defmodule XeniaExamplesWeb.App.ConnectionPage do
  @moduledoc """
  `/connection`: an editor that turns read-only while its LiveView is
  disconnected, because what you type then can't reach the server.

  The adapter (`offlineMonaco` in `assets/js/islands/monaco.js`) is
  Xenia's Monaco adapter with one addition: `consumes: ["connection"]` and a
  `connection` prop handler. Xenia sets that value for each island from its
  own LiveView, so no page code is needed.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Connection",
       notes: "# Notes\n",
       version: 0
     )}
  end

  @impl true
  def handle_event("notes_changed", %{"value" => notes, "version" => version}, socket),
    do: {:noreply, assign(socket, notes: notes, version: version)}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">When the connection drops</h1>
    <p>
      While this page's LiveView is disconnected, the editor below is read-only:
      anything typed then would never reach the server. When the connection is
      back, you can type again.
    </p>
    <p>
      <button id="drop" phx-hook=".DropConnection" class="btn btn-sm">
        Drop the connection for 2 seconds
      </button>
      <span class="ml-2 text-sm opacity-70">or turn off your network.</span>
    </p>

    <.monaco
      id="notes"
      adapter="OfflineMonaco"
      value={@notes}
      version={@version}
      language="markdown"
      on_change="notes_changed"
      style="height: 200px"
    />

    <p id="server-notes" class="text-sm opacity-70">
      The server has {String.length(@notes)} characters.
    </p>

    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet title="The adapter, in assets/js/islands/monaco.js" code={adapter_snippet()} />
    <.snippet title="The tag, in page.ex" code={tag_snippet()} />

    <script :type={Phoenix.LiveView.ColocatedHook} name=".DropConnection">
      // Only for this demo: disconnects the whole LiveSocket, then connects
      // again. The island learns about both through its connection prop.
      export default {
        mounted() {
          this.el.addEventListener("click", () => {
            window.liveSocket.disconnect()
            setTimeout(() => window.liveSocket.connect(), 2000)
          })
        },
      }
    </script>
    """
  end

  # The code on the page: how this example is made.
  defp adapter_snippet,
    do: ~S"""
    // Xenia's Monaco adapter, plus one prop: this island's LiveView connection.
    export const offlineMonaco = {
      ...monaco,
      consumes: [...monaco.consumes, "connection"],
      props: {
        ...monaco.props,
        connection: (editor, connection) =>
          editor.applyOptions({ readOnly: connection === "disconnected" }),
      },
    }

    // app.js
    createHooks({ OfflineMonaco: offlineMonaco })
    """

  defp tag_snippet,
    do: ~S"""
    <.monaco id="notes" adapter="OfflineMonaco" value={@notes} on_change="notes_changed" />
    """
end
