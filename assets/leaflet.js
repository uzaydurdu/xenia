// `import ... from "xenia/leaflet"`: Xenia's official adapter, in its own bundle
// (priv/static/xenia-leaflet.esm.js). It imports no library: the app passes it
// with `load` (see assets/adapters/leaflet.js).
export { createLeaflet } from "./adapters/leaflet.js";
