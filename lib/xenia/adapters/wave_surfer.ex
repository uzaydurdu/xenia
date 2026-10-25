defmodule Xenia.Adapters.WaveSurfer do
  @moduledoc """
  `<.wavesurfer>`: an audio waveform (WaveSurfer.js), through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install wavesurfer.js --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createWaveSurfer } from "xenia/wavesurfer"

  const wavesurfer = createWaveSurfer({
      load: async () => {
        const [ws, regions, timeline, minimap, hover, spectrogram] = await Promise.all([
          import("wavesurfer.js"),
          import("wavesurfer.js/dist/plugins/regions.esm.js"),
          import("wavesurfer.js/dist/plugins/timeline.esm.js"),
          import("wavesurfer.js/dist/plugins/minimap.esm.js"),
          import("wavesurfer.js/dist/plugins/hover.esm.js"),
          import("wavesurfer.js/dist/plugins/spectrogram.esm.js"),
        ])
        return {
          WaveSurfer: ws.default,
          RegionsPlugin: regions.default,
          TimelinePlugin: timeline.default,
          MinimapPlugin: minimap.default,
          HoverPlugin: hover.default,
          SpectrogramPlugin: spectrogram.default,
        }
      },
  })

  hooks: { ...colocatedHooks, ...createHooks({ WaveSurfer: wavesurfer }) },
  ```

  Then `import Xenia.Adapters.WaveSurfer` in `html_helpers`, and render
  `<.wavesurfer id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"WaveSurfer"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for WaveSurfer.js (v7/v8): one audio file as an interactive
    waveform, with regions, markers, timeline, minimap, hover and spectrogram.
    For several synchronized tracks and recording, see wavesurfer_multitrack.js.

    Props:
      url           audio URL. Changing it loads the new file.
      peaks         precomputed peaks (list of channels) for instant drawing of
                    long files; needs `duration` too
      duration      seconds, with `peaks`
      options       any WaveSurfer option, camelCase or snake_case, applied in
                    place: wave_color, progress_color, cursor_color, height,
                    bar_width, bar_gap, bar_radius, normalize, split_channels,
                    drag_to_seek, auto_scroll, auto_center, ...
      zoom          pixels per second (0 = fit the container)
      volume        0..1
      muted         boolean
      playback_rate 0.25..4 (pitch preserved)
      regions       [%{id, start, end?, color?, content?, drag?, resize?}]
                    The server owns the list: regions are added, updated and
                    removed to match it. A region without `end` is a marker.
      region_editing  true lets the user drag on the waveform to create
                    regions (sent as region_created; add them to `regions`)
      timeline      true or %{height, time_interval, primary_label_interval, ...}
      minimap       true or %{height, wave_color, ...}
      hover         true or %{line_color, label_color, ...}
      spectrogram   true or %{height, fft_samples, frequency_min, frequency_max,
                    labels, scale, color_map, ...}
      Plugin props: false or nil removes the plugin; a changed map rebuilds it.

    Commands:
      play %{start?, end?}, pause, play_pause, stop
      seek %{seconds}, skip %{seconds}
      play_region %{id}
      download_image %{filename?}   the waveform as PNG

    Events:
      ready            %{duration}
      loading          %{percent}             at most every 250 ms
      playback         %{state: "playing" | "paused", seconds}
      position         %{seconds}             while playing, at most every 250 ms
      seek             %{seconds}             the user clicked or dragged
      finish           %{}
      zoom             %{px_per_sec}          at most every 250 ms
      region_created   %{region}              the user drew a region
      region_updated   %{region}              the user moved/resized one
      region_clicked   %{region}
      region_in, region_out  %{region}        playback entered/left a region
      error            %{source, message, code}
      `region` is %{id, start, end, color, content}.
  """
  use Xenia.Components

  component :wavesurfer, adapter: "WaveSurfer" do
    prop :url, :string
    prop :peaks, :list
    prop :duration, :any
    prop :options, :map
    prop :zoom, :any
    prop :volume, :any
    prop :muted, :boolean
    prop :playback_rate, :any
    prop :regions, :list
    prop :region_editing, :boolean
    prop :timeline, :any
    prop :minimap, :any
    prop :hover, :any
    prop :spectrogram, :any
    event :ready
    event :loading
    event :playback
    event :position
    event :seek
    event :finish
    event :zoom
    event :region_created
    event :region_updated
    event :region_clicked
    event :region_in
    event :region_out
    event :error
  end
end
