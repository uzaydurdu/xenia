defmodule Xenia.Adapters.D3 do
  @moduledoc """
  `<.d3_chart>`: data-driven charts (D3), through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install d3 --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createD3 } from "xenia/d3"

  const d3 = createD3({
      load: () => import("d3"),
  })

  hooks: { ...colocatedHooks, ...createHooks({ D3: d3 }) },
  ```

  Then `import Xenia.Adapters.D3` in `html_helpers`, and render
  `<.d3_chart id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  Add chart kinds of your own with the `charts` option, then render
  `<.d3_chart kind="heatmap">`:

  ```js
  const d3 = createD3({
    load: () => import("d3"),
    charts: {
      heatmap: {
        create(view) { return state },   // once
        update(state, view) {},          // every data/options change and resize
        destroy(state) {},               // optional
      },
    },
  })
  ```

  `view` is `{ d3, svg, root, width, height, data, options, color, select,
  hover }`.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"D3"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for D3 (v7): data-driven charts with D3's data joins.

    D3 is a toolkit, not a chart library, so this adapter offers both:
      - built-in kinds: "bar", "line", "area", "scatter", "pie", "donut",
        with axes, legend, tooltip, transitions, click/hover/brush events;
      - your own charts: createD3({ load, charts: { sankey: { create, update,
        destroy } } }) in JS, then kind="sankey" from the server (see Setup).

    Props:
      kind     one of the built-in kinds or a registered name. Default "bar".
      data     long format, one object per point:
                 %{x: "Jan" | 3 | "2026-01-01", y: 42, series: "North", size: 5}
               `series` is optional (one series), `size` only for scatter.
               Pie/donut: x is the slice label, y its value.
      options  (all optional)
        x_type        "auto" | "band" | "linear" | "time". Auto: bars use bands;
                      numbers are linear; ISO date strings are time; else band.
        y_min, y_max  fixed y domain (defaults to 0..max, extended for negatives)
        x_label, y_label   axis titles
        x_format, y_format d3-format specifier (".0%", "$,.2f"), or for time
                           axes a d3-time-format specifier ("%b %d")
        colors        list of CSS colors (default: Tableau 10)
        curve         "linear" | "monotone" | "step" | "natural" (line/area)
        stacked       true stacks bars of several series
        points        true draws points on lines (default true)
        inner_radius  0..1 hole size for donut (default 0.6)
        legend        true | false (default: true when there are 2+ entries)
        grid          true | false (default true)
        tooltip       true | false (default true)
        brush         true lets the user drag a range on line/area/scatter
                      charts with a linear or time x axis
        duration      transition length in ms (default 300; 0 = none)
        margin        %{top, right, bottom, left}

    Commands:
      highlight %{x, series?}   show a point/bar/slice as active with tooltip
      clear_highlight
      download_svg %{filename?}

    Events:
      select        %{x, y, series, index}   a mark was clicked
      hover         same, or %{} when leaving; at most every 100 ms
      brush         %{from, to}   the brushed x range (numbers or ISO strings)
      legend_click  %{key, hidden}   a legend entry was toggled
      error         %{source, message, code}

    Colors follow the page: text and axes use currentColor, so light and dark
    mode work without configuration.
  """
  use Xenia.Components

  component :d3_chart, adapter: "D3" do
    prop :kind, :string, default: "bar"
    prop :data, :list, required: true
    prop :options, :map
    event :select
    event :hover
    event :brush
    event :legend_click
    event :error
  end
end
