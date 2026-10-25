defmodule Xenia.Adapters.FullCalendar do
  @moduledoc """
  `<.full_calendar>`: a calendar (FullCalendar), through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install @fullcalendar/core @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/list @fullcalendar/interaction --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createFullCalendar } from "xenia/fullcalendar"

  const fullcalendar = createFullCalendar({
      load: async () => {
        const [core, dayGrid, timeGrid, list, interaction] = await Promise.all([
          import("@fullcalendar/core"),
          import("@fullcalendar/daygrid"),
          import("@fullcalendar/timegrid"),
          import("@fullcalendar/list"),
          import("@fullcalendar/interaction"),
        ])
        return {
          Calendar: core.Calendar,
          plugins: [dayGrid.default, timeGrid.default, list.default, interaction.default],
        }
      },
  })

  hooks: { ...colocatedHooks, ...createHooks({ FullCalendar: fullcalendar }) },
  ```

  Then `import Xenia.Adapters.FullCalendar` in `html_helpers`, and render
  `<.full_calendar id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"FullCalendar"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for FullCalendar (v6, standard MIT plugins): month, week,
    day and list views, with drag-and-drop, resizing and date selection.

    Props:
      events     [%{id, title, start, end?, all_day?, color?, background_color?,
                    border_color?, text_color?, display?, url?, editable?,
                    group_id?, extended_props?}]
                 Dates as ISO 8601 strings. Keys in snake_case or camelCase.
      view       "dayGridMonth" (default) | "timeGridWeek" | "timeGridDay" |
                 "listWeek" | "dayGridWeek" | "listMonth" | ...
      date       ISO date to show
      editable   true lets the user drag and resize events
      selectable true lets the user select a date range
      options    any other FullCalendar option, snake_case or camelCase:
                 locale, first_day, slot_min_time, slot_max_time,
                 business_hours, header_toolbar, now_indicator, weekends,
                 time_zone, ...

    Commands:
      today, prev, next
      change_view %{view, date?}
      go_to_date %{date}
      scroll_to_time %{time}            e.g. "08:00"
      select %{start, end?}, unselect
      revert_change %{id}               undo the user's last move/resize of an
                                        event, e.g. when the server rejects it
      update_size

    Events:
      event_click   %{event}
      date_click    %{date, all_day}
      select        %{start, end, all_day}
      event_change  %{event, old_event, kind: "drop" | "resize"}
      dates_set     %{start, end, view}   the visible range changed
      error         %{source, message, code}
      `event` is %{id, title, start, end, all_day, extended_props}.

    Changing an event: on event_change, update your data and re-render
    `events`; to refuse, send revert_change with the event's id. (If you only
    left `events` unchanged, the prop wouldn't be resent and the calendar would
    keep showing the user's move.)

    FullCalendar injects its own CSS. For dark mode, set its CSS variables,
    e.g. [data-theme=dark] { --fc-border-color: #3f3f46; --fc-page-bg-color: #18181b; }
  """
  use Xenia.Components

  component :full_calendar, adapter: "FullCalendar" do
    prop :events, :list, default: []
    prop :view, :string
    prop :date, :string
    prop :editable, :boolean
    prop :selectable, :boolean
    prop :options, :map
    event :event_click
    event :date_click
    event :select
    event :event_change
    event :dates_set
    event :error
  end
end
