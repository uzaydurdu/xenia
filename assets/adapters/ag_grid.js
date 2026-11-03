/**
 * Xenia's official adapter for AG Grid Community (v36, MIT): a data grid
 * with sorting, filtering, inline editing, row selection, pagination and
 * CSV export. Built and tested with ag-grid-community only: Xenia doesn't
 * use or test AG Grid Enterprise.
 *
 * Rows are matched by id (`row_id`), so when `row_data` changes AG Grid
 * updates only the rows that changed, and keeps scroll position,
 * selection, sorting and filters.
 *
 * Props:
 *   row_data         [%{id, ...}]   the rows
 *   column_defs      [%{field, header_name?, sortable?, filter?, editable?,
 *                       cell_editor?, type?, width?, flex?, children?, ...}]
 *                    AG Grid's column definitions; keys may be snake_case.
 *                    Functions can't come from the server: define them in
 *                    the factory's `options.columnTypes` and name them with
 *                    `type` (see below).
 *   default_col_def  defaults for every column, the same keys
 *   row_id           the row id field (default "id")
 *   height           CSS height, e.g. "400px"; nil lets the grid grow
 *                    with its rows
 *   row_selection    "single" | "multiple" (with checkboxes) | nil
 *   pagination       rows per page; nil for none
 *   quick_filter     text that filters on every column
 *   filter_model     AG Grid's filter model, e.g.
 *                    %{"price" => %{filter_type: "number", type: "greaterThan", filter: 30000}}
 *   sort             [%{col_id, sort: "asc" | "desc"}]
 *   theme            the app's theme ("light" or "dark") arrives here through
 *                    consumes: ["theme"]. Set it on the tag to pin one, or to
 *                    false for the base theme's own colors.
 *   options          any other grid option, snake_case or camelCase. AG Grid
 *                    reads some only once, so changing `options` remounts
 *                    the grid (as does changing `row_id`).
 *
 * Commands:
 *   apply_transaction %{add?, update?, remove?}   rows to add, update or
 *                     remove, matched by id (remove takes rows or ids). For
 *                     large data: send what changed instead of `row_data`.
 *   select_rows %{ids}, deselect_all
 *   ensure_visible %{id, position?: "top" | "middle" | "bottom"}
 *   set_filter_model %{filter_model}, clear_filters
 *   export_csv %{file_name?}
 *   size_columns_to_fit, auto_size_columns
 *   revert_edit %{id, field}   undo the user's last edit of a cell, e.g.
 *                              when the server rejects it
 *
 * Events:
 *   ready        %{rows}
 *   cell_edited  %{id, field, value, old_value, row}
 *   row_click    %{id, row}, row_dblclick %{id, row}
 *   selection    %{ids}                      the user changed the selection
 *   sort         %{sort: [%{col_id, sort}]}  the user sorted by a header
 *   filter       %{filter_model}             the user changed a column
 *                                            filter (debounced 300 ms)
 *   error        %{source, message, code}
 *
 * No CSS to import: AG Grid's themes are JavaScript, and add their styles.
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createAgGrid } from "xenia/ag-grid"
 *   const agGrid = createAgGrid({
 *     load: () => import("ag-grid-community"),
 *     // optional: the base theme, the modules, default grid options
 *     theme: (ag) => ag.themeQuartz.withParams({ accentColor: "#7c3aed" }),
 *     options: { columnTypes: { euro: { valueFormatter: (p) => `€${p.value}` } } },
 *   })
 *   // createHooks({ AgGrid: agGrid }), then <.ag_grid> (Xenia.Adapters.AgGrid)
 *   Extend it by spreading: { ...agGrid, commands: { ...agGrid.commands, mine() {} } }
 */

import {
  camelizeKeys,
  defaultExport,
  expectLibrary,
  guarded,
  isPlainObject,
  isolateFormEvents,
  loadOnce,
  reportError,
  withLibrary,
} from "./shared.js";

const LOAD = 'createAgGrid({ load: () => import("ag-grid-community") })';

/** The source Xenia gives its own cell changes (revert_edit), so they aren't reported. */
const SOURCE = "xenia";

/** Selection changes the server or the grid made, not the user. */
const NOT_THE_USER =
  /^(api|rowDataChanged|rowGroupChanged|selectableChanged|masterDetail|gridInitializing)/;

/** Column keys that hold nested option maps: camelize their keys too. */
const NESTED_COLUMN_KEYS = [
  "cellEditorParams",
  "cellRendererParams",
  "filterParams",
  "floatingFilterComponentParams",
  "headerComponentParams",
  "tooltipComponentParams",
];

function pickLibrary(library) {
  const ag =
    typeof library?.createGrid === "function"
      ? library
      : defaultExport(library);
  expectLibrary(typeof ag?.createGrid === "function", LOAD);
  return ag;
}

function toColumn(column) {
  if (!isPlainObject(column)) return column;
  const converted = camelizeKeys(column);

  for (const key of NESTED_COLUMN_KEYS) {
    if (isPlainObject(converted[key]))
      converted[key] = camelizeKeys(converted[key]);
  }

  if (Array.isArray(converted.children))
    converted.children = toColumns(converted.children);
  return converted;
}

