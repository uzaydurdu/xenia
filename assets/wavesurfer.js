// `import ... from "xenia/wavesurfer"`: Xenia's official adapter, in its own bundle
// (priv/static/xenia-wavesurfer.esm.js). It imports no library: the app passes it
// with `load` (see assets/adapters/wavesurfer.js).
export { createWaveSurfer } from "./adapters/wavesurfer.js";
