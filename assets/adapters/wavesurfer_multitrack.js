/**
 * Xenia's official adapter for wavesurfer-multitrack, plus microphone recording and a
 * spectrogram inspector: a small audio studio.
 *
 * Layout (inside the element Xenia hands to mount()):
 *   1. Multitrack timeline: server tracks plus one reserved "take" slot for
 *      the latest recording. Tracks can be dragged, trimmed and faded.
 *   2. Recording preview: a live scrolling waveform while recording.
 *   3. Inspector (optional): waveform + spectrogram of one selected track.
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createWaveSurferMultitrack } from "xenia/wavesurfer-multitrack"
 *   const wavesurferMultitrack = createWaveSurferMultitrack({
 *     load: async () => {
 *       const [ws, record, spectrogram, multitrack] = await Promise.all([
 *         import("wavesurfer.js"),
 *         import("wavesurfer.js/dist/plugins/record.esm.js"),
 *         import("wavesurfer.js/dist/plugins/spectrogram.esm.js"),
 *         import("wavesurfer-multitrack"),
 *       ])
 *       return {
 *         WaveSurfer: ws.default,
 *         RecordPlugin: record.default,
 *         SpectrogramPlugin: spectrogram.default,
 *         Multitrack: multitrack.default,
 *       }
 *     }
 *   })
 *   // createHooks({ WaveSurferMultitrack: wavesurferMultitrack }), then <.wavesurfer_multitrack> (Xenia.Adapters.WaveSurferMultitrack)
 *   Extend it by spreading: { ...wavesurferMultitrack, commands: { ...wavesurferMultitrack.commands, mine() {} } }
 *
 * ---------------------------------------------------------------------------
 * Props
 *   tracks       [%{id, url, start_position?, volume?, draggable?,
 *                   start_cue?, end_cue?, fade_in_end?, fade_out_start?,
 *                   envelope?, markers?, intro?, options?}]
 *                Any wavesurfer-multitrack track option works, in snake_case
 *                or camelCase. Changing the list remounts the studio, which
 *                discards the browser-only recording (multitrack can't remove
 *                tracks). Keep live state (volume, positions) out of it.
 *   options      multitrack options: track_background, track_border_color,
 *                cursor_color, drag_bounds, right_button_drag,
 *                timeline_options, ... Changing them remounts too.
 *   zoom         pixels per second (default 50), applied in place
 *   spectrogram  false, true, or %{height, fft_samples, frequency_min,
 *                frequency_max, labels, scale, color_map}. Rebuilds only the
 *                inspector.
 *
 * Commands
 *   play, pause, seek %{seconds}
 *   volume %{id, value 0..1}           by track id ("take" for the recording)
 *   list_devices                       → devices event
 *   start_recording %{device_id?, overdub?}
 *                                      overdub plays the tracks while you
 *                                      record; the take starts at the cursor
 *   pause_recording, resume_recording, stop_recording, discard_recording
 *   inspect %{id}                      show a track (or "take") in the inspector
 *   download_recording %{filename?}    save the take locally
 *   upload_recording %{name, filename?}  send the take to a LiveView upload
 *                                      (allow_upload/3 + a rendered
 *                                      live_file_input with that name)
 *
 * Events (none debounced: streams are throttled here, others are discrete)
 *   ready               %{track_ids}
 *   playback            %{state: "playing" | "paused", seconds}
 *   position            %{seconds}            while playing, ≤ 4 per second
 *   recording           %{state: "started" | "paused" | "resumed" | "stopped"}
 *   recording_progress  %{seconds}            while recording, ≤ 4 per second
 *   recorded            %{id, bytes, mime_type, seconds, start_position}
 *   track_moved         %{id, start_position}
 *   track_trimmed       %{id, start_cue?, end_cue?}
 *   track_faded         %{id, fade_in_end?, fade_out_start?}
 *   track_volume        %{id, volume}         the user changed it on the track
 *   envelope_changed    %{id, points}
 *   devices             %{devices: [%{id, label}]}
 *   inspected           %{id, seconds}
 *   error               %{source, message, code}
 *
 * Recorded audio stays in the browser until download_recording or
 * upload_recording. Events carry JSON metadata only.
 */

