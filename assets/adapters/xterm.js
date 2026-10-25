/**
 * Xenia's official adapter for xterm.js (v5/v6).
 *
 * A terminal is a stream, not a value: its screen never travels as a prop.
 * Server output arrives as commands, user input leaves as events.
 *
 * Props (all optional, applied in place):
 *   font_size, font_family, font_weight, line_height, letter_spacing,
 *   cursor_blink, cursor_style ("block" | "underline" | "bar"),
 *   scrollback, read_only, theme (xterm ITheme object)
 *   options   any other xterm option, camelCase or snake_case, merged
 *   links     true (default) makes URLs clickable; false turns it off
 *   A removed prop restores xterm's default for that option.
 *
 * Commands (Xenia.push_to/4):
 *   write %{text}, writeln %{text}, paste %{text}
 *   clear, reset, focus, blur
 *   scroll_to_bottom, scroll_to_top, scroll_lines %{amount}
 *   select_all, clear_selection
 *   search_next %{query, case_sensitive?, regex?, whole_word?}
 *   search_previous %{...same}, clear_search
 *   `paste` acts as if the user typed the text, so it also emits `data`.
 *
 * Events (bind with on_<event>):
 *   data       %{data}            every input chunk, never debounced
 *   resize     %{cols, rows}      after a refit, debounced 100 ms
 *   ready      %{cols, rows}      once per mount, after the first real fit;
 *                                 replay server-side output here
 *   title      %{title}           a program set the window title
 *   bell       %{}                a program rang the bell
 *   selection  %{text}            the selection changed, debounced 200 ms
 *   search     %{query, found}    result of a search command
 *   error      %{source, message, code}
 *
 * Notes:
 *   - The server must echo input: xterm doesn't print what the user types.
 *   - The container needs a height (e.g. style="height: 320px"). While it is
 *     hidden or has no size, the terminal isn't fitted and `ready` waits.
 *   - Import xterm's CSS once, e.g. in app.css:
 *       @import "../node_modules/@xterm/xterm/css/xterm.css";
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createXterm } from "xenia/xterm"
 *   const xterm = createXterm({
 *     load: async () => ({
 *       ...(await import("@xterm/xterm")),
 *       ...(await import("@xterm/addon-fit")),
 *       ...(await import("@xterm/addon-search")),
 *       ...(await import("@xterm/addon-web-links")),
 *     })
 *   })
 *   // createHooks({ Xterm: xterm }), then <.xterm> (Xenia.Adapters.Xterm)
 *   Extend it by spreading: { ...xterm, commands: { ...xterm.commands, mine() {} } }
 */

import {
  camelizeKeys,
  expectLibrary,
  guarded,
  isFiniteNumber,
  isolateFormEvents,
  loadOnce,
  reportError,
  withLibrary,
} from "./shared.js";

const LOAD = "createXterm({ load: see the usage at the top of this file })";

