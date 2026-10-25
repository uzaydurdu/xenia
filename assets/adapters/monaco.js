/**
 * MonacoAdapter
 *
 * Shipped as its own entry point, `import ... from "xenia/monaco"`, so apps
 * that don't use Monaco never meet it (M7 dry run: one bundle made every
 * app's build fail without monaco-editor installed).
 *
 * Two ways to use it:
 *   - `createMonaco({ load })` (bottom of this file): the Xenia adapter, for
 *     createHooks({ Monaco: createMonaco({ load: () => import("monaco-editor") }) }).
 *     This is the normal path.
 *   - `MonacoAdapter`: the class underneath it, usable directly from a plain
 *     LiveView hook with no other part of Xenia (CLAUDE.md §4: every layer
 *     works standalone).
 *
 * Loading: the app passes `load`, a function returning `import("monaco-editor")`.
 * The import then sits in the app's own code, so esbuild resolves it from the
 * app's assets/node_modules. Imported from inside Xenia's package, it could
 * not be found there (M7 dry run).
 *
 * Public surface of the class:
 *   new MonacoAdapter(el, { load, id, value, language, theme, options, setup })
 *   applyValue(payload)   applyLanguage(language)   applyTheme(theme)
 *   applyOptions(options) onChange(callback)    destroy()   raw()
 *
 * Value contract:
 *   The value is a Monaco-specific payload: { value: string, version?: number }.
 *   A plain string is accepted as shorthand for { value }.
 *   - onChange(callback) calls back on every local edit with { value, version }.
 *     version increments per edit and is scoped to this adapter instance.
 *   - applyValue({ value, version }) is an echo of a local edit and is ignored
 *     if the editor has since moved past that version.
 *   - applyValue({ value }) without a version is authoritative and always applied,
 *     including while the editor is readOnly (readOnly only stops the user).
 *   - applyValue resolves to the editor's content afterwards, whether or not
 *     it changed anything, or to undefined if this adapter isn't the active,
 *     live owner. Callers use it to keep a form's input in sync.
 *   The adapter reports changes immediately. Debouncing and transport belong
 *   to the caller. destroy() does not deliver pending edits, so a caller that
 *   debounces onChange must flush its pending change before calling destroy().
 *
 * Escape hatch:
 *   raw() resolves to { monaco, editor } once the editor exists, or null if
 *   initialization failed or the adapter was destroyed. Use it for Monaco calls
 *   the adapter doesn't wrap (focus, trigger, commands). Edits made through the
 *   raw editor are ordinary edits: they are reported by onChange like typing.
 *
 * Model contract:
 *   props.id (or, when absent, el.id) is required and is the model's identity.
 *   Under Xenia's core it is the component id (ctx.id), because the core's
 *   mount element has no id. Adapters with the same id share one model (e.g.
 *   during a page transition where the old and new page overlap). The most recently mounted adapter is the active
 *   owner: only it reports changes and accepts updates. When an existing model
 *   is adopted, the new adapter's props.value and props.language replace the
 *   model's content and language as an undoable edit.
 *
 * Theme contract:
 *   Monaco themes are global. theme and applyTheme() affect every editor on the
 *   page; the most recently applied theme wins.
 *
 * DOM contract:
 *   The editor is mounted into a child element the adapter creates inside el,
 *   never into el itself. Monaco writes data-* attributes (data-keybinding-context,
 *   data-mode-id) onto its container, and LiveView removes any data-* attribute
 *   the server didn't render from a phx-update="ignore" element on every patch.
 *   Losing data-keybinding-context silently disables every keybinding (arrows,
 *   delete, select all). Children of an ignored element are never touched.
 */

// Defaults required for correct integration, not product choices.
const DEFAULT_OPTIONS = {
  automaticLayout: true,
  fixedOverflowWidgets: true,
};

// key -> { model, owned, owners, applying }
//   owned:    false if the model existed before any adapter acquired it; such
//             models are never disposed here.
//   owners:   adapters using the model, in mount order. The last one is active.
//   applying: count of programmatic edits in progress on this model. Shared,
//             because every editor attached to the model sees those edits.
const registry = new Map();

