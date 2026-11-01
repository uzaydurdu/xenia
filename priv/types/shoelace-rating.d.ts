// "xenia/shoelace-rating": Xenia's official adapter for Shoelace's <sl-rating>.
// See Xenia.Adapters.ShoelaceRating.

import type { Adapter } from "./xenia.js";
import type { AdapterError, Load, NoArgs } from "./shared.js";

export interface ShoelaceRatingFactoryOptions {
  /** Required: `() => import("@shoelace-style/shoelace/dist/components/rating/rating.js")`. */
  load: Load;
}

/** `<sl-rating>`'s properties. Props without a handler are set on the element. */
export interface ShoelaceRatingProps {
  /** The form sends it back as a string, e.g. "4". */
  value?: number | string;
  max?: number;
  precision?: number;
  label?: string;
  readonly?: boolean;
  disabled?: boolean;
  /** Bump it to force `value`. */
  revision?: unknown;
}

export interface ShoelaceRatingEvents {
  change: { value: number };
  hover: { phase: string; value: number };
  focus: NoArgs;
  blur: NoArgs;
  error: AdapterError;
}

export interface ShoelaceRatingCommands {
  focus: NoArgs;
  blur: NoArgs;
  set_value: { value: number };
}

/** `mount` returns the `<sl-rating>` element itself. */
export type ShoelaceRatingElement = HTMLElement & { value: number; [key: string]: any };

export type ShoelaceRatingAdapter = Adapter<
  ShoelaceRatingElement,
  ShoelaceRatingProps,
  ShoelaceRatingEvents,
  ShoelaceRatingCommands
>;

export function createShoelaceRating(options: ShoelaceRatingFactoryOptions): ShoelaceRatingAdapter;
