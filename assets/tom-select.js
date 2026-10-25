// `import ... from "xenia/tom-select"`: Xenia's official adapter, in its own bundle
// (priv/static/xenia-tom-select.esm.js). It imports no library: the app passes it
// with `load` (see assets/adapters/tom_select.js).
export { createTomSelect } from "./adapters/tom_select.js";
