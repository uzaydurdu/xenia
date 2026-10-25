defmodule Xenia.Adapters.WaveSurferMultitrack do
  @moduledoc """
  `<.wavesurfer_multitrack>`: a multitrack audio studio with recording, through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install wavesurfer.js wavesurfer-multitrack --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createWaveSurferMultitrack } from "xenia/wavesurfer-multitrack"

  const wavesurferMultitrack = createWaveSurferMultitrack({
      load: async () => {
        const [ws, record, spectrogram, multitrack] = await Promise.all([
          import("wavesurfer.js"),
          import("wavesurfer.js/dist/plugins/record.esm.js"),
          import("wavesurfer.js/dist/plugins/spectrogram.esm.js"),
          import("wavesurfer-multitrack"),
        ])
        return {
          WaveSurfer: ws.default,
          RecordPlugin: record.default,
          SpectrogramPlugin: spectrogram.default,
          Multitrack: multitrack.default,
        }
      },
  })

  hooks: { ...colocatedHooks, ...createHooks({ WaveSurferMultitrack: wavesurferMultitrack }) },
  ```

  Then `import Xenia.Adapters.WaveSurferMultitrack` in `html_helpers`, and render
  `<.wavesurfer_multitrack id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"WaveSurferMultitrack"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for wavesurfer-multitrack, plus microphone recording and a
    spectrogram inspector: a small audio studio.

    Layout (inside the element Xenia hands to mount()):
      1. Multitrack timeline: server tracks plus one reserved "take" slot for
         the latest recording. Tracks can be dragged, trimmed and faded.
      2. Recording preview: a live scrolling waveform while recording.
      3. Inspector (optional): waveform + spectrogram of one selected track.
  """
  use Xenia.Components

  component :wavesurfer_multitrack, adapter: "WaveSurferMultitrack" do
    prop :tracks, :list, default: []
    prop :options, :map
    prop :zoom, :any
    prop :spectrogram, :any
    event :ready
    event :playback
    event :position
    event :recording
    event :recording_progress
    event :recorded
    event :track_moved
    event :track_trimmed
    event :track_faded
    event :track_volume
    event :envelope_changed
    event :devices
    event :inspected
    event :error
  end
end
