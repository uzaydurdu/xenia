/**
 * Xenia's official adapter for Shoelace's <sl-rating> (shoelace_rating.js).
 *
 * mount() returns the element itself, so any prop without a handler is set
 * as an element property by Xenia's default handler (`element[key] = value`).
 * Only `value` has a handler, because it needs form echo handling.
 *
 * Props (all <sl-rating> properties):
 *   value      number   current rating (default 0)
 *   max        number   number of symbols (default 5)
 *   precision  number   step size, e.g. 0.5 for half stars (default 1)
 *   label      string   accessible label
 *   readonly   boolean  show a value that can't be changed
 *   disabled   boolean  greyed out, no input
 *   revision   number   bump to force `value` (see "Server corrections")
 *   Send every prop on every render (give them defaults in the component):
 *   a removed prop would be set to `undefined`, not back to its default.
 *
 * Commands:  focus, blur, set_value %{value}
 * Events:    change %{value}, hover %{phase, value}, focus, blur, error
 *
 * Form field: inside <.form> with field={@form[:rating]}, the value is
 * submitted with the form, and validate replies carrying an older value are
 * ignored.
 *
 * Server corrections: props are only sent when they change. If the user
 * picks 4 and the server refuses it (keeping value at 2), the `value` prop
 * doesn't change. Bump `revision` or send `set_value` to put it back.
 *
 * Styling (on the container or any ancestor; they inherit):
 *   --xenia-rating-filled   --xenia-rating-empty
 *   --xenia-rating-size     --xenia-rating-spacing
 * The adapter points the element's own --symbol-* variables at these, so
 * stars render correctly even without Shoelace's theme CSS. The theme is
 * still recommended (focus ring, disabled look):
 *   @import "../node_modules/@shoelace-style/shoelace/dist/themes/light.css";
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createShoelaceRating } from "xenia/shoelace-rating"
 *   const shoelaceRating = createShoelaceRating({
 *     load: () => import("@shoelace-style/shoelace/dist/components/rating/rating.js")
 *   })
 *   // createHooks({ ShoelaceRating: shoelaceRating }), then <.shoelace_rating> (Xenia.Adapters.ShoelaceRating)
 *   Extend it by spreading: { ...shoelaceRating, commands: { ...shoelaceRating.commands, mine() {} } }
 */

import {
  createFormField,
  expectLibrary,
  guarded,
  isFiniteNumber,
  isolateFormEvents,
  loadOnce,
  withLibrary,
} from "./shared.js";

const LOAD =
  'createShoelaceRating({ load: () => import("@shoelace-style/shoelace/dist/components/rating/rating.js") })';

