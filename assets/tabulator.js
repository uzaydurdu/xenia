// `import ... from "xenia/tabulator"`: Xenia's official adapter, in its own bundle
// (priv/static/xenia-tabulator.esm.js). It imports no library: the app passes it
// with `load` (see assets/adapters/tabulator.js).
export { createTabulator } from "./adapters/tabulator.js";
