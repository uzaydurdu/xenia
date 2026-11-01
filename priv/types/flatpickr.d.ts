// "xenia/flatpickr": Xenia's official flatpickr adapter. See Xenia.Adapters.Flatpickr.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";

export interface FlatpickrFactoryOptions {
  /** Required: `() => import("flatpickr")`. */
  load: Load;
}

/** A date string in `date_format`, or a list for "multiple" and "range". */
export type FlatpickrValue = string | string[] | null;

export interface FlatpickrProps {
  value?: FlatpickrValue;
  /** Bump it to force `value` over the user's newer choice. */
  revision?: unknown;
  /** Changing it remounts. */
  mode?: "single" | "multiple" | "range";
  enable_time?: boolean;
  /** Time only. Changing it remounts. */
  no_calendar?: boolean;
  time_24hr?: boolean;
  date_format?: string;
  alt_format?: string;
  alt_input?: boolean;
  min_date?: string;
  max_date?: string;
  disable?: Array<string | { from: string; to: string }>;
  /** Changing it remounts. */
  inline?: boolean;
  placeholder?: string;
  locale?: string | Record<string, unknown>;
  /** Any other flatpickr option, snake_case or camelCase. */
  options?: Record<string, unknown>;
}

export interface FlatpickrEvents {
  /** A range sends its list once both ends are chosen. */
  change: { value: FlatpickrValue };
  open: NoArgs;
  close: NoArgs;
  error: AdapterError;
}

export interface FlatpickrCommands {
  open: NoArgs;
  close: NoArgs;
  toggle: NoArgs;
  /** Clears the value (reported as a change). */
  clear: NoArgs;
  /** Sets it without a change event. */
  set_value: { value: FlatpickrValue };
  jump_to_date: { date: string };
}

export type FlatpickrAdapter = Adapter<AdapterState, FlatpickrProps, FlatpickrEvents, FlatpickrCommands>;

export function createFlatpickr(options: FlatpickrFactoryOptions): FlatpickrAdapter;
