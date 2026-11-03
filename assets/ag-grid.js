// `import ... from "xenia/ag-grid"`: Xenia's official adapter, in its own bundle
// (priv/static/xenia-ag-grid.esm.js). It imports no library: the app passes it
// with `load` (see assets/adapters/ag_grid.js).
export { createAgGrid } from "./adapters/ag_grid.js";
