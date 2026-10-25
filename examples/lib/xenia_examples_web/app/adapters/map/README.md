# Map

Leaflet, a map with markers that come from the server. Open it at `/adapters/map`.

**Try it:** click a marker, drag the Berlin one, and click "Fly to Paris".

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createLeaflet({load: () => import("leaflet")})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({Leaflet: official.leaflet})`. |
| [`assets/css/app.css`](../../../../../assets/css/app.css) | Imports the library's CSS. |

## How it works

- **The tag** is `<.leaflet_map>`, from `Xenia.Adapters.Leaflet` (its docs list every prop, event and command).
- **Events:** `on_marker_click` sends the marker's id; `on_marker_drag_end` sends its id and new position.
- **Commands:** `Xenia.push_to(socket, "map", "fly_to", %{lat: 48.8566, lng: 2.3522, zoom: 9})`.
- **`markers`** is a list of maps with an `id`. After a drag, the server stores the new position, so a re-render keeps the marker where the user left it.
- Map tiles © OpenStreetMap contributors.
