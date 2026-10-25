// `import ... from "xenia/tiptap"`: Xenia's official adapter, in its own bundle
// (priv/static/xenia-tiptap.esm.js). It imports no library: the app passes it
// with `load` (see assets/adapters/tiptap.js).
export { createTiptap } from "./adapters/tiptap.js";
