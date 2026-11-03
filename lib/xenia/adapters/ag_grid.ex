defmodule Xenia.Adapters.AgGrid do
  @moduledoc """
  `<.ag_grid>`: a data grid (AG Grid Community), through Xenia's official adapter.

  AG Grid Community is free and MIT licensed. The adapter is built and
  tested with it only: Xenia doesn't use or test AG Grid Enterprise.

  ## Setup

  Install the library in your app:

      npm install ag-grid-community --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createAgGrid } from "xenia/ag-grid"

  const agGrid = createAgGrid({
      load: () => import("ag-grid-community"),
  })

  hooks: { ...colocatedHooks, ...createHooks({ AgGrid: agGrid }) },
  ```

  There is no CSS to import: AG Grid's themes are JavaScript and add their
  own styles. The grid follows the app's theme (`consumes: ["theme"]`); set
  `theme="light"` to pin one, or `theme={false}` for the base theme's own
  colors.

  Then `import Xenia.Adapters.AgGrid` in `html_helpers`, and render
  `<.ag_grid id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  ## Functions in columns

  Value formatters, comparators and cell renderers are functions, which
  can't come from the server. Define them once in the factory's
  `options.columnTypes`, and name them in a column with `type`:

  ```js
  const agGrid = createAgGrid({
      load: () => import("ag-grid-community"),
      theme: (ag) => ag.themeQuartz.withParams({ accentColor: "#7c3aed" }),
      options: {
        columnTypes: {
          euro: { valueFormatter: (p) => `€${p.value.toLocaleString()}` },
        },
      },
  })
  ```

  ```heex
  <.ag_grid id="cars" row_data={@cars} column_defs={[%{field: "price", type: "euro"}]} />
  ```

  The factory takes `load` (required), `theme` (`(ag) => theme`, default
  `themeQuartz`), `modules` (`(ag) => [...]`, default
  `[AllCommunityModule]`; pass fewer modules for a smaller bundle) and
  `options` (grid options for every grid of this factory). It returns a
  plain adapter object: spread it to add or change props, commands and
  events, without copying the adapter.

  The tag uses the adapter name `"AgGrid"`. To register it under another
  name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Rows are matched by id (`row_id`), so when `row_data` changes AG Grid
    updates only the rows that changed, and keeps scroll position,
    selection, sorting and filters.

    Props:
      row_data         [%{id, ...}]   the rows
      column_defs      [%{field, header_name?, sortable?, filter?, editable?,
                          cell_editor?, type?, width?, flex?, children?, ...}]
                       AG Grid's column definitions; keys may be snake_case.
      default_col_def  defaults for every column, the same keys
      row_id           the row id field (default "id")
      height           CSS height, e.g. "400px"; nil lets the grid grow
                       with its rows
      row_selection    "single" | "multiple" (with checkboxes) | nil
      pagination       rows per page; nil for none
      quick_filter     text that filters on every column
      filter_model     AG Grid's filter model, e.g.
                       %{"price" => %{filter_type: "number", type: "greaterThan", filter: 30000}}
      sort             [%{col_id, sort: "asc" | "desc"}]
      theme            "light" or "dark" (the app's, through consumes), or false
      options          any other grid option, snake_case or camelCase. AG Grid
                       reads some only once, so changing `options` remounts
                       the grid (as does changing `row_id`).

    Commands:
      apply_transaction %{add?, update?, remove?}   rows to add, update or
                        remove, matched by id (remove takes rows or ids). For
                        large data: send what changed instead of `row_data`.
      select_rows %{ids}, deselect_all
      ensure_visible %{id, position?: "top" | "middle" | "bottom"}
      set_filter_model %{filter_model}, clear_filters
      export_csv %{file_name?}
      size_columns_to_fit, auto_size_columns
      revert_edit %{id, field}   undo the user's last edit of a cell, e.g.
                                 when the server rejects it

    Events:
      ready        %{rows}
      cell_edited  %{id, field, value, old_value, row}
      row_click    %{id, row}, row_dblclick %{id, row}
      selection    %{ids}                      the user changed the selection
      sort         %{sort: [%{col_id, sort}]}  the user sorted by a header
      filter       %{filter_model}             the user changed a column
                                               filter (debounced 300 ms)
      error        %{source, message, code}
  """
  use Xenia.Components

  component :ag_grid, adapter: "AgGrid" do
    prop :row_data, :list, required: true
    prop :column_defs, :list, required: true
    prop :default_col_def, :map
    prop :row_id, :string
    prop :height, :string
    prop :row_selection, :string, values: ~w(single multiple)
    prop :pagination, :integer
    prop :quick_filter, :string
    prop :filter_model, :map
    prop :sort, :list
    prop :theme, :any, doc: ~s|"light" or "dark" to pin one, false for the base theme's colors|
    prop :options, :map
    event :ready
    event :cell_edited
    event :row_click
    event :row_dblclick
    event :selection
    event :sort
    event :filter
    event :error
  end
end
