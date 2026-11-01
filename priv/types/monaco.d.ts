// "xenia/monaco": Xenia's official Monaco adapter, and the MonacoAdapter
// class underneath it. See Xenia.Adapters.Monaco.

import type { Adapter } from "./xenia.js";
import type { Load } from "./shared.js";

/** The editor's value: authoritative without `version`; a changed `revision` forces it. */
export interface MonacoValue {
  value: string;
  version?: number;
  revision?: unknown;
}

/** Runs once per editor. Return Monaco disposables to dispose with the editor. */
export type MonacoSetup = (monaco: any, editor: any) => unknown;

export interface MonacoFactoryOptions {
  /** Required: `() => import("monaco-editor")`. */
  load: Load;
  setup?: MonacoSetup;
}

export interface MonacoProps {
  value?: string | MonacoValue;
  language?: string;
  /** The app's theme ("light" | "dark", through `consumes`), a Monaco theme name, or a theme definition. */
  theme?: unknown;
  /** Replaces the editor theme used for the app's "light" or "dark". */
  themes?: { light?: unknown; dark?: unknown };
  /** Monaco editor options, e.g. `{readOnly: true, minimap: {enabled: false}}`. */
  options?: Record<string, unknown>;
}

export interface MonacoEvents {
  /** Debounced 300 ms. */
  change: { value: string; version: number };
}

export interface MonacoCommands {
  focus: Record<string, never>;
  insert: { text: string };
}

/** The editor class, also usable from a plain LiveView hook without the rest of Xenia. */
export class MonacoAdapter {
  constructor(
    el: HTMLElement,
    props: {
      load: Load;
      /** The model's identity; `ctx.id` under Xenia. */
      id?: string;
      value?: string | MonacoValue;
      language?: string;
      theme?: unknown;
      options?: Record<string, unknown>;
      setup?: MonacoSetup;
    },
  );
  /** Resolves to the editor's text afterwards, or `undefined` if this editor isn't the live owner. */
  applyValue(payload: string | MonacoValue): Promise<string | undefined>;
  applyLanguage(language: string): Promise<void>;
  /** Monaco themes are global: this changes every editor on the page. */
  applyTheme(theme: unknown): Promise<void>;
  applyOptions(options: Record<string, unknown>): Promise<void>;
  onChange(callback: (change: { value: string; version: number }) => void): Promise<void>;
  /** Monaco and the editor, for calls the adapter doesn't wrap; `null` if it failed or was destroyed. */
  raw(): Promise<{ monaco: any; editor: any } | null>;
  destroy(): Promise<void>;
}

export type MonacoXeniaAdapter = Adapter<MonacoAdapter, MonacoProps, MonacoEvents, MonacoCommands>;

/** Creates the adapter: `createHooks({ Monaco: createMonaco({ load: () => import("monaco-editor") }) })`. */
export function createMonaco(options: MonacoFactoryOptions): MonacoXeniaAdapter;
