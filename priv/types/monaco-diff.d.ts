// "xenia/monaco-diff": Xenia's official adapter for Monaco's diff editor.
// See Xenia.Adapters.MonacoDiff.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";
import type { MonacoValue } from "./monaco.js";

export interface MonacoDiffFactoryOptions {
  /** Required: `() => import("monaco-editor")`. */
  load: Load;
}

export interface MonacoDiffProps {
  /** The left (old) text. Always applied as given. */
  original?: string;
  /** The right (new) text, editable: the same payload as Monaco's `value`. */
  modified?: string | MonacoValue;
  language?: string;
  /** Global, as for Monaco. */
  theme?: unknown;
  /** Diff editor options, e.g. `{renderSideBySide: false}`. */
  options?: Record<string, unknown>;
}

export interface MonacoDiffLineChange {
  original_start: number;
  original_end: number;
  modified_start: number;
  modified_end: number;
}

export interface MonacoDiffEvents {
  /** The user edited the modified side (debounced 300 ms). */
  change: { value: string; version: number };
  diff: { changes: number; line_changes: MonacoDiffLineChange[] };
  error: AdapterError;
}

export interface MonacoDiffCommands {
  focus: NoArgs;
  next_diff: NoArgs;
  previous_diff: NoArgs;
  reveal_line: { line: number; side?: "modified" | "original" };
}

export type MonacoDiffAdapter = Adapter<AdapterState, MonacoDiffProps, MonacoDiffEvents, MonacoDiffCommands>;

export function createMonacoDiff(options: MonacoDiffFactoryOptions): MonacoDiffAdapter;
