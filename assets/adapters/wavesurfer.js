/**
 * Xenia's official adapter for WaveSurfer.js (v7/v8): one audio file as an interactive
 * waveform, with regions, markers, timeline, minimap, hover and spectrogram.
 * For several synchronized tracks and recording, see wavesurfer_multitrack.js.
 *
 * Props:
 *   url           audio URL. Changing it loads the new file.
 *   peaks         precomputed peaks (list of channels) for instant drawing of
 *                 long files; needs `duration` too
 *   duration      seconds, with `peaks`
 *   options       any WaveSurfer option, camelCase or snake_case, applied in
 *                 place: wave_color, progress_color, cursor_color, height,
 *                 bar_width, bar_gap, bar_radius, normalize, split_channels,
 *                 drag_to_seek, auto_scroll, auto_center, ...
 *   zoom          pixels per second (0 = fit the container)
 *   volume        0..1
 *   muted         boolean
 *   playback_rate 0.25..4 (pitch preserved)
 *   regions       [%{id, start, end?, color?, content?, drag?, resize?}]
 *                 The server owns the list: regions are added, updated and
 *                 removed to match it. A region without `end` is a marker.
 *   region_editing  true lets the user drag on the waveform to create
 *                 regions (sent as region_created; add them to `regions`)
 *   timeline      true or %{height, time_interval, primary_label_interval, ...}
 *   minimap       true or %{height, wave_color, ...}
 *   hover         true or %{line_color, label_color, ...}
 *   spectrogram   true or %{height, fft_samples, frequency_min, frequency_max,
 *                 labels, scale, color_map, ...}
 *   Plugin props: false or nil removes the plugin; a changed map rebuilds it.
 *
 * Commands:
 *   play %{start?, end?}, pause, play_pause, stop
 *   seek %{seconds}, skip %{seconds}
 *   play_region %{id}
 *   download_image %{filename?}   the waveform as PNG
 *
 * Events:
 *   ready            %{duration}
 *   loading          %{percent}             at most every 250 ms
 *   playback         %{state: "playing" | "paused", seconds}
 *   position         %{seconds}             while playing, at most every 250 ms
 *   seek             %{seconds}             the user clicked or dragged
 *   finish           %{}
 *   zoom             %{px_per_sec}          at most every 250 ms
 *   region_created   %{region}              the user drew a region
 *   region_updated   %{region}              the user moved/resized one
 *   region_clicked   %{region}
 *   region_in, region_out  %{region}        playback entered/left a region
 *   error            %{source, message, code}
 *   `region` is %{id, start, end, color, content}.
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createWaveSurfer } from "xenia/wavesurfer"
 *   const wavesurfer = createWaveSurfer({
 *     load: async () => {
 *       const [ws, regions, timeline, minimap, hover, spectrogram] = await Promise.all([
 *         import("wavesurfer.js"),
 *         import("wavesurfer.js/dist/plugins/regions.esm.js"),
 *         import("wavesurfer.js/dist/plugins/timeline.esm.js"),
 *         import("wavesurfer.js/dist/plugins/minimap.esm.js"),
 *         import("wavesurfer.js/dist/plugins/hover.esm.js"),
 *         import("wavesurfer.js/dist/plugins/spectrogram.esm.js"),
 *       ])
 *       return {
 *         WaveSurfer: ws.default,
 *         RegionsPlugin: regions.default,
 *         TimelinePlugin: timeline.default,
 *         MinimapPlugin: minimap.default,
 *         HoverPlugin: hover.default,
 *         SpectrogramPlugin: spectrogram.default,
 *       }
 *     }
 *   })
 *   // createHooks({ WaveSurfer: wavesurfer }), then <.wavesurfer> (Xenia.Adapters.WaveSurfer)
 *   Extend it by spreading: { ...wavesurfer, commands: { ...wavesurfer.commands, mine() {} } }
 */

import {
  camelizeKeys,
  expectLibrary,
  guarded,
  isFiniteNumber,
  isPlainObject,
  loadOnce,
  reportError,
  throttle,
  withLibrary,
} from "./shared.js";

