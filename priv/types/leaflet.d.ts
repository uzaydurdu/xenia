// "xenia/leaflet": Xenia's official Leaflet adapter. See Xenia.Adapters.Leaflet.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";

export interface LeafletFactoryOptions {
  /** Required: `() => import("leaflet")`. */
  load: Load;
}

/** `[lat, lng]`. */
export type LatLng = [number, number];
/** `[[south, west], [north, east]]`. */
export type Bounds = [LatLng, LatLng];

export interface LeafletMarker {
  id: string | number;
  lat: number;
  lng: number;
  popup?: string;
  tooltip?: string;
  draggable?: boolean;
  color?: string;
  icon_url?: string;
  icon_size?: [number, number];
}

export interface LeafletProps {
  center?: LatLng;
  zoom?: number;
  /** A URL template, or `{url, attribution, max_zoom, subdomains, ...}`. */
  tiles?: string | Record<string, unknown>;
  /** Synced by id. */
  markers?: LeafletMarker[];
  /** A GeoJSON Feature or FeatureCollection. */
  geojson?: Record<string, unknown> | null;
  geojson_style?: Record<string, unknown>;
  /** Fit the view to that data whenever it changes. */
  fit?: "markers" | "geojson" | "all" | null;
  /** Leaflet map options at mount. Changing them remounts. */
  options?: Record<string, unknown>;
}

export interface LeafletView {
  center: LatLng;
  zoom: number;
  bounds: Bounds;
}

export interface LeafletEvents {
  ready: LeafletView;
  click: { lat: number; lng: number };
  /** Debounced 200 ms. */
  move_end: LeafletView;
  marker_click: { id: string | number; lat: number; lng: number };
  marker_drag_end: { id: string | number; lat: number; lng: number };
  feature_click: { id: unknown; properties: Record<string, unknown>; lat: number; lng: number };
  located: { lat: number; lng: number; accuracy: number };
  error: AdapterError;
}

export interface LeafletCommands {
  fly_to: { lat: number; lng: number; zoom?: number };
  set_view: { lat: number; lng: number; zoom?: number };
  fit_bounds: { bounds: Bounds; padding?: number };
  fit_markers: { padding?: number };
  fit_geojson: { padding?: number };
  zoom_in: NoArgs;
  zoom_out: NoArgs;
  open_popup: { id: string | number };
  close_popup: NoArgs;
  /** Ask the browser for the user's position. */
  locate: NoArgs;
  /** After the container changed size by itself. */
  invalidate_size: NoArgs;
}

export type LeafletAdapter = Adapter<AdapterState, LeafletProps, LeafletEvents, LeafletCommands>;

export function createLeaflet(options: LeafletFactoryOptions): LeafletAdapter;
