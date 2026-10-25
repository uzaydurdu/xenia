/**
 * Xenia's official adapter for Tiptap (v3): a rich-text editor that also works as a
 * form field.
 *
 * Props:
 *   content      HTML string, or %{value, format: "html" | "json", revision}.
 *                As in monaco.js, a changed `revision` forces the server's
 *                content even over newer typing; otherwise, in a form, the
 *                editor's own earlier content coming back from validate is
 *                ignored.
 *   format       "html" (default) or "json": what change events and the form
 *                field carry
 *   editable     true (default) / false
 *   placeholder  text shown while the editor is empty
 *   limit        maximum number of characters (0 or nil = no limit)
 *   toolbar      true for the default toolbar, a list of item names, or
 *                false. Items: bold, italic, underline, strike, code,
 *                heading1, heading2, heading3, paragraph, bullet_list,
 *                ordered_list, blockquote, code_block, horizontal_rule, link,
 *                undo, redo, separator
 *   starter_kit  StarterKit configuration, e.g. %{heading: %{levels: [1, 2]},
 *                link: %{open_on_click: false}}. Changing it remounts.
 *
 * Commands:
 *   focus %{position?: "start" | "end" | "all"}, blur
 *   set_content %{value, format?}     replace the content (not reported back)
 *   clear
 *   insert %{content}                 HTML or text at the cursor
 *   run %{command, args?}             any Tiptap command on a focused chain,
 *                                     e.g. %{command: "toggleBold"} or
 *                                     %{command: "setLink", args: [%{href: "..."}]}
 *
 * Events:
 *   change  %{value, text, empty, characters, words}   debounced 300 ms
 *   focus   %{}, blur %{}
 *   error   %{source, message, code}
 *
 * Form field: with field={@form[:body]}, the HTML (or JSON with
 * format="json") is submitted with the form.
 *
 * Tiptap is unstyled. The adapter adds minimal styles for the toolbar,
 * placeholder and focus outline; style the content with your own CSS (for
 * example Tailwind's `prose` class on the container).
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createTiptap } from "xenia/tiptap"
 *   const tiptap = createTiptap({
 *     load: async () => {
 *       const [core, starterKit, extensions] = await Promise.all([
 *         import("@tiptap/core"),
 *         import("@tiptap/starter-kit"),
 *         import("@tiptap/extensions"),
 *       ])
 *       return {
 *         Editor: core.Editor,
 *         StarterKit: starterKit.default,
 *         CharacterCount: extensions.CharacterCount,
 *         Placeholder: extensions.Placeholder,
 *       }
 *     }
 *   })
 *   // createHooks({ Tiptap: tiptap }), then <.tiptap> (Xenia.Adapters.Tiptap)
 *   Extend it by spreading: { ...tiptap, commands: { ...tiptap.commands, mine() {} } }
 */

import {
  camelizeKeys,
  createFormField,
  expectLibrary,
  guarded,
  injectStyle,
  isolateFormEvents,
  loadOnce,
  reportError,
  withLibrary,
} from "./shared.js";

const LOAD = "createTiptap({ load: see the usage at the top of this file })";

