# Terminal

xterm.js, a terminal that the server answers. Open it at `/adapters/terminal`.

**Try it:** type `help`, `date`, `echo hello` or `clear`, and press Enter.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createXterm({load: async () => ({...})})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({Xterm: official.xterm})`. |
| [`assets/css/app.css`](../../../../../assets/css/app.css) | Imports the library's CSS. |

## How it works

- **The tag** is `<.xterm>`, from `Xenia.Adapters.Xterm` (its docs list every prop, event and command).
- **Events:** `on_ready` fires once the terminal has its size; `on_data` sends what the user types.
- **Commands:** `Xenia.push_to(socket, "terminal", "write", %{text: "..."})`.
- **A terminal is a stream:** keys go up as events, and output comes down as `write` commands. xterm.js doesn't print what the user types, so the server echoes it.
- **The theme** follows the app's light and dark mode.
