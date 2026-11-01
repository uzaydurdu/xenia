// "xenia/wavesurfer-multitrack": Xenia's official adapter for
// wavesurfer-multitrack, with recording. See Xenia.Adapters.WaveSurferMultitrack.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";
import type { PluginOption } from "./wavesurfer.js";

export interface WaveSurferMultitrackFactoryOptions {
  /** Required: resolves to `{ WaveSurfer, RecordPlugin, SpectrogramPlugin, Multitrack }`. */
  load: Load<{ WaveSurfer: any; RecordPlugin: any; SpectrogramPlugin?: any; Multitrack: any }>;
}

/** A track; any wavesurfer-multitrack track option works, snake_case or camelCase. */
export interface MultitrackTrack {
  id: string | number;
  url: string;
  start_position?: number;
  volume?: number;
  draggable?: boolean;
  start_cue?: number;
  end_cue?: number;
  fade_in_end?: number;
  fade_out_start?: number;
  [key: string]: unknown;
}

export interface WaveSurferMultitrackProps {
  /** Changing the list remounts the studio. */
  tracks?: MultitrackTrack[];
  /** Changing them remounts too. */
  options?: Record<string, unknown>;
  zoom?: number;
  spectrogram?: PluginOption;
}

export interface WaveSurferMultitrackEvents {
  ready: { track_ids: Array<string | number> };
  playback: { state: "playing" | "paused"; seconds: number };
  position: { seconds: number };
  recording: { state: "started" | "paused" | "resumed" | "stopped" };
  recording_progress: { seconds: number };
  recorded: { id: string; bytes: number; mime_type: string; seconds: number; start_position: number };
  track_moved: { id: string | number; start_position: number };
  track_trimmed: { id: string | number; start_cue?: number; end_cue?: number };
  track_faded: { id: string | number; fade_in_end?: number; fade_out_start?: number };
  track_volume: { id: string | number; volume: number };
  envelope_changed: { id: string | number; points: unknown[] };
  devices: { devices: { id: string; label: string }[] };
  inspected: { id: string | number; seconds: number };
  error: AdapterError;
}

export interface WaveSurferMultitrackCommands {
  play: NoArgs;
  pause: NoArgs;
  seek: { seconds: number };
  /** By track id, or "take" for the recording. */
  volume: { id: string | number; value: number };
  list_devices: NoArgs;
  start_recording: { device_id?: string; overdub?: boolean };
  pause_recording: NoArgs;
  resume_recording: NoArgs;
  stop_recording: NoArgs;
  discard_recording: NoArgs;
  inspect: { id: string | number };
  download_recording: { filename?: string };
  /** To a LiveView upload: `allow_upload/3` and a rendered `live_file_input` with that name. */
  upload_recording: { name: string; filename?: string };
}

export type WaveSurferMultitrackAdapter = Adapter<
  AdapterState,
  WaveSurferMultitrackProps,
  WaveSurferMultitrackEvents,
  WaveSurferMultitrackCommands
>;

export function createWaveSurferMultitrack(
  options: WaveSurferMultitrackFactoryOptions,
): WaveSurferMultitrackAdapter;
