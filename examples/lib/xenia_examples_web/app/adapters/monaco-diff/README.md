# Diff editor

Monaco's side-by-side diff editor: the old code on the left, the new code on the right. Open it at `/adapters/monaco-diff`.

**Try it:** edit the right side and watch the line count, then click "Go to the next change".

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createMonacoDiff({load: () => import("monaco-editor")})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({MonacoDiff: official.monacoDiff})`. |

## How it works

- **The tag** is `<.monaco_diff>`, from `Xenia.Adapters.MonacoDiff` (its docs list every prop, event and command).
- **Events:** `on_change` sends the right side's text with a `version`; `on_diff` sends how many blocks changed.
- **Commands:** `Xenia.push_to(socket, "diff", "next_diff")`.
- **`modified`** is `%{value, version}`, like `<.monaco>`'s value: the editor tells echoes of its own typing apart from real server updates, so the cursor never jumps.
- **A form field:** with `field={@form[:x]}`, the right side is the submitted value.
