defmodule XeniaExamplesWeb.App.Adapters.MapPage do
  @moduledoc "`/adapters/map`: a map with markers (`<.leaflet_map>`)."
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    markers = [
      %{id: "berlin", lat: 52.52, lng: 13.405, popup: "Berlin", draggable: true},
      %{id: "paris", lat: 48.8566, lng: 2.3522, popup: "Paris"},
      %{id: "warsaw", lat: 52.2297, lng: 21.0122, popup: "Warsaw"}
    ]

    {:ok, assign(socket, page_title: "Map", markers: markers, last: nil)}
  end

  @impl true
  def handle_event("marker_clicked", %{"id" => id}, socket),
    do: {:noreply, assign(socket, last: "You clicked #{String.capitalize(id)}.")}

  # The user dragged a marker: keep the new position on the server.
  def handle_event("marker_moved", %{"id" => id, "lat" => lat, "lng" => lng}, socket) do
    markers =
      Enum.map(socket.assigns.markers, fn marker ->
        if marker.id == id, do: %{marker | lat: lat, lng: lng}, else: marker
      end)

    {:noreply,
     assign(socket,
       markers: markers,
       last: "#{String.capitalize(id)} moved to #{round_to(lat)}, #{round_to(lng)}."
     )}
  end

  def handle_event("fly_paris", _params, socket),
    do: {:noreply, Xenia.push_to(socket, "map", "fly_to", %{lat: 48.8566, lng: 2.3522, zoom: 9})}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Map</h1>
    <p>Leaflet: click a marker, or drag the Berlin one. Map data © OpenStreetMap contributors.</p>

    <.leaflet_map
      id="map"
      center={[51.5, 12.5]}
      zoom={4}
      markers={@markers}
      on_marker_click="marker_clicked"
      on_marker_drag_end="marker_moved"
      style="height: 360px"
    />

    <button id="fly-paris" phx-click="fly_paris" class="btn btn-sm">Fly to Paris</button>
    <p id="last">{@last || "Click a marker."}</p>
    """
  end

  defp round_to(value), do: Float.round(value * 1.0, 2)
end
