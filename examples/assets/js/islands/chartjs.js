// Xenia's official Chart.js adapter, configured for this app, and extended.
// Used by the Chart.js adapter example (lib/xenia_examples_web/app/chartjs).
//
// Compare with ./chart.js, an adapter written by hand: the official one is
// used without copying it, and still changed in three ways below.

import { createChartjs } from "xenia/chartjs"

// A small Chart.js plugin of our own: a soft background behind the plot.
// Any Chart.js plugin works the same way (zoom, annotation, datalabels).
const plotBackground = {
  id: "plotBackground",
  beforeDraw(chart, _args, options) {
    const { ctx, chartArea } = chart
    if (!chartArea || options.color === false) return

    ctx.save()
    ctx.fillStyle = options.color ?? "rgba(124, 58, 237, 0.07)"
    ctx.fillRect(chartArea.left, chartArea.top, chartArea.width, chartArea.height)
    ctx.restore()
  },
}

// 1. Configure: one factory for the whole app. Chart.js is loaded once, and
//    the plugin is registered once, however many charts there are.
export const chartjs = createChartjs({
  load: () => import("chart.js/auto"),
  plugins: [plotBackground],
  // Defaults for every chart of this app. A chart's own `options` win.
  options: { animation: false },
  // Runs for each new chart: give it a name screen readers can announce.
  setup(chart) {
    const names = chart.data.datasets.map((dataset) => dataset.label).join(" and ")
    chart.canvas.setAttribute("role", "img")
    chart.canvas.setAttribute("aria-label", `Chart of ${names}`)
  },
})

// 2. Extend: the same adapter, plus a `total` event with every new data.
//    The official adapter is a plain object, so spread it and add to it.
export const revenueChart = {
  ...chartjs,

  async mount(el, props, ctx) {
    const instance = await chartjs.mount(el, props, ctx)
    emitTotal(props.data, ctx)
    return instance
  },

  props: {
    ...chartjs.props,
    data(instance, data, ctx) {
      chartjs.props.data(instance, data, ctx)
      emitTotal(data, ctx)
    },
  },

  events: { ...chartjs.events, total: {} },
}

function emitTotal(data, ctx) {
  const values = (data?.datasets ?? []).flatMap((dataset) => dataset.data ?? [])
  ctx.emit("total", { total: values.reduce((sum, value) => sum + value, 0) })
}
