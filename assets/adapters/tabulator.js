/**
 * Xenia's official adapter for Tabulator (v6): an interactive data grid with sorting,
 * filtering, inline editing, row selection, pagination and export.
 *
 * Rows are updated in place: when `data` changes, only changed rows are
 * updated, removed rows deleted and new rows appended, so scroll position,
 * selection, sorting and editing state survive server updates. A changed
 * row order falls back to replacing the data (still keeping sort/filter).
 *
 * Props:
 *   data         [%{id, ...}]   rows; `id` identifies a row (see `index`)
 *   columns      [%{title, field, sorter?, editor?, formatter?, width?,
 *                   hoz_align?, header_filter?, editor_params?, ...}]
 *                Column keys may be snake_case. Values (also inside *_params
 *                maps) are passed unchanged. Changing columns keeps the rows.
 *   index        the row id field (default "id")
 *   height       CSS height, e.g. "400px"; nil lets the table grow
 *   layout       "fitColumns" (default) | "fitData" | "fitDataFill" | ...
 *   selectable   true (any number), a number (max rows), or false
 *   page_size    rows per page; enables pagination
 *   placeholder  text shown when there are no rows
 *   sort         [%{column, dir: "asc" | "desc"}]   applied when it changes
 *   filter       [%{field, type: "=" | "like" | ">" | ..., value}]
 *   options      any other Tabulator option, snake_case or camelCase
 *                (movable_rows, group_by, frozen_rows, history, ...).
 *                Tabulator reads most options only once, so changing
 *                `options` remounts the table.
 *
 * Commands:
 *   set_sort %{sort: [...]}, clear_sort
 *   set_filter %{filter: [...]}, clear_filter
 *   select_rows %{ids}, deselect_rows %{ids?}
 *   scroll_to_row %{id, position?: "top" | "center" | "bottom" | "nearest"}
 *   download %{type: "csv" | "json" | "html", filename?}
 *   undo, redo                      (needs options: %{history: true})
 *   revert_edit %{id, field}        undo the user's last edit of a cell,
 *                                   e.g. when the server rejects it
 *   reset                           re-render the last `data` prop
 *
 * Events:
 *   ready        %{rows}
 *   cell_edited  %{id, field, value, old_value, row}
 *   row_click    %{id, row}, row_dblclick %{id, row}
 *   selection    %{ids}                 the user changed the selection
 *   sort         %{sort: [%{column, dir}]}   the user sorted by a header
 *   filter       %{filter: [...]}       header filters changed (300 ms)
 *   page         %{page}
 *   row_moved    %{ids}                 with movable_rows: the new order
 *   error        %{source, message, code}
 *
 * Load a Tabulator theme in app.css, e.g.
 *   @import "../node_modules/tabulator-tables/dist/css/tabulator_simple.min.css";
 * (tabulator_midnight.min.css is a dark theme.)
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createTabulator } from "xenia/tabulator"
 *   const tabulator = createTabulator({
 *     load: () => import("tabulator-tables")
 *   })
 *   // createHooks({ Tabulator: tabulator }), then <.tabulator> (Xenia.Adapters.Tabulator)
 *   Extend it by spreading: { ...tabulator, commands: { ...tabulator.commands, mine() {} } }
 */

import {
  camelizeKeys,
  defaultExport,
  expectLibrary,
  guarded,
  isolateFormEvents,
  loadOnce,
  reportError,
  withLibrary,
} from "./shared.js";

const LOAD = 'createTabulator({ load: () => import("tabulator-tables") })';

