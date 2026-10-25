defmodule XeniaExamplesWeb.App.Adapters.ShoelaceRatingPage do
  @moduledoc "`/adapters/shoelace-rating`: Shoelace's rating, in half stars (`<.shoelace_rating>`)."
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "Half-star rating", value: 3.5)}
  end

  @impl true
  def handle_event("rated", %{"value" => value}, socket),
    do: {:noreply, assign(socket, value: value)}

  def handle_event("reset", _params, socket), do: {:noreply, assign(socket, value: 0)}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Half-star rating</h1>
    <p>Shoelace's rating, through the official adapter: half stars, and a read-only average.</p>

    <div class="flex items-center gap-3">
      <.shoelace_rating
        id="stars"
        value={@value}
        precision={0.5}
        label="Your rating"
        on_change="rated"
      />
      <span id="value">{@value} of 5</span>
    </div>

    <div class="flex items-center gap-3 text-sm opacity-80">
      <.shoelace_rating id="average" value={4.5} precision={0.5} readonly label="Average" />
      <span>The average, read-only.</span>
    </div>

    <button id="reset" phx-click="reset" class="btn btn-sm">Reset to 0</button>
    """
  end
end