function pickLibrary(library) {
  const { Editor, StarterKit, CharacterCount, Placeholder } = library ?? {};
  expectLibrary(
    typeof Editor === "function" && StarterKit && CharacterCount && Placeholder,
    LOAD,
  );
  return { Editor, StarterKit, CharacterCount, Placeholder };
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createTiptap({ load: libraryImport } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let Editor, StarterKit, CharacterCount, Placeholder;
  const STYLE = `
  .xenia-rich-text { display: flex; flex-direction: column; gap: 6px; }
  .xenia-rich-text__toolbar { display: flex; flex-wrap: wrap; gap: 2px; }
  .xenia-rich-text__toolbar button { all: unset; cursor: pointer; padding: 4px 8px; border-radius: 6px; font: 600 13px/1.2 system-ui, sans-serif; opacity: 0.8; }
  .xenia-rich-text__toolbar button:hover { background: rgba(127, 127, 127, 0.15); opacity: 1; }
  .xenia-rich-text__toolbar button[aria-pressed="true"] { background: rgba(127, 127, 127, 0.25); opacity: 1; }
  .xenia-rich-text__toolbar button:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
  .xenia-rich-text__toolbar button:disabled { opacity: 0.3; cursor: default; }
  .xenia-rich-text__toolbar [role="separator"] { width: 1px; margin: 4px 4px; background: currentColor; opacity: 0.2; }
  .xenia-rich-text .ProseMirror { min-height: 6rem; outline: none; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(127, 127, 127, 0.3); }
  .xenia-rich-text .ProseMirror:focus-visible { border-color: rgba(99, 102, 241, 0.8); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }
  .xenia-rich-text .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; height: 0; pointer-events: none; opacity: 0.45; }
`;

  /** Toolbar items: label, how to run, and how to tell they're active. */
  const TOOLBAR = {
    bold: {
      label: "B",
      title: "Bold",
      run: (c) => c.toggleBold(),
      active: (e) => e.isActive("bold"),
    },
    italic: {
      label: "I",
      title: "Italic",
      run: (c) => c.toggleItalic(),
      active: (e) => e.isActive("italic"),
    },
    underline: {
      label: "U",
      title: "Underline",
      run: (c) => c.toggleUnderline(),
      active: (e) => e.isActive("underline"),
    },
    strike: {
      label: "S",
      title: "Strikethrough",
      run: (c) => c.toggleStrike(),
      active: (e) => e.isActive("strike"),
    },
    code: {
      label: "</>",
      title: "Inline code",
      run: (c) => c.toggleCode(),
      active: (e) => e.isActive("code"),
    },
    heading1: {
      label: "H1",
      title: "Heading 1",
      run: (c) => c.toggleHeading({ level: 1 }),
      active: (e) => e.isActive("heading", { level: 1 }),
    },
    heading2: {
      label: "H2",
      title: "Heading 2",
      run: (c) => c.toggleHeading({ level: 2 }),
      active: (e) => e.isActive("heading", { level: 2 }),
    },
    heading3: {
      label: "H3",
      title: "Heading 3",
      run: (c) => c.toggleHeading({ level: 3 }),
      active: (e) => e.isActive("heading", { level: 3 }),
    },
    paragraph: {
      label: "¶",
      title: "Paragraph",
      run: (c) => c.setParagraph(),
      active: (e) => e.isActive("paragraph"),
    },
    bullet_list: {
      label: "•",
      title: "Bullet list",
      run: (c) => c.toggleBulletList(),
      active: (e) => e.isActive("bulletList"),
    },
    ordered_list: {
      label: "1.",
      title: "Numbered list",
      run: (c) => c.toggleOrderedList(),
      active: (e) => e.isActive("orderedList"),
    },
    blockquote: {
      label: "❝",
      title: "Quote",
      run: (c) => c.toggleBlockquote(),
      active: (e) => e.isActive("blockquote"),
    },
    code_block: {
      label: "{ }",
      title: "Code block",
      run: (c) => c.toggleCodeBlock(),
      active: (e) => e.isActive("codeBlock"),
    },
    horizontal_rule: {
      label: "—",
      title: "Divider",
      run: (c) => c.setHorizontalRule(),
    },
    link: {
      label: "🔗",
      title: "Link",
      run: null,
      active: (e) => e.isActive("link"),
    },
    undo: {
      label: "↶",
      title: "Undo",
      run: (c) => c.undo(),
      enabled: (e) => e.can().undo(),
    },
    redo: {
      label: "↷",
      title: "Redo",
      run: (c) => c.redo(),
      enabled: (e) => e.can().redo(),
    },
  };

  const DEFAULT_TOOLBAR = [
    "bold",
    "italic",
    "strike",
    "code",
    "separator",
    "heading2",
    "heading3",
    "bullet_list",
    "ordered_list",
    "blockquote",
    "code_block",
    "separator",
    "link",
    "undo",
    "redo",
  ];

  function toPayload(input) {
    if (input == null) return { value: "" };
    if (typeof input === "string") return { value: input };
    return input;
  }

  /** The editor's content in the configured format. */
  function currentValue(instance) {
    return instance.format === "json"
      ? instance.editor.getJSON()
      : instance.editor.getHTML();
  }

  /** JSON content may arrive as a string (e.g. from a form param). */
  function parseContent(value, format) {
    if (
      format === "json" &&
      typeof value === "string" &&
      value.trim().startsWith("{")
    ) {
      return JSON.parse(value);
    }
    return value ?? "";
  }

  function changeDetail(instance) {
    const { editor } = instance;
    const storage = editor.storage.characterCount;

    return {
      value: currentValue(instance),
      text: editor.getText(),
      empty: editor.isEmpty,
      characters: storage?.characters?.() ?? editor.getText().length,
      words: storage?.words?.() ?? 0,
    };
  }

  function promptLink(instance) {
    const { editor, win } = instance;
    const previous = editor.getAttributes("link").href ?? "";
    const href = win.prompt("Link URL (empty to remove)", previous);

    if (href === null) return;
    if (href === "")
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  function renderToolbar(instance, items) {
    const { toolbarEl } = instance;
    toolbarEl.replaceChildren();
    toolbarEl.hidden = !items;
    instance.toolbarButtons = [];

    if (!items) return;

    const doc = toolbarEl.ownerDocument;
    const list = items === true ? DEFAULT_TOOLBAR : items;

    for (const name of list) {
      if (name === "separator") {
        const separator = doc.createElement("span");
        separator.setAttribute("role", "separator");
        toolbarEl.appendChild(separator);
        continue;
      }

      const item = TOOLBAR[name];
      if (!item) {
        reportError(
          instance.ctx,
          "toolbar",
          new Error(`unknown toolbar item "${name}"`),
        );
        continue;
      }

      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      button.title = item.title;
      button.setAttribute("aria-label", item.title);

      // mousedown keeps the editor's selection; click runs the command.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        if (name === "link") promptLink(instance);
        else item.run(instance.editor.chain().focus()).run();
      });

      toolbarEl.appendChild(button);
      instance.toolbarButtons.push({ button, item });
    }

    updateToolbar(instance);
  }

  /** Reflects active marks and undo/redo availability in the toolbar. */
  function updateToolbar(instance) {
    const { editor } = instance;
    const editable = editor.isEditable;

    for (const { button, item } of instance.toolbarButtons) {
      if (item.active)
        button.setAttribute("aria-pressed", String(item.active(editor)));
      button.disabled =
        !editable || (item.enabled ? !item.enabled(editor) : false);
    }
  }

  function buildExtensions(props, instance) {
    const starterKit = camelizeKeys(props.starter_kit ?? {}, { deep: true });

    return [
      StarterKit.configure({
        ...starterKit,
        link: { openOnClick: false, ...(starterKit.link ?? {}) },
      }),
      // Read lazily, so the placeholder prop can change after mount.
      Placeholder.configure({ placeholder: () => instance.placeholder }),
      CharacterCount.configure({ limit: props.limit || null }),
    ];
  }

  const adapter = {
    mount(el, props, ctx) {
      const doc = el.ownerDocument;
      injectStyle(doc, "xenia-rich-text-style", STYLE);

      const host = doc.createElement("div");
      host.className = "xenia-rich-text";
      const toolbarEl = doc.createElement("div");
      toolbarEl.className = "xenia-rich-text__toolbar";
      toolbarEl.setAttribute("role", "toolbar");
      const editorEl = doc.createElement("div");
      host.append(toolbarEl, editorEl);
      el.appendChild(host);

      const content = toPayload(props.content);

      const instance = {
        ctx,
        win: doc.defaultView,
        host,
        toolbarEl,
        toolbarButtons: [],
        editor: null,
        format: props.format === "json" ? "json" : "html",
        placeholder: props.placeholder ?? "",
        revision: content.revision,
        field: createFormField(ctx),
        applying: false,
        stopIsolation: isolateFormEvents(el),
      };

      try {
        instance.editor = new Editor({
          element: editorEl,
          extensions: buildExtensions(props, instance),
          content: parseContent(
            content.value,
            content.format ?? instance.format,
          ),
          editable: props.editable !== false,
          onUpdate: () => {
            updateToolbar(instance);
            if (instance.applying) return;

            const detail = changeDetail(instance);
            ctx.emit("change", detail);
            instance.field.report(detail.value);
          },
          onSelectionUpdate: () => updateToolbar(instance),
          onFocus: () => ctx.emit("focus", {}),
          onBlur: () => ctx.emit("blur", {}),
        });

        renderToolbar(instance, props.toolbar ?? false);
        return instance;
      } catch (error) {
        instance.editor?.destroy();
        instance.stopIsolation();
        host.remove();
        throw error;
      }
    },

    destroy(instance) {
      instance.editor.destroy();
      instance.stopIsolation();
      instance.host.remove();
    },

    props: {
      // Same order as monaco.js: revision forces, form echoes are ignored,
      // anything else is applied and quietly synced to the form.
      content(instance, input) {
        const payload = toPayload(input);
        const forced = payload.revision !== instance.revision;
        instance.revision = payload.revision;

        if (forced) instance.field.clear();
        else if (instance.field.isEcho(payload.value)) return;

        const next = parseContent(
          payload.value,
          payload.format ?? instance.format,
        );
        const current = currentValue(instance);
        const same =
          typeof next === "string"
            ? next === current
            : JSON.stringify(next) === JSON.stringify(current);

        if (!same) {
          instance.applying = true;
          try {
            instance.editor.commands.setContent(next, { emitUpdate: false });
          } finally {
            instance.applying = false;
          }
        }

        instance.field.sync(currentValue(instance));
      },

      format(instance, format) {
        instance.format = format === "json" ? "json" : "html";
      },

      editable(instance, editable) {
        instance.editor.setEditable(editable !== false, false);
        updateToolbar(instance);
      },

      placeholder(instance, placeholder) {
        instance.placeholder = placeholder ?? "";
        instance.editor.view.dispatch(instance.editor.state.tr); // redraw decorations
      },

      toolbar: (instance, toolbar) => renderToolbar(instance, toolbar ?? false),
      limit: (_instance, _limit, ctx) => ctx.remount(),
      starter_kit: (_instance, _config, ctx) => ctx.remount(),
    },

    commands: {
      focus: guarded("focus", (i, { position = "end" }) =>
        i.editor.commands.focus(position),
      ),
      blur: guarded("blur", (i) => i.editor.commands.blur()),

      set_content: guarded("set_content", (i, { value, format }) => {
        i.applying = true;
        try {
          i.editor.commands.setContent(
            parseContent(value, format ?? i.format),
            { emitUpdate: false },
          );
        } finally {
          i.applying = false;
        }
        i.field.sync(currentValue(i));
      }),

      clear: guarded("clear", (i) => {
        i.applying = true;
        try {
          i.editor.commands.setContent("", { emitUpdate: false });
        } finally {
          i.applying = false;
        }
        i.field.sync(currentValue(i));
      }),

      insert: guarded("insert", (i, { content }) => {
        if (content == null) throw new TypeError("insert expects %{content}");
        i.editor.chain().focus().insertContent(content).run();
      }),

      run: guarded("run", (i, { command, args }) => {
        const chain = i.editor.chain().focus();
        if (
          typeof command !== "string" ||
          typeof chain[command] !== "function"
        ) {
          throw new Error(`unknown Tiptap command ${JSON.stringify(command)}`);
        }

        const list = args == null ? [] : Array.isArray(args) ? args : [args];
        chain[command](...list).run();
      }),
    },

    events: {
      change: { debounce: 300 },
      focus: {},
      blur: {},
      error: {},
    },
  };

  return withLibrary(adapter, loadLibrary, (library) => {
    ({ Editor, StarterKit, CharacterCount, Placeholder } =
      pickLibrary(library));
  });
}
