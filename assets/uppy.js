// `import ... from "xenia/uppy"`: Xenia's official adapter, in its own bundle
// (priv/static/xenia-uppy.esm.js). It imports no library: the app passes it
// with `load` (see assets/adapters/uppy.js).
export { createUppy } from "./adapters/uppy.js";
