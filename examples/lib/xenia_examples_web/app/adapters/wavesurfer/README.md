# Audio waveform

wavesurfer.js draws a sound file's waveform, with regions the server owns. Open it at `/adapters/wavesurfer`.

**Try it:** play and pause, then click "Mark the middle" and click the region.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createWaveSurfer({load: async () => ({...})})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({WaveSurfer: official.wavesurfer})`. |

## How it works

- **The tag** is `<.wavesurfer>`, from `Xenia.Adapters.WaveSurfer` (its docs list every prop, event and command).
- **Events:** `on_ready` sends the duration, `on_playback` the state, `on_region_clicked` the region.
- **Commands:** `Xenia.push_to(socket, "wave", "play_pause")`.
- **`regions`** is an assign: the server adds one, and the waveform shows it.
- The sound is `priv/static/audio/tone.wav`.