import {
  camelizeKeys,
  expectLibrary,
  guarded,
  isFiniteNumber,
  loadOnce,
  reportError,
  throttle,
  withLibrary,
} from "./shared.js";

const LOAD =
  "createWaveSurferMultitrack({ load: see the usage at the top of this file })";

function pickLibrary(library) {
  const { WaveSurfer, RecordPlugin, SpectrogramPlugin, Multitrack } =
    library ?? {};
  expectLibrary(
    [WaveSurfer, RecordPlugin, SpectrogramPlugin, Multitrack].every(
      (part) => typeof part?.create === "function",
    ),
    LOAD,
  );
  return { WaveSurfer, RecordPlugin, SpectrogramPlugin, Multitrack };
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createWaveSurferMultitrack({ load: libraryImport } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let WaveSurfer, RecordPlugin, SpectrogramPlugin, Multitrack;
  const TAKE_ID = "take";
  const DEFAULT_ZOOM = 50;
  const TRACK_HEIGHT = 72;
  const PREVIEW_HEIGHT = 80;
  const INSPECTOR_WAVE_HEIGHT = 48;
  const STREAM_MS = 250;

  /** Kept object URLs: the previous take may still be loading when replaced. */
  const KEPT_TAKE_URLS = 2;

  /** After play(), how long "not playing yet" isn't treated as stopped. */
  const PLAY_START_GRACE_MS = 500;

  const COLORS = Object.freeze({
    wave: "#94a3b8",
    progress: "#4f46e5",
    recording: "#f59e0b",
    recordingProgress: "#ea580c",
  });

  const SPECTROGRAM_DEFAULTS = Object.freeze({
    height: 160,
    fft_samples: 512,
    frequency_min: 0,
    frequency_max: 8000,
    labels: true,
    scale: "mel",
    color_map: "roseus",
  });

  const isTime = (value) => isFiniteNumber(value) && value >= 0;
  const isVolume = (value) => isTime(value) && value <= 1;
  const isPositive = (value) => isTime(value) && value > 0;
  const isNonEmptyString = (value) =>
    typeof value === "string" && value.trim() !== "";
  const isPowerOfTwo = (value) =>
    Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;

  // -----------------------------------------------------------------------------
  // Tracks
  // -----------------------------------------------------------------------------

  function toTrack(track) {
    if (!track || typeof track !== "object")
      throw new TypeError("Each audio track must be an object");
    if (!isNonEmptyString(track.id))
      throw new TypeError("Each audio track needs a non-empty id");
    if (track.id === TAKE_ID)
      throw new TypeError(`Track id "${TAKE_ID}" is reserved for recordings`);
    if (!isNonEmptyString(track.url) && !track.peaks)
      throw new TypeError(`Track "${track.id}" needs a url or peaks`);

    const { options, ...rest } = camelizeKeys(track);
    const startPosition = rest.startPosition ?? 0;
    const volume = rest.volume ?? 1;

    if (!isTime(startPosition))
      throw new TypeError(`Track "${track.id}": start_position must be ≥ 0`);
    if (!isVolume(volume))
      throw new TypeError(
        `Track "${track.id}": volume must be between 0 and 1`,
      );

    return {
      draggable: true,
      ...rest,
      id: track.id,
      startPosition,
      volume,
      options: {
        height: TRACK_HEIGHT,
        waveColor: COLORS.wave,
        progressColor: COLORS.progress,
        ...camelizeKeys(options ?? {}),
      },
    };
  }

  function takeTrack({ url = null, startPosition = 0 } = {}) {
    const track = {
      id: TAKE_ID,
      startPosition,
      volume: 1,
      draggable: true,
      options: {
        height: TRACK_HEIGHT,
        waveColor: COLORS.recording,
        progressColor: COLORS.recordingProgress,
      },
    };

    if (url) track.url = url;
    return track;
  }

  /** Validates tracks, rejects duplicate ids, appends the take slot. */
  function prepareTracks(tracks) {
    if (!Array.isArray(tracks))
      throw new TypeError("WaveSurferMultitrack tracks must be a list");

    const lookup = new Map();
    const list = tracks.map((track, index) => {
      const prepared = toTrack(track);
      if (lookup.has(prepared.id))
        throw new TypeError(`Duplicate audio track id: "${prepared.id}"`);
      lookup.set(prepared.id, { url: prepared.url, index });
      return prepared;
    });

    list.push(takeTrack());
    return { list, lookup };
  }

  function trackIndex(instance, id) {
    if (id === TAKE_ID) return instance.tracks.size;
    return instance.tracks.get(id)?.index;
  }

  // -----------------------------------------------------------------------------
  // Playback
  // -----------------------------------------------------------------------------

  function requireReady(instance) {
    if (!instance.ready) throw new Error("Audio tracks are not ready yet");
  }

  function setPlayback(instance, state) {
    if (instance.playback === state) return;
    instance.playback = state;
    instance.ctx.emit("playback", {
      state,
      seconds: instance.multitrack.getCurrentTime(),
    });
  }

  /** Polls once per frame while playing: positions and end-of-timeline. */
  function watchPlayback(instance) {
    if (instance.positionFrame) return;

    const tick = () => {
      instance.positionFrame = 0;
      if (instance.destroyed || instance.playback !== "playing") return;

      const { multitrack } = instance;
      const starting =
        performance.now() - instance.playStartedAt < PLAY_START_GRACE_MS;

      if (multitrack.isPlaying() || starting) {
        instance.emitPosition(multitrack.getCurrentTime());
        instance.positionFrame = instance.win.requestAnimationFrame(tick);
      } else {
        setPlayback(instance, "paused");
      }
    };

    instance.positionFrame = instance.win.requestAnimationFrame(tick);
  }

  function play(instance) {
    requireReady(instance);
    instance.playStartedAt = performance.now();

    // play() may be rejected by the browser's autoplay policy.
    const result = instance.multitrack.play();
    setPlayback(instance, "playing");
    watchPlayback(instance);

    Promise.resolve(result).catch((error) => {
      setPlayback(instance, "paused");
      reportError(instance.ctx, "play", error);
    });
  }

  function pause(instance) {
    instance.multitrack.pause();
    setPlayback(instance, "paused");
  }

  // -----------------------------------------------------------------------------
  // Recording
  // -----------------------------------------------------------------------------

  async function listDevices(instance) {
    const devices = await RecordPlugin.getAvailableAudioDevices();

    instance.ctx.emit("devices", {
      devices: devices.map((device, index) => ({
        id: device.deviceId,
        label: device.label || `Microphone ${index + 1}`,
      })),
    });
  }

  /**
   * Starts recording. Permission prompts make this async; a component
   * destroyed meanwhile releases the microphone instead of starting.
   */
  // RecordPlugin.isActive() is true before the first recording: it compares
  // a missing MediaRecorder's state with "inactive". So "busy" is asked
  // directly (a CLAUDE.md §6 M5.5 finding).
  function recorderBusy(recorder) {
    return Boolean(recorder?.isRecording() || recorder?.isPaused());
  }

  async function startRecording(
    instance,
    { device_id: deviceId, overdub = false },
  ) {
    requireReady(instance);

    const { recorder } = instance;
    if (
      instance.recordingStarting ||
      instance.recordingStopping ||
      recorderBusy(recorder)
    )
      return;

    if (deviceId != null && !isNonEmptyString(deviceId)) {
      throw new TypeError("device_id must be a non-empty string");
    }

    instance.recordingStarting = true;
    instance.overdub = overdub === true;
    instance.takeStart = instance.multitrack.getCurrentTime();
    instance.recordedSeconds = 0;

    try {
      await recorder.startRecording(deviceId ? { deviceId } : undefined);

      if (instance.destroyed) {
        releaseMicrophone(instance);
        return;
      }

      if (instance.overdub) play(instance);
    } finally {
      instance.recordingStarting = false;
    }
  }

  function stopRecording(instance) {
    if (!recorderBusy(instance.recorder) || instance.recordingStopping) return;

    instance.recordingStopping = true;
    instance.recorder.stopRecording(); // the audio arrives via record-end
    if (instance.overdub) pause(instance);
  }

  function releaseMicrophone(instance) {
    try {
      if (recorderBusy(instance.recorder)) instance.recorder.stopRecording();
      instance.recorder?.stopMic?.();
    } catch {
      // Already torn down: nothing left to release.
    }
  }

  /** Puts a finished recording into the take slot at its start position. */
  function attachTake(instance, blob) {
    if (!(blob instanceof Blob) || blob.size === 0) {
      reportError(
        instance.ctx,
        "recording",
        new Error("Recording produced no audio"),
      );
      return;
    }

    const url = URL.createObjectURL(blob);

    try {
      // Adding a track with an existing id replaces that track.
      instance.multitrack.addTrack(
        takeTrack({ url, startPosition: instance.takeStart }),
      );
    } catch (error) {
      URL.revokeObjectURL(url);
      reportError(instance.ctx, "recording", error);
      return;
    }

    instance.take = {
      url,
      blob,
      seconds: instance.recordedSeconds,
      startPosition: instance.takeStart,
    };

    instance.takeUrls.push(url);
    while (instance.takeUrls.length > KEPT_TAKE_URLS)
      URL.revokeObjectURL(instance.takeUrls.shift());

    instance.ctx.emit("recorded", {
      id: TAKE_ID,
      bytes: blob.size,
      mime_type: blob.type,
      seconds: instance.take.seconds,
      start_position: instance.take.startPosition,
    });

    if (instance.inspectedId === TAKE_ID) inspect(instance, { id: TAKE_ID });
  }

  function discardRecording(instance) {
    if (!instance.take) return;

    instance.multitrack.addTrack(takeTrack());
    instance.take = null;

    if (instance.inspectedId === TAKE_ID) {
      instance.inspectedId = null;
      instance.inspector?.empty?.();
    }
  }

  function requireTake(instance) {
    if (!instance.take) throw new Error("There is no recording yet");
  }

  function takeFile(instance, filename) {
    const { blob } = instance.take;
    const extension = blob.type.split(";")[0].split("/")[1] || "webm";
    return new File([blob], filename ?? `take.${extension}`, {
      type: blob.type,
    });
  }

  function downloadRecording(instance, { filename }) {
    requireTake(instance);

    const link = instance.el.ownerDocument.createElement("a");
    link.href = instance.take.url;
    link.download = takeFile(instance, filename).name;
    link.click();
  }

  /** Hands the take to a LiveView upload through Xenia's ctx.upload. */
  function uploadRecording(instance, { name, filename }) {
    requireTake(instance);
    if (!isNonEmptyString(name))
      throw new TypeError("upload_recording expects %{name: upload name}");

    if (!instance.ctx.upload(name, [takeFile(instance, filename)])) {
      throw new Error(
        `LiveView did not accept the upload "${name}" (see the console)`,
      );
    }
  }

  // -----------------------------------------------------------------------------
  // Spectrogram inspector
  // -----------------------------------------------------------------------------

  function spectrogramOptions(value) {
    if (!value) return null;
    if (typeof value !== "object" && value !== true) {
      throw new TypeError(
        "spectrogram must be false, true or a map of options",
      );
    }

    const config = {
      ...SPECTROGRAM_DEFAULTS,
      ...(value === true ? {} : value),
    };

    if (!isPositive(config.height))
      throw new TypeError("spectrogram height must be > 0");
    if (!isPowerOfTwo(config.fft_samples))
      throw new TypeError("spectrogram fft_samples must be a power of two");
    if (
      !isTime(config.frequency_min) ||
      !(config.frequency_max > config.frequency_min)
    ) {
      throw new TypeError(
        "spectrogram needs 0 ≤ frequency_min < frequency_max",
      );
    }

    return camelizeKeys({ ...config, color_map: config.color_map });
  }

  function destroyInspector(instance) {
    try {
      instance.inspector?.destroy();
    } catch (error) {
      console.error(
        "[Xenia wavesurfer_multitrack] inspector cleanup failed:",
        error,
      );
    }

    instance.inspector = null;
  }

  /** (Re)creates the inspector; plugin options are fixed at creation. */
  function buildInspector(instance, options) {
    destroyInspector(instance);
    instance.inspectorEl.hidden = !options;
    if (!options) return;

    const inspector = WaveSurfer.create({
      container: instance.inspectorEl,
      height: INSPECTOR_WAVE_HEIGHT,
      interact: false,
      waveColor: COLORS.wave,
      progressColor: COLORS.wave,
      plugins: [SpectrogramPlugin.create(options)],
    });

    inspector.on("ready", (duration) => {
      instance.ctx.emit("inspected", {
        id: instance.inspectedId,
        seconds: duration,
      });
    });
    inspector.on("error", (error) =>
      reportError(instance.ctx, "inspect", error),
    );

    instance.inspector = inspector;
    if (instance.inspectedId) inspect(instance, { id: instance.inspectedId });
  }

  function inspect(instance, { id }) {
    if (!instance.inspector) throw new Error("The spectrogram is disabled");

    const url =
      id === TAKE_ID ? instance.take?.url : instance.tracks.get(id)?.url;
    if (!url) {
      throw new TypeError(
        id === TAKE_ID
          ? "There is no recording yet"
          : `Unknown track id: ${JSON.stringify(id)}`,
      );
    }

    instance.inspectedId = id;
    Promise.resolve(instance.inspector.load(url)).catch((error) => {
      if (error?.name !== "AbortError")
        reportError(instance.ctx, "inspect", error);
    });
  }

  // -----------------------------------------------------------------------------
  // Construction and cleanup
  // -----------------------------------------------------------------------------

  function buildLayout(instance) {
    const doc = instance.el.ownerDocument;
    const section = (className, marginTop) => {
      const node = doc.createElement("div");
      node.className = className;
      if (marginTop) node.style.marginTop = marginTop;
      return node;
    };

    instance.tracksEl = section("xenia-audio__tracks");
    instance.previewEl = section("xenia-audio__recording", "16px");
    instance.inspectorEl = section("xenia-audio__inspector", "16px");
    instance.el.append(
      instance.tracksEl,
      instance.previewEl,
      instance.inspectorEl,
    );
  }

  function createMultitrack(instance, trackList, options, zoom) {
    const multitrack = Multitrack.create(trackList, {
      cursorColor: COLORS.progress,
      ...camelizeKeys(options ?? {}),
      container: instance.tracksEl,
      minPxPerSec: zoom,
    });

    instance.multitrack = multitrack;
    const { ctx } = instance;

    multitrack.on("canplay", () => {
      if (instance.ready) return;
      instance.ready = true;
      ctx.emit("ready", { track_ids: [...instance.tracks.keys()] });
    });

    multitrack.on("start-position-change", ({ id, startPosition }) => {
      if (id === TAKE_ID && instance.take)
        instance.take.startPosition = startPosition;
      ctx.emit("track_moved", { id, start_position: startPosition });
    });

    multitrack.on("start-cue-change", ({ id, startCue }) =>
      ctx.emit("track_trimmed", { id, start_cue: startCue }),
    );
    multitrack.on("end-cue-change", ({ id, endCue }) =>
      ctx.emit("track_trimmed", { id, end_cue: endCue }),
    );
    multitrack.on("fade-in-change", ({ id, fadeInEnd }) =>
      ctx.emit("track_faded", { id, fade_in_end: fadeInEnd }),
    );
    multitrack.on("fade-out-change", ({ id, fadeOutStart }) =>
      ctx.emit("track_faded", { id, fade_out_start: fadeOutStart }),
    );
    multitrack.on("volume-change", ({ id, volume }) =>
      ctx.emit("track_volume", { id, volume }),
    );
    multitrack.on("envelope-points-change", ({ id, points }) =>
      ctx.emit("envelope_changed", { id, points }),
    );
  }

  function createRecorder(instance) {
    const recorder = RecordPlugin.create({
      renderRecordedAudio: false,
      scrollingWaveform: true,
      scrollingWaveformWindow: 10,
    });

    // The preview WaveSurfer owns the plugin; destroying it destroys both.
    instance.recorder = recorder;
    instance.preview = WaveSurfer.create({
      container: instance.previewEl,
      height: PREVIEW_HEIGHT,
      waveColor: COLORS.recording,
      progressColor: COLORS.recordingProgress,
      plugins: [recorder],
    });

    const { ctx } = instance;
    const state = (value) => () => ctx.emit("recording", { state: value });

    recorder.on("record-start", state("started"));
    recorder.on("record-pause", state("paused"));
    recorder.on("record-resume", state("resumed"));

    recorder.on("record-progress", (milliseconds) => {
      instance.recordedSeconds = milliseconds / 1000;
      instance.emitRecordingProgress(instance.recordedSeconds);
    });

    recorder.on("record-end", (blob) => {
      instance.recordingStopping = false;
      if (instance.destroyed) return;

      ctx.emit("recording", { state: "stopped" });
      attachTake(instance, blob);
    });
  }

  function safely(label, step) {
    try {
      step();
    } catch (error) {
      console.error(
        `[Xenia wavesurfer_multitrack] ${label} cleanup failed:`,
        error,
      );
    }
  }

  /** Releases everything; tolerates a partial instance; idempotent. */
  function disposeInstance(instance) {
    if (instance.destroyed) return;
    instance.destroyed = true;

    if (instance.positionFrame)
      instance.win.cancelAnimationFrame(instance.positionFrame);
    instance.emitPosition.cancel();
    instance.emitRecordingProgress.cancel();

    releaseMicrophone(instance); // before tearing down the waveforms
    destroyInspector(instance);
    safely("Recording preview", () => instance.preview?.destroy());
    safely("Multitrack", () => instance.multitrack?.destroy());

    for (const url of instance.takeUrls) URL.revokeObjectURL(url);
    instance.takeUrls.length = 0;
    instance.take = null;

    instance.tracksEl?.remove();
    instance.previewEl?.remove();
    instance.inspectorEl?.remove();
  }

  const adapter = {
    mount(el, props, ctx) {
      const instance = {
        el,
        ctx,
        win: el.ownerDocument.defaultView,
        multitrack: null,
        recorder: null,
        preview: null,
        inspector: null,
        tracksEl: null,
        previewEl: null,
        inspectorEl: null,
        tracks: new Map(),
        take: null,
        takeUrls: [],
        destroyed: false,
        ready: false,
        playback: "paused",
        playStartedAt: 0,
        positionFrame: 0,
        recordingStarting: false,
        recordingStopping: false,
        overdub: false,
        takeStart: 0,
        recordedSeconds: 0,
        inspectedId: null,
        emitPosition: throttle(
          (seconds) => !instance.destroyed && ctx.emit("position", { seconds }),
          STREAM_MS,
        ),
        emitRecordingProgress: throttle(
          (seconds) =>
            !instance.destroyed && ctx.emit("recording_progress", { seconds }),
          STREAM_MS,
        ),
      };

      // Xenia doesn't call destroy() for a failed mount, so release first.
      try {
        const { list, lookup } = prepareTracks(props.tracks ?? []);
        const spectrogram = spectrogramOptions(props.spectrogram);
        const zoom = props.zoom ?? DEFAULT_ZOOM;
        if (!isPositive(zoom))
          throw new TypeError("zoom must be a positive number");

        instance.tracks = lookup;
        buildLayout(instance);
        createMultitrack(instance, list, props.options, zoom);
        createRecorder(instance);
        buildInspector(instance, spectrogram);

        return instance;
      } catch (error) {
        disposeInstance(instance);
        throw error;
      }
    },

    destroy(instance) {
      disposeInstance(instance);
    },

    props: {
      // The track list and options define the multitrack engine, which can't
      // remove tracks, so a change rebuilds the studio.
      tracks: (_instance, _tracks, ctx) => ctx.remount(),
      options: (_instance, _options, ctx) => ctx.remount(),

      zoom(instance, value, ctx) {
        const zoom = value ?? DEFAULT_ZOOM;
        if (isPositive(zoom)) instance.multitrack.zoom(zoom);
        else
          reportError(
            ctx,
            "zoom",
            new TypeError("zoom must be a positive number"),
          );
      },

      spectrogram(instance, value, ctx) {
        try {
          buildInspector(instance, spectrogramOptions(value));
        } catch (error) {
          reportError(ctx, "spectrogram", error);
        }
      },
    },

    commands: {
      play: guarded("play", (instance) => play(instance)),
      pause: guarded("pause", (instance) => pause(instance)),

      seek: guarded("seek", (instance, { seconds }) => {
        if (!isTime(seconds))
          throw new TypeError("seek expects %{seconds: number ≥ 0}");
        instance.multitrack.setTime(seconds);
        instance.ctx.emit("position", { seconds });
      }),

      volume: guarded("volume", (instance, { id, value }) => {
        const index = trackIndex(instance, id);
        if (index === undefined)
          throw new TypeError(`Unknown track id: ${JSON.stringify(id)}`);
        if (!isVolume(value))
          throw new TypeError("volume expects %{value: 0..1}");
        instance.multitrack.setTrackVolume(index, value);
      }),

      list_devices: guarded("list_devices", (instance) =>
        listDevices(instance),
      ),
      start_recording: guarded("start_recording", (instance, args) =>
        startRecording(instance, args),
      ),
      pause_recording: guarded("pause_recording", (instance) => {
        if (instance.recorder.isRecording()) instance.recorder.pauseRecording();
      }),
      resume_recording: guarded("resume_recording", (instance) => {
        if (instance.recorder.isPaused()) instance.recorder.resumeRecording();
      }),
      stop_recording: guarded("stop_recording", (instance) =>
        stopRecording(instance),
      ),
      discard_recording: guarded("discard_recording", (instance) =>
        discardRecording(instance),
      ),

      inspect: guarded("inspect", (instance, args) => inspect(instance, args)),
      download_recording: guarded("download_recording", (instance, args) =>
        downloadRecording(instance, args),
      ),
      upload_recording: guarded("upload_recording", (instance, args) =>
        uploadRecording(instance, args),
      ),
    },

    events: {
      ready: {},
      playback: {},
      position: {},
      recording: {},
      recording_progress: {},
      recorded: {},
      track_moved: {},
      track_trimmed: {},
      track_faded: {},
      track_volume: {},
      envelope_changed: {},
      devices: {},
      inspected: {},
      error: {},
    },
  };

  return withLibrary(adapter, loadLibrary, (library) => {
    ({ WaveSurfer, RecordPlugin, SpectrogramPlugin, Multitrack } =
      pickLibrary(library));
  });
}
