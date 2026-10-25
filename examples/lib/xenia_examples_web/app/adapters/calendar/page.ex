defmodule XeniaExamplesWeb.App.Adapters.CalendarPage do
  @moduledoc "`/adapters/calendar`: a month calendar (`<.full_calendar>`)."
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    today = Date.utc_today()

    events = [
      %{id: "1", title: "Team sync", start: Date.to_iso8601(today)},
      %{id: "2", title: "Release", start: Date.to_iso8601(Date.add(today, 3))}
    ]

    {:ok, assign(socket, page_title: "Calendar", events: events, opened: nil)}
  end

  # A click on a day adds an event there; a click on an event opens it.
  @impl true
  def handle_event("day_clicked", %{"date" => date}, socket) do
    id = Integer.to_string(length(socket.assigns.events) + 1)
    event = %{id: id, title: "New event #{id}", start: String.slice(date, 0, 10)}
    {:noreply, update(socket, :events, &(&1 ++ [event]))}
  end

  def handle_event("event_clicked", %{"event" => %{"title" => title, "start" => start}}, socket),
    do: {:noreply, assign(socket, opened: "#{title}, #{String.slice(start, 0, 10)}")}

  def handle_event("go", %{"to" => to}, socket) when to in ~w(prev next today),
    do: {:noreply, Xenia.push_to(socket, "calendar", to)}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Calendar</h1>
    <p>FullCalendar: click a day to add an event there, or click an event to open it.</p>

    <div class="flex flex-wrap gap-2">
      <button id="prev" phx-click="go" phx-value-to="prev" class="btn btn-sm">Previous month</button>
      <button id="today" phx-click="go" phx-value-to="today" class="btn btn-sm">Today</button>
      <button id="next" phx-click="go" phx-value-to="next" class="btn btn-sm">Next month</button>
    </div>

    <.full_calendar
      id="calendar"
      events={@events}
      options={%{header_toolbar: %{left: "title", center: "", right: ""}}}
      on_date_click="day_clicked"
      on_event_click="event_clicked"
      style="height: 520px"
    />

    <p id="opened">{@opened || "No event opened."}</p>
    <p id="count">The server has {length(@events)} events.</p>
    """
  end
end
