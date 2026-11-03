/**
 * The official AG Grid adapter (`createAgGrid` from "xenia/ag-grid").
 *
 * The app passes AG Grid Community in with `load`, so these tests pass a
 * fake one: a createGrid that records what the adapter asks of it, and lets
 * a test play the grid's events. The adapter runs inside the real
 * Controller, as in a browser. The real AG Grid is tested in the examples
 * app's browser tests (/adapters/ag-grid).
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Controller } from "../../assets/core/controller.js";
import { setProvider, resetProviders } from "../../assets/core/providers.js";
import { createAgGrid } from "../../assets/ag-grid.js";

beforeEach(() => resetProviders());

class Theme {
  constructor(name, parts = [], params = null) {
    Object.assign(this, { name, parts, params });
  }
  withPart(part) {
    return new Theme(this.name, [...this.parts, part], this.params);
  }
  withParams(params) {
    return new Theme(this.name, this.parts, params);
  }
}

// A stand-in for ag-grid-community.
function fakeAgGrid() {
  const grids = [];

  const module = {
    AllCommunityModule: { moduleName: "AllCommunity" },
    themeQuartz: new Theme("quartz"),
    colorSchemeDark: "colorSchemeDark",
    colorSchemeLight: "colorSchemeLight",

    createGrid(host, options, params) {
      const grid = {
        host,
        options,
        params,
        set: [],
        calls: [],
        destroyed: false,
        filterModel: null,
      };
      const idOf = (row) => options.getRowId({ data: row });
      const node = (row) => ({
        data: row,
        setDataValue(field, value, source) {
          grid.calls.push(["setDataValue", idOf(row), field, value, source]);
          row[field] = value;
          options.onCellValueChanged?.({
            source,
            data: row,
            node: this,
            colDef: { field },
            newValue: value,
          });
        },
      });

      grid.api = {
        setGridOption(key, value) {
          grid.set.push([key, value]);
          grid.options[key] = value;
        },
        getDisplayedRowCount: () => grid.options.rowData.length,
        getRowNode: (id) => {
          const row = grid.options.rowData.find((r) => idOf(r) === id);
          return row ? node(row) : undefined;
        },
        applyTransaction: (transaction) =>
          grid.calls.push(["applyTransaction", transaction]),
        setNodesSelected: ({ nodes, newValue, source }) =>
          grid.calls.push([
            "setNodesSelected",
            nodes.map((n) => idOf(n.data)),
            newValue,
            source,
          ]),
        deselectAll: () => grid.calls.push(["deselectAll"]),
        getSelectedRows: () =>
          grid.options.rowData.filter((row) => row.selected),
        ensureNodeVisible: (n, position) =>
          grid.calls.push(["ensureNodeVisible", idOf(n.data), position]),
        setFilterModel: (model) => {
          grid.filterModel = model;
          grid.calls.push(["setFilterModel", model]);
        },
        getFilterModel: () => grid.filterModel ?? {},
        applyColumnState: (state) =>
          grid.calls.push(["applyColumnState", state]),
        getColumnState: () => [
          { colId: "price", sort: "desc", sortIndex: 1 },
          { colId: "make", sort: "asc", sortIndex: 0 },
          { colId: "year", sort: null },
        ],
        exportDataAsCsv: (csv) => grid.calls.push(["exportDataAsCsv", csv]),
        sizeColumnsToFit: () => grid.calls.push(["sizeColumnsToFit"]),
        autoSizeAllColumns: () => grid.calls.push(["autoSizeAllColumns"]),
        destroy: () => (grid.destroyed = true),
      };

      grids.push(grid);
      options.onGridReady?.({ api: grid.api });
      return grid.api;
    },
  };

  return { module, grids };
}

const CARS = [
  { id: 1, make: "Volvo", price: 30000 },
  { id: 2, make: "Kia", price: 25000 },
];
const COLUMNS = [
  {
    field: "make",
    header_name: "Make",
    filter_params: { button_list: ["reset"] },
  },
  {
    header_name: "Price",
    children: [{ field: "price", cell_editor: "agNumberCellEditor" }],
  },
];

function setup(t, adapter, props) {
  const dom = new JSDOM(`<div id="c"></div>`);
  const original = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = original;
    dom.window.close();
  });

  const container = dom.window.document.getElementById("c");
  container.setAttribute("data-xenia-props", JSON.stringify(props));
  container.setAttribute(
    "data-xenia-events",
    JSON.stringify({
      ready: "ready",
      cell_edited: "edited",
      row_click: "clicked",
      selection: "selected",
      sort: "sorted",
      filter: "filtered",
      error: "failed",
    }),
  );

  const sent = [];
  const hook = {
    el: container,
    pushEvent: (event, payload) => sent.push([event, payload]),
  };
  return { controller: new Controller(hook, adapter), container, sent };
}

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

async function mounted(
  t,
  factory = {},
  props = { row_data: CARS, column_defs: COLUMNS },
) {
  const fake = fakeAgGrid();
  const adapter = createAgGrid({ load: () => fake.module, ...factory });
  const parts = setup(t, adapter, props);
  await parts.controller.mount();
  await settle();
  return { ...parts, ...fake, grid: fake.grids[0] };
}

function setProps(parts, props) {
  parts.container.setAttribute("data-xenia-props", JSON.stringify(props));
  parts.controller.update();
}

// --- Creating the grid -----------------------------------------------------

test("creates the grid in its own element, with the columns in AG Grid's names", async (t) => {
  const { grid, container, sent } = await mounted(t);

  assert.equal(
    grid.host.parentElement.parentElement,
    container,
    "inside Xenia's el",
  );
  assert.deepEqual(grid.options.columnDefs, [
    {
      field: "make",
      headerName: "Make",
      filterParams: { buttonList: ["reset"] },
    },
    {
      headerName: "Price",
      children: [{ field: "price", cellEditor: "agNumberCellEditor" }],
    },
  ]);
  assert.deepEqual(grid.options.rowData, CARS);
  assert.notEqual(
    grid.options.rowData[0],
    CARS[0],
    "rows are copies: AG Grid edits them in place",
  );
  assert.equal(grid.options.getRowId({ data: { id: 7 } }), "7");
  assert.deepEqual(grid.params.modules, [{ moduleName: "AllCommunity" }]);
  assert.equal(
    grid.options.domLayout,
    "autoHeight",
    "no height: the grid grows with its rows",
  );
  assert.equal(grid.options.rowSelection, undefined);
  assert.deepEqual(sent, [["ready", { rows: 2 }]]);
});

test("height, selection, pagination, quick filter, sort and filter model at mount", async (t) => {
  const { grid } = await mounted(
    t,
    {},
    {
      row_data: CARS,
      column_defs: COLUMNS,
      height: "300px",
      row_selection: "multiple",
      pagination: 25,
      quick_filter: "vol",
      sort: [{ col_id: "price", sort: "desc" }],
      filter_model: {
        price: { filter_type: "number", type: "greaterThan", filter: 1 },
      },
      row_id: "make",
    },
  );

  assert.equal(grid.host.style.height, "300px");
  assert.equal(grid.options.domLayout, "normal");
  assert.deepEqual(grid.options.rowSelection, {
    mode: "multiRow",
    checkboxes: true,
    headerCheckbox: true,
  });
  assert.equal(grid.options.pagination, true);
  assert.equal(grid.options.paginationPageSize, 25);
  assert.equal(grid.options.quickFilterText, "vol");
  assert.equal(grid.options.getRowId({ data: { make: "Kia" } }), "Kia");
  assert.deepEqual(grid.calls.slice(0, 2), [
    [
      "applyColumnState",
      {
        state: [{ colId: "price", sort: "desc" }],
        defaultState: { sort: null },
      },
    ],
    [
      "setFilterModel",
      { price: { filter_type: "number", type: "greaterThan", filter: 1 } },
    ],
  ]);
});

test("factory options: base theme, modules and grid options; a grid's own options win", async (t) => {
  const formatter = () => "€";
  const { grid } = await mounted(
    t,
    {
      theme: (ag) => ag.themeQuartz.withParams({ accentColor: "#7c3aed" }),
      modules: (ag) => [ag.AllCommunityModule, { moduleName: "Extra" }],
      options: {
        columnTypes: { euro: { valueFormatter: formatter } },
        animateRows: false,
      },
    },
    { row_data: CARS, column_defs: COLUMNS, options: { animate_rows: true } },
  );

  assert.deepEqual(grid.options.theme.params, { accentColor: "#7c3aed" });
  assert.equal(grid.params.modules.length, 2);
  assert.equal(grid.options.columnTypes.euro.valueFormatter, formatter);
  assert.equal(
    grid.options.animateRows,
    true,
    "the tag's options, camelized, win",
  );
});

// --- Props -----------------------------------------------------------------

test("new rows go to AG Grid as one rowData update, which it matches by id", async (t) => {
  const parts = await mounted(t);
  const rows = [...CARS, { id: 3, make: "Fiat", price: 15000 }];
  setProps(parts, { row_data: rows, column_defs: COLUMNS });

  assert.deepEqual(parts.grid.set, [["rowData", rows]]);
});

test("quick filter, height, pagination and selection change in place", async (t) => {
  const parts = await mounted(t);
  setProps(parts, {
    row_data: CARS,
    column_defs: COLUMNS,
    quick_filter: "kia",
    height: "200px",
    pagination: 10,
    row_selection: "single",
  });

  assert.deepEqual(Object.fromEntries(parts.grid.set), {
    quickFilterText: "kia",
    domLayout: "normal",
    paginationPageSize: 10,
    pagination: true,
    rowSelection: { mode: "singleRow", checkboxes: true },
  });
  assert.equal(parts.grid.host.style.height, "200px");
  assert.equal(parts.grids.length, 1, "no remount");
});

test("row_id and options are read once: changing them remounts the grid", async (t) => {
  const parts = await mounted(t);
  setProps(parts, {
    row_data: CARS,
    column_defs: COLUMNS,
    options: { row_height: 50 },
  });
  await settle();

  assert.equal(parts.grids.length, 2);
  assert.equal(parts.grids[0].destroyed, true);
  assert.equal(parts.grids[1].options.rowHeight, 50);
});

// --- The theme -------------------------------------------------------------

test("the app's theme arrives through consumes, as a color scheme on the base theme", async (t) => {
  setProvider("theme", "dark");
  const parts = await mounted(t);
  assert.deepEqual(parts.grid.options.theme.parts, ["colorSchemeDark"]);

  setProvider("theme", "light");
  assert.deepEqual(parts.grid.set.at(-1)[1].parts, ["colorSchemeLight"]);
});

test("a pinned theme ignores the app's; false keeps the base theme's colors", async (t) => {
  setProvider("theme", "dark");
  const pinned = await mounted(
    t,
    {},
    { row_data: CARS, column_defs: COLUMNS, theme: "light" },
  );
  assert.deepEqual(pinned.grid.options.theme.parts, ["colorSchemeLight"]);

  const plain = await mounted(
    t,
    {},
    { row_data: CARS, column_defs: COLUMNS, theme: false },
  );
  assert.deepEqual(plain.grid.options.theme.parts, []);
});

// --- Events ----------------------------------------------------------------

test("a user's edit is reported; revert_edit puts the old value back without a report", async (t) => {
  const parts = await mounted(t);
  const { grid, sent } = parts;
  const row = grid.options.rowData[0];
  row.price = 31000;
  grid.options.onCellValueChanged({
    source: "edit",
    data: row,
    node: grid.api.getRowNode("1"),
    colDef: { field: "price" },
    newValue: 31000,
    oldValue: 30000,
  });
  await settle();

  assert.deepEqual(sent.at(-1), [
    "edited",
    {
      id: 1,
      field: "price",
      value: 31000,
      old_value: 30000,
      row: { id: 1, make: "Volvo", price: 31000 },
    },
  ]);

  parts.controller.command("revert_edit", { id: 1, field: "price" });
  await settle();
  assert.deepEqual(grid.calls.at(-1), [
    "setDataValue",
    "1",
    "price",
    30000,
    "xenia",
  ]);
  assert.equal(
    sent.filter(([e]) => e === "edited").length,
    1,
    "the revert isn't reported",
  );
});

test("only the user's selections and sorts are reported, not the server's", async (t) => {
  const { grid, sent } = await mounted(t);
  grid.options.rowData[1].selected = true;

  grid.options.onSelectionChanged({ source: "api", api: grid.api });
  grid.options.onSelectionChanged({ source: "rowDataChanged", api: grid.api });
  grid.options.onSelectionChanged({
    source: "checkboxSelected",
    api: grid.api,
  });
  grid.options.onSortChanged({ source: "api", api: grid.api });
  grid.options.onSortChanged({ source: "uiColumnSorted", api: grid.api });
  await settle();

  assert.deepEqual(sent.slice(1), [
    ["selected", { ids: [2] }],
    [
      "sorted",
      {
        sort: [
          { col_id: "make", sort: "asc" },
          { col_id: "price", sort: "desc" },
        ],
      },
    ],
  ]);
});

test("a column filter is reported after 300 ms; quick filters and the server's aren't", async (t) => {
  const { grid, sent } = await mounted(t);
  grid.filterModel = { make: { filter: "vo" } };

  grid.options.onFilterChanged({ source: "quickFilter", api: grid.api });
  grid.options.onFilterChanged({ source: "api", api: grid.api });
  grid.options.onFilterChanged({ source: "columnFilter", api: grid.api });
  grid.options.onFilterChanged({ source: "columnFilter", api: grid.api });
  await settle(50);
  assert.equal(sent.length, 1, "only ready so far");

  await settle(350);
  assert.deepEqual(sent.slice(1), [
    ["filtered", { filter_model: { make: { filter: "vo" } } }],
  ]);
});

test("a row click sends the row and its id", async (t) => {
  const { grid, sent } = await mounted(t);
  grid.options.onRowClicked({ data: grid.options.rowData[1] });
  await settle();
  assert.deepEqual(sent.at(-1), [
    "clicked",
    { id: 2, row: { id: 2, make: "Kia", price: 25000 } },
  ]);
});

// --- Commands --------------------------------------------------------------

test("commands reach the grid's API", async (t) => {
  const { controller, grid } = await mounted(t);

  controller.command("apply_transaction", {
    add: [{ id: 3, make: "Fiat" }],
    remove: [1],
  });
  controller.command("select_rows", { ids: [2, 99] });
  controller.command("ensure_visible", { id: 2 });
  controller.command("export_csv", { file_name: "cars.csv" });
  controller.command("clear_filters");
  controller.command("size_columns_to_fit");
  await settle();

  assert.deepEqual(grid.calls, [
    [
      "applyTransaction",
      { add: [{ id: 3, make: "Fiat" }], remove: [{ id: 1 }] },
    ],
    ["setNodesSelected", ["2"], true, "api"],
    ["ensureNodeVisible", "2", "middle"],
    ["exportDataAsCsv", { fileName: "cars.csv" }],
    ["setFilterModel", null],
    ["sizeColumnsToFit"],
  ]);
});

test("a command with a bad argument is an error event, and the grid stays", async (t) => {
  const { controller, grid, sent } = await mounted(t);
  t.mock.method(console, "error", () => {});

  controller.command("ensure_visible", { id: 404 });
  controller.command("select_rows", { ids: "2" });
  await settle();

  assert.deepEqual(
    sent.slice(1).map(([event, { source }]) => [event, source]),
    [
      ["failed", "ensure_visible"],
      ["failed", "select_rows"],
    ],
  );
  assert.equal(grid.destroyed, false);
});

test("destroy destroys the grid and removes its element", async (t) => {
  const { controller, grid } = await mounted(t);
  controller.destroy();

  assert.equal(grid.destroyed, true);
  assert.equal(grid.host.isConnected, false);
});
