# Code editor

Xenia's built-in Monaco editor, with our own changes. Open it at `/adapters/monaco`.

Xenia ships an adapter for Monaco, the editor from VS Code. You use the
`<.monaco>` tag, and you can still change how it looks and what it does.
This example adds four things:

| Change | Where |
|---|---|
| **A dark theme of our own.** Switch to dark mode to see it. | The `themes` attribute in [`page.ex`](page.ex). |
| **Elixir snippets.** Type `def` or `IO` in the editor. | The `setup` function in [`assets/js/islands/monaco.js`](../../../../../assets/js/islands/monaco.js). |
| **Buttons that change the code from the server.** | `insert` and `reset` in [`page.ex`](page.ex). |
| **Keyboard shortcuts.** With the editor focused, press ⌘S (Ctrl+S) to save, and ⌘⇧. or ⌘⇧, (Ctrl+Shift+. or ,) for a bigger or smaller font. | The `shortcuts` attribute and the `save`, `bigger` and `smaller` events in [`page.ex`](page.ex). |

The server also receives every change you type: the line count below the
editor comes from the server.

## How it works

- **Typing.** The editor sends `on_change` with the code and a `version`
  number. The page stores both. Sending `version` back tells the editor
  "this is your own typing", so it doesn't overwrite what you typed since.
- **Insert.** `Xenia.push_to(socket, "editor", "insert", %{text: ...})`
  inserts text where the cursor is.
- **Reset.** The page puts the starting code back, and raises `revision`.
  A new `revision` tells the editor to take the server's code.
- **Shortcuts.** `shortcuts={%{"mod+s" => "save", ...}}` maps keys to
  LiveView events, only while the editor has focus. `mod` is Cmd on a Mac
  and Ctrl elsewhere. The editor's last change is always sent before the
  shortcut, so "save" sees what you just typed. The font size goes back to
  the editor through the `options` prop.
- **Setup.** `createMonaco({load, setup})` takes a `setup` function. It runs
  for each editor, and gets Monaco itself, so you can register anything
  Monaco offers.

Monaco needs some build setup: web workers and a CSS file. See
[`config/config.exs`](../../../../../config/config.exs) and
[`root.html.heex`](../../../components/layouts/root.html.heex), and the
"Monaco" section of Xenia's README.