function pickLibrary(library) {
  const Tabulator =
    library?.TabulatorFull ?? library?.Tabulator ?? defaultExport(library);
  expectLibrary(typeof Tabulator === "function", LOAD);
  return { Tabulator };
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createTabulator({ load: libraryImport } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let Tabulator;
  /** Column keys that hold nested option maps: camelize their keys too. */
  const NESTED_COLUMN_KEYS = new Set([
    "editorParams",
    "formatterParams",
    "headerFilterParams",
    "sorterParams",
  ]);

  function toColumns(columns) {
    return (Array.isArray(columns) ? columns : []).map((column) => {
      const converted = camelizeKeys(column);

      for (const key of NESTED_COLUMN_KEYS) {
        if (
          converted[key] &&
          typeof converted[key] === "object" &&
          !Array.isArray(converted[key])
        ) {
          converted[key] = camelizeKeys(converted[key]);
        }
      }

      if (Array.isArray(converted.columns))
        converted.columns = toColumns(converted.columns);
      return converted;
    });
  }

  function toRows(data) {
    return Array.isArray(data) ? data.map((row) => ({ ...row })) : [];
  }

  function toSorters(sort) {
    return (Array.isArray(sort) ? sort : []).map(({ column, field, dir }) => ({
      column: column ?? field,
      dir: dir ?? "asc",
    }));
  }

  function toFilters(filter) {
    return (Array.isArray(filter) ? filter : []).map(
      ({ field, type, value }) => ({ field, type: type ?? "=", value }),
    );
  }

  function sortersOut(sorters) {
    return sorters.map((sorter) => ({
      column: sorter.field ?? sorter.column?.getField?.(),
      dir: sorter.dir,
    }));
  }

  function selectableOption(selectable) {
    if (selectable === true) return true;
    if (Number.isInteger(selectable) && selectable > 0) return selectable;
    return false;
  }

  /** Runs `fn(table)` now if the table is built, or right after. */
  function whenBuilt(instance, fn) {
    if (instance.built) return fn(instance.table);
    instance.queue.push(fn);
    return undefined;
  }

  /**
   * Brings the table in line with `rows`: per-row updates, deletions and
   * appended rows when the existing order is kept; otherwise replaceData.
   */
  async function syncData(instance, rows) {
    const { table, index } = instance;
    const current = table.getData();
    const byId = new Map(current.map((row) => [row[index], row]));
    const nextIds = rows.map((row) => row[index]);
    const nextSet = new Set(nextIds);

    const keptCurrent = current
      .map((row) => row[index])
      .filter((id) => nextSet.has(id));
    const keptNext = nextIds.filter((id) => byId.has(id));
    const sameOrder =
      keptCurrent.length === keptNext.length &&
      keptCurrent.every((id, i) => id === keptNext[i]);
    const appendsOnlyAtEnd =
      nextIds.slice(keptNext.length).every((id) => !byId.has(id)) &&
      nextIds.slice(0, keptNext.length).every((id) => byId.has(id));

    instance.applying = true;

    try {
      if (
        !sameOrder ||
        !appendsOnlyAtEnd ||
        rows.some((row) => row[index] == null)
      ) {
        await table.replaceData(rows);
        return;
      }

      const removed = current
        .filter((row) => !nextSet.has(row[index]))
        .map((row) => row[index]);
      const changed = rows.filter(
        (row) =>
          byId.has(row[index]) &&
          JSON.stringify(row) !== JSON.stringify(byId.get(row[index])),
      );
      const added = rows.filter((row) => !byId.has(row[index]));

      if (removed.length) await table.deleteRow(removed);
      if (changed.length) await table.updateData(changed);
      if (added.length) await table.addData(added, false);
    } finally {
      instance.applying = false;
    }
  }

  /** A server-side sort: applied, remembered, and not reported back. */
  function applySort(instance, table, sort) {
    const sorters = toSorters(sort);
    instance.applying = true;

    try {
      if (sorters.length) table.setSort(sorters);
      else table.clearSort();
    } finally {
      instance.applying = false;
    }

    instance.lastSort = JSON.stringify(sortersOut(table.getSorters()));
  }

  function rowDetail(row, index) {
    const data = row.getData();
    return { id: data[index] ?? null, row: data };
  }

  const adapter = {
    mount(el, props, ctx) {
      const doc = el.ownerDocument;
      const host = doc.createElement("div");
      el.appendChild(host);

      const instance = {
        ctx,
        host,
        table: null,
        built: false,
        queue: [],
        index: props.index ?? "id",
        data: toRows(props.data),
        edits: new Map(), // "id\u0000field" → cell, for revert_edit
        applying: false,
        lastSort: JSON.stringify(toSorters(props.sort)),
        filterTimer: null,
        // Cell editors and header filters are <input>s: keep their events
        // from triggering the surrounding form's phx-change.
        stopIsolation: isolateFormEvents(el),
      };

      const options = {
        layout: props.layout ?? "fitColumns",
        height: props.height ?? undefined,
        index: instance.index,
        placeholder: props.placeholder ?? "No data",
        selectableRows: selectableOption(props.selectable),
        initialSort: toSorters(props.sort),
        initialFilter: toFilters(props.filter),
        ...(props.page_size
          ? { pagination: true, paginationSize: props.page_size }
          : {}),
        ...camelizeKeys(props.options ?? {}),
        columns: toColumns(props.columns),
        data: instance.data,
      };

      if (!props.columns) options.autoColumns = true;

      const table = new Tabulator(host, options);
      instance.table = table;

      table.on("tableBuilt", () => {
        instance.built = true;
        for (const fn of instance.queue.splice(0)) {
          try {
            fn(table);
          } catch (error) {
            reportError(ctx, "update", error);
          }
        }
        ctx.emit("ready", { rows: table.getDataCount() });
      });

      table.on("cellEdited", (cell) => {
        const data = cell.getRow().getData();
        const id = data[instance.index] ?? null;
        const field = cell.getField();

        instance.edits.set(`${id}\u0000${field}`, cell);
        ctx.emit("cell_edited", {
          id,
          field,
          value: cell.getValue(),
          old_value: cell.getOldValue(),
          row: data,
        });
      });

      table.on("rowClick", (_event, row) =>
        ctx.emit("row_click", rowDetail(row, instance.index)),
      );
      table.on("rowDblClick", (_event, row) =>
        ctx.emit("row_dblclick", rowDetail(row, instance.index)),
      );

      table.on("rowSelectionChanged", (data) => {
        if (!instance.applying)
          ctx.emit("selection", {
            ids: data.map((row) => row[instance.index]),
          });
      });

      // dataSorted also fires when data changes (the sort is re-applied) and
      // for server sorts; only a sort the user changed is reported.
      table.on("dataSorted", (sorters) => {
        const sort = sortersOut(sorters);
        const key = JSON.stringify(sort);
        if (key === instance.lastSort) return;

        instance.lastSort = key;
        if (instance.built && !instance.applying) ctx.emit("sort", { sort });
      });

      table.on("dataFiltered", () => {
        if (instance.applying) return;
        clearTimeout(instance.filterTimer);
        instance.filterTimer = setTimeout(() => {
          if (ctx.isAlive())
            ctx.emit("filter", { filter: table.getHeaderFilters() });
        }, 300);
      });

      table.on("pageLoaded", (page) => ctx.emit("page", { page }));
      table.on("rowMoved", () =>
        ctx.emit("row_moved", {
          ids: table.getRows().map((row) => row.getData()[instance.index]),
        }),
      );

      return instance;
    },

    destroy(instance) {
      clearTimeout(instance.filterTimer);
      instance.queue.length = 0;
      instance.table.destroy();
      instance.stopIsolation();
      instance.host.remove();
    },

    props: {
      data(instance, data, ctx) {
        instance.data = toRows(data);
        instance.edits.clear();
        whenBuilt(instance, () =>
          syncData(instance, instance.data).catch((error) =>
            reportError(ctx, "data", error),
          ),
        );
      },

      columns: (instance, columns) =>
        whenBuilt(instance, (table) => table.setColumns(toColumns(columns))),
      height: (instance, height) =>
        whenBuilt(instance, (table) => table.setHeight(height ?? false)),
      placeholder: (_instance, _value, ctx) => ctx.remount(),

      sort: (instance, sort) =>
        whenBuilt(instance, (table) => applySort(instance, table, sort)),

      filter: (instance, filter) =>
        whenBuilt(instance, (table) => {
          instance.applying = true;
          try {
            const filters = toFilters(filter);
            if (filters.length) table.setFilter(filters);
            else table.clearFilter();
          } finally {
            instance.applying = false;
          }
        }),

      // Read by Tabulator only when the table is created.
      index: (_instance, _value, ctx) => ctx.remount(),
      layout: (_instance, _value, ctx) => ctx.remount(),
      selectable: (_instance, _value, ctx) => ctx.remount(),
      page_size: (_instance, _value, ctx) => ctx.remount(),
      options: (_instance, _value, ctx) => ctx.remount(),
    },

    commands: {
      set_sort: guarded("set_sort", (i, { sort }) =>
        whenBuilt(i, (table) => applySort(i, table, sort)),
      ),
      clear_sort: guarded("clear_sort", (i) =>
        whenBuilt(i, (table) => applySort(i, table, [])),
      ),
      set_filter: guarded("set_filter", (i, { filter }) =>
        whenBuilt(i, (table) => table.setFilter(toFilters(filter))),
      ),
      clear_filter: guarded("clear_filter", (i) =>
        whenBuilt(i, (table) => table.clearFilter(true)),
      ),

      select_rows: guarded("select_rows", (i, { ids }) =>
        whenBuilt(i, (table) => {
          if (!Array.isArray(ids))
            throw new TypeError("select_rows expects %{ids: [...]}");
          i.applying = true;
          try {
            table.selectRow(ids);
          } finally {
            i.applying = false;
          }
        }),
      ),

      deselect_rows: guarded("deselect_rows", (i, { ids }) =>
        whenBuilt(i, (table) => {
          i.applying = true;
          try {
            table.deselectRow(ids);
          } finally {
            i.applying = false;
          }
        }),
      ),

      scroll_to_row: guarded(
        "scroll_to_row",
        (i, { id, position = "center" }) =>
          whenBuilt(i, (table) => table.scrollToRow(id, position, true)),
      ),

      download: guarded("download", (i, { type = "csv", filename }) =>
        whenBuilt(i, (table) =>
          table.download(type, filename ?? `table.${type}`),
        ),
      ),

      undo: guarded("undo", (i) => whenBuilt(i, (table) => table.undo())),
      redo: guarded("redo", (i) => whenBuilt(i, (table) => table.redo())),

      revert_edit: guarded("revert_edit", (i, { id, field }) => {
        const key = `${id}\u0000${field}`;
        const cell = i.edits.get(key);
        if (!cell)
          throw new Error(
            `no edit to revert for row ${JSON.stringify(id)}, field ${JSON.stringify(field)}`,
          );

        cell.restoreOldValue();
        i.edits.delete(key);
      }),

      reset: guarded("reset", (i) =>
        whenBuilt(i, (table) =>
          table.replaceData(i.data.map((row) => ({ ...row }))),
        ),
      ),
    },

    events: {
      ready: {},
      cell_edited: {},
      row_click: {},
      row_dblclick: {},
      selection: {},
      sort: {},
      filter: {},
      page: {},
      row_moved: {},
      error: {},
    },
  };

  return withLibrary(adapter, loadLibrary, (library) => {
    ({ Tabulator } = pickLibrary(library));
  });
}
