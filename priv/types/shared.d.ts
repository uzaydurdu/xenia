// Types the official adapters share. Not an entry point: the adapters'
// declarations import it.

/**
 * Gives the adapter its library, written in the app so the import resolves
 * from the app's own node_modules: `() => import("chart.js/auto")`.
 */
export type Load<Library = any> = () => Library | Promise<Library>;

/** The `error` event every official adapter sends, e.g. for a command's bad arguments. */
export interface AdapterError {
  source: string;
  message: string;
  /** The error's name, e.g. "TypeError", or null. */
  code: string | null;
}

/** A command or event without arguments (the server sends `%{}`). */
export type NoArgs = Record<string, never>;

/** The adapter's own state: its fields aren't part of the documented API. */
export type AdapterState = Record<string, any>;
