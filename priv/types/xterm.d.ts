// "xenia/xterm": Xenia's official xterm.js adapter. See Xenia.Adapters.Xterm.
// A terminal is a stream: output arrives as commands, input leaves as events.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";

export interface XtermFactoryOptions {
  /** Required: resolves to `{ Terminal, FitAddon, SearchAddon?, WebLinksAddon? }`. */
  load: Load<{ Terminal: any; FitAddon: any; SearchAddon?: any; WebLinksAddon?: any }>;
}

export interface XtermProps {
  font_size?: number;
  font_family?: string;
  font_weight?: string | number;
  line_height?: number;
  letter_spacing?: number;
  cursor_blink?: boolean;
  cursor_style?: "block" | "underline" | "bar";
  scrollback?: number;
  read_only?: boolean;
  /** The app's theme ("light" | "dark", through `consumes`), or an xterm ITheme object. */
  theme?: "light" | "dark" | Record<string, string> | null;
  /** Any other xterm option, merged. */
  options?: Record<string, unknown>;
  /** Clickable URLs (default true). */
  links?: boolean;
}

export interface XtermSearch {
  query: string;
  case_sensitive?: boolean;
  regex?: boolean;
  whole_word?: boolean;
}

export interface XtermEvents {
  /** Every input chunk, never debounced. */
  data: { data: string };
  resize: { cols: number; rows: number };
  /** Once per mount, after the first real fit: replay server-side output here. */
  ready: { cols: number; rows: number };
  title: { title: string };
  bell: NoArgs;
  selection: { text: string };
  search: { query: string; found: boolean };
  error: AdapterError;
}

export interface XtermCommands {
  write: { text: string };
  writeln: { text: string };
  /** As if the user typed it, so it also emits `data`. */
  paste: { text: string };
  clear: NoArgs;
  reset: NoArgs;
  focus: NoArgs;
  blur: NoArgs;
  scroll_to_bottom: NoArgs;
  scroll_to_top: NoArgs;
  scroll_lines: { amount: number };
  select_all: NoArgs;
  clear_selection: NoArgs;
  search_next: XtermSearch;
  search_previous: XtermSearch;
  clear_search: NoArgs;
}

export type XtermAdapter = Adapter<AdapterState, XtermProps, XtermEvents, XtermCommands>;

export function createXterm(options: XtermFactoryOptions): XtermAdapter;
