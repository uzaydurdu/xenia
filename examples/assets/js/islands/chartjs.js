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

// 3. A live chart: its points arrive as commands, not as a prop, so each
//    update sends only the new points, however long the series is. Used by
//    the large data example (lib/xenia_examples_web/app/large-data).
//
//    The server keeps the series, and sends it whole when the chart says
//    `ready`: when it mounts, and when its LiveView has reconnected (a new
//    LiveView process, which doesn't know what this chart shows).
export const liveChart = {
  ...chartjs,
  consumes: [...chartjs.consumes, "connection"],

  async mount(el, props, ctx) {
    const instance = await chartjs.mount(el, props, ctx)
    ctx.emit("ready", {})
    return instance
  },

  props: {
    ...chartjs.props,
    connection(_instance, connection, ctx) {
      if (connection === "connected") ctx.emit("ready", {})
    },
  },

  events: { ...chartjs.events, ready: {} },

  commands: {
    ...chartjs.commands,

    // The whole series, after `ready`.
    replace_points(instance, { labels, values }, ctx) {
      setSeries(instance, labels, values, ctx)
    },

    // New points at the end. With `max`, only the last `max` points stay.
    append_points(instance, { labels, values, max }, ctx) {
      const data = instance.config.data ?? {}
      const keep = (list) => (max ? list.slice(-max) : list)

      setSeries(
        instance,
        keep([...(data.labels ?? []), ...labels]),
        keep([...(data.datasets?.[0]?.data ?? []), ...values]),
        ctx,
      )
    },
  },
}

// Through the official `data` handler, so the chart keeps the points when
// it's rebuilt, e.g. for a new `type`.
function setSeries(instance, labels, values, ctx) {
  const data = instance.config.data ?? {}
  const [dataset = {}] = data.datasets ?? []
  chartjs.props.data(instance, { ...data, labels, datasets: [{ ...dataset, data: values }] }, ctx)
}
