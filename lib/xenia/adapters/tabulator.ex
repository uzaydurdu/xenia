defmodule Xenia.Adapters.Tabulator do
  @moduledoc """
  `<.tabulator>`: an interactive data table (Tabulator), through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install tabulator-tables --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createTabulator } from "xenia/tabulator"

  const tabulator = createTabulator({
      load: () => import("tabulator-tables"),
  })

  hooks: { ...colocatedHooks, ...createHooks({ Tabulator: tabulator }) },
  ```

  And its CSS, in `assets/css/app.css`:

      @import "../node_modules/tabulator-tables/dist/css/tabulator_simple.min.css";

  Then `import Xenia.Adapters.Tabulator` in `html_helpers`, and render
  `<.tabulator id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"Tabulator"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for Tabulator (v6): an interactive data grid with sorting,
    filtering, inline editing, row selection, pagination and export.

    Rows are updated in place: when `data` changes, only changed rows are
    updated, removed rows deleted and new rows appended, so scroll position,
    selection, sorting and editing state survive server updates. A changed
    row order falls back to replacing the data (still keeping sort/filter).

    Props:
      data         [%{id, ...}]   rows; `id` identifies a row (see `index`)
      columns      [%{title, field, sorter?, editor?, formatter?, width?,
                      hoz_align?, header_filter?, editor_params?, ...}]
                   Column keys may be snake_case. Values (also inside *_params
                   maps) are passed unchanged. Changing columns keeps the rows.
      index        the row id field (default "id")
      height       CSS height, e.g. "400px"; nil lets the table grow
      layout       "fitColumns" (default) | "fitData" | "fitDataFill" | ...
      selectable   true (any number), a number (max rows), or false
      page_size    rows per page; enables pagination
      placeholder  text shown when there are no rows
      sort         [%{column, dir: "asc" | "desc"}]   applied when it changes
      filter       [%{field, type: "=" | "like" | ">" | ..., value}]
      options      any other Tabulator option, snake_case or camelCase
                   (movable_rows, group_by, frozen_rows, history, ...).
                   Tabulator reads most options only once, so changing
                   `options` remounts the table.

    Commands:
      set_sort %{sort: [...]}, clear_sort
      set_filter %{filter: [...]}, clear_filter
      select_rows %{ids}, deselect_rows %{ids?}
      scroll_to_row %{id, position?: "top" | "center" | "bottom" | "nearest"}
      download %{type: "csv" | "json" | "html", filename?}
      undo, redo                      (needs options: %{history: true})
      revert_edit %{id, field}        undo the user's last edit of a cell,
                                      e.g. when the server rejects it
      reset                           re-render the last `data` prop

    Events:
      ready        %{rows}
      cell_edited  %{id, field, value, old_value, row}
      row_click    %{id, row}, row_dblclick %{id, row}
      selection    %{ids}                 the user changed the selection
      sort         %{sort: [%{column, dir}]}   the user sorted by a header
      filter       %{filter: [...]}       header filters changed (300 ms)
      page         %{page}
      row_moved    %{ids}                 with movable_rows: the new order
      error        %{source, message, code}

    Load a Tabulator theme in app.css, e.g.
      @import "../node_modules/tabulator-tables/dist/css/tabulator_simple.min.css";
    (tabulator_midnight.min.css is a dark theme.)
  """
  use Xenia.Components

  component :tabulator, adapter: "Tabulator" do
    prop :data, :list, required: true
    prop :columns, :list, required: true
    prop :index, :string
    prop :height, :string
    prop :layout, :string
    prop :selectable, :any
    prop :page_size, :integer
    prop :placeholder, :string
    prop :sort, :list
    prop :filter, :list
    prop :options, :map
    event :ready
    event :cell_edited
    event :row_click
    event :row_dblclick
    event :selection
    event :sort
    event :filter
    event :page
    event :row_moved
    event :error
  end
end
