defmodule XeniaExamplesWeb.App.Adapters.FlatpickrPage do
  @moduledoc "`/adapters/flatpickr`: a date range picker (`<.flatpickr mode=\"range\">`)."
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "Date range", range: [], picked: nil)}
  end

  # A range is sent once both ends are chosen: a list of two dates.
  @impl true
  def handle_event("picked", %{"value" => [from, to]}, socket),
    do: {:noreply, assign(socket, range: [from, to], picked: "From #{from} to #{to}.")}

  def handle_event("picked", _params, socket), do: {:noreply, socket}

  def handle_event("next_week", _params, socket) do
    monday = Date.utc_today() |> Date.add(7) |> Date.beginning_of_week()
    range = [Date.to_iso8601(monday), Date.to_iso8601(Date.add(monday, 4))]
    {:noreply, assign(socket, range: range, picked: "From #{hd(range)} to #{List.last(range)}.")}
  end

  def handle_event("open", _params, socket),
    do: {:noreply, Xenia.push_to(socket, "trip", "open")}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Date range</h1>
    <p>flatpickr in range mode. Pick two dates, or let the server pick next week.</p>

    <div class="max-w-xs">
      <.flatpickr
        id="trip"
        mode="range"
        value={@range}
        min_date="today"
        placeholder="Pick your dates"
        on_change="picked"
      />
    </div>

    <div class="flex flex-wrap gap-2">
      <button id="next-week" phx-click="next_week" class="btn btn-sm">Next week, Monday to Friday</button>
      <button id="open" phx-click="open" class="btn btn-sm">Open the calendar</button>
    </div>

    <p id="picked">{@picked || "No dates yet."}</p>
    """
  end
end
