// "xenia/tabulator": Xenia's official Tabulator adapter. See Xenia.Adapters.Tabulator.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";

export interface TabulatorFactoryOptions {
  /** Required: `() => import("tabulator-tables")`. */
  load: Load;
}

/** A row; `id` (or the `index` field) identifies it. */
export type TabulatorRow = Record<string, unknown>;

/** A column; keys may be snake_case (`hoz_align`, `header_filter`, `editor_params`). */
export interface TabulatorColumn {
  title?: string;
  field?: string;
  [key: string]: unknown;
}

export interface TabulatorSort {
  column: string;
  dir: "asc" | "desc";
}

export interface TabulatorFilter {
  field: string;
  type: string;
  value: unknown;
}

export interface TabulatorProps {
  data?: TabulatorRow[];
  columns?: TabulatorColumn[];
  /** The row id field (default "id"). */
  index?: string;
  height?: string | null;
  layout?: "fitColumns" | "fitData" | "fitDataFill" | "fitDataStretch" | "fitDataTable" | (string & {});
  selectable?: boolean | number;
  page_size?: number;
  placeholder?: string;
  sort?: TabulatorSort[];
  filter?: TabulatorFilter[];
  /** Any other Tabulator option. Changing it remounts the table. */
  options?: Record<string, unknown>;
}

export interface TabulatorEvents {
  ready: { rows: number };
  cell_edited: { id: unknown; field: string; value: unknown; old_value: unknown; row: TabulatorRow };
  row_click: { id: unknown; row: TabulatorRow };
  row_dblclick: { id: unknown; row: TabulatorRow };
  selection: { ids: unknown[] };
  sort: { sort: TabulatorSort[] };
  /** Debounced 300 ms. */
  filter: { filter: TabulatorFilter[] };
  page: { page: number };
  row_moved: { ids: unknown[] };
  error: AdapterError;
}

export interface TabulatorCommands {
  set_sort: { sort: TabulatorSort[] };
  clear_sort: NoArgs;
  set_filter: { filter: TabulatorFilter[] };
  clear_filter: NoArgs;
  select_rows: { ids: unknown[] };
  deselect_rows: { ids?: unknown[] };
  scroll_to_row: { id: unknown; position?: "top" | "center" | "bottom" | "nearest" };
  download: { type: "csv" | "json" | "html"; filename?: string };
  /** Needs `options: %{history: true}`. */
  undo: NoArgs;
  redo: NoArgs;
  /** Undo the user's last edit of a cell, e.g. when the server rejects it. */
  revert_edit: { id: unknown; field: string };
  reset: NoArgs;
}

export type TabulatorAdapter = Adapter<AdapterState, TabulatorProps, TabulatorEvents, TabulatorCommands>;

export function createTabulator(options: TabulatorFactoryOptions): TabulatorAdapter;
