defmodule XeniaExamplesWeb.App.ScratchpadLive do
  @moduledoc """
  The scratchpad: the persistent part of `scratchpad/layout.ex`.

  It's a LiveView of its own that stays alive while you move between the
  scratchpad's pages. So its Monaco editor stays alive too: the same editor,
  with your text, your cursor and your undo history. It goes away when you
  leave the scratchpad's pages, and the next visit starts a fresh one.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Persistent

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket, notes: "", version: 0, pages: 0, started: started(), pid: inspect(self()))}
  end

  defp started, do: Time.utc_now() |> Time.truncate(:second) |> Time.to_string()

  # Xenia calls this when the scratchpad connects, and after every page change.
  @impl true
  def handle_navigation(_uri, socket), do: {:noreply, update(socket, :pages, &(&1 + 1))}

  # The editor's changes come to this LiveView, not to the page: the
  # scratchpad is where the editor lives.
  @impl true
  def handle_event("notes_changed", %{"value" => notes, "version" => version}, socket),
    do: {:noreply, assign(socket, notes: notes, version: version)}

  @impl true
  def render(assigns) do
    ~H"""
    <%!-- data-pid: which server process this is, for the browser test. --%>
    <div id="scratchpad" data-pid={@pid} class="space-y-2 rounded-box border border-base-300 p-3">
      <h2 class="font-medium">Scratchpad</h2>
      <.monaco
        id="scratchpad-editor"
        value={@notes}
        version={@version}
        language="markdown"
        on_change="notes_changed"
        style="height: 180px"
      />
      <p class="text-xs opacity-70">
        Open since <span id="scratchpad-started">{@started}</span>
        UTC · pages seen: <span id="scratchpad-pages">{@pages}</span>
        · the server has <span id="scratchpad-lines">{length(String.split(@notes, "\n"))}</span>
        lines.
      </p>
    </div>
    """
  end
end
