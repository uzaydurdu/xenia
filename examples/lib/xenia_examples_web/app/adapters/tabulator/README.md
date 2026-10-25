# Data table

Tabulator, a data table: sort, edit cells, and click rows. Open it at `/adapters/tabulator`.

**Try it:** click a header to sort, double-click a cell to edit it, click a row, or add a row from the server.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createTabulator({load: () => import("tabulator-tables")})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({Tabulator: official.tabulator})`. |
| [`assets/css/app.css`](../../../../../assets/css/app.css) | Imports the library's CSS. |

## How it works

- **The tag** is `<.tabulator>`, from `Xenia.Adapters.Tabulator` (its docs list every prop, event and command).
- **Events:** `on_cell_edited` sends the row id, the field and the new value; `on_row_click` sends the row.
- **`data` and `columns`** come from the server. Adding a row is just a new list in the assign.
- **Column options** are Tabulator's own, written in snake_case in Elixir (`hoz_align: "right"`); the adapter turns them into camelCase.
