/**
 * Xenia's official adapter for Leaflet (v1.9): interactive maps with markers, GeoJSON
 * layers, popups and viewport events.
 *
 * Props:
 *   center      [lat, lng]   applied when it differs from the current view
 *   zoom        number
 *   tiles       URL template (default OpenStreetMap) or
 *               %{url, attribution, max_zoom, subdomains, ...}
 *   markers     [%{id, lat, lng, popup?, tooltip?, draggable?, color?,
 *                  icon_url?, icon_size?}]   synced by id
 *   geojson     a GeoJSON object (Feature or FeatureCollection)
 *   geojson_style  %{color, weight, fill_color, fill_opacity, ...}, or per
 *               feature: properties.style in the GeoJSON itself
 *   fit         "markers" | "geojson" | "all": fit the view to that data
 *               whenever it changes (ignores center/zoom while set)
 *   options     Leaflet map options at mount: min_zoom, max_zoom,
 *               scroll_wheel_zoom, zoom_control, dragging, ... (snake_case
 *               or camelCase). Changing them remounts the map.
 *
 * Commands:
 *   fly_to %{lat, lng, zoom?}, set_view %{lat, lng, zoom?}
 *   fit_bounds %{bounds: [[south, west], [north, east]], padding?}
 *   fit_markers %{padding?}, fit_geojson %{padding?}
 *   zoom_in, zoom_out
 *   open_popup %{id}, close_popup
 *   locate                      ask the browser for the user's position
 *   invalidate_size             after the container changed size by itself
 *
 * Events:
 *   ready        %{center, zoom, bounds}
 *   click        %{lat, lng}
 *   move_end     %{center, zoom, bounds}      debounced 200 ms
 *   marker_click %{id, lat, lng}
 *   marker_drag_end  %{id, lat, lng}
 *   feature_click    %{id, properties, lat, lng}
 *   located      %{lat, lng, accuracy}
 *   error        %{source, message, code}
 *   bounds is [[south, west], [north, east]].
 *
 * The container needs a height (e.g. style="height: 400px"), and Leaflet's
 * CSS must be loaded once, e.g. in app.css:
 *   @import "../node_modules/leaflet/dist/leaflet.css";
 * Markers are drawn as inline SVG pins, so no marker image files are needed.
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createLeaflet } from "xenia/leaflet"
 *   const leaflet = createLeaflet({
 *     load: () => import("leaflet")
 *   })
 *   // createHooks({ Leaflet: leaflet }), then <.leaflet_map> (Xenia.Adapters.Leaflet)
 *   Extend it by spreading: { ...leaflet, commands: { ...leaflet.commands, mine() {} } }
 */

import {
  camelizeKeys,
  expectLibrary,
  guarded,
  isFiniteNumber,
  loadOnce,
  reportError,
  withLibrary,
} from "./shared.js";

const LOAD = 'createLeaflet({ load: () => import("leaflet") })';