// adapter instance -> echo tracker (createEchoes()), for form-field editors only
//   Remembers the values this editor reported through ctx.setFormValue(), so
//   the `value` prop handler can recognize LiveView's validate replies that
//   carry the editor's own, possibly older, text, and ignore them instead of
//   overwriting newer typing.
//   Per instance, not per model key: echoes belong to one editor's form field.
//   A remount creates a new instance and so starts with a fresh tracker.
//   A WeakMap, so an entry goes away with its instance; destroy() needs no
//   cleanup for it.
const pendingEchoes = new WeakMap();

function acquireModel(monaco, key, adapter, value, language) {
  let entry = registry.get(key);
  let adopted = true;

  if (!entry || entry.model.isDisposed()) {
    const uri = monaco.Uri.parse(key);
    const existing = monaco.editor.getModel(uri);

    entry = {
      model: existing ?? monaco.editor.createModel(value, language, uri),
      owned: !existing,
      owners: [],
      applying: 0,
    };

    adopted = Boolean(existing);
    registry.set(key, entry);
  }

  entry.owners.push(adapter);

  return { entry, adopted };
}

function releaseModel(key, adapter) {
  const entry = registry.get(key);
  const index = entry ? entry.owners.indexOf(adapter) : -1;

  if (index === -1) {
    console.warn(`[MonacoAdapter] release of untracked model "${key}" ignored`);
    return;
  }

  entry.owners.splice(index, 1);

  if (entry.owners.length > 0) return;

  registry.delete(key);

  if (entry.owned && !entry.model.isDisposed()) {
    entry.model.dispose();
  }
}

function toPayload(input) {
  if (typeof input === "string") return { value: input };
  return input ?? {};
}

function toDisposables(result) {
  if (result == null) return [];

  const list = Array.isArray(result) ? result : [result];

  return list.filter((item) => item && typeof item.dispose === "function");
}

function themeName(theme) {
  return typeof theme === "string" ? theme : theme.name;
}

/**
 * Remember values sent from Monaco to Phoenix.
 *
 * When Phoenix sends an old value back, we can
 * recognize it and avoid replacing newer typing.
 */
export function createEchoes(limit = 100) {
  const sent = [];

  return {
    reported(value) {
      // The same value twice in a row changes nothing in the form, so no
      // phx-change and no reply follow for the second one. (Monaco can
      // report one final text many times: an 18-character insertText gave
      // 18 change events, each reading the finished text.)
      if (sent.at(-1) === value) return;

      sent.push(value);

      if (sent.length > limit) {
        sent.shift();
      }
    },

    isEcho(value) {
      const index = sent.indexOf(value);

      if (index === -1) {
        return false;
      }

      sent.splice(0, index + 1);

      return true;
    },

    clear() {
      sent.length = 0;
    },
  };
}

export class MonacoAdapter {
  #el;
  #props;
  #key;
  #ready;
  #destroyed = false;
  #version = 0;

  #monaco = null;
  #host = null;
  #editor = null;
  #entry = null;
  #changeListener = null;
  #setupDisposables = [];

