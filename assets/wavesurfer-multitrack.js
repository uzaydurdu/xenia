// `import ... from "xenia/wavesurfer-multitrack"`: Xenia's official adapter, in its own bundle
// (priv/static/xenia-wavesurfer-multitrack.esm.js). It imports no library: the app passes it
// with `load` (see assets/adapters/wavesurfer_multitrack.js).
export { createWaveSurferMultitrack } from "./adapters/wavesurfer_multitrack.js";
