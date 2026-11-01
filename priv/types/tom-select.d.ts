// "xenia/tom-select": Xenia's official Tom Select adapter. See Xenia.Adapters.TomSelect.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";

export interface TomSelectFactoryOptions {
  /** Required: `() => import("tom-select")`. */
  load: Load;
}

export interface TomSelectOption {
  value: string | number;
  text?: string;
  disabled?: boolean;
  optgroup?: string;
  [key: string]: unknown;
}

/** A string, or a list for `multiple`. */
export type TomSelectValue = string | string[];

export interface TomSelectProps {
  options?: TomSelectOption[];
  optgroups?: { value: string; label: string }[];
  value?: TomSelectValue | null;
  /** Changing it remounts. */
  multiple?: boolean;
  placeholder?: string;
  /** Lets the user add values that aren't in `options`. */
  create?: boolean;
  max_items?: number;
  /** Sends what the user types as a `search` call. */
  remote?: boolean;
  disabled?: boolean;
  /** Any other Tom Select setting. Changing them remounts. */
  settings?: Record<string, unknown>;
}

export interface TomSelectEvents {
  change: { value: TomSelectValue };
  /** A call with `remote`: reply with `{options: [...]}`. */
  search: { query: string };
  created: { value: string; text: string };
  focus: NoArgs;
  blur: NoArgs;
  error: AdapterError;
}

export interface TomSelectCommands {
  focus: NoArgs;
  blur: NoArgs;
  open: NoArgs;
  close: NoArgs;
  /** Remove the selection (reported as a change). */
  clear: NoArgs;
  /** Select programmatically (not reported). */
  set_value: { value: TomSelectValue };
  add_option: { value: string | number; text: string };
}

export type TomSelectAdapter = Adapter<AdapterState, TomSelectProps, TomSelectEvents, TomSelectCommands>;

export function createTomSelect(options: TomSelectFactoryOptions): TomSelectAdapter;
