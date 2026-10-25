# Audio studio

Several audio tracks you drag in time, and a recording from the microphone. Open it at `/adapters/multitrack`.

**Try it:** play the tracks, drag one along the timeline, then record a few seconds and stop.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createWaveSurferMultitrack({load: async () => ({...})})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({WaveSurferMultitrack: official.wavesurferMultitrack})`. |

## How it works

- **The tag** is `<.wavesurfer_multitrack>`, from `Xenia.Adapters.WaveSurferMultitrack` (its docs list every prop, event and command).
- **Events:** `on_ready`, `on_recording` (the state), `on_recorded` (seconds and bytes), and `on_error`.
- **Commands:** `play`, `pause`, `start_recording` and `stop_recording`.
- **The recording stays in the browser** until it is downloaded or uploaded. Events only carry facts about it.
- **Errors are events:** a denied microphone arrives as `on_error`, and the page shows it.
