defmodule XeniaExamplesWeb.App.RatingPage do
  @moduledoc """
  `/rating`: Shoelace's `<sl-rating>`, a web component.

  Its adapter (`assets/js/islands/rating.js`) has no prop functions. Xenia
  sets each prop on the element (`node.value = 3`), which is all a web
  component needs.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "Rating", value: 3, max: 5)}
  end

  @impl true
  def handle_event("rated", %{"value" => value}, socket) do
    {:noreply, assign(socket, value: value)}
  end

  def handle_event("reset", _params, socket), do: {:noreply, assign(socket, value: 0)}

  def handle_event("more_stars", _params, socket) do
    {:noreply, assign(socket, max: if(socket.assigns.max == 5, do: 10, else: 5))}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Rating</h1>
    <p>A web component. Pick a rating, or let the server change it.</p>

    <.rating id="stars" value={@value} max={@max} on_change="rated" />

    <p id="rated">The server has: {@value} of {@max}.</p>

    <div class="flex flex-wrap gap-2">
      <button id="reset" phx-click="reset" class="btn btn-sm">Reset to 0</button>
      <button id="more-stars" phx-click="more_stars" class="btn btn-sm">
        Use {if @max == 5, do: 10, else: 5} stars
      </button>
    </div>
    """
  end
end
