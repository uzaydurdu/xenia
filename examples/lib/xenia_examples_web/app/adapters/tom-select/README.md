# Tag picker

Tom Select: a searchable select that picks several values and creates new ones. Open it at `/adapters/tom-select`.

**Try it:** search, pick a few languages, or type a new one and press Enter. "Clear" is a command. In the second picker, type a few letters of a country: the server searches.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createTomSelect({load: () => import("tom-select")})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({TomSelect: official.tomSelect})`. |
| [`assets/css/app.css`](../../../../../assets/css/app.css) | Imports the library's CSS. |

## How it works

- **The tag** is `<.tom_select multiple create>`, from `Xenia.Adapters.TomSelect` (its docs list every prop, event and command).
- **Events:** `on_change` sends the picked values; `on_created` sends a new tag's value and text.
- **Commands:** `Xenia.push_to(socket, "langs", "clear")`.
- **`options`** come from the server, as a list of `%{value, text}` maps.
- **A form field:** the [Forms](../../forms) example uses it with `field={@form[:tags]}`.
- **Server search** (the second picker): `remote` makes each search a
  call. The page binds it with `on_search="search_countries"`, and
  `handle_event` replies `{:reply, %{options: matches}, socket}`. Each
  reply belongs to its own search, so a slow answer can't show up under a
  newer query. See "Calls" in Xenia's README.