function toColumns(columns) {
  return (Array.isArray(columns) ? columns : []).map(toColumn);
}

function toRows(rows) {
  return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
}

function selectionOption(selection) {
  if (selection === "single") return { mode: "singleRow", checkboxes: true };
  if (selection === "multiple")
    return { mode: "multiRow", checkboxes: true, headerCheckbox: true };
  return undefined;
}

function toSortState(sort) {
  return (Array.isArray(sort) ? sort : []).map(
    ({ col_id, colId, field, sort }) => ({
      colId: col_id ?? colId ?? field,
      sort: sort ?? "asc",
    }),
  );
}

function sortOut(api) {
  return api
    .getColumnState()
    .filter((column) => column.sort)
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
    .map((column) => ({ col_id: column.colId, sort: column.sort }));
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts. Optional:
 *   modules  (library) => the AG Grid modules, default [AllCommunityModule]
 *   theme    (library) => the base theme, default themeQuartz
 *   options  grid options for every grid of this factory (functions are
 *            fine here: columnTypes, valueFormatters, ...). Each grid's own
 *            props and `options` win.
 */
export function createAgGrid({
  load: libraryImport,
  modules: modulesOption,
  theme: themeOption,
  options: factoryOptions = {},
} = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let ag;
  let modules;
  let baseTheme;
  const themes = new Map(); // "light" | "dark" | "base" → theme object

  function themeFor(mode) {
    const key = mode === "dark" ? "dark" : mode === "light" ? "light" : "base";
    if (!themes.has(key)) {
      const scheme =
        key === "dark"
          ? ag.colorSchemeDark
          : key === "light"
            ? ag.colorSchemeLight
            : null;
      const canAdd = scheme && typeof baseTheme?.withPart === "function";
      themes.set(key, canAdd ? baseTheme.withPart(scheme) : baseTheme);
    }
    return themes.get(key);
  }

  function setHeight(instance, height) {
    instance.host.style.height = height ?? "";
    instance.api?.setGridOption("domLayout", height ? "normal" : "autoHeight");
  }

  const adapter = {
    consumes: ["theme"],

    mount(el, props, ctx) {
      const host = el.ownerDocument.createElement("div");
      el.appendChild(host);

      const instance = {
        ctx,
        host,
        api: null,
        rowId: props.row_id ?? "id",
        edits: new Map(), // "id\u0000field" → {node, field, oldValue}, for revert_edit
        filterTimer: null,
        // Cell editors and filters are <input>s: keep their events from
        // triggering the surrounding form's phx-change.
        stopIsolation: isolateFormEvents(el),
      };
      const idOf = (data) => data?.[instance.rowId] ?? null;
      const rowOut = (data) => ({ id: idOf(data), row: { ...data } });
      host.style.height = props.height ?? "";

      const options = {
        ...factoryOptions,
        ...camelizeKeys(props.options ?? {}),
        theme: themeFor(props.theme),
        columnDefs: toColumns(props.column_defs),
        defaultColDef: {
          ...factoryOptions.defaultColDef,
          ...toColumn(props.default_col_def ?? {}),
        },
        rowData: toRows(props.row_data),
        getRowId: (params) => String(idOf(params.data)),
        domLayout: props.height ? "normal" : "autoHeight",
        rowSelection: selectionOption(props.row_selection),
        pagination: Boolean(props.pagination),
        ...(props.pagination ? { paginationPageSize: props.pagination } : {}),
        quickFilterText: props.quick_filter ?? undefined,

        onGridReady: (event) =>
          ctx.emit("ready", { rows: event.api.getDisplayedRowCount() }),

        onCellValueChanged: (event) => {
          if (event.source === SOURCE) return;
          const field = event.colDef.field ?? event.column?.getColId?.();
          const id = idOf(event.data);
          instance.edits.set(`${id}\u0000${field}`, {
            node: event.node,
            field,
            oldValue: event.oldValue,
          });
          ctx.emit("cell_edited", {
            id,
            field,
            value: event.newValue,
            old_value: event.oldValue,
            row: { ...event.data },
          });
        },

        onRowClicked: (event) => ctx.emit("row_click", rowOut(event.data)),
        onRowDoubleClicked: (event) =>
          ctx.emit("row_dblclick", rowOut(event.data)),

        onSelectionChanged: (event) => {
          if (NOT_THE_USER.test(event.source ?? "")) return;
          ctx.emit("selection", { ids: event.api.getSelectedRows().map(idOf) });
        },

        // The server's sort (the `sort` prop) arrives with source "api".
        onSortChanged: (event) => {
          if (!/^ui/.test(event.source ?? "")) return;
          ctx.emit("sort", { sort: sortOut(event.api) });
        },

        onFilterChanged: (event) => {
          if (event.source !== "columnFilter" || event.afterDataChange) return;
          clearTimeout(instance.filterTimer);
          instance.filterTimer = setTimeout(() => {
            if (ctx.isAlive())
              ctx.emit("filter", { filter_model: event.api.getFilterModel() });
          }, 300);
        },
      };

      instance.api = ag.createGrid(host, options, { modules });

      if (props.sort) applySort(instance, props.sort);
      if (props.filter_model) instance.api.setFilterModel(props.filter_model);

      return instance;
    },

    destroy(instance) {
      clearTimeout(instance.filterTimer);
      instance.edits.clear();
      instance.api.destroy();
      instance.stopIsolation();
      instance.host.remove();
    },

    props: {
      row_data(instance, rows) {
        instance.edits.clear();
        instance.api.setGridOption("rowData", toRows(rows));
      },
      column_defs: (instance, columns) =>
        instance.api.setGridOption("columnDefs", toColumns(columns)),
      default_col_def: (instance, defaults) =>
        instance.api.setGridOption("defaultColDef", {
          ...factoryOptions.defaultColDef,
          ...toColumn(defaults ?? {}),
        }),
      height: (instance, height) => setHeight(instance, height),
      row_selection: (instance, selection) =>
        instance.api.setGridOption("rowSelection", selectionOption(selection)),
      pagination(instance, size) {
        if (size) instance.api.setGridOption("paginationPageSize", size);
        instance.api.setGridOption("pagination", Boolean(size));
      },
      quick_filter: (instance, text) =>
        instance.api.setGridOption("quickFilterText", text ?? ""),
      filter_model: (instance, model) =>
        instance.api.setFilterModel(model ?? null),
      sort: (instance, sort) => applySort(instance, sort),
      theme: (instance, theme) =>
        instance.api.setGridOption("theme", themeFor(theme)),

      // Read by AG Grid only when the grid is created.
      row_id: (_instance, _value, ctx) => ctx.remount(),
      options: (_instance, _value, ctx) => ctx.remount(),
    },

    commands: {
      apply_transaction: guarded(
        "apply_transaction",
        (i, { add, update, remove }) => {
          const asRow = (row) =>
            isPlainObject(row) ? row : { [i.rowId]: row };
          i.api.applyTransaction({
            ...(add ? { add: toRows(add) } : {}),
            ...(update ? { update: toRows(update) } : {}),
            ...(remove ? { remove: remove.map(asRow) } : {}),
          });
        },
      ),

      select_rows: guarded("select_rows", (i, { ids }) => {
        if (!Array.isArray(ids))
          throw new TypeError("select_rows expects %{ids: [...]}");
        const nodes = ids
          .map((id) => i.api.getRowNode(String(id)))
          .filter(Boolean);
        i.api.setNodesSelected({ nodes, newValue: true, source: "api" });
      }),
      deselect_all: guarded("deselect_all", (i) => i.api.deselectAll()),

      ensure_visible: guarded(
        "ensure_visible",
        (i, { id, position = "middle" }) => {
          const node = i.api.getRowNode(String(id));
          if (!node) throw new Error(`no row with id ${JSON.stringify(id)}`);
          i.api.ensureNodeVisible(node, position);
        },
      ),

      set_filter_model: guarded("set_filter_model", (i, { filter_model }) =>
        i.api.setFilterModel(filter_model ?? null),
      ),
      clear_filters: guarded("clear_filters", (i) =>
        i.api.setFilterModel(null),
      ),

      export_csv: guarded("export_csv", (i, { file_name }) =>
        i.api.exportDataAsCsv(file_name ? { fileName: file_name } : undefined),
      ),

      size_columns_to_fit: guarded("size_columns_to_fit", (i) =>
        i.api.sizeColumnsToFit(),
      ),
      auto_size_columns: guarded("auto_size_columns", (i) =>
        i.api.autoSizeAllColumns(),
      ),

      revert_edit: guarded("revert_edit", (i, { id, field }) => {
        const key = `${id}\u0000${field}`;
        const edit = i.edits.get(key);
        if (!edit)
          throw new Error(
            `no edit to revert for row ${JSON.stringify(id)}, field ${JSON.stringify(field)}`,
          );

        edit.node.setDataValue(edit.field, edit.oldValue, SOURCE);
        i.edits.delete(key);
      }),
    },

    events: {
      ready: {},
      cell_edited: {},
      row_click: {},
      row_dblclick: {},
      selection: {},
      sort: {},
      filter: {},
      error: {},
    },
  };

  function applySort(instance, sort) {
    instance.api.applyColumnState({
      state: toSortState(sort),
      defaultState: { sort: null },
    });
  }

  return withLibrary(adapter, loadLibrary, (library) => {
    ag = pickLibrary(library);
    modules ??= modulesOption ? modulesOption(ag) : [ag.AllCommunityModule];
    expectLibrary(
      Array.isArray(modules) && modules.every(Boolean),
      `${LOAD}: modules must be AG Grid modules, e.g. [AllCommunityModule]`,
    );
    baseTheme ??= themeOption ? themeOption(ag) : ag.themeQuartz;
  });
}