function pickLibrary(library) {
  const { Terminal, FitAddon, SearchAddon, WebLinksAddon } = library ?? {};
  expectLibrary(
    [Terminal, FitAddon, SearchAddon, WebLinksAddon].every(
      (part) => typeof part === "function",
    ),
    LOAD,
  );
  return { Terminal, FitAddon, SearchAddon, WebLinksAddon };
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createXterm({ load: libraryImport } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let Terminal, FitAddon, SearchAddon, WebLinksAddon;
  /** Server prop name → xterm option name. */
  const OPTION_PROPS = {
    font_size: "fontSize",
    font_family: "fontFamily",
    font_weight: "fontWeight",
    line_height: "lineHeight",
    letter_spacing: "letterSpacing",
    cursor_blink: "cursorBlink",
    cursor_style: "cursorStyle",
    scrollback: "scrollback",
    read_only: "disableStdin",
    theme: "theme",
  };

  /** Palettes for the app's light and dark themes (consumes: ["theme"]). */
  const PALETTES = {
    light: {
      background: "#ffffff",
      foreground: "#1f2937",
      cursor: "#7c3aed",
      selectionBackground: "#ddd6fe",
    },
    dark: {
      background: "#0f0a1f",
      foreground: "#e5e7eb",
      cursor: "#fbbf24",
      selectionBackground: "#4c1d95",
    },
  };

  /** Options that change the cell size, so the terminal must refit after them. */
  const LAYOUT_OPTIONS = new Set([
    "fontSize",
    "fontFamily",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
  ]);

  /** Xenia's own defaults, applied before props. */
  const BASE_OPTIONS = {
    fontSize: 14,
    cursorBlink: true,
    convertEol: true, // lets the server send "\n" instead of "\r\n"
    allowProposedApi: true, // needed by the search addon's decorations
  };

  /**
   * Fits the terminal to its container if possible. Returns true only after a
   * real fit: skipped when the instance is dead, the container has no size
   * (hidden, not laid out), or FitAddon can't propose positive dimensions.
   */
  function fitSafely(instance) {
    const { el, fit, ctx } = instance;

    if (!ctx.isAlive()) return false;

    const { width, height } = el.getBoundingClientRect();
    if (width <= 0 || height <= 0) return false;

    const dimensions = fit.proposeDimensions();
    if (!dimensions || dimensions.cols <= 0 || dimensions.rows <= 0)
      return false;

    fit.fit();
    return true;
  }

  /**
   * Refits at most once per animation frame, and emits `ready` after the first
   * successful fit, so the server only replays output into a measured terminal.
   */
  function scheduleFit(instance) {
    if (instance.frame) return;

    instance.frame = instance.win.requestAnimationFrame(() => {
      instance.frame = 0;
      if (!fitSafely(instance)) return;

      if (!instance.readySent) {
        instance.readySent = true;
        instance.ctx.emit("ready", {
          cols: instance.term.cols,
          rows: instance.term.rows,
        });
      }
    });
  }

  /**
   * Sets one xterm option; undefined restores the value from before props.
   * For `theme`, the app's theme name ("light" or "dark") picks a palette.
   */
  function setOption(instance, option, value) {
    if (option === "theme" && typeof value === "string")
      value = PALETTES[value];
    instance.term.options[option] =
      value === undefined ? instance.defaults[option] : value;
    if (LAYOUT_OPTIONS.has(option)) scheduleFit(instance);
  }

  function applyOptionsProp(instance, options) {
    for (const [option, value] of Object.entries(camelizeKeys(options ?? {}))) {
      if (!(option in instance.defaults))
        instance.defaults[option] = instance.term.options[option];
      setOption(instance, option, value);
    }
  }

  function setLinks(instance, enabled) {
    if (enabled === false) {
      instance.links?.dispose();
      instance.links = null;
    } else if (!instance.links) {
      instance.links = new WebLinksAddon();
      instance.term.loadAddon(instance.links);
    }
  }

  function textArg(command, args) {
    if (typeof args?.text === "string") return args.text;
    throw new TypeError(`${command} expects %{text: string}`);
  }

  function search(instance, direction, args) {
    const {
      query,
      case_sensitive: caseSensitive,
      regex,
      whole_word: wholeWord,
    } = args;

    if (typeof query !== "string" || query === "") {
      throw new TypeError(
        `search_${direction} expects %{query: non-empty string}`,
      );
    }

    const options = {
      caseSensitive: Boolean(caseSensitive),
      regex: Boolean(regex),
      wholeWord: Boolean(wholeWord),
    };
    const found =
      direction === "next"
        ? instance.search.findNext(query, options)
        : instance.search.findPrevious(query, options);

    instance.ctx.emit("search", { query, found });
  }

  /**
   * Releases everything an instance holds. Shared by destroy() and a failed
   * mount; tolerates a partially built instance.
   */
  function disposeInstance(instance) {
    if (instance.frame) instance.win.cancelAnimationFrame(instance.frame);
    instance.frame = 0;

    instance.resize?.disconnect();
    clearTimeout(instance.selectionTimer);
    instance.stopIsolation?.();

    for (const disposable of instance.disposables) disposable.dispose();
    instance.disposables.length = 0;

    instance.term.dispose(); // also disposes loaded addons
  }

  const adapter = {
    // The app's theme arrives as the `theme` prop.
    consumes: ["theme"],

    mount(el, props, ctx) {
      const term = new Terminal(BASE_OPTIONS);

      const instance = {
        el,
        term,
        ctx,
        win: el.ownerDocument.defaultView,
        fit: null,
        search: null,
        links: null,
        resize: null,
        defaults: {},
        frame: 0,
        disposables: [],
        readySent: false,
        selectionTimer: null,
        stopIsolation: null,
      };

      // Xenia doesn't call destroy() for a failed mount, so everything
      // allocated here is released before rethrowing.
      try {
        for (const option of Object.values(OPTION_PROPS)) {
          instance.defaults[option] = term.options[option];
        }

        instance.fit = new FitAddon();
        instance.search = new SearchAddon();
        term.loadAddon(instance.fit);
        term.loadAddon(instance.search);
        setLinks(instance, props.links);

        term.open(el);
        instance.stopIsolation = isolateFormEvents(el);

        for (const [prop, option] of Object.entries(OPTION_PROPS)) {
          if (props[prop] !== undefined)
            setOption(instance, option, props[prop]);
        }

        applyOptionsProp(instance, props.options);

        instance.disposables.push(
          term.onData((data) => ctx.emit("data", { data })),
          term.onResize(({ cols, rows }) => ctx.emit("resize", { cols, rows })),
          term.onTitleChange((title) => ctx.emit("title", { title })),
          term.onBell(() => ctx.emit("bell", {})),
          term.onSelectionChange(() => {
            clearTimeout(instance.selectionTimer);
            instance.selectionTimer = setTimeout(() => {
              if (ctx.isAlive())
                ctx.emit("selection", { text: term.getSelection() });
            }, 200);
          }),
        );

        // Fires once when observing starts and again when a hidden container
        // becomes visible, which is what delays `ready` correctly.
        instance.resize = new ResizeObserver(() => scheduleFit(instance));
        instance.resize.observe(el);

        scheduleFit(instance);
        return instance;
      } catch (error) {
        try {
          disposeInstance(instance);
        } catch (cleanupError) {
          console.error(
            "[Xenia xterm] cleanup after failed mount failed:",
            cleanupError,
          );
        }

        throw error;
      }
    },

    destroy(instance) {
      disposeInstance(instance);
    },

    props: {
      ...Object.fromEntries(
        Object.entries(OPTION_PROPS).map(([prop, option]) => [
          prop,
          (instance, value) => setOption(instance, option, value),
        ]),
      ),

      options(instance, options, ctx) {
        try {
          applyOptionsProp(instance, options);
        } catch (error) {
          reportError(ctx, "options", error);
        }
      },

      links: (instance, enabled) => setLinks(instance, enabled),
    },

    commands: {
      write: guarded("write", (i, args) =>
        i.term.write(textArg("write", args)),
      ),
      writeln: guarded("writeln", (i, args) =>
        i.term.writeln(textArg("writeln", args)),
      ),
      paste: guarded("paste", (i, args) =>
        i.term.paste(textArg("paste", args)),
      ),

      clear: guarded("clear", (i) => i.term.clear()),
      reset: guarded("reset", (i) => i.term.reset()),
      focus: guarded("focus", (i) => i.term.focus()),
      blur: guarded("blur", (i) => i.term.blur()),

      scroll_to_bottom: guarded("scroll_to_bottom", (i) =>
        i.term.scrollToBottom(),
      ),
      scroll_to_top: guarded("scroll_to_top", (i) => i.term.scrollToTop()),
      scroll_lines: guarded("scroll_lines", (i, { amount }) => {
        if (!isFiniteNumber(amount))
          throw new TypeError("scroll_lines expects %{amount: number}");
        i.term.scrollLines(amount);
      }),

      select_all: guarded("select_all", (i) => i.term.selectAll()),
      clear_selection: guarded("clear_selection", (i) =>
        i.term.clearSelection(),
      ),

      search_next: guarded("search_next", (i, args) => search(i, "next", args)),
      search_previous: guarded("search_previous", (i, args) =>
        search(i, "previous", args),
      ),
      clear_search: guarded("clear_search", (i) => i.search.clearDecorations()),
    },

    events: {
      data: {}, // no debounce: every keystroke must reach the server
      resize: { debounce: 100 }, // only the final size matters while dragging
      ready: {},
      title: {},
      bell: {},
      selection: {},
      search: {},
      error: {},
    },
  };

  return withLibrary(adapter, loadLibrary, (library) => {
    ({ Terminal, FitAddon, SearchAddon, WebLinksAddon } = pickLibrary(library));
  });
}
