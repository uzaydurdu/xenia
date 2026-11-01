// "xenia/d3": Xenia's official D3 adapter. See Xenia.Adapters.D3.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";

/** One point, in long format. Pie and donut: `x` is the slice label, `y` its value. */
export interface D3Point {
  x: string | number;
  y: number;
  series?: string;
  /** Scatter only. */
  size?: number;
}

export interface D3ChartOptions {
  x_type?: "auto" | "band" | "linear" | "time";
  y_min?: number;
  y_max?: number;
  x_label?: string;
  y_label?: string;
  x_format?: string;
  y_format?: string;
  colors?: string[];
  curve?: "linear" | "monotone" | "step" | "natural";
  stacked?: boolean;
  points?: boolean;
  inner_radius?: number;
  legend?: boolean;
  grid?: boolean;
  tooltip?: boolean;
  brush?: boolean;
  duration?: number;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  [key: string]: unknown;
}

/** What a custom chart kind gets on create and on every update. */
export interface D3View {
  d3: any;
  svg: SVGSVGElement;
  root: any;
  width: number;
  height: number;
  data: D3Point[];
  options: D3ChartOptions;
  color: (key: string) => string;
  select: (payload: D3Mark) => void;
  hover: (payload: D3Mark | NoArgs) => void;
}

/** Your own chart kind, used with `kind="<name>"`. */
export interface D3CustomChart<State = any> {
  create(view: D3View): State;
  update(state: State, view: D3View): void;
  destroy?(state: State): void;
}

export interface D3FactoryOptions {
  /** Required: `() => import("d3")`. */
  load: Load;
  /** Custom chart kinds, by name. */
  charts?: Record<string, D3CustomChart>;
}

export interface D3Props {
  /** "bar" (default), "line", "area", "scatter", "pie", "donut", or a custom kind. */
  kind?: "bar" | "line" | "area" | "scatter" | "pie" | "donut" | (string & {});
  data?: D3Point[];
  options?: D3ChartOptions;
}

export interface D3Mark {
  x: string | number;
  y: number;
  series: string | null;
  index: number;
}

export interface D3Events {
  select: D3Mark;
  /** A mark, or `{}` when leaving. */
  hover: D3Mark | NoArgs;
  brush: { from: number | string; to: number | string };
  legend_click: { key: string; hidden: boolean };
  error: AdapterError;
}

export interface D3Commands {
  highlight: { x: string | number; series?: string };
  clear_highlight: NoArgs;
  download_svg: { filename?: string };
}

export type D3Adapter = Adapter<AdapterState, D3Props, D3Events, D3Commands>;

export function createD3(options: D3FactoryOptions): D3Adapter;
