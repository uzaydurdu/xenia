defmodule Xenia.Adapters.Leaflet do
  @moduledoc """
  `<.leaflet_map>`: an interactive map (Leaflet), through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install leaflet --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createLeaflet } from "xenia/leaflet"

  const leaflet = createLeaflet({
      load: () => import("leaflet"),
  })

  hooks: { ...colocatedHooks, ...createHooks({ Leaflet: leaflet }) },
  ```

  And its CSS, in `assets/css/app.css`:

      @import "../node_modules/leaflet/dist/leaflet.css";

  Then `import Xenia.Adapters.Leaflet` in `html_helpers`, and render
  `<.leaflet_map id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"Leaflet"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for Leaflet (v1.9): interactive maps with markers, GeoJSON
    layers, popups and viewport events.

    Props:
      center      [lat, lng]   applied when it differs from the current view
      zoom        number
      tiles       URL template (default OpenStreetMap) or
                  %{url, attribution, max_zoom, subdomains, ...}
      markers     [%{id, lat, lng, popup?, tooltip?, draggable?, color?,
                     icon_url?, icon_size?}]   synced by id
      geojson     a GeoJSON object (Feature or FeatureCollection)
      geojson_style  %{color, weight, fill_color, fill_opacity, ...}, or per
                  feature: properties.style in the GeoJSON itself
      fit         "markers" | "geojson" | "all": fit the view to that data
                  whenever it changes (ignores center/zoom while set)
      options     Leaflet map options at mount: min_zoom, max_zoom,
                  scroll_wheel_zoom, zoom_control, dragging, ... (snake_case
                  or camelCase). Changing them remounts the map.

    Commands:
      fly_to %{lat, lng, zoom?}, set_view %{lat, lng, zoom?}
      fit_bounds %{bounds: [[south, west], [north, east]], padding?}
      fit_markers %{padding?}, fit_geojson %{padding?}
      zoom_in, zoom_out
      open_popup %{id}, close_popup
      locate                      ask the browser for the user's position
      invalidate_size             after the container changed size by itself

    Events:
      ready        %{center, zoom, bounds}
      click        %{lat, lng}
      move_end     %{center, zoom, bounds}      debounced 200 ms
      marker_click %{id, lat, lng}
      marker_drag_end  %{id, lat, lng}
      feature_click    %{id, properties, lat, lng}
      located      %{lat, lng, accuracy}
      error        %{source, message, code}
      bounds is [[south, west], [north, east]].

    The container needs a height (e.g. style="height: 400px"), and Leaflet's
    CSS must be loaded once, e.g. in app.css:
      @import "../node_modules/leaflet/dist/leaflet.css";
    Markers are drawn as inline SVG pins, so no marker image files are needed.
  """
  use Xenia.Components

  component :leaflet_map, adapter: "Leaflet" do
    prop :center, :list
    prop :zoom, :any
    prop :tiles, :any
    prop :markers, :list
    prop :geojson, :map
    prop :geojson_style, :map
    prop :fit, :string
    prop :options, :map
    event :ready
    event :click
    event :move_end
    event :marker_click
    event :marker_drag_end
    event :feature_click
    event :located
    event :error
  end
end
