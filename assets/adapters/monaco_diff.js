/**
 * Xenia's official adapter for Monaco's diff editor: an original and a modified text
 * side by side (or inline), with the modified side editable.
 *
 * It follows the same conventions as monaco.js: the same value payload,
 * `revision` to force the server's text, form-field support with echo
 * handling, edits that bypass readOnly, and the editor mounted in a child
 * element so Monaco's data-* attributes survive LiveView patches.
 *
 * Props:
 *   original   string, the left/old text. Always applied as given.
 *   modified   { value, version?, revision? } or a plain string; the
 *              right/new text, as in monaco.js:
 *                - with a `version` echoed from a change event, it is ignored
 *                  if the user has typed past it;
 *                - without one it is authoritative;
 *                - a changed `revision` forces it even over newer typing.
 *   language   Monaco language id, for both sides
 *   theme      theme name or theme definition (global, like monaco.js)
 *   options    diff editor options, e.g. %{renderSideBySide: false,
 *              ignoreTrimWhitespace: false, readOnly: true,
 *              originalEditable: false, wordWrap: "on"}
 *
 * Commands:
 *   focus
 *   next_diff, previous_diff          jump between changes
 *   reveal_line %{line, side?}        side "modified" (default) or "original"
 *
 * Events:
 *   change  %{value, version}   the user edited the modified side (300 ms)
 *   diff    %{changes, line_changes: [%{original_start, original_end,
 *            modified_start, modified_end}]}  the computed diff changed
 *   error   %{source, message, code}
 *
 * Form field: with field={@form[:code]}, the modified text is submitted with
 * the form, exactly as in monaco.js.
 *
 * The app owns Monaco's worker setup (MonacoEnvironment), as for monaco.js.
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createMonacoDiff } from "xenia/monaco-diff"
 *   const monacoDiff = createMonacoDiff({
 *     load: () => import("monaco-editor")
 *   })
 *   // createHooks({ MonacoDiff: monacoDiff }), then <.monaco_diff> (Xenia.Adapters.MonacoDiff)
 *   Extend it by spreading: { ...monacoDiff, commands: { ...monacoDiff.commands, mine() {} } }
 */

import {
  createFormField,
  expectLibrary,
  guarded,
  isolateFormEvents,
  loadOnce,
  reportError,
  withLibrary,
} from "./shared.js";

const LOAD = 'createMonacoDiff({ load: () => import("monaco-editor") })';

