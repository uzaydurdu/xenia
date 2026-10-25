// `import ... from "xenia/monaco"`: Xenia's Monaco adapter (Tier 2), in its
// own bundle (priv/static/xenia-monaco.esm.js). It doesn't import
// monaco-editor itself: the app passes `load: () => import("monaco-editor")`.
export { MonacoAdapter, createMonaco } from "./adapters/monaco.js";
