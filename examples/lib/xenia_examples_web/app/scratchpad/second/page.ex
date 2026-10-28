defmodule XeniaExamplesWeb.App.Scratchpad.SecondPage do
  @moduledoc """
  `/scratchpad/second`: the second of the two pages that share the
  scratchpad. Its own LiveView, with its own state: a counter that starts
  again every time you open it, while the scratchpad beside it keeps going.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket), do: {:ok, assign(socket, clicks: 0)}

  def metadata(_assigns), do: %{title: "Second page"}

  @impl true
  def handle_event("click", _params, socket), do: {:noreply, update(socket, :clicks, &(&1 + 1))}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">The second page</h1>
    <p>
      A different LiveView: this counter belongs to the page, so it starts
      from zero each time you come here. The scratchpad belongs to the
      layout, so it keeps your text.
    </p>
    <button id="page-click" phx-click="click" class="btn btn-sm">
      Clicks on this page: <span id="page-clicks">{@clicks}</span>
    </button>
    """
  end
end
