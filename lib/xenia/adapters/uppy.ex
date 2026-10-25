defmodule Xenia.Adapters.Uppy do
  @moduledoc """
  `<.uppy>`: a file upload dashboard (Uppy), through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install @uppy/core @uppy/dashboard @uppy/xhr-upload @uppy/tus --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createUppy } from "xenia/uppy"

  const uppy = createUppy({
      load: async () => {
        const [core, dashboard, xhr, tus] = await Promise.all([
          import("@uppy/core"),
          import("@uppy/dashboard"),
          import("@uppy/xhr-upload"), // only for transport="xhr"
          import("@uppy/tus"), // only for transport="tus"
        ])
        return { Uppy: core.default, Dashboard: dashboard.default, XHRUpload: xhr.default, Tus: tus.default }
      },
  })

  hooks: { ...colocatedHooks, ...createHooks({ Uppy: uppy }) },
  ```

  And its CSS, in `assets/css/app.css`:

      @import "../node_modules/@uppy/core/dist/style.min.css";
      @import "../node_modules/@uppy/dashboard/dist/style.min.css";

  Then `import Xenia.Adapters.Uppy` in `html_helpers`, and render
  `<.uppy id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"Uppy"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for Uppy (v4–v6): a file upload dashboard with drag and
    drop, previews, restrictions and progress.

    Three transports, chosen with the `transport` prop:
      "liveview" (default)  Files go to a LiveView upload through Xenia's
                            ctx.upload: the page needs allow_upload/3 with the
                            name in `upload_name` and a rendered
                            <.live_file_input> for it. LiveView then uploads
                            them (at once with auto_upload: true, otherwise on
                            form submit) and reports progress on the server.
                            Uppy marks the files done when LiveView accepts
                            them.
      "xhr"                 Multipart POST to `endpoint` (your own controller),
                            with Uppy's own progress bars.
      "tus"                 Resumable uploads to a tus server at `endpoint`.

    Props:
      transport     "liveview" | "xhr" | "tus"
      upload_name   LiveView upload name (liveview transport)
      endpoint      URL (xhr, tus)
      headers       %{"x-csrf-token" => token, ...} (xhr, tus)
      field_name    form field name for xhr (default "file")
      restrictions  %{max_file_size, max_number_of_files, min_number_of_files,
                      allowed_file_types: ["image/*", ".pdf"], max_total_file_size}
      auto_proceed  true uploads as soon as files are added
      note          hint under the drop area, e.g. "Images up to 5 MB"
      height        dashboard height (default 350)
      theme         "auto" (default: follows the page's light/dark mode),
                    "light" or "dark"
      disabled      true greys out the dashboard
      dashboard     any other Dashboard option, snake_case or camelCase
      options       any other Uppy core option
      Changing transport, upload_name, endpoint, headers, field_name,
      dashboard or options remounts; the rest applies in place.

    Commands:
      upload                start uploading the added files
      cancel_all            stop uploads and remove all files
      clear                 remove all files (after an upload)
      remove_file %{id}
      retry_all

    Events:
      files_added         %{files: [%{id, name, size, type}]}
      file_removed        %{file}
      restriction_failed  %{file, message}
      upload_progress     %{file, percent}   xhr/tus, at most every 250 ms
      upload_success      %{file, response}  response: %{status, body}
      upload_error        %{file, message}
      complete            %{successful: [file], failed: [file]}
      handed_off          %{name, files}     liveview: LiveView accepted them
      error               %{source, message, code}

    Load Uppy's CSS once, e.g. in app.css:
      @import "../node_modules/@uppy/core/dist/style.min.css";
      @import "../node_modules/@uppy/dashboard/dist/style.min.css";
  """
  use Xenia.Components

  component :uppy, adapter: "Uppy" do
    prop :transport, :string
    prop :upload_name, :string
    prop :endpoint, :string
    prop :headers, :map
    prop :field_name, :string
    prop :restrictions, :map
    prop :auto_proceed, :boolean
    prop :note, :string
    prop :height, :integer
    prop :theme, :string
    prop :disabled, :boolean
    prop :dashboard, :map
    prop :options, :map
    event :files_added
    event :file_removed
    event :restriction_failed
    event :upload_progress
    event :upload_success
    event :upload_error
    event :complete
    event :handed_off
    event :error
  end
end
