// "xenia/tiptap": Xenia's official Tiptap adapter. See Xenia.Adapters.Tiptap.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";

export interface TiptapFactoryOptions {
  /** Required: resolves to `{ Editor, StarterKit, CharacterCount, Placeholder }`. */
  load: Load<{ Editor: any; StarterKit: any; CharacterCount: any; Placeholder: any }>;
}

export type TiptapToolbarItem =
  | "bold" | "italic" | "underline" | "strike" | "code"
  | "heading1" | "heading2" | "heading3" | "paragraph"
  | "bullet_list" | "ordered_list" | "blockquote" | "code_block"
  | "horizontal_rule" | "link" | "undo" | "redo" | "separator";

export interface TiptapProps {
  /** HTML, or `{value, format, revision}`: a changed `revision` forces it. */
  content?: string | { value: unknown; format?: "html" | "json"; revision?: unknown };
  /** What change events and the form field carry. */
  format?: "html" | "json";
  editable?: boolean;
  placeholder?: string;
  /** Maximum characters; 0 or null for no limit. */
  limit?: number | null;
  toolbar?: boolean | TiptapToolbarItem[];
  /** StarterKit configuration. Changing it remounts. */
  starter_kit?: Record<string, unknown>;
}

export interface TiptapEvents {
  /** Debounced 300 ms. */
  change: { value: unknown; text: string; empty: boolean; characters: number; words: number };
  focus: NoArgs;
  blur: NoArgs;
  error: AdapterError;
}

export interface TiptapCommands {
  focus: { position?: "start" | "end" | "all" };
  blur: NoArgs;
  /** Not reported back. */
  set_content: { value: unknown; format?: "html" | "json" };
  clear: NoArgs;
  insert: { content: string };
  /** Any Tiptap command on a focused chain, e.g. `{command: "toggleBold"}`. */
  run: { command: string; args?: unknown[] };
}

export type TiptapAdapter = Adapter<AdapterState, TiptapProps, TiptapEvents, TiptapCommands>;

export function createTiptap(options: TiptapFactoryOptions): TiptapAdapter;
