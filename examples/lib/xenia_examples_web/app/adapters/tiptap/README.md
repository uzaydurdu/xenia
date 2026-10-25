# Rich text

Tiptap, a rich-text editor, with Xenia's toolbar. Open it at `/adapters/tiptap`.

**Try it:** select some text and make it bold. Insert a signature or load a draft from the server, and make the editor read-only.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createTiptap({load: async () => ({Editor, StarterKit, ...})})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({Tiptap: official.tiptap})`. |

## How it works

- **The tag** is `<.tiptap>`, from `Xenia.Adapters.Tiptap` (its docs list every prop, event and command).
- **Events:** `on_change="changed"` sends the HTML and the word and character counts, 300 ms after typing stops.
- **Commands:** `insert` and `set_content`, for example `Xenia.push_to(socket, "notes", "insert", %{content: " — sent with Xenia"})`.
- **`editable`** is an ordinary prop: the button flips it on the server, and the editor follows.
- **Several packages:** Tiptap is `@tiptap/core`, the starter kit and its extensions. `load` returns the parts the adapter uses, so you choose what is bundled.
- **A form field:** the [Forms](../../forms) example uses it with `field={@form[:body]}`.
