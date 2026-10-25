defmodule Xenia.Adapters.Chartjs do
  @moduledoc """
  `<.chartjs>`: a Chart.js chart, through Xenia's official Chart.js adapter.

  ## Setup

  Install Chart.js in your app, and pass it to the adapter:

      npm install chart.js --prefix assets

  ```js
  // assets/js/app.js
  import { createChartjs } from "xenia/chartjs"

  const chartjs = createChartjs({ load: () => import("chart.js/auto") })

  hooks: { ...colocatedHooks, ...createHooks({ ChartJS: chartjs }) },
  ```

  Then `import Xenia.Adapters.Chartjs` in `html_helpers`, and:

      <.chartjs id="sales" type="bar" data={@sales} on_point_click="clicked" style="height: 300px" />

  `data` and `options` are Chart.js's own, so every chart type and option
  works. The chart follows the app's theme (`consumes: ["theme"]`); set
  `theme="light"` to pin one, or `theme={false}` for Chart.js's plain
  colors.

  ## Commands

      Xenia.push_to(socket, "sales", "highlight", %{index: 2})

  `highlight` (`%{dataset_index, index}`), `clear_highlight`,
  `toggle_dataset` (`%{index, visible}`), `reset`, and `download_image`
  (`%{filename}`). A command with wrong arguments sends `error`.

  ## Configuring and extending

  `createChartjs` takes `plugins`, default `options`, a `palette`, and a
  `setup(chart, %{Chart, ctx})` callback. It returns a plain adapter
  object, so you can spread it and add your own commands, props or events;
  in a handler, `instance.chart` is the Chart.js chart. See the "Official
  adapters" section of the README.

  The tag uses the adapter name `"ChartJS"`. To register the adapter under
  another name, render it with `<.xenia adapter="...">` or declare your own
  tag.
  """
  use Xenia.Components

  component :chartjs, adapter: "ChartJS", doc: "A Chart.js chart (Xenia's official adapter)." do
    prop :type, :string, default: "bar", doc: "the chart type; changing it rebuilds the chart"
    prop :data, :map, required: true, doc: "Chart.js data: %{labels: [...], datasets: [...]}"
    prop :options, :map, doc: "Chart.js options, merged over the themed defaults"
    prop :theme, :any, doc: ~s|"light" or "dark" to pin one, false for no themed colors|
    event :point_click
    event :legend_click
    event :hover
    event :error
  end
end
