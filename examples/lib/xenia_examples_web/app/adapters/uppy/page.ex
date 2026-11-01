defmodule XeniaExamplesWeb.App.Adapters.UppyPage do
  @moduledoc """
  `/adapters/uppy`: Uppy's upload dashboard, uploading through LiveView
  (`<.uppy transport="liveview">`).

  Uppy hands the files to a normal LiveView upload (`allow_upload/3`), so
  the server receives them like any other upload. The page renders a hidden
  `<.live_file_input>` for it.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(page_title: "File uploads", uploaded: [])
     |> allow_upload(:files,
       accept: :any,
       max_entries: 5,
       max_file_size: 5_000_000,
       auto_upload: true,
       progress: &handle_progress/3
     )}
  end

  @impl true
  def handle_event("validate", _params, socket), do: {:noreply, socket}

  # LiveView received a file: keep its name (a real app would store it).
  defp handle_progress(:files, entry, socket) do
    if entry.done? do
      name =
        consume_uploaded_entry(socket, entry, fn %{path: path} ->
          {:ok, {entry.client_name, File.stat!(path).size}}
        end)

      {:noreply, update(socket, :uploaded, &(&1 ++ [name]))}
    else
      {:noreply, socket}
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">File uploads</h1>
    <p>
      Uppy's dashboard. Drop files on it, and they upload at once, to the LiveView like any other upload.
    </p>

    <.uppy
      id="uploader"
      transport="liveview"
      upload_name="files"
      auto_proceed
      note="Up to 5 files, 5 MB each"
      height={260}
    />

    <form id="upload-form" phx-change="validate" class="hidden">
      <.live_file_input upload={@uploads.files} />
    </form>

    <ul id="uploaded" class="space-y-1">
      <li :for={{name, size} <- @uploaded}>Received {name} ({size} bytes)</li>
    </ul>
    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet title="The tag and the LiveView upload, in page.ex" code={page_snippet()} />
    <.snippet title="The setup, once, in assets/js" code={setup_snippet()} />
    """
  end

  # The code on the page: how this example is made.
  defp page_snippet,
    do: ~S"""
    <.uppy id="uploader" transport="liveview" upload_name="files" auto_proceed />

    <form id="upload-form" phx-change="validate" class="hidden">
      <.live_file_input upload={@uploads.files} />
    </form>

    # In mount: an ordinary LiveView upload, which Uppy fills
    allow_upload(socket, :files, accept: :any, max_entries: 5, auto_upload: true,
      progress: &handle_progress/3)

    defp handle_progress(:files, entry, socket) when entry.done? do
      name = consume_uploaded_entry(socket, entry, fn %{path: _path} -> {:ok, entry.client_name} end)
      {:noreply, update(socket, :uploaded, &(&1 ++ [name]))}
    end
    """

  defp setup_snippet,
    do: ~S"""
    import { createUppy } from "xenia/uppy"

    export const uppy = createUppy({
      load: async () => {
        const [core, dashboard] = await Promise.all([
          import("@uppy/core"),
          import("@uppy/dashboard"),
        ])
        return { Uppy: core.default, Dashboard: dashboard.default }
      },
    })

    // app.js
    createHooks({ Uppy: uppy })
    """
end
