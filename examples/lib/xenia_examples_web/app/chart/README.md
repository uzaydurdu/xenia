# Chart

A Chart.js chart on a LiveView page. Open it at `/chart`.

This example shows the three ways a page and a JS island talk:

| Way | Direction | Try it |
|---|---|---|
| **Props** | page → chart | Click "New numbers". The page changes `@data`, and the same chart updates. |
| **Events** | chart → page | Click a bar. The chart sends `click`, and the page shows which month it was. |
| **Commands** | page → chart | Click "Highlight March". The page asks the chart to highlight a bar. |

"Show as a line chart" changes the `type` prop. Chart.js can't change its
type in place, so the adapter asks Xenia to build a new chart with
`ctx.remount()`.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: the data, the buttons, and what happens on a click. |
| [`assets/js/islands/chart.js`](../../../../assets/js/islands/chart.js) | The adapter. It says how Chart.js starts, updates and stops. |
| [`components/islands.ex`](../../components/islands.ex) | Declares the `<.chart>` tag and its props. |
| [`assets/js/app.js`](../../../../assets/js/app.js) | Registers the adapter: `createHooks({Chart: chart})`. |

## How it works

1. The page renders the tag:

   ```heex
   <.chart id="sales" type={@type} data={@data} on_click="bar_clicked" />
   ```

2. In the browser, Xenia calls the adapter's `mount` with the props. The
   adapter creates the chart.
3. When `@data` changes, Xenia calls `props.data` in the adapter, and only
   that.
4. When you click a bar, the adapter calls `ctx.emit("click", ...)`.
   `on_click="bar_clicked"` sends it to `handle_event("bar_clicked", ...)`.
5. `Xenia.push_to(socket, "sales", "highlight", %{index: 2})` runs
   `commands.highlight` in the adapter of the chart with id `sales`, and no
   other chart.
