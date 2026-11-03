# Data grid

AG Grid Community, a data grid: filters, sorting, inline editing, row
selection and a CSV export. Open it at `/adapters/ag-grid`.

AG Grid Community is free and MIT licensed. Xenia's adapter is built and
tested with it only, not with AG Grid Enterprise.

**Try it:** type in the filter box, sort by a header, double-click a price
to change it, tick a few rows, and press "Cheapest first" or "Export as
CSV".

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its rows and columns, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createAgGrid({load: () => import("ag-grid-community"), ...})`: Xenia's adapter, with the library passed in, a purple accent, and a `euro` column type. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({AgGrid: official.agGrid})`. |

There is no CSS to import: AG Grid's themes are JavaScript.

## How it works

- **The tag** is `<.ag_grid>`, from `Xenia.Adapters.AgGrid` (its docs list every prop, event and command).
- **Columns are AG Grid's own `columnDefs`**, written in snake_case in Elixir (`floating_filter: true`); the adapter turns them into camelCase.
- **Functions stay in JavaScript.** A value formatter can't come from the server, so `official.js` defines a `euro` column type, and the price column names it with `type: "euro"`.
- **Rows are matched by id.** Adding a car is just a longer list in the assign: AG Grid adds that row and keeps the selection, sort and filters.
- **Events:** `on_cell_edited` sends the row id, the field and the new value; `on_selection` the selected ids; `on_sort` the user's sort, which the server keeps.
- **The server can sort too:** "Cheapest first" sets the `sort` prop. That change isn't reported back as a user sort.
- **The filter box** is a plain Phoenix form; its text goes to the grid as `quick_filter`.
- **Commands:** "Export as CSV" is `Xenia.push_to(socket, "cars", "export_csv", %{file_name: "cars.csv"})`.
