// "xenia/chartjs": Xenia's official Chart.js adapter. Props, events and
// commands are documented in Xenia.Adapters.Chartjs.

import type { Adapter, Ctx } from "./xenia.js";
import type { AdapterError, Load, NoArgs } from "./shared.js";

export interface ChartjsFactoryOptions {
  /** Required: `() => import("chart.js/auto")`. Called once, at the first mount. */
  load: Load;
  /** Chart.js plugins to register once (zoom, annotation, datalabels, your own). */
  plugins?: unknown[];
  /** Chart.js options for every chart of this factory, under each chart's own `options`. */
  options?: Record<string, unknown>;
  /** Dataset colors, per theme. */
  palette?: { light?: string[]; dark?: string[] };
  /** Runs after each chart is created. A returned function runs before it's destroyed. */
  setup?: (chart: any, context: { Chart: any; ctx: Ctx<ChartjsEvents> }) => void | (() => void);
}

export interface ChartjsProps {
  /** Changing it rebuilds the chart: Chart.js can't switch types in place. */
  type?: "bar" | "line" | "pie" | "doughnut" | "radar" | "polarArea" | "scatter" | "bubble" | (string & {});
  /** `{labels, datasets}`, exactly as Chart.js expects. */
  data?: { labels?: unknown[]; datasets?: Record<string, unknown>[]; [key: string]: unknown };
  /** Chart.js options, merged over the themed defaults. */
  options?: Record<string, unknown>;
  /** The app's theme, through `consumes: ["theme"]`; `false` for no themed colors. */
  theme?: "light" | "dark" | false | null;
}

export interface ChartjsPoint {
  dataset_index: number;
  index: number;
  dataset: string;
  label: unknown;
  value: unknown;
}

export interface ChartjsEvents {
  point_click: ChartjsPoint;
  legend_click: { dataset_index: number; label: string; hidden: boolean };
  /** A point, or `{}` when the pointer leaves all points. */
  hover: ChartjsPoint | NoArgs;
  error: AdapterError;
}

export interface ChartjsCommands {
  highlight: { dataset_index?: number; index: number };
  clear_highlight: NoArgs;
  toggle_dataset: { index: number; visible?: boolean };
  reset: NoArgs;
  download_image: { filename?: string };
}

/** What the adapter hands its handlers. */
export interface ChartjsInstance {
  /** The Chart.js chart, `null` until the first render. */
  chart: any;
  /** Chart.js itself. */
  Chart: any;
  [key: string]: any;
}

export type ChartjsAdapter = Adapter<ChartjsInstance, ChartjsProps, ChartjsEvents, ChartjsCommands>;

/** Creates the adapter. Extend it by spreading: `{...chartjs, commands: {...chartjs.commands, mine() {}}}`. */
export function createChartjs(options: ChartjsFactoryOptions): ChartjsAdapter;
