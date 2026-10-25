/**
 * Xenia's official adapter for FullCalendar (v6, standard MIT plugins): month, week,
 * day and list views, with drag-and-drop, resizing and date selection.
 *
 * Props:
 *   events     [%{id, title, start, end?, all_day?, color?, background_color?,
 *                 border_color?, text_color?, display?, url?, editable?,
 *                 group_id?, extended_props?}]
 *              Dates as ISO 8601 strings. Keys in snake_case or camelCase.
 *   view       "dayGridMonth" (default) | "timeGridWeek" | "timeGridDay" |
 *              "listWeek" | "dayGridWeek" | "listMonth" | ...
 *   date       ISO date to show
 *   editable   true lets the user drag and resize events
 *   selectable true lets the user select a date range
 *   options    any other FullCalendar option, snake_case or camelCase:
 *              locale, first_day, slot_min_time, slot_max_time,
 *              business_hours, header_toolbar, now_indicator, weekends,
 *              time_zone, ...
 *
 * Commands:
 *   today, prev, next
 *   change_view %{view, date?}
 *   go_to_date %{date}
 *   scroll_to_time %{time}            e.g. "08:00"
 *   select %{start, end?}, unselect
 *   revert_change %{id}               undo the user's last move/resize of an
 *                                     event, e.g. when the server rejects it
 *   update_size
 *
 * Events:
 *   event_click   %{event}
 *   date_click    %{date, all_day}
 *   select        %{start, end, all_day}
 *   event_change  %{event, old_event, kind: "drop" | "resize"}
 *   dates_set     %{start, end, view}   the visible range changed
 *   error         %{source, message, code}
 *   `event` is %{id, title, start, end, all_day, extended_props}.
 *
 * Changing an event: on event_change, update your data and re-render
 * `events`; to refuse, send revert_change with the event's id. (If you only
 * left `events` unchanged, the prop wouldn't be resent and the calendar would
 * keep showing the user's move.)
 *
 * FullCalendar injects its own CSS. For dark mode, set its CSS variables,
 * e.g. [data-theme=dark] { --fc-border-color: #3f3f46; --fc-page-bg-color: #18181b; }
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createFullCalendar } from "xenia/fullcalendar"
 *   const fullcalendar = createFullCalendar({
 *     load: async () => {
 *       const [core, dayGrid, timeGrid, list, interaction] = await Promise.all([
 *         import("@fullcalendar/core"),
 *         import("@fullcalendar/daygrid"),
 *         import("@fullcalendar/timegrid"),
 *         import("@fullcalendar/list"),
 *         import("@fullcalendar/interaction"),
 *       ])
 *       return {
 *         Calendar: core.Calendar,
 *         plugins: [dayGrid.default, timeGrid.default, list.default, interaction.default],
 *       }
 *     }
 *   })
 *   // createHooks({ FullCalendar: fullcalendar }), then <.full_calendar> (Xenia.Adapters.FullCalendar)
 *   Extend it by spreading: { ...fullcalendar, commands: { ...fullcalendar.commands, mine() {} } }
 */

import {
  camelizeKeys,
  expectLibrary,
  guarded,
  loadOnce,
  reportError,
  withLibrary,
} from "./shared.js";

const LOAD =
  "createFullCalendar({ load: see the usage at the top of this file })";

