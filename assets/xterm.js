// `import ... from "xenia/xterm"`: Xenia's official adapter, in its own bundle
// (priv/static/xenia-xterm.esm.js). It imports no library: the app passes it
// with `load` (see assets/adapters/xterm.js).
export { createXterm } from "./adapters/xterm.js";
