# Chart.js adapter

Xenia's official Chart.js adapter. Open it at `/adapters/chartjs`.

The [Chart](../../chart) example shows how to **write** an adapter yourself.
This one shows the other way: **use** an adapter that Xenia ships, without
copying it, and still make it your own.

**Try it:** switch the theme, click a bar or a legend entry, and use the
buttons. Below the first chart, a second one shows a total that the
adapter reports.

## The three steps

| Step | What it means | Where |
|---|---|---|
| **Use** | `createChartjs({load: () => import("chart.js/auto")})` gives you the whole adapter. The page renders `<.chartjs>`. | [`chartjs.js`](../../../../../assets/js/islands/chartjs.js), [`page.ex`](page.ex) |
| **Configure** | Options for the whole app: a Chart.js plugin of our own (the soft background behind the plot), default `options`, and a `setup` function that gives each chart a name for screen readers. | [`chartjs.js`](../../../../../assets/js/islands/chartjs.js) |
| **Extend** | `revenueChart` is the same adapter, spread into a new object that also sends a `total` event. The page shows it. | [`chartjs.js`](../../../../../assets/js/islands/chartjs.js), [`page.ex`](page.ex) |

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: the data, the buttons, and what happens on a click. |
| [`assets/js/islands/chartjs.js`](../../../../../assets/js/islands/chartjs.js) | Configures the official adapter, and extends it. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers both: `createHooks({ChartJS: chartjs, RevenueChart: revenueChart})`. |

## How it works

- **Chart.js comes from your app.** `npm install chart.js` puts it in your
  `assets/node_modules`, and `load` passes it to the adapter. Xenia itself
  depends on no chart library.
- **Loaded once.** Both charts on this page share one adapter factory, so
  Chart.js is loaded once and the plugin is registered once.
- **The theme** comes from the app, like in the [Theme](../../theme) example.
  Set `theme="light"` on the tag to pin one.
- **Events:** `on_point_click` and `on_legend_click` name the LiveView
  events. **Commands:** `Xenia.push_to(socket, "official", "highlight", %{index: 2})`.