function pickLibrary(library) {
  const L = typeof library?.map === "function" ? library : library?.default;
  expectLibrary(typeof L?.map === "function", LOAD);
  return { L };
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createLeaflet({ load: libraryImport } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let L;
  const OSM = {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  };

  const DEFAULT_CENTER = [0, 0];
  const DEFAULT_ZOOM = 2;

  /** Coordinates closer than this count as the same view (avoids jitter). */
  const EPSILON = 1e-6;

  /** Only plain CSS color values go into the SVG markup. */
  function safeColor(color) {
    return typeof color === "string" &&
      /^[#a-zA-Z0-9(),.%\s-]{1,40}$/.test(color)
      ? color
      : "#4f46e5";
  }

  function pinIcon(input) {
    const color = safeColor(input);
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
      <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z"
            fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="white"/>
    </svg>`;

    return L.divIcon({
      html: svg,
      className: "xenia-map-pin",
      iconSize: [28, 40],
      iconAnchor: [14, 40],
      popupAnchor: [0, -36],
    });
  }

  function markerIcon(marker) {
    if (marker.icon_url) {
      const size = marker.icon_size ?? [32, 32];
      return L.icon({
        iconUrl: marker.icon_url,
        iconSize: size,
        iconAnchor: [size[0] / 2, size[1]],
        popupAnchor: [0, -size[1]],
      });
    }

    return pinIcon(marker.color);
  }

  function boundsOut(bounds) {
    return [
      [bounds.getSouth(), bounds.getWest()],
      [bounds.getNorth(), bounds.getEast()],
    ];
  }

  function viewDetail(map) {
    const center = map.getCenter();
    return {
      center: [center.lat, center.lng],
      zoom: map.getZoom(),
      bounds: boundsOut(map.getBounds()),
    };
  }

  function toLatLng(value, command) {
    if (
      Array.isArray(value) &&
      isFiniteNumber(value[0]) &&
      isFiniteNumber(value[1])
    )
      return L.latLng(value[0], value[1]);
    throw new TypeError(`${command} expects [lat, lng]`);
  }

  function setTiles(instance, tiles) {
    instance.tiles?.remove();

    const config =
      typeof tiles === "string" ? { url: tiles } : camelizeKeys(tiles ?? {});
    const { url, ...options } = { ...OSM, ...config };

    instance.tiles = L.tileLayer(url, options).addTo(instance.map);
  }

  /** Adds, updates and removes markers to match the server's list. */
  function syncMarkers(instance, list) {
    const { map, markers, ctx } = instance;
    const wanted = new Map(
      (Array.isArray(list) ? list : []).map((marker) => [
        String(marker.id),
        marker,
      ]),
    );

    for (const [id, entry] of markers) {
      if (!wanted.has(id)) {
        entry.layer.remove();
        markers.delete(id);
      }
    }

    for (const [id, data] of wanted) {
      if (!isFiniteNumber(data.lat) || !isFiniteNumber(data.lng)) {
        reportError(
          ctx,
          "markers",
          new TypeError(`marker ${id} needs numeric lat and lng`),
        );
        continue;
      }

      let entry = markers.get(id);

      if (!entry) {
        // Created with its pin: added with Leaflet's default icon first,
        // the browser would fetch marker-icon.png and marker-shadow.png.
        const layer = L.marker([data.lat, data.lng], {
          draggable: Boolean(data.draggable),
          icon: markerIcon(data),
        }).addTo(map);

        layer.on("click", () => {
          const { lat, lng } = layer.getLatLng();
          ctx.emit("marker_click", { id, lat, lng });
        });
        layer.on("dragend", () => {
          const { lat, lng } = layer.getLatLng();
          ctx.emit("marker_drag_end", { id, lat, lng });
        });

        entry = { layer, data: null };
        markers.set(id, entry);
      }

      const { layer } = entry;
      const previous = entry.data;

      layer.setLatLng([data.lat, data.lng]);

      // New markers always get Xenia's pin; existing ones only when it changed.
      if (
        !previous ||
        previous.color !== data.color ||
        previous.icon_url !== data.icon_url
      ) {
        layer.setIcon(markerIcon(data));
      }
      if (layer.dragging)
        data.draggable ? layer.dragging.enable() : layer.dragging.disable();

      if (data.popup != null) layer.bindPopup(String(data.popup));
      else layer.unbindPopup();

      if (data.tooltip != null) layer.bindTooltip(String(data.tooltip));
      else layer.unbindTooltip();

      entry.data = data;
    }
  }

  function featureStyle(instance) {
    const base = camelizeKeys(instance.geojsonStyle ?? {});
    return (feature) => ({
      ...base,
      ...camelizeKeys(feature?.properties?.style ?? {}),
    });
  }

  function setGeojson(instance, data) {
    instance.geojson?.remove();
    instance.geojson = null;
    if (!data) return;

    instance.geojson = L.geoJSON(data, {
      style: featureStyle(instance),
      pointToLayer: (feature, latlng) =>
        L.marker(latlng, { icon: pinIcon(feature?.properties?.style?.color) }),
      onEachFeature: (feature, layer) => {
        if (feature?.properties?.popup != null)
          layer.bindPopup(String(feature.properties.popup));

        layer.on("click", (event) => {
          instance.ctx.emit("feature_click", {
            id: feature.id ?? feature.properties?.id ?? null,
            properties: feature.properties ?? {},
            lat: event.latlng.lat,
            lng: event.latlng.lng,
          });
        });
      },
    }).addTo(instance.map);
  }

  function fitTo(instance, target, padding = 24) {
    const layers = [];
    if (target === "markers" || target === "all")
      layers.push(
        ...[...instance.markers.values()].map((entry) => entry.layer),
      );
    if ((target === "geojson" || target === "all") && instance.geojson)
      layers.push(instance.geojson);
    if (layers.length === 0) return;

    const bounds = L.featureGroup(layers).getBounds();
    if (bounds.isValid())
      instance.map.fitBounds(bounds, {
        padding: [padding, padding],
        maxZoom: 16,
      });
  }

  /** Applies center/zoom props unless the map already shows them. */
  function applyView(instance) {
    if (instance.fit) return;

    const { map } = instance;
    const current = map.getCenter();
    const [lat, lng] = instance.center ?? [current.lat, current.lng];
    const zoom = instance.zoom ?? map.getZoom();

    const same =
      Math.abs(current.lat - lat) < EPSILON &&
      Math.abs(current.lng - lng) < EPSILON &&
      map.getZoom() === zoom;
    if (!same) map.setView([lat, lng], zoom);
  }

  const adapter = {
    mount(el, props, ctx) {
      const doc = el.ownerDocument;
      const host = doc.createElement("div");
      host.style.cssText = "width: 100%; height: 100%; min-height: 200px;";
      el.appendChild(host);

      const map = L.map(host, camelizeKeys(props.options ?? {}));

      const instance = {
        ctx,
        host,
        map,
        tiles: null,
        markers: new Map(),
        geojson: null,
        geojsonStyle: props.geojson_style,
        center: props.center,
        zoom: props.zoom,
        fit: props.fit ?? null,
        moveTimer: null,
        resize: null,
      };

      try {
        map.setView(props.center ?? DEFAULT_CENTER, props.zoom ?? DEFAULT_ZOOM);
        setTiles(instance, props.tiles);
        syncMarkers(instance, props.markers);
        setGeojson(instance, props.geojson);
        if (instance.fit) fitTo(instance, instance.fit);

        map.on("click", (event) =>
          ctx.emit("click", { lat: event.latlng.lat, lng: event.latlng.lng }),
        );
        map.on("moveend", () => ctx.emit("move_end", viewDetail(map)));
        map.on("locationfound", (event) =>
          ctx.emit("located", {
            lat: event.latlng.lat,
            lng: event.latlng.lng,
            accuracy: event.accuracy,
          }),
        );
        map.on("locationerror", (event) =>
          reportError(ctx, "locate", new Error(event.message)),
        );

        // Leaflet measures its container once; keep it in sync with layout.
        instance.resize = new ResizeObserver(() =>
          map.invalidateSize({ pan: false }),
        );
        instance.resize.observe(host);

        ctx.emit("ready", viewDetail(map));
        return instance;
      } catch (error) {
        map.remove();
        host.remove();
        throw error;
      }
    },

    destroy(instance) {
      instance.resize?.disconnect();
      instance.map.stopLocate();
      instance.map.remove(); // removes every layer and listener
      instance.host.remove();
    },

    props: {
      center(instance, center) {
        instance.center = center;
        applyView(instance);
      },

      zoom(instance, zoom) {
        instance.zoom = zoom;
        applyView(instance);
      },

      tiles: (instance, tiles) => setTiles(instance, tiles),

      markers(instance, markers) {
        syncMarkers(instance, markers);
        if (instance.fit === "markers" || instance.fit === "all")
          fitTo(instance, instance.fit);
      },

      geojson(instance, geojson, ctx) {
        try {
          setGeojson(instance, geojson);
          if (instance.fit === "geojson" || instance.fit === "all")
            fitTo(instance, instance.fit);
        } catch (error) {
          reportError(ctx, "geojson", error);
        }
      },

      geojson_style(instance, style) {
        instance.geojsonStyle = style;
        instance.geojson?.setStyle(featureStyle(instance));
      },

      fit(instance, fit) {
        instance.fit = fit ?? null;
        if (instance.fit) fitTo(instance, instance.fit);
        else applyView(instance);
      },

      options: (_instance, _options, ctx) => ctx.remount(),
    },

    commands: {
      fly_to: guarded("fly_to", (i, { lat, lng, zoom }) =>
        i.map.flyTo(toLatLng([lat, lng], "fly_to"), zoom ?? i.map.getZoom()),
      ),
      set_view: guarded("set_view", (i, { lat, lng, zoom }) =>
        i.map.setView(
          toLatLng([lat, lng], "set_view"),
          zoom ?? i.map.getZoom(),
        ),
      ),

      fit_bounds: guarded("fit_bounds", (i, { bounds, padding = 24 }) => {
        if (!Array.isArray(bounds) || bounds.length !== 2) {
          throw new TypeError(
            "fit_bounds expects %{bounds: [[south, west], [north, east]]}",
          );
        }
        i.map.fitBounds(
          [
            toLatLng(bounds[0], "fit_bounds"),
            toLatLng(bounds[1], "fit_bounds"),
          ],
          { padding: [padding, padding] },
        );
      }),

      fit_markers: guarded("fit_markers", (i, { padding }) =>
        fitTo(i, "markers", padding),
      ),
      fit_geojson: guarded("fit_geojson", (i, { padding }) =>
        fitTo(i, "geojson", padding),
      ),
      zoom_in: guarded("zoom_in", (i) => i.map.zoomIn()),
      zoom_out: guarded("zoom_out", (i) => i.map.zoomOut()),

      open_popup: guarded("open_popup", (i, { id }) => {
        const entry = i.markers.get(String(id));
        if (!entry) throw new Error(`no marker with id ${JSON.stringify(id)}`);
        entry.layer.openPopup();
      }),

      close_popup: guarded("close_popup", (i) => i.map.closePopup()),
      locate: guarded("locate", (i) =>
        i.map.locate({ setView: true, maxZoom: 16 }),
      ),
      invalidate_size: guarded("invalidate_size", (i) =>
        i.map.invalidateSize(),
      ),
    },

    events: {
      ready: {},
      click: {},
      move_end: { debounce: 200 },
      marker_click: {},
      marker_drag_end: {},
      feature_click: {},
      located: {},
      error: {},
    },
  };

  return withLibrary(adapter, loadLibrary, (library) => {
    ({ L } = pickLibrary(library));
  });
}
