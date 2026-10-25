// The chart island: Chart.js in a LiveView page.
// Used by the chart and theme examples (lib/xenia_examples_web/app/chart).
//
// An adapter only says how the library is created, updated and destroyed.
// Xenia does the rest: it sends props, delivers events, routes commands,
// and cleans up when you leave the page.

import Chart from "chart.js/auto"

export const chart = {
  // Ask Xenia for the app's theme. It arrives as an ordinary prop.
  consumes: ["theme"],

  // Create the chart inside `el`, an empty element Xenia made for it.
  mount(el, props, ctx) {
    const canvas = el.appendChild(document.createElement("canvas"))

    return new Chart(canvas, {
      type: props.type,
      data: props.data,
      options: options(props.theme, ctx),
    })
  },

  // Called when the page goes away.
  destroy(chart) {
    chart.destroy()
  },

  // One function per prop. Xenia calls it only when the value changed.
  props: {
    data(chart, data) {
      chart.data = data
      chart.update()
    },

    // Chart.js can't change its type in place, so Xenia builds a new chart.
    type(_chart, _type, ctx) {
      ctx.remount()
    },

    theme(chart, theme, ctx) {
      chart.options = options(theme, ctx)
      chart.update()
    },
  },

  // Events this island can send to the LiveView.
  events: {
    click: {},
  },

  // Things the server can ask it to do, with Xenia.push_to/4.
  commands: {
    highlight(chart, { index }) {
      chart.setActiveElements([{ datasetIndex: 0, index }])
      chart.update()
    },
  },
}

// Colors for light and dark mode, and the click handler.
function options(theme, ctx) {
  const dark = theme === "dark"
  const text = dark ? "#e5e7eb" : "#374151"
  const grid = dark ? "#374151" : "#e5e7eb"

  return {
    maintainAspectRatio: false,
    animation: false,
    // A click anywhere above a month counts as a click on its bar.
    interaction: { mode: "index", intersect: false },
    color: text,
    elements: {
      bar: { backgroundColor: dark ? "#a78bfa" : "#7c3aed" },
      line: { borderColor: dark ? "#fbbf24" : "#d97706" },
      point: { backgroundColor: dark ? "#fbbf24" : "#d97706" },
    },
    scales: {
      x: { ticks: { color: text }, grid: { color: grid } },
      y: { ticks: { color: text }, grid: { color: grid } },
    },
    onClick(_event, points, chart) {
      if (points[0]) ctx.emit("click", { label: chart.data.labels[points[0].index] })
    },
  }
}