function pickLibrary(library) {
  expectLibrary(typeof library?.editor?.createDiffEditor === "function", LOAD);
  return { Monaco: library };
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createMonacoDiff({ load: libraryImport } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let Monaco;
  const DEFAULT_OPTIONS = {
    automaticLayout: true,
    fixedOverflowWidgets: true,
    renderSideBySide: true,
    originalEditable: false,
  };

  let modelCounter = 0;

  function toPayload(input) {
    if (typeof input === "string") return { value: input };
    return input ?? {};
  }

  function themeName(theme) {
    return typeof theme === "string" ? theme : theme?.name;
  }

  function defineTheme(monaco, theme) {
    if (theme && typeof theme === "object") {
      monaco.editor.defineTheme(theme.name, {
        base: theme.base,
        inherit: theme.inherit ?? true,
        rules: theme.rules ?? [],
        colors: theme.colors ?? {},
      });
    }
  }

  /**
   * Replaces a model's content as one undoable edit that also works while the
   * editor is readOnly. `instance.applying` keeps the change listener from
   * reporting it as a user edit.
   */
  function replaceContent(instance, model, editor, value) {
    if (!model || model.getValue() === value) return;

    const selections = editor?.getSelections();
    instance.applying += 1;

    try {
      model.pushStackElement();
      model.pushEditOperations(
        selections ?? [],
        [{ range: model.getFullModelRange(), text: value }],
        () => selections,
      );
      model.pushStackElement();
      if (selections) editor.setSelections(selections);
    } finally {
      instance.applying -= 1;
    }
  }

  function lineChanges(diffEditor) {
    return (diffEditor.getLineChanges() ?? []).map((change) => ({
      original_start: change.originalStartLineNumber,
      original_end: change.originalEndLineNumber,
      modified_start: change.modifiedStartLineNumber,
      modified_end: change.modifiedEndLineNumber,
    }));
  }

  async function init(instance, props) {
    const monaco = Monaco;
    if (instance.destroyed || !instance.el.isConnected) return null;

    instance.monaco = monaco;

    const { theme, language, options } = props;
    const n = ++modelCounter;
    const base = `xenia://monaco-diff/${encodeURIComponent(instance.id)}/${n}`;

    instance.originalModel = monaco.editor.createModel(
      props.original ?? "",
      language,
      monaco.Uri.parse(`${base}/original`),
    );
    instance.modifiedModel = monaco.editor.createModel(
      toPayload(props.modified).value ?? "",
      language,
      monaco.Uri.parse(`${base}/modified`),
    );

    defineTheme(monaco, theme);

    // Mounted in a child element: Monaco must not own el's data-* attributes.
    instance.host = instance.el.ownerDocument.createElement("div");
    instance.host.style.cssText = "width: 100%; height: 100%;";
    instance.el.appendChild(instance.host);

    const editor = monaco.editor.createDiffEditor(instance.host, {
      ...DEFAULT_OPTIONS,
      ...options,
      ...(theme ? { theme: themeName(theme) } : {}),
    });

    editor.setModel({
      original: instance.originalModel,
      modified: instance.modifiedModel,
    });
    instance.editor = editor;

    const { ctx } = instance;

    instance.disposables.push(
      instance.modifiedModel.onDidChangeContent(() => {
        if (instance.applying > 0) return;

        instance.version += 1;
        const value = instance.modifiedModel.getValue();

        ctx.emit("change", { value, version: instance.version });
        instance.field.report(value);
      }),

      editor.onDidUpdateDiff(() => {
        const changes = lineChanges(editor);
        ctx.emit("diff", { changes: changes.length, line_changes: changes });
      }),
    );

    return editor;
  }

  /** Runs `fn(editor)` once the editor exists, if the instance is still alive. */
  async function withEditor(instance, fn) {
    const editor = await instance.ready;
    if (!editor || instance.destroyed) return undefined;
    return fn(editor);
  }

  function teardown(instance) {
    for (const disposable of instance.disposables) {
      try {
        disposable.dispose();
      } catch (error) {
        console.error("[Xenia monaco-diff] dispose failed:", error);
      }
    }

    instance.disposables.length = 0;
    instance.editor?.dispose(); // before its models
    instance.originalModel?.dispose();
    instance.modifiedModel?.dispose();
    instance.host?.remove();
    instance.stopIsolation?.();

    instance.editor = null;
    instance.originalModel = null;
    instance.modifiedModel = null;
    instance.host = null;
  }

  const adapter = {
    mount(el, props, ctx) {
      const instance = {
        el,
        ctx,
        id: ctx.id ?? el.id ?? "diff",
        monaco: null,
        editor: null,
        host: null,
        originalModel: null,
        modifiedModel: null,
        version: 0,
        applying: 0,
        revision: toPayload(props.modified).revision,
        field: createFormField(ctx),
        disposables: [],
        destroyed: false,
        stopIsolation: isolateFormEvents(el),
        ready: null,
      };

      instance.ready = init(instance, props).catch((error) => {
        reportError(ctx, "mount", error);
        teardown(instance);
        return null;
      });

      return instance;
    },

    // Synchronous: marks the instance destroyed now and finishes tearing down
    // when loading has settled.
    destroy(instance) {
      instance.destroyed = true;
      void instance.ready.then(() => teardown(instance));
    },

    props: {
      original: (instance, value) =>
        withEditor(instance, (editor) =>
          replaceContent(
            instance,
            instance.originalModel,
            editor.getOriginalEditor(),
            value ?? "",
          ),
        ),

      // Same order as monaco.js: revision forces, then form echoes are
      // ignored, then versioned echoes the user typed past are ignored.
      modified(instance, input) {
        const payload = toPayload(input);
        const forced = payload.revision !== instance.revision;
        instance.revision = payload.revision;

        if (forced) {
          instance.field.clear();
        } else if (
          payload.version == null &&
          instance.field.isEcho(payload.value)
        ) {
          return;
        }

        void withEditor(instance, (editor) => {
          const { value, version } = payload;
          const stale =
            !forced && version != null && version < instance.version;

          if (typeof value === "string" && !stale) {
            replaceContent(
              instance,
              instance.modifiedModel,
              editor.getModifiedEditor(),
              value,
            );
          }

          instance.field.sync(instance.modifiedModel.getValue());
        });
      },

      language: (instance, language) =>
        withEditor(instance, () => {
          if (!language) return;
          for (const model of [
            instance.originalModel,
            instance.modifiedModel,
          ]) {
            if (model.getLanguageId() !== language)
              instance.monaco.editor.setModelLanguage(model, language);
          }
        }),

      theme: (instance, theme) =>
        withEditor(instance, () => {
          if (!theme) return;
          defineTheme(instance.monaco, theme);
          instance.monaco.editor.setTheme(themeName(theme));
        }),

      options: (instance, options) =>
        withEditor(instance, (editor) => {
          if (options) editor.updateOptions(options);
        }),
    },

    commands: {
      focus: guarded("focus", (instance) =>
        withEditor(instance, (editor) => editor.getModifiedEditor().focus()),
      ),

      next_diff: guarded("next_diff", (instance) =>
        withEditor(instance, (editor) => editor.goToDiff("next")),
      ),
      previous_diff: guarded("previous_diff", (instance) =>
        withEditor(instance, (editor) => editor.goToDiff("previous")),
      ),

      reveal_line: guarded(
        "reveal_line",
        (instance, { line, side = "modified" }) =>
          withEditor(instance, (editor) => {
            if (!Number.isInteger(line) || line < 1)
              throw new TypeError("reveal_line expects %{line: integer ≥ 1}");

            const target =
              side === "original"
                ? editor.getOriginalEditor()
                : editor.getModifiedEditor();
            target.revealLineInCenter(line);
            target.setPosition({ lineNumber: line, column: 1 });
          }),
      ),
    },

    events: {
      change: { debounce: 300 },
      diff: { debounce: 250 },
      error: {},
    },
  };

  return withLibrary(adapter, loadLibrary, (library) => {
    ({ Monaco } = pickLibrary(library));
  });
}
