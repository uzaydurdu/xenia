// "xenia/wavesurfer": Xenia's official WaveSurfer.js adapter. See Xenia.Adapters.WaveSurfer.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";

export interface WaveSurferFactoryOptions {
  /** Required: resolves to `{ WaveSurfer, RegionsPlugin, TimelinePlugin, ... }`. */
  load: Load<{
    WaveSurfer: any;
    RegionsPlugin?: any;
    TimelinePlugin?: any;
    MinimapPlugin?: any;
    HoverPlugin?: any;
    SpectrogramPlugin?: any;
  }>;
}

/** A region, or a marker when it has no `end`. */
export interface WaveSurferRegion {
  id: string;
  start: number;
  end?: number | null;
  color?: string;
  content?: string;
  drag?: boolean;
  resize?: boolean;
}

/** `true`, a map of plugin options, or `false`/`null` for none. */
export type PluginOption = boolean | Record<string, unknown> | null;

export interface WaveSurferProps {
  url?: string;
  /** Precomputed peaks (a list per channel); needs `duration`. */
  peaks?: number[][];
  duration?: number;
  /** Any WaveSurfer option, snake_case or camelCase. */
  options?: Record<string, unknown>;
  zoom?: number;
  volume?: number;
  muted?: boolean;
  playback_rate?: number;
  regions?: WaveSurferRegion[];
  region_editing?: boolean;
  timeline?: PluginOption;
  minimap?: PluginOption;
  hover?: PluginOption;
  spectrogram?: PluginOption;
}

export interface WaveSurferRegionPayload {
  id: string;
  start: number;
  end: number | null;
  color: string | null;
  content: string | null;
}

export interface WaveSurferEvents {
  ready: { duration: number };
  loading: { percent: number };
  playback: { state: "playing" | "paused"; seconds: number };
  position: { seconds: number };
  seek: { seconds: number };
  finish: NoArgs;
  zoom: { px_per_sec: number };
  region_created: { region: WaveSurferRegionPayload };
  region_updated: { region: WaveSurferRegionPayload };
  region_clicked: { region: WaveSurferRegionPayload };
  region_in: { region: WaveSurferRegionPayload };
  region_out: { region: WaveSurferRegionPayload };
  error: AdapterError;
}

export interface WaveSurferCommands {
  play: { start?: number; end?: number };
  pause: NoArgs;
  play_pause: NoArgs;
  stop: NoArgs;
  seek: { seconds: number };
  skip: { seconds: number };
  play_region: { id: string };
  download_image: { filename?: string };
}

export type WaveSurferAdapter = Adapter<AdapterState, WaveSurferProps, WaveSurferEvents, WaveSurferCommands>;

export function createWaveSurfer(options: WaveSurferFactoryOptions): WaveSurferAdapter;
