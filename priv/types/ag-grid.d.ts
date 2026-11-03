// "xenia/ag-grid": Xenia's official AG Grid Community adapter. See Xenia.Adapters.AgGrid.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";

export interface AgGridFactoryOptions {
  /** Required: `() => import("ag-grid-community")`. */
  load: Load;
  /** The AG Grid modules to use. Default: `(ag) => [ag.AllCommunityModule]`. */
  modules?: (library: any) => unknown[];
  /** The base theme. Default: `(ag) => ag.themeQuartz`. */
  theme?: (library: any) => unknown;
  /**
   * Grid options for every grid of this factory. Functions are fine here:
   * `columnTypes` with value formatters, comparators, cell renderers.
   */
  options?: Record<string, unknown>;
}

/** A row; `id` (or the `row_id` field) identifies it. */
export type AgGridRow = Record<string, unknown>;

/** A column definition; keys may be snake_case (`header_name`, `cell_editor`). */
export interface AgGridColumn {
  field?: string;
  header_name?: string;
  type?: string | string[];
  children?: AgGridColumn[];
  [key: string]: unknown;
}

export interface AgGridSort {
  col_id: string;
  sort: "asc" | "desc";
}

export interface AgGridProps {
  row_data?: AgGridRow[];
  column_defs?: AgGridColumn[];
  default_col_def?: Record<string, unknown>;
  /** The row id field (default "id"). Changing it remounts the grid. */
  row_id?: string;
  height?: string | null;
  row_selection?: "single" | "multiple" | null;
  /** Rows per page; null for no pagination. */
  pagination?: number | null;
  quick_filter?: string | null;
  filter_model?: Record<string, unknown> | null;
  sort?: AgGridSort[];
  /** "light" or "dark" (the app's theme, through consumes), or false. */
  theme?: "light" | "dark" | false;
  /** Any other grid option. Changing it remounts the grid. */
  options?: Record<string, unknown>;
}

export interface AgGridEvents {
  ready: { rows: number };
  cell_edited: { id: unknown; field: string; value: unknown; old_value: unknown; row: AgGridRow };
  row_click: { id: unknown; row: AgGridRow };
  row_dblclick: { id: unknown; row: AgGridRow };
  selection: { ids: unknown[] };
  sort: { sort: AgGridSort[] };
  /** Debounced 300 ms. */
  filter: { filter_model: Record<string, unknown> };
  error: AdapterError;
}

export interface AgGridCommands {
  /** Rows to add, update or remove, matched by id; `remove` takes rows or ids. */
  apply_transaction: { add?: AgGridRow[]; update?: AgGridRow[]; remove?: (AgGridRow | unknown)[] };
  select_rows: { ids: unknown[] };
  deselect_all: NoArgs;
  ensure_visible: { id: unknown; position?: "top" | "middle" | "bottom" };
  set_filter_model: { filter_model: Record<string, unknown> | null };
  clear_filters: NoArgs;
  export_csv: { file_name?: string };
  size_columns_to_fit: NoArgs;
  auto_size_columns: NoArgs;
  /** Undo the user's last edit of a cell, e.g. when the server rejects it. */
  revert_edit: { id: unknown; field: string };
}

export type AgGridAdapter = Adapter<AdapterState, AgGridProps, AgGridEvents, AgGridCommands>;

export function createAgGrid(options: AgGridFactoryOptions): AgGridAdapter;
