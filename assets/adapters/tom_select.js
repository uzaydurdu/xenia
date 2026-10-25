/**
 * Xenia's official adapter for Tom Select (v2): a searchable select or multi-select,
 * with tagging, server-side search, and form-field support.
 *
 * Props:
 *   options      [%{value, text, disabled?, optgroup?}]   the choices
 *   optgroups    [%{value, label}]                        optional groups
 *   value        the selected value (a string), or a list for `multiple`
 *   multiple     true for a multi-select. Changing it remounts.
 *   placeholder  text shown while nothing is selected
 *   create       true lets the user add values that aren't in `options`
 *   max_items    maximum selections (multi-select)
 *   remote       true sends what the user types to the server as a `search`
 *                call. Reply from handle_event with
 *                {:reply, %{options: [...]}, socket}, and those options
 *                are the results for that query. (Updating `options` works
 *                too.)
 *   disabled     true / false
 *   settings     any other Tom Select setting, snake_case or camelCase:
 *                max_options, close_after_select, hide_selected,
 *                allow_empty_option, plugins (e.g. ["remove_button"]), ...
 *                Changing them remounts.
 *
 * Commands:
 *   focus, blur, open, close
 *   clear                          remove the selection (reported as change)
 *   set_value %{value}             select programmatically (not reported)
 *   add_option %{value, text}
 *
 * Events:
 *   change   %{value}          a string, or a list for `multiple`
 *   search   %{query}          with `remote`; a call: reply %{options: [...]}
 *   created  %{value, text}    the user created a new option
 *   focus %{}, blur %{}
 *   error    %{source, message, code}
 *
 * Form field: with field={@form[:tag]} the value is submitted with the form.
 * A multi-select submits a JSON array string, e.g. "[\"a\",\"b\"]" (decode it
 * with Jason), because the form value is one hidden input.
 *
 * Import Tom Select's CSS once, e.g. in app.css:
 *   @import "../node_modules/tom-select/dist/css/tom-select.css";
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createTomSelect } from "xenia/tom-select"
 *   const tomSelect = createTomSelect({
 *     load: () => import("tom-select")
 *   })
 *   // createHooks({ TomSelect: tomSelect }), then <.tom_select> (Xenia.Adapters.TomSelect)
 *   Extend it by spreading: { ...tomSelect, commands: { ...tomSelect.commands, mine() {} } }
 */

import {
  camelizeKeys,
  createFormField,
  defaultExport,
  expectLibrary,
  guarded,
  isolateFormEvents,
  loadOnce,
  toList,
  withLibrary,
} from "./shared.js";

const LOAD = 'createTomSelect({ load: () => import("tom-select") })';

