// The typed island: a Chart.js doughnut, written in TypeScript.
// Used by the typed example (lib/xenia_examples_web/app/typed).
//
// Phoenix's esbuild compiles .ts files as they are, and `npm run typecheck`
// (in assets/) checks them. The three types below say what the server
// sends, what the island reports and what the server can ask, so a
// misspelled event or a wrong payload is an error before the page runs.
// Chart.js's own types describe the chart itself.

import Chart from "chart.js/auto"
import type { Adapter } from "xenia"

type Segment = "spent" | "left"

// What the server sends (the props in page.ex), plus the app's theme,
// which arrives because the adapter consumes it.
type Props = {
  spent: number
  left: number
  theme?: "light" | "dark"
}

// What the island reports, and each payload.
type Events = {
  segment_click: { segment: Segment; amount: number }
}

// What the server can ask, with Xenia.push_to/4.
type Commands = {
  highlight: { segment: Segment }
}

const SEGMENTS: Segment[] = ["spent", "left"]

export const budget: Adapter<Chart<"doughnut">, Props, Events, Commands> = {
  consumes: ["theme"],

  mount(el, props, ctx) {
    const canvas = el.appendChild(document.createElement("canvas"))

    return new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["Spent", "Left"],
        datasets: [{ data: [props.spent, props.left], backgroundColor: colors(props.theme) }],
      },
      options: {
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { labels: { color: textColor(props.theme) } } },
        onClick(_event, elements, chart) {
          const index = elements[0]?.index
          if (index === undefined) return

          ctx.emit("segment_click", {
            segment: SEGMENTS[index],
            amount: Number(chart.data.datasets[0].data[index]),
          })
        },
      },
    })
  },

  destroy(chart) {
    chart.destroy()
  },

  // `undefined` means the server stopped sending the prop.
  props: {
    spent(chart, spent) {
      chart.data.datasets[0].data[0] = spent ?? 0
      chart.update()
    },

    left(chart, left) {
      chart.data.datasets[0].data[1] = left ?? 0
      chart.update()
    },

    theme(chart, theme) {
      chart.data.datasets[0].backgroundColor = colors(theme)
      chart.options.plugins!.legend!.labels!.color = textColor(theme)
      chart.update()
    },
  },

  events: {
    segment_click: {},
  },

  commands: {
    highlight(chart, { segment }) {
      const active = [{ datasetIndex: 0, index: SEGMENTS.indexOf(segment) }]
      chart.setActiveElements(active)
      chart.tooltip?.setActiveElements(active, { x: 0, y: 0 })
      chart.update()
    },
  },
}

function colors(theme: Props["theme"]): string[] {
  return theme === "dark" ? ["#a78bfa", "#3f3f46"] : ["#7c3aed", "#e5e7eb"]
}

function textColor(theme: Props["theme"]): string {
  return theme === "dark" ? "#e5e7eb" : "#374151"
}
