/**
 * Xenia's official adapter for flatpickr (v4): date, time, date-time, range and
 * multiple-date pickers, usable as a form field.
 *
 * Values are strings in `date_format` (default "Y-m-d", "Y-m-d H:i" with
 * time, "H:i" for time only), so they arrive on the server ready for
 * Date.from_iso8601/1 or NaiveDateTime parsing ("Y-m-d\\TH:i:S" for ISO
 * date-times).
 *
 * Props:
 *   value        a date string; for mode "multiple" or "range" a list of them
 *   revision     bump to force `value` over the user's newer choice
 *   mode         "single" (default) | "multiple" | "range". Changing it remounts.
 *   enable_time  true adds a time picker
 *   no_calendar  true for a time-only picker. Changing it remounts.
 *   time_24hr    true for a 24-hour clock
 *   date_format  flatpickr format of the value, e.g. "Y-m-d", "d.m.Y H:i"
 *   alt_format   friendly format shown to the user (default "F j, Y", with
 *                time "F j, Y H:i"); alt_input: false shows `date_format`
 *   min_date, max_date   date strings, or "today"
 *   disable      dates (or %{from, to} ranges) the user can't pick
 *   inline       true shows the calendar permanently. Changing it remounts.
 *   placeholder  text shown while empty
 *   locale       a locale object, or the name of one registered with
 *                flatpickr.localize / imported from "flatpickr/dist/l10n"
 *   options      any other flatpickr option, snake_case or camelCase
 *                (week_numbers, show_months, minute_increment, ...)
 *
 * Commands:
 *   open, close, toggle
 *   clear                         clears the value (reported as a change)
 *   set_value %{value}            sets it without a change event
 *   jump_to_date %{date}          shows that month
 *
 * Events:
 *   change  %{value}   a string, or a list for "multiple"/"range"
 *                      (a range sends its list once both ends are chosen)
 *   open %{}, close %{}
 *   error   %{source, message, code}
 *
 * Form field: with field={@form[:starts_on]} the value is submitted with the
 * form; "multiple"/"range" submit a JSON list string.
 *
 * Import flatpickr's CSS once, e.g. in app.css:
 *   @import "../node_modules/flatpickr/dist/flatpickr.min.css";
 * (flatpickr/dist/themes/dark.css is a dark theme.)
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createFlatpickr } from "xenia/flatpickr"
 *   const flatpickr = createFlatpickr({
 *     load: () => import("flatpickr")
 *   })
 *   // createHooks({ Flatpickr: flatpickr }), then <.flatpickr> (Xenia.Adapters.Flatpickr)
 *   Extend it by spreading: { ...flatpickr, commands: { ...flatpickr.commands, mine() {} } }
 */

import {
  camelizeKeys,
  createFormField,
  defaultExport,
  expectLibrary,
  guarded,
  isolateFormEvents,
  loadOnce,
  reportError,
  toList,
  withLibrary,
} from "./shared.js";

const LOAD = 'createFlatpickr({ load: () => import("flatpickr") })';