function pickLibrary(library) {
  const TomSelect = defaultExport(library);
  expectLibrary(typeof TomSelect === "function", LOAD);
  return { TomSelect };
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createTomSelect({ load: libraryImport } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let TomSelect;
  function normalizeValue(value, multiple) {
    if (multiple) return toList(value).map(String); // also decodes a submitted JSON list

    if (Array.isArray(value)) return value.length ? String(value[0]) : "";
    return value == null ? "" : String(value);
  }

  function normalizeOptions(options) {
    return (Array.isArray(options) ? options : []).map((option) => ({
      ...option,
      value: String(option.value),
      text: option.text ?? String(option.value),
    }));
  }

  /** Current selection, as a string or a list. */
  function currentValue(instance) {
    return normalizeValue(instance.tom.getValue(), instance.multiple);
  }

  /** Runs `fn` without reporting the resulting change events. */
  function silently(instance, fn) {
    instance.applying = true;
    try {
      fn();
    } finally {
      instance.applying = false;
    }
  }

  /** Replaces the choices, keeping the current selection. */
  function setOptions(instance, options) {
    const { tom } = instance;

    silently(instance, () => {
      tom.clearOptions(); // keeps selected options by default
      tom.addOptions(normalizeOptions(options));
      tom.refreshOptions(false);
    });
  }

  function settings(instance, props) {
    const { ctx } = instance;

    const base = {
      options: normalizeOptions(props.options),
      optgroups: props.optgroups ?? [],
      items: []
        .concat(normalizeValue(props.value, instance.multiple))
        .filter((value) => value !== ""),
      placeholder: props.placeholder,
      create: Boolean(props.create),
      maxItems: instance.multiple ? (props.max_items ?? null) : 1,
      valueField: "value",
      labelField: "text",
      searchField: ["text"],
      ...camelizeKeys(props.settings ?? {}),
    };

    if (props.create) {
      base.onOptionAdd = (value, data) => {
        if (!instance.applying)
          ctx.emit("created", { value, text: data?.text ?? value });
      };
    }

    if (props.remote) {
      // Every query goes to the server, and its reply is that query's
      // results (ctx.call), so a slow reply can't fill in a newer query's
      // list. A reply without options leaves them to the options prop.
      base.shouldLoad = () => true;
      base.load = (query, callback) => {
        ctx.call("search", { query }).then(
          (reply) => {
            if (!ctx.isAlive()) return;
            callback(
              Array.isArray(reply?.options)
                ? normalizeOptions(reply.options)
                : undefined,
            );
          },
          () => {
            if (ctx.isAlive()) callback();
          },
        );
      };
    }

    return base;
  }

  const adapter = {
    mount(el, props, ctx) {
      const doc = el.ownerDocument;

      // Unnamed: the value travels through ctx.setFormValue, not this element.
      const element = doc.createElement("select");
      element.multiple = Boolean(props.multiple);
      el.appendChild(element);

      const instance = {
        ctx,
        element,
        tom: null,
        multiple: Boolean(props.multiple),
        applying: false,
        field: createFormField(ctx),
        stopIsolation: isolateFormEvents(el),
      };

      try {
        instance.tom = new TomSelect(element, settings(instance, props));
        if (props.disabled) instance.tom.disable();

        instance.tom.on("change", () => {
          if (instance.applying) return;

          const value = currentValue(instance);
          ctx.emit("change", { value });
          instance.field.report(value);
        });

        instance.tom.on("focus", () => ctx.emit("focus", {}));
        instance.tom.on("blur", () => ctx.emit("blur", {}));

        return instance;
      } catch (error) {
        instance.tom?.destroy();
        instance.stopIsolation();
        element.remove();
        throw error;
      }
    },

    destroy(instance) {
      instance.tom.destroy();
      instance.stopIsolation();
      instance.element.remove();
    },

    props: {
      options: (instance, options) => setOptions(instance, options),

      optgroups(instance, optgroups) {
        silently(instance, () => {
          instance.tom.clearOptionGroups();
          for (const group of optgroups ?? [])
            instance.tom.addOptionGroup(group.value, group);
          instance.tom.refreshOptions(false);
        });
      },

      // In a form, a value this select reported itself is a validate reply.
      value(instance, value) {
        const next = normalizeValue(value, instance.multiple);
        if (instance.field.isEcho(next)) return;

        silently(instance, () => instance.tom.setValue(next, true));
        instance.field.sync(currentValue(instance));
      },

      placeholder(instance, placeholder) {
        instance.tom.settings.placeholder = placeholder ?? "";
        instance.tom.inputState();
        instance.tom.control_input.placeholder = placeholder ?? "";
      },

      disabled(instance, disabled) {
        if (disabled) instance.tom.disable();
        else instance.tom.enable();
      },

      max_items(instance, maxItems) {
        instance.tom.settings.maxItems = instance.multiple
          ? (maxItems ?? null)
          : 1;
      },

      // Built into Tom Select at construction: rebuild for these.
      multiple: (_instance, _value, ctx) => ctx.remount(),
      create: (_instance, _value, ctx) => ctx.remount(),
      remote: (_instance, _value, ctx) => ctx.remount(),
      settings: (_instance, _value, ctx) => ctx.remount(),
    },

    commands: {
      focus: guarded("focus", (i) => i.tom.focus()),
      blur: guarded("blur", (i) => i.tom.blur()),
      open: guarded("open", (i) => i.tom.open()),
      close: guarded("close", (i) => i.tom.close()),

      // A user-visible action triggered by the server: reported like a change.
      clear: guarded("clear", (i) => i.tom.clear()),

      set_value: guarded("set_value", (i, { value }) => {
        silently(i, () =>
          i.tom.setValue(normalizeValue(value, i.multiple), true),
        );
        i.field.sync(currentValue(i));
      }),

      add_option: guarded("add_option", (i, { value, text }) => {
        if (value == null)
          throw new TypeError("add_option expects %{value, text?}");
        silently(i, () => {
          i.tom.addOption({
            value: String(value),
            text: text ?? String(value),
          });
          i.tom.refreshOptions(false);
        });
      }),
    },

    events: {
      change: {},
      search: {}, // a call; Tom Select throttles typing itself (loadThrottle)
      created: {},
      focus: {},
      blur: {},
      error: {},
    },
  };

  return withLibrary(adapter, loadLibrary, (library) => {
    ({ TomSelect } = pickLibrary(library));
  });
}
