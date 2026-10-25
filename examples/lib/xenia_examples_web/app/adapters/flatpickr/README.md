# Date range

flatpickr in range mode: a start and an end date in one field. Open it at `/adapters/flatpickr`.

**Try it:** pick two dates, or click "Next week" and let the server pick them. "Open the calendar" is a command.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createFlatpickr({load: () => import("flatpickr")})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({Flatpickr: official.flatpickr})`. |

## How it works

- **The tag** is `<.flatpickr mode="range">`, from `Xenia.Adapters.Flatpickr` (its docs list every prop, event and command).
- **Events:** `on_change="picked"` sends the dates as a list.
- **Commands:** `Xenia.push_to(socket, "trip", "open")`. The adapter also has `close`, `toggle` and `clear`.
- **The server sets the value** by changing the `value` assign, like any prop.
- **A form field:** the [Forms](../../forms) example uses it with `field={@form[:due]}`. The [Date picker](../../date-picker) basic example writes a flatpickr adapter by hand instead.
