// `import ... from "xenia/flatpickr"`: Xenia's official adapter, in its own bundle
// (priv/static/xenia-flatpickr.esm.js). It imports no library: the app passes it
// with `load` (see assets/adapters/flatpickr.js).
export { createFlatpickr } from "./adapters/flatpickr.js";
