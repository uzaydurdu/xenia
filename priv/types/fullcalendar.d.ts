// "xenia/fullcalendar": Xenia's official FullCalendar adapter. See Xenia.Adapters.FullCalendar.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";

export interface FullCalendarFactoryOptions {
  /** Required: resolves to `{ Calendar, plugins }` from the @fullcalendar packages. */
  load: Load<{ Calendar: any; plugins: unknown[] }>;
}

/** An event on the calendar. Dates are ISO 8601 strings; keys in snake_case or camelCase. */
export interface FullCalendarEventInput {
  id: string | number;
  title: string;
  start: string;
  end?: string;
  all_day?: boolean;
  color?: string;
  background_color?: string;
  border_color?: string;
  text_color?: string;
  display?: string;
  url?: string;
  editable?: boolean;
  group_id?: string;
  extended_props?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FullCalendarProps {
  events?: FullCalendarEventInput[];
  view?: "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek" | "dayGridWeek" | "listMonth" | (string & {});
  date?: string;
  editable?: boolean;
  selectable?: boolean;
  /** Any other FullCalendar option, snake_case or camelCase. */
  options?: Record<string, unknown>;
}

/** An event, as the calendar reports it. */
export interface FullCalendarEvent {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  all_day: boolean;
  extended_props: Record<string, unknown>;
}

export interface FullCalendarEvents {
  event_click: { event: FullCalendarEvent };
  date_click: { date: string; all_day: boolean };
  select: { start: string; end: string; all_day: boolean };
  event_change: { event: FullCalendarEvent; old_event: FullCalendarEvent; kind: "drop" | "resize" };
  dates_set: { start: string; end: string; view: string };
  error: AdapterError;
}

export interface FullCalendarCommands {
  today: NoArgs;
  prev: NoArgs;
  next: NoArgs;
  change_view: { view: string; date?: string };
  go_to_date: { date: string };
  scroll_to_time: { time: string };
  select: { start: string; end?: string };
  unselect: NoArgs;
  /** Undo the user's last move or resize of an event, e.g. when the server rejects it. */
  revert_change: { id: string | number };
  update_size: NoArgs;
}

export type FullCalendarAdapter = Adapter<
  AdapterState,
  FullCalendarProps,
  FullCalendarEvents,
  FullCalendarCommands
>;

export function createFullCalendar(options: FullCalendarFactoryOptions): FullCalendarAdapter;
