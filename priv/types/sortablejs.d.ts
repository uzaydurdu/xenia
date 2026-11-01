// "xenia/sortablejs": Xenia's official SortableJS adapter. See Xenia.Adapters.SortableJS.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";

export interface SortablejsFactoryOptions {
  /** Required: `() => import("sortablejs")`. */
  load: Load;
}

export interface SortableItem {
  id: string | number;
  /** Set as text, never as HTML. */
  label: string;
  disabled?: boolean;
  class?: string;
}

export interface SortablejsProps {
  items?: SortableItem[];
  /** Lists with the same name exchange items. */
  group?: string | { name: string; pull?: boolean | "clone"; put?: boolean };
  handle?: boolean;
  disabled?: boolean;
  list_class?: string;
  item_class?: string;
  /** Any other SortableJS option, snake_case or camelCase. */
  options?: Record<string, unknown>;
}

export interface SortablejsEvents {
  sort: { ids: string[]; item_id: string; old_index: number; new_index: number };
  /** `from` is the other list's component id. */
  add: { ids: string[]; item_id: string; new_index: number; from: string };
  /** `to` is the other list's component id. */
  remove: { ids: string[]; item_id: string; old_index: number; to: string };
  error: AdapterError;
}

export interface SortablejsCommands {
  /** Re-render from the last `items` prop, e.g. after the server refused a move. */
  reset: NoArgs;
}

export type SortablejsAdapter = Adapter<AdapterState, SortablejsProps, SortablejsEvents, SortablejsCommands>;

export function createSortablejs(options: SortablejsFactoryOptions): SortablejsAdapter;
