# File uploads

Uppy's upload dashboard, sending files through an ordinary LiveView upload. Open it at `/adapters/uppy`.

**Try it:** drop a file on the dashboard. It uploads at once, and the page lists what the server received.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createUppy({load: async () => ({...})})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({Uppy: official.uppy})`. |
| [`assets/css/app.css`](../../../../../assets/css/app.css) | Imports the library's CSS. |

## How it works

- **The tag** is `<.uppy transport="liveview">`, from `Xenia.Adapters.Uppy` (its docs list every prop, event and command).
- **LiveView receives the files:** `upload_name="files"` names the `allow_upload(:files, ...)` in `mount`, and the page renders a hidden `<.live_file_input>` for it. The server consumes each file in its `progress` callback, like any other upload.
- **Other transports:** Uppy can also upload straight to your own endpoint, with XHR or tus.
- **The theme** follows the app's light and dark mode.
