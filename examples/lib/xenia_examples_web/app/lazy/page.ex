defmodule XeniaExamplesWeb.App.LazyPage do
  @moduledoc """
  `/lazy`: a Monaco editor below the fold, with `lazy="visible"`.

  It mounts only when you scroll to it, and, because the app uses code
  splitting, only then downloads Monaco. A command sent before that waits
  for the editor.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Lazy islands",
       code: "# An editor that waited for you\n",
       version: 0,
       sent: 0
     )}
  end

  @impl true
  def handle_event("code_changed", %{"value" => code, "version" => version}, socket),
    do: {:noreply, assign(socket, code: code, version: version)}

  # A command for an island that hasn't mounted yet: it waits for the mount.
  def handle_event("insert_now", _params, socket) do
    {:noreply,
     socket
     |> update(:sent, &(&1 + 1))
     |> Xenia.push_to("later", "insert", %{text: "Sent from the top of the page.\n"})}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Lazy islands</h1>
    <p>
      The code editor at the bottom of this page has <code>lazy="visible"</code>.
      It doesn't start, and Monaco isn't downloaded, until you scroll down to it.
    </p>
    <p>
      <button id="insert-now" phx-click="insert_now" class="btn btn-sm">
        Send the editor a line now
      </button>
      <span id="sent" class="ml-2 text-sm opacity-70">Lines sent: {@sent}</span>
    </p>

    <h2 class="text-lg font-semibold">How it's made</h2>
    <div class="space-y-4">
      <.snippet title="The tag, in page.ex" code={tag_snippet()} />
      <.snippet title="The adapter, in assets/js" code={adapter_snippet()} />
    </div>
    <.snippet title="A command sent early, in page.ex" code={command_snippet()} />

    <section class="space-y-4 rounded-box border border-base-300 p-5" style="min-height: 150vh">
      <h2 class="font-medium">Why wait?</h2>
      <p>
        Monaco is the biggest library in these examples. A page that shows it
        far down, or in a part most visitors never open, shouldn't make
        everyone download and start it.
      </p>
      <p>
        Open your browser's network tab, then scroll down: Monaco's file is
        requested only when the editor comes into view. Press the button above
        first, and the line it sends is waiting for the editor when it starts.
      </p>
      <p>Keep scrolling.</p>
    </section>

    <.monaco
      id="later"
      lazy="visible"
      value={@code}
      version={@version}
      language="markdown"
      on_change="code_changed"
      style="height: 220px"
    >
      <:loading>
        <div class="grid h-full place-items-center rounded-box bg-base-200 text-sm opacity-70">
          The editor starts when you scroll here.
        </div>
      </:loading>
    </.monaco>

    <p id="lines">The server has {length(String.split(@code, "\n"))} lines.</p>
    """
  end

  # The code on the page: how this example is made.
  defp tag_snippet,
    do: ~S"""
    <.monaco id="later" lazy="visible" value={@code} on_change="code_changed">
      <:loading>The editor starts when you scroll here.</:loading>
    </.monaco>
    """

  defp adapter_snippet,
    do: ~S"""
    // With code splitting, import() is a file of its own:
    // downloaded when the editor mounts, not with the page.
    export const monaco = createMonaco({
      load: () => import("monaco-editor"),
    })
    """

  defp command_snippet,
    do: ~S"""
    # The editor doesn't exist yet: Xenia keeps the command until it mounts.
    Xenia.push_to(socket, "later", "insert", %{text: "Sent from the top of the page.\n"})
    """
end
