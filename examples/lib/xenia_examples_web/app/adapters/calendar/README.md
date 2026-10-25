# Calendar

FullCalendar, a month view whose events live on the server. Open it at `/adapters/calendar`.

**Try it:** click a day to add an event there, click an event to open it, and move between months.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createFullCalendar({load: async () => ({...})})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({FullCalendar: official.fullcalendar})`. |

## How it works

- **The tag** is `<.full_calendar>`, from `Xenia.Adapters.FullCalendar` (its docs list every prop, event and command).
- **Events:** `on_date_click` sends the day; `on_event_click` sends the event.
- **Commands:** `prev`, `next` and `today`: `Xenia.push_to(socket, "calendar", "next")`.
- **`events`** is an assign: adding one on the server shows it in the calendar.
- **Several packages:** `load` returns FullCalendar's core and the plugins you use (day grid, time grid, list, interaction).
