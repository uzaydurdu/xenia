// `import ... from "xenia/monaco-diff"`: Xenia's official adapter, in its own bundle
// (priv/static/xenia-monaco-diff.esm.js). It imports no library: the app passes it
// with `load` (see assets/adapters/monaco_diff.js).
export { createMonacoDiff } from "./adapters/monaco_diff.js";