function pickLibrary(library) {
  const { Calendar, plugins } = library ?? {};
  expectLibrary(typeof Calendar === "function" && Array.isArray(plugins), LOAD);
  return { Calendar, calendarPlugins: plugins };
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createFullCalendar({ load: libraryImport } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let Calendar, calendarPlugins;
  const SOURCE_ID = "xenia";

  /** Options the adapter sets itself; `options` can't override them. */
  const MANAGED = new Set(["events", "eventSources", "plugins"]);

  function toEvents(events) {
    return (Array.isArray(events) ? events : []).map((event) => {
      const converted = camelizeKeys(event);
      if (converted.id != null) converted.id = String(converted.id);
      return converted;
    });
  }

  function eventDetail(event) {
    if (!event) return null;

    return {
      id: event.id || null,
      title: event.title,
      start: event.startStr || null,
      end: event.endStr || null,
      all_day: event.allDay,
      extended_props: event.extendedProps ?? {},
    };
  }

  function userOptions(options) {
    return Object.fromEntries(
      Object.entries(camelizeKeys(options ?? {})).filter(
        ([key]) => !MANAGED.has(key),
      ),
    );
  }

  /** Replaces the calendar's events with the server's list. */
  function setEvents(instance, events) {
    const { calendar } = instance;

    calendar.batchRendering(() => {
      calendar.getEventSourceById(SOURCE_ID)?.remove();
      calendar.addEventSource({ id: SOURCE_ID, events: toEvents(events) });
    });

    // The server's list is the truth now: nothing left to revert.
    instance.reverts.clear();
  }

  function setOptions(instance, options) {
    const next = userOptions(options);

    // Options removed since the last update fall back to the adapter's base.
    for (const key of Object.keys(instance.options)) {
      if (!(key in next)) instance.calendar.setOption(key, instance.base[key]);
    }

    for (const [key, value] of Object.entries(next))
      instance.calendar.setOption(key, value);
    instance.options = next;
  }

  function requireDate(command, date) {
    if (typeof date !== "string" || Number.isNaN(Date.parse(date))) {
      throw new TypeError(`${command} expects an ISO 8601 date string`);
    }
  }

  const adapter = {
    mount(el, props, ctx) {
      const doc = el.ownerDocument;
      const host = doc.createElement("div");
      el.appendChild(host);

      const instance = {
        ctx,
        host,
        calendar: null,
        options: {},
        base: {},
        reverts: new Map(),
      };

      const recordChange = (kind) => (info) => {
        if (info.event.id) instance.reverts.set(info.event.id, info.revert);

        ctx.emit("event_change", {
          event: eventDetail(info.event),
          old_event: eventDetail(info.oldEvent),
          kind,
        });
      };

      instance.base = {
        initialView: props.view ?? "dayGridMonth",
        initialDate: props.date,
        height: "100%",
        editable: Boolean(props.editable),
        selectable: Boolean(props.selectable),
        headerToolbar: {
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,listWeek",
        },
      };

      instance.options = userOptions(props.options);

      const calendarInstance = new Calendar(host, {
        ...instance.base,
        ...instance.options,
        plugins: calendarPlugins,
        eventSources: [{ id: SOURCE_ID, events: toEvents(props.events) }],

        eventClick: (info) => {
          // Server-provided URLs would navigate away; report instead.
          info.jsEvent.preventDefault();
          ctx.emit("event_click", { event: eventDetail(info.event) });
        },
        dateClick: (info) =>
          ctx.emit("date_click", { date: info.dateStr, all_day: info.allDay }),
        select: (info) =>
          ctx.emit("select", {
            start: info.startStr,
            end: info.endStr,
            all_day: info.allDay,
          }),
        eventDrop: recordChange("drop"),
        eventResize: recordChange("resize"),
        datesSet: (info) =>
          ctx.emit("dates_set", {
            start: info.startStr,
            end: info.endStr,
            view: info.view.type,
          }),
      });

      instance.calendar = calendarInstance;

      try {
        calendarInstance.render();
        return instance;
      } catch (error) {
        calendarInstance.destroy();
        host.remove();
        throw error;
      }
    },

    destroy(instance) {
      instance.calendar.destroy();
      instance.host.remove();
    },

    props: {
      events: (instance, events) => setEvents(instance, events),

      view(instance, view) {
        if (view) instance.calendar.changeView(view);
      },

      date(instance, date) {
        if (date) instance.calendar.gotoDate(date);
      },

      editable: (instance, editable) =>
        instance.calendar.setOption("editable", Boolean(editable)),
      selectable: (instance, selectable) =>
        instance.calendar.setOption("selectable", Boolean(selectable)),

      options(instance, options, ctx) {
        try {
          setOptions(instance, options);
        } catch (error) {
          reportError(ctx, "options", error);
        }
      },
    },

    commands: {
      today: guarded("today", (i) => i.calendar.today()),
      prev: guarded("prev", (i) => i.calendar.prev()),
      next: guarded("next", (i) => i.calendar.next()),

      change_view: guarded("change_view", (i, { view, date }) => {
        if (typeof view !== "string")
          throw new TypeError("change_view expects %{view: string}");
        i.calendar.changeView(view, date);
      }),

      go_to_date: guarded("go_to_date", (i, { date }) => {
        requireDate("go_to_date", date);
        i.calendar.gotoDate(date);
      }),

      scroll_to_time: guarded("scroll_to_time", (i, { time }) =>
        i.calendar.scrollToTime(time),
      ),

      select: guarded("select", (i, { start, end }) => {
        requireDate("select", start);
        i.calendar.select(start, end);
      }),

      unselect: guarded("unselect", (i) => i.calendar.unselect()),

      revert_change: guarded("revert_change", (i, { id }) => {
        const revert = i.reverts.get(String(id));
        if (!revert)
          throw new Error(
            `no change to revert for event ${JSON.stringify(id)}`,
          );
        revert();
        i.reverts.delete(String(id));
      }),

      update_size: guarded("update_size", (i) => i.calendar.updateSize()),
    },

    events: {
      event_click: {},
      date_click: {},
      select: {},
      event_change: {},
      dates_set: {},
      error: {},
    },
  };

  return withLibrary(adapter, loadLibrary, (library) => {
    ({ Calendar, calendarPlugins } = pickLibrary(library));
  });
}