function pickLibrary(library) {
  const flatpickrLib = defaultExport(library);
  expectLibrary(typeof flatpickrLib === "function", LOAD);
  return { flatpickrLib };
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createFlatpickr({ load: libraryImport } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let flatpickrLib;
  /** Settings flatpickr can't change on a live instance. */
  const REMOUNT_PROPS = ["mode", "no_calendar", "inline"];

  function dateFormat(props) {
    if (props.date_format) return props.date_format;
    if (props.no_calendar) return "H:i";
    return props.enable_time ? "Y-m-d H:i" : "Y-m-d";
  }

  function altFormat(props) {
    if (props.alt_format) return props.alt_format;
    if (props.no_calendar) return props.time_24hr ? "H:i" : "h:i K";
    return props.enable_time
      ? props.time_24hr
        ? "F j, Y H:i"
        : "F j, Y h:i K"
      : "F j, Y";
  }

  function config(props) {
    return {
      mode: props.mode ?? "single",
      enableTime: Boolean(props.enable_time || props.no_calendar),
      noCalendar: Boolean(props.no_calendar),
      time_24hr: Boolean(props.time_24hr),
      dateFormat: dateFormat(props),
      altInput: props.alt_input !== false,
      altFormat: altFormat(props),
      minDate: props.min_date ?? null,
      maxDate: props.max_date ?? null,
      disable: props.disable ?? [],
      inline: Boolean(props.inline),
      ...(props.locale ? { locale: props.locale } : {}),
      ...camelizeKeys(props.options ?? {}),
    };
  }

  const isMulti = (instance) => instance.fp.config.mode !== "single";

  /** The current selection as the adapter's value. */
  function currentValue(instance) {
    const { fp } = instance;
    const strings = fp.selectedDates.map((date) =>
      fp.formatDate(date, fp.config.dateFormat),
    );
    return isMulti(instance) ? strings : (strings[0] ?? "");
  }

  function toDates(value, multi) {
    if (value == null || value === "") return [];
    if (multi) return toList(value); // also decodes a submitted JSON list
    return Array.isArray(value) ? value.slice(0, 1) : [value];
  }

  /** Sets the picker's value without firing onChange. */
  function setValueQuietly(instance, value) {
    instance.fp.setDate(toDates(value, isMulti(instance)), false);
  }

  function scheduleApply(instance) {
    if (instance.applyScheduled) return;
    instance.applyScheduled = true;
    queueMicrotask(() => applyValue(instance));
  }

  /**
   * Applies the latest server value after all props of one update were seen:
   * forced by a new revision, ignored when it's the picker's own earlier value
   * coming back from validate, applied and quietly synced otherwise.
   */
  function applyValue(instance) {
    instance.applyScheduled = false;
    if (instance.destroyed || !instance.pending) return;

    const { value } = instance.pending;
    instance.pending = null;

    if (instance.forced) {
      instance.forced = false;
      instance.field.clear();
    } else if (instance.field.isEcho(value ?? (isMulti(instance) ? [] : ""))) {
      return;
    }

    setValueQuietly(instance, value);
    instance.field.sync(currentValue(instance));
  }

  function setOption(instance, key, value) {
    instance.fp.set(key, value);
  }

  const adapter = {
    mount(el, props, ctx) {
      const doc = el.ownerDocument;

      // Unnamed: the value travels through ctx.setFormValue, not this input.
      const input = doc.createElement("input");
      input.type = "text";
      input.placeholder = props.placeholder ?? "";
      input.style.cssText = "width: 100%;";
      el.appendChild(input);

      const instance = {
        ctx,
        input,
        fp: null,
        field: createFormField(ctx),
        revision: props.revision,
        serverValue: props.value,
        pending: null,
        forced: false,
        applyScheduled: false,
        destroyed: false,
        stopIsolation: isolateFormEvents(el),
      };

      try {
        instance.fp = flatpickrLib(input, {
          ...config(props),
          defaultDate: toDates(
            props.value,
            (props.mode ?? "single") !== "single",
          ),
          onChange: () => {
            // A range is reported once both ends are chosen.
            if (
              instance.fp.config.mode === "range" &&
              instance.fp.selectedDates.length === 1
            )
              return;

            const value = currentValue(instance);
            ctx.emit("change", { value });
            instance.field.report(value);
          },
          onOpen: () => ctx.emit("open", {}),
          onClose: () => ctx.emit("close", {}),
        });

        // flatpickr's alt input is a second <input>; give it the placeholder.
        if (instance.fp.altInput)
          instance.fp.altInput.placeholder = props.placeholder ?? "";

        return instance;
      } catch (error) {
        instance.stopIsolation();
        input.remove();
        throw error;
      }
    },

    destroy(instance) {
      instance.destroyed = true;
      instance.fp.destroy();
      instance.stopIsolation();
      instance.input.remove();
    },

    props: {
      value(instance, value) {
        instance.serverValue = value;
        instance.pending = { value };
        scheduleApply(instance);
      },

      revision(instance, revision) {
        if (revision === instance.revision) return;

        instance.revision = revision;
        instance.forced = true;
        instance.pending ??= { value: instance.serverValue };
        scheduleApply(instance);
      },

      enable_time: (i, value) => setOption(i, "enableTime", Boolean(value)),
      time_24hr: (i, value) => setOption(i, "time_24hr", Boolean(value)),
      min_date: (i, value) => setOption(i, "minDate", value ?? null),
      max_date: (i, value) => setOption(i, "maxDate", value ?? null),
      disable: (i, value) => setOption(i, "disable", value ?? []),

      date_format(instance, value) {
        setOption(
          instance,
          "dateFormat",
          value ?? dateFormat({ enable_time: instance.fp.config.enableTime }),
        );
        instance.field.sync(currentValue(instance));
      },

      alt_format: (i, value) => setOption(i, "altFormat", value ?? "F j, Y"),

      placeholder(instance, value) {
        instance.input.placeholder = value ?? "";
        if (instance.fp.altInput)
          instance.fp.altInput.placeholder = value ?? "";
      },

      locale: (i, value) => setOption(i, "locale", value ?? "default"),

      options(instance, options, ctx) {
        try {
          for (const [key, value] of Object.entries(
            camelizeKeys(options ?? {}),
          ))
            setOption(instance, key, value);
        } catch (error) {
          reportError(ctx, "options", error);
        }
      },

      ...Object.fromEntries(
        REMOUNT_PROPS.map((key) => [
          key,
          (_instance, _value, ctx) => ctx.remount(),
        ]),
      ),
    },

    commands: {
      open: guarded("open", (i) => i.fp.open()),
      close: guarded("close", (i) => i.fp.close()),
      toggle: guarded("toggle", (i) => i.fp.toggle()),

      // A user-visible action: reported like a change.
      clear: guarded("clear", (i) => i.fp.clear()),

      set_value: guarded("set_value", (i, { value }) => {
        setValueQuietly(i, value);
        i.field.sync(currentValue(i));
      }),

      jump_to_date: guarded("jump_to_date", (i, { date }) => {
        if (date == null) throw new TypeError("jump_to_date expects %{date}");
        i.fp.jumpToDate(date);
      }),
    },

    events: {
      change: {},
      open: {},
      close: {},
      error: {},
    },
  };

  return withLibrary(adapter, loadLibrary, (library) => {
    ({ flatpickrLib } = pickLibrary(library));
  });
}
