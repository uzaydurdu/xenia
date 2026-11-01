// "xenia/uppy": Xenia's official Uppy adapter. See Xenia.Adapters.Uppy.

import type { Adapter } from "./xenia.js";
import type { AdapterError, AdapterState, Load, NoArgs } from "./shared.js";

export interface UppyFactoryOptions {
  /** Required: resolves to `{ Uppy, Dashboard, XHRUpload?, Tus? }`. */
  load: Load<{ Uppy: any; Dashboard: any; XHRUpload?: any; Tus?: any }>;
}

export interface UppyProps {
  /** Changing it remounts. */
  transport?: "liveview" | "xhr" | "tus";
  /** The LiveView upload's name (liveview transport). */
  upload_name?: string;
  /** xhr and tus. */
  endpoint?: string;
  headers?: Record<string, string>;
  field_name?: string;
  restrictions?: {
    max_file_size?: number;
    max_number_of_files?: number;
    min_number_of_files?: number;
    allowed_file_types?: string[];
    max_total_file_size?: number;
  };
  auto_proceed?: boolean;
  note?: string;
  height?: number;
  /** "auto" follows the app's theme, through `consumes: ["theme"]`. */
  theme?: "auto" | "light" | "dark";
  disabled?: boolean;
  dashboard?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface UppyFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface UppyEvents {
  files_added: { files: UppyFile[] };
  file_removed: { file: UppyFile };
  restriction_failed: { file: UppyFile | null; message: string };
  upload_progress: { file: UppyFile; percent: number };
  upload_success: { file: UppyFile; response: { status: number; body: unknown } };
  upload_error: { file: UppyFile; message: string };
  complete: { successful: UppyFile[]; failed: UppyFile[] };
  /** liveview transport: LiveView accepted them. */
  handed_off: { name: string; files: UppyFile[] };
  error: AdapterError;
}

export interface UppyCommands {
  upload: NoArgs;
  cancel_all: NoArgs;
  clear: NoArgs;
  remove_file: { id: string };
  retry_all: NoArgs;
}

export type UppyAdapter = Adapter<AdapterState, UppyProps, UppyEvents, UppyCommands>;

export function createUppy(options: UppyFactoryOptions): UppyAdapter;