  constructor(el, props = {}) {
    const id = props.id ?? el?.id;

    // Without an id, every editor would share the model "xenia://monaco/undefined".
    if (!id) {
      throw new Error(
        "MonacoAdapter requires props.id or an element with a stable id",
      );
    }

    // See "Loading" above: the app supplies the import.
    if (typeof props.load !== "function") {
      throw new TypeError(
        'MonacoAdapter requires props.load, e.g. { load: () => import("monaco-editor") }',
      );
    }

    this.#el = el;
    this.#props = props;
    this.#key = `xenia://monaco/${encodeURIComponent(id)}`;

    this.#ready = this.#init().catch((error) => {
      console.error("[MonacoAdapter] initialization failed:", error);
      this.#teardown();
      return null;
    });
  }

  // Resolves to the editor's content after applying (see "Value contract").
  async applyValue(payload) {
    const editor = await this.#activeEditor();
    if (!editor) return undefined;

    const { value, version } = toPayload(payload);

    // Echo of an edit the user has since typed past, or no usable value:
    // the editor keeps its content, and that content is what's reported.
    if (
      typeof value === "string" &&
      !(version != null && version < this.#version)
    ) {
      this.#replaceContent(value);
    }

    return editor.getValue();
  }

  async applyLanguage(language) {
    if (!language || !(await this.#activeEditor())) return;

    this.#setLanguage(language);
  }

  async applyTheme(theme) {
    if (!theme || !(await this.#activeEditor())) return;

    if (typeof theme === "object") this.#defineTheme(theme);

    this.#monaco.editor.setTheme(themeName(theme));
  }

  // Merges into the current options, like editor.updateOptions.
  async applyOptions(options) {
    if (!options || !(await this.#activeEditor())) return;

    this.#editor.updateOptions(options);
  }

  async onChange(callback) {
    const editor = await this.#ready;

    if (!editor || this.#destroyed) return;

    this.#changeListener?.dispose();

    this.#changeListener = editor.onDidChangeModelContent(() => {
      if (this.#entry.applying > 0 || !this.#isActive()) return;

      this.#version += 1;

      callback({ value: editor.getValue(), version: this.#version });
    });
  }

  async raw() {
    const editor = await this.#ready;

    if (!editor || this.#destroyed) return null;

    return { monaco: this.#monaco, editor };
  }

  async destroy() {
    if (this.#destroyed) return;

    this.#destroyed = true;

    await this.#ready;

    this.#teardown();
  }

  async #init() {
    const monaco = await this.#props.load();

    if (this.#destroyed || !this.#el.isConnected) return null;

    this.#monaco = monaco;

    const { value = "" } = toPayload(this.#props.value);
    const { theme, language, options, setup } = this.#props;

    const { entry, adopted } = acquireModel(
      monaco,
      this.#key,
      this,
      value,
      language,
    );

    this.#entry = entry;

    if (theme && typeof theme === "object") this.#defineTheme(theme);

    // See "DOM contract" above: Monaco must not own el's attributes.
    this.#host = document.createElement("div");
    this.#host.style.width = "100%";
    this.#host.style.height = "100%";
    this.#el.appendChild(this.#host);

    this.#editor = monaco.editor.create(this.#host, {
      ...DEFAULT_OPTIONS,
      ...options,
      ...(theme ? { theme: themeName(theme) } : {}),
      model: entry.model,
    });

    // New props are authoritative over a reused model.
    if (adopted) {
      if (language) this.#setLanguage(language);
      if (this.#props.value != null) this.#replaceContent(value);
    }

    if (typeof setup === "function") {
      // setup may return a disposable, an array of them, or a Promise of either.
      this.#setupDisposables = toDisposables(await setup(monaco, this.#editor));
    }

    return this.#editor;
  }

  // Resolves to the editor only if this adapter is alive and the active owner.
  async #activeEditor() {
    const editor = await this.#ready;
    return editor && !this.#destroyed && this.#isActive() ? editor : null;
  }

  #isActive() {
    return this.#entry?.owners.at(-1) === this;
  }

  #replaceContent(value) {
    const editor = this.#editor;
    const model = editor?.getModel();

    if (!model || model.getValue() === value) return;

    const selections = editor.getSelections();

    this.#entry.applying += 1;

    try {
      // Edit the model, not the editor: editor.executeEdits refuses every edit
      // while readOnly is set, and readOnly must only stop the user, not the
      // server. Stack elements on both sides keep this edit in its own undo group.
      model.pushStackElement();
      model.pushEditOperations(
        selections ?? [],
        [{ range: model.getFullModelRange(), text: value }],
        () => selections,
      );
      model.pushStackElement();

      if (selections) editor.setSelections(selections);
    } finally {
      this.#entry.applying -= 1;
    }
  }

  #setLanguage(language) {
    const model = this.#editor?.getModel();

    if (model && model.getLanguageId() !== language) {
      this.#monaco.editor.setModelLanguage(model, language);
    }
  }

  #defineTheme(theme) {
    this.#monaco.editor.defineTheme(theme.name, {
      base: theme.base,
      inherit: theme.inherit ?? true,
      rules: theme.rules ?? [],
      colors: theme.colors ?? {},
    });
  }

  // Synchronous and idempotent; safe to call from any state.
  #teardown() {
    this.#changeListener?.dispose();
    this.#changeListener = null;

    for (const disposable of this.#setupDisposables) {
      try {
        disposable.dispose();
      } catch (error) {
        console.error("[MonacoAdapter] error disposing setup resource:", error);
      }
    }

    this.#setupDisposables = [];

    // Dispose the editor before releasing the model it is attached to.
    this.#editor?.dispose();
    this.#editor = null;

    this.#host?.remove();
    this.#host = null;

    if (this.#entry) releaseModel(this.#key, this);

    this.#entry = null;
    this.#monaco = null;
  }
}
/**
 * The Xenia adapter for Monaco (Tier 2, CLAUDE.md §2): the same shape a Tier 1
 * adapter written in an app would have. Create it with the app's import and
 * register it:
 *
 *   import { createMonaco } from "xenia/monaco"
 *   const monaco = createMonaco({ load: () => import("monaco-editor") })
 *   createHooks({ Monaco: monaco })
 *
 * and render the container (`<.monaco>` does) with:
 *
 *   data-xenia-props   {"value": {"value": "...", "version": null},
 *                       "language": "elixir", "theme": "vs-dark", "options": {}}
 *   data-xenia-events  {"change": "<your LiveView event>"}
 *
 * `value` is the payload described under "Value contract" above: echo the
 * client's `version` back from your handle_event, send `null` for
 * authoritative updates.
 *
 * The app still owns Monaco's worker setup (MonacoEnvironment, CLAUDE.md §6).
 * Anything that can't travel as JSON, such as a function that registers
 * completion providers, goes to createMonaco as `setup(monaco, editor)`.
 *
 * Theme: the adapter consumes the app's "theme" provider (CLAUDE.md §5), so
 * editors follow the app's light/dark theme with no `theme` attr. An explicit
 * `theme` beats it, but Monaco themes are global (CLAUDE.md §6), so the last
 * theme applied wins for every editor on the page.
 */

// The last `revision` each editor received (see the `value` prop below).
const revisions = new WeakMap();

// Each editor remembers the current application theme
// and the developer's optional custom theme mappings.
const themeState = new WeakMap();

/**
 * The app's theme words in Monaco's: "light" → "vs", "dark" → "vs-dark".
 * Anything else (a Monaco theme name such as "hc-black", or a theme object)
 * passes through, so an explicit `theme` keeps working as before.
 */
export function monacoTheme(theme) {
  if (theme === "light") return "vs";
  if (theme === "dark") return "vs-dark";
  return theme;
}

/**
 * Pick the developer's custom theme if provided.
 * Otherwise, fall back to Monaco's default mapping.
 */
export function resolveTheme({ app, themes }) {
  return themes?.[app] ?? monacoTheme(app);
}

/**
 * Creates the Xenia adapter for Monaco.
 *
 *   load   required: () => import("monaco-editor"), written in the app
 *   setup  optional: (monaco, editor) => disposable(s), run once per editor
 *          after it is created (completion providers, commands, ...)
 */
export function createMonaco({ load, setup } = {}) {
  if (typeof load !== "function") {
    throw new TypeError(
      '[Xenia] createMonaco needs { load: () => import("monaco-editor") }',
    );
  }

  return {
    ...adapter,
    mount: (el, props, ctx) =>
      adapter.mount(el, { ...props, load, setup }, ctx),
  };
}

const adapter = {
  // The app's theme arrives as the `theme` prop, like any prop (CLAUDE.md §5).
  consumes: ["theme"],

  mount(el, props, ctx) {
    // Remember the application's current theme and
    // the developer's optional theme mappings.
    const state = {
      app: props.theme,
      themes: props.themes,
    };

    // The core's mount element has no id, so the model is keyed by ctx.id.
    const editor = new MonacoAdapter(el, {
      ...props,
      theme: resolveTheme(state),
      id: ctx.id,
    });

    // Remember theme settings for future prop updates.
    themeState.set(editor, state);

    const echoes = createEchoes();

    // Keyed by the returned instance: Xenia passes it to every prop handler.
    pendingEchoes.set(editor, echoes);
    revisions.set(editor, props.value?.revision);

    editor.onChange((payload) => {
      ctx.emit("change", payload);

      // true only for a form field: remember the value, so its validate
      // reply is recognized as an echo instead of overwriting newer typing.
      if (ctx.setFormValue(payload.value)) {
        echoes.reported(payload.value);
      }
    });

    return editor;
  },

  // Synchronous, as §4 requires: MonacoAdapter.destroy() marks the instance
  // destroyed at once and finishes tearing down when loading has settled.
  destroy(editor) {
    void editor.destroy();
  },

  props: {
    // Values from Phoenix, checked in this order:
    //
    // 1. A changed `revision` means the server forces its value (Xenia.Adapters.Monaco,
    //    "Forcing the server's value"): applied even over newer local edits.
    //    This matters when the server rejects an edit, because it then still
    //    sends its older `version`, which would otherwise be ignored as a
    //    stale echo. Forcing also forgets pending form echoes, so a reset to
    //    text the user once typed (e.g. "" after Save) is still applied.
    //
    // 2. Otherwise, in a form, a value without a version that this editor
    //    reported itself is a validate reply carrying older text: ignored,
    //    so it can't overwrite newer typing. Checked only here, and once,
    //    because a match also drops every earlier pending value.
    //
    // 3. Anything else is applied. The form's input then gets what
    //    the editor actually shows, quietly: a server change must not
    //    trigger another phx-change.
    //
    // Whatever is applied (1 or 3) also forgets pending echoes. Replies
    // arrive in order, so every earlier report has been answered by now,
    // or its reply was lost: after a reconnect, the fresh render ("") came
    // first, then form recovery sent the user's text back, and that text
    // must be applied, not taken for an old echo.
    value(editor, payload, ctx) {
      const echoes = pendingEchoes.get(editor);
      const revision = payload?.revision;
      const forced = revision !== revisions.get(editor);
      revisions.set(editor, revision);

      if (
        !forced &&
        payload?.version == null &&
        echoes?.isEcho(payload?.value)
      ) {
        return;
      }

      echoes?.clear();

      editor
        .applyValue(forced ? { value: payload?.value } : payload)
        .then((shown) => {
          if (typeof shown === "string")
            ctx.setFormValue(shown, { notify: false });
        });
    },

    language: (editor, language) => editor.applyLanguage(language),

    theme(editor, app) {
      // Reuse existing state, or create it if missing.
      const state = themeState.get(editor) ?? {
        app: undefined,
        themes: undefined,
      };

      state.app = app;
      themeState.set(editor, state);

      return editor.applyTheme(resolveTheme(state));
    },

    themes(editor, themes) {
      // Reuse existing state, or create it if missing.
      const state = themeState.get(editor) ?? {
        app: undefined,
        themes: undefined,
      };

      state.themes = themes;
      themeState.set(editor, state);

      return editor.applyTheme(resolveTheme(state));
    },

    options: (editor, options) => editor.applyOptions(options),
  },

  events: {
    change: { debounce: 300 },
  },

  commands: {
    focus: (editor) => editor.raw().then((raw) => raw?.editor.focus()),
    insert: (editor, { text }) =>
      editor
        .raw()
        .then((raw) => raw?.editor.trigger("xenia", "type", { text })),
  },
};
