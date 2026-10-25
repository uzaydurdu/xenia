// `import ... from "xenia/chartjs"`: Xenia's official Chart.js adapter, in
// its own bundle (priv/static/xenia-chartjs.esm.js). It doesn't import
// chart.js itself: the app passes `load: () => import("chart.js/auto")`.
export { createChartjs } from "./adapters/chartjs.js";