function pickLibrary() {
  // Importing the component registers <sl-rating>; nothing else is needed.
  expectLibrary(Boolean(globalThis.customElements?.get("sl-rating")), LOAD);
  return {};
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createShoelaceRating({ load: libraryImport } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);

  /**
   * element → per-instance state:
   *   listeners, lastHover        event bookkeeping
   *   field                       form-field helper (createFormField)
   *   revision, serverValue       last `revision` and `value` props
   *   pendingValue, forced, applyScheduled   see applyValue()
   *   stopIsolation               removes isolateFormEvents listeners
   */
  const state = new WeakMap();

  const STAR_VARIABLES = {
    "--symbol-color": "var(--xenia-rating-empty, #d4d4d8)",
    "--symbol-color-active": "var(--xenia-rating-filled, #f59e0b)",
    "--symbol-size": "var(--xenia-rating-size, 1.25rem)",
    "--symbol-spacing": "var(--xenia-rating-spacing, 0.125rem)",
  };

  let themeChecked = false;

  /** Warns once if Shoelace's theme tokens are missing from the page. */
  function checkTheme(doc) {
    if (themeChecked) return;
    themeChecked = true;

    const token = doc.defaultView
      .getComputedStyle(doc.documentElement)
      .getPropertyValue("--sl-focus-ring-width")
      .trim();

    if (token === "") {
      console.warn(
        "[Xenia shoelace_rating] Shoelace's theme CSS isn't loaded. Stars still render, but the " +
          "focus ring and disabled style need it (@shoelace-style/shoelace/dist/themes/light.css).",
      );
    }
  }

  function scheduleApply(node) {
    const entry = state.get(node);
    if (entry.applyScheduled) return;

    entry.applyScheduled = true;
    queueMicrotask(() => applyValue(node));
  }

  /**
   * Applies the latest server value: forced by a new revision, ignored when
   * it is this rating's own earlier value coming back from validate, applied
   * (and quietly synced to the form) otherwise.
   */
  function applyValue(node) {
    const entry = state.get(node);
    if (!entry) return; // destroyed in the meantime

    entry.applyScheduled = false;
    const pending = entry.pendingValue;
    entry.pendingValue = null;
    if (!pending) return;

    if (entry.forced) {
      entry.forced = false;
      entry.field.clear();
    } else if (entry.field.isEcho(pending.value)) {
      return;
    }

    node.value = pending.value;
    entry.field.sync(pending.value);
  }

  function listen(node, type, handler) {
    node.addEventListener(type, handler);
    state.get(node).listeners.push([type, handler]);
  }

  const adapter = {
    mount(el, props, ctx) {
      const doc = el.ownerDocument;
      const node = doc.createElement("sl-rating");

      state.set(node, {
        listeners: [],
        lastHover: null,
        field: createFormField(ctx),
        revision: props.revision,
        serverValue: props.value ?? 0, // last `value` prop, for forced reverts
        stopIsolation: isolateFormEvents(el),
      });

      for (const [name, value] of Object.entries(STAR_VARIABLES)) {
        node.style.setProperty(name, value);
      }

      checkTheme(doc);

      // Properties, not attributes, so numbers and booleans keep their types.
      const { revision: _revision, ...properties } = props;
      Object.assign(node, properties);

      // Shoelace fires sl-change only for user input, so server updates
      // never echo back as change events.
      listen(node, "sl-change", () => {
        ctx.emit("change", { value: node.value });
        state.get(node).field.report(node.value);
      });

      // sl-hover fires on every pointer move; only changes are forwarded.
      listen(node, "sl-hover", (event) => {
        const { phase, value } = event.detail;
        const entry = state.get(node);

        if (phase === "move" && value === entry.lastHover) return;

        entry.lastHover = phase === "end" ? null : value;
        ctx.emit("hover", { phase, value });
      });

      // focusin/focusout bubble out of the shadow DOM to the host.
      listen(node, "focusin", () => ctx.emit("focus", {}));
      listen(node, "focusout", () => ctx.emit("blur", {}));

      el.appendChild(node);
      return node;
    },

    destroy(node) {
      const entry = state.get(node);

      for (const [type, handler] of entry?.listeners ?? []) {
        node.removeEventListener(type, handler);
      }

      entry?.stopIsolation();
      state.delete(node);
      node.remove();
    },

    props: {
      // `value` and `revision` can change in the same update, in either
      // dispatch order. Both handlers only record what changed; one microtask
      // later, after every changed prop was seen, applyValue decides.
      value(node, value) {
        const entry = state.get(node);
        entry.serverValue = value ?? 0;
        entry.pendingValue = { value: entry.serverValue };
        scheduleApply(node);
      },

      revision(node, revision) {
        const entry = state.get(node);
        if (revision === entry.revision) return;

        entry.revision = revision;
        entry.forced = true;
        // A revision alone forces the server's last value back, e.g. after
        // it refused the user's pick and kept `value` unchanged.
        entry.pendingValue ??= { value: entry.serverValue };
        scheduleApply(node);
      },
    },

    commands: {
      focus: guarded("focus", (node) => node.focus()),
      blur: guarded("blur", (node) => node.blur()),

      set_value: guarded("set_value", (node, { value }) => {
        if (!isFiniteNumber(value) || value < 0) {
          throw new TypeError("set_value expects %{value: number ≥ 0}");
        }

        node.value = value;
        state.get(node).field.sync(value);
      }),
    },

    events: {
      change: {},
      hover: {},
      focus: {},
      blur: {},
      error: {},
    },
  };

  return withLibrary(adapter, loadLibrary, (library) => {
    pickLibrary(library);
  });
}