const LOAD =
  "createWaveSurfer({ load: see the usage at the top of this file })";

function pickLibrary(library) {
  const {
    WaveSurfer,
    RegionsPlugin,
    TimelinePlugin,
    MinimapPlugin,
    HoverPlugin,
    SpectrogramPlugin,
  } = library ?? {};
  expectLibrary(
    typeof WaveSurfer?.create === "function" &&
      typeof RegionsPlugin?.create === "function",
    LOAD,
  );
  return {
    WaveSurfer,
    RegionsPlugin,
    TimelinePlugin,
    MinimapPlugin,
    HoverPlugin,
    SpectrogramPlugin,
  };
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createWaveSurfer({ load: libraryImport } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let WaveSurfer,
    RegionsPlugin,
    TimelinePlugin,
    MinimapPlugin,
    HoverPlugin,
    SpectrogramPlugin;
  const STREAM_MS = 250;

  const DEFAULT_OPTIONS = {
    waveColor: "#94a3b8",
    progressColor: "#4f46e5",
    cursorColor: "#4f46e5",
    height: 96,
    normalize: true,
    dragToSeek: true,
  };

  /** Optional plugins: prop name → factory from the prop's options. */
  const PLUGINS = {
    timeline: (options) => TimelinePlugin.create({ height: 20, ...options }),
    minimap: (options) =>
      MinimapPlugin.create({
        height: 24,
        waveColor: "#cbd5e1",
        progressColor: "#94a3b8",
        ...options,
      }),
    hover: (options) =>
      HoverPlugin.create({
        lineColor: "#4f46e5",
        labelBackground: "#18181b",
        labelColor: "#fafafa",
        ...options,
      }),
    spectrogram: (options) =>
      SpectrogramPlugin.create({ height: 160, labels: true, ...options }),
  };

  function regionDetail(region) {
    return {
      id: region.id,
      start: region.start,
      end: region.end,
      color: region.color ?? null,
      content:
        typeof region.content?.textContent === "string"
          ? region.content.textContent
          : null,
    };
  }

  function regionParams(region) {
    return {
      id: String(region.id),
      start: Number(region.start),
      end: region.end == null ? Number(region.start) : Number(region.end),
      color: region.color,
      content: region.content == null ? undefined : String(region.content),
      drag: region.drag ?? true,
      resize: region.resize ?? true,
    };
  }

  /** Makes the regions on the waveform match the server's list. */
  function syncRegions(instance, list) {
    // Always remember the latest list: a reload re-applies it on `ready`.
    instance.regionList = list ?? [];
    if (!instance.ready) return;

    const wanted = new Map(
      (Array.isArray(list) ? list : []).map((region) => [
        String(region.id),
        region,
      ]),
    );
    instance.syncingRegions = true;

    try {
      for (const region of instance.regions.getRegions()) {
        const next = wanted.get(region.id);

        if (!next) {
          region.remove();
        } else {
          region.setOptions(regionParams(next));
          wanted.delete(region.id);
        }
      }

      for (const region of wanted.values())
        instance.regions.addRegion(regionParams(region));
    } finally {
      instance.syncingRegions = false;
    }
  }

  function setRegionEditing(instance, enabled) {
    instance.stopDragSelection?.();
    instance.stopDragSelection = null;

    if (enabled) {
      const options = isPlainObject(enabled) ? camelizeKeys(enabled) : {};
      instance.stopDragSelection = instance.regions.enableDragSelection({
        color: "rgba(79, 70, 229, 0.15)",
        ...options,
      });
    }
  }

  /** Adds, rebuilds or removes an optional plugin to match its prop. */
  function setPlugin(instance, name, value) {
    const current = instance.plugins.get(name);

    if (current) {
      instance.wavesurfer.unregisterPlugin(current);
      current.destroy?.();
      instance.plugins.delete(name);
    }

    if (!value) return;

    const options = isPlainObject(value) ? camelizeKeys(value) : {};
    instance.plugins.set(
      name,
      instance.wavesurfer.registerPlugin(PLUGINS[name](options)),
    );
  }

  function load(instance, { url, peaks, duration }) {
    if (!url && !peaks) return;

    instance.ready = false;

    instance.wavesurfer.load(url ?? "", peaks, duration).catch((error) => {
      // A newer load() supersedes this one with an AbortError: not a failure.
      if (error?.name !== "AbortError")
        reportError(instance.ctx, "load", error);
    });
  }

  /** Applies the latest volume, mute, rate and zoom (after each load). */
  function applyPlayback(instance) {
    const { volume, muted, playback_rate: rate, zoom } = instance.playback;
    const { wavesurfer } = instance;

    wavesurfer.setVolume(isFiniteNumber(volume) ? volume : 1);
    wavesurfer.setMuted(Boolean(muted));
    wavesurfer.setPlaybackRate(isFiniteNumber(rate) ? rate : 1, true);
    if (instance.ready) wavesurfer.zoom(isFiniteNumber(zoom) ? zoom : 0);
  }

  function playbackSetter(key) {
    return (instance, value) => {
      instance.playback = { ...instance.playback, [key]: value };
      applyPlayback(instance);
    };
  }

  function setPlayback(instance, state) {
    instance.ctx.emit("playback", {
      state,
      seconds: instance.wavesurfer.getCurrentTime(),
    });
  }

  function requireNumber(command, name, value) {
    if (!isFiniteNumber(value))
      throw new TypeError(`${command} expects %{${name}: number}`);
  }

  const adapter = {
    mount(el, props, ctx) {
      const doc = el.ownerDocument;
      const container = doc.createElement("div");
      el.appendChild(container);

      const regions = RegionsPlugin.create();

      const wavesurfer = WaveSurfer.create({
        ...DEFAULT_OPTIONS,
        ...camelizeKeys(props.options ?? {}),
        container,
        plugins: [regions],
      });

      const instance = {
        ctx,
        container,
        wavesurfer,
        regions,
        plugins: new Map(),
        ready: false,
        regionList: props.regions ?? [],
        // Latest playback settings; re-applied after every (re)load.
        playback: {
          volume: props.volume,
          muted: props.muted,
          playback_rate: props.playback_rate,
          zoom: props.zoom,
        },
        syncingRegions: false,
        stopDragSelection: null,
        source: {
          url: props.url,
          peaks: props.peaks,
          duration: props.duration,
        },
        emitPosition: throttle(
          (seconds) => ctx.isAlive() && ctx.emit("position", { seconds }),
          STREAM_MS,
        ),
        emitLoading: throttle(
          (percent) => ctx.isAlive() && ctx.emit("loading", { percent }),
          STREAM_MS,
        ),
        emitZoom: throttle(
          (pxPerSec) =>
            ctx.isAlive() && ctx.emit("zoom", { px_per_sec: pxPerSec }),
          STREAM_MS,
        ),
      };

      try {
        for (const name of Object.keys(PLUGINS)) {
          if (props[name]) setPlugin(instance, name, props[name]);
        }

        setRegionEditing(instance, props.region_editing);

        wavesurfer.on("ready", (duration) => {
          instance.ready = true;

          applyPlayback(instance);
          syncRegions(instance, instance.regionList);
          ctx.emit("ready", { duration });
        });

        wavesurfer.on("loading", (percent) => instance.emitLoading(percent));
        wavesurfer.on("play", () => setPlayback(instance, "playing"));
        wavesurfer.on("pause", () => setPlayback(instance, "paused"));
        wavesurfer.on("finish", () => ctx.emit("finish", {}));
        wavesurfer.on(
          "timeupdate",
          (seconds) => wavesurfer.isPlaying() && instance.emitPosition(seconds),
        );
        wavesurfer.on("interaction", (seconds) =>
          ctx.emit("seek", { seconds }),
        );
        wavesurfer.on("zoom", (pxPerSec) => instance.emitZoom(pxPerSec));
        wavesurfer.on("error", (error) =>
          reportError(ctx, "wavesurfer", error),
        );

        // Server-driven region changes are not reported back.
        regions.on("region-created", (region) => {
          if (!instance.syncingRegions)
            ctx.emit("region_created", { region: regionDetail(region) });
        });
        regions.on("region-updated", (region) => {
          if (!instance.syncingRegions)
            ctx.emit("region_updated", { region: regionDetail(region) });
        });
        regions.on("region-clicked", (region, event) => {
          event.stopPropagation(); // don't also seek
          ctx.emit("region_clicked", { region: regionDetail(region) });
        });
        regions.on("region-in", (region) =>
          ctx.emit("region_in", { region: regionDetail(region) }),
        );
        regions.on("region-out", (region) =>
          ctx.emit("region_out", { region: regionDetail(region) }),
        );

        load(instance, instance.source);
        return instance;
      } catch (error) {
        wavesurfer.destroy();
        container.remove();
        throw error;
      }
    },

    destroy(instance) {
      instance.emitPosition.cancel();
      instance.emitLoading.cancel();
      instance.emitZoom.cancel();
      instance.stopDragSelection?.();
      instance.wavesurfer.destroy(); // also destroys registered plugins
      instance.container.remove();
    },

    props: {
      url(instance, url) {
        instance.source = { ...instance.source, url };
        load(instance, instance.source);
      },

      peaks(instance, peaks) {
        instance.source = { ...instance.source, peaks };
        load(instance, instance.source);
      },

      duration(instance, duration) {
        instance.source = { ...instance.source, duration };
      },

      options(instance, options, ctx) {
        try {
          instance.wavesurfer.setOptions({
            ...DEFAULT_OPTIONS,
            ...camelizeKeys(options ?? {}),
          });
        } catch (error) {
          reportError(ctx, "options", error);
        }
      },

      zoom: playbackSetter("zoom"),
      volume: playbackSetter("volume"),
      muted: playbackSetter("muted"),
      playback_rate: playbackSetter("playback_rate"),

      regions: (instance, list) => syncRegions(instance, list),
      region_editing: (instance, enabled) =>
        setRegionEditing(instance, enabled),

      timeline: (instance, value) => setPlugin(instance, "timeline", value),
      minimap: (instance, value) => setPlugin(instance, "minimap", value),
      hover: (instance, value) => setPlugin(instance, "hover", value),
      spectrogram: (instance, value) =>
        setPlugin(instance, "spectrogram", value),
    },

    commands: {
      play: guarded("play", (instance, { start, end }) =>
        instance.wavesurfer.play(start, end),
      ),
      pause: guarded("pause", (instance) => instance.wavesurfer.pause()),
      play_pause: guarded("play_pause", (instance) =>
        instance.wavesurfer.playPause(),
      ),
      stop: guarded("stop", (instance) => instance.wavesurfer.stop()),

      seek: guarded("seek", (instance, { seconds }) => {
        requireNumber("seek", "seconds", seconds);
        instance.wavesurfer.setTime(Math.max(0, seconds));
      }),

      skip: guarded("skip", (instance, { seconds }) => {
        requireNumber("skip", "seconds", seconds);
        instance.wavesurfer.skip(seconds);
      }),

      play_region: guarded("play_region", (instance, { id }) => {
        const region = instance.regions
          .getRegions()
          .find((r) => r.id === String(id));
        if (!region) throw new Error(`no region with id ${JSON.stringify(id)}`);
        region.play(true);
      }),

      download_image: guarded(
        "download_image",
        async (instance, { filename = "waveform.png" }) => {
          const [url] = await instance.wavesurfer.exportImage(
            "image/png",
            1,
            "dataURL",
          );
          const link = instance.container.ownerDocument.createElement("a");
          link.href = url;
          link.download = filename;
          link.click();
        },
      ),
    },

    events: {
      ready: {},
      loading: {},
      playback: {},
      position: {}, // throttled in the adapter
      seek: {},
      finish: {},
      zoom: {},
      region_created: {},
      region_updated: {},
      region_clicked: {},
      region_in: {},
      region_out: {},
      error: {},
    },
  };

  return withLibrary(adapter, loadLibrary, (library) => {
    ({
      WaveSurfer,
      RegionsPlugin,
      TimelinePlugin,
      MinimapPlugin,
      HoverPlugin,
      SpectrogramPlugin,
    } = pickLibrary(library));
  });
}
