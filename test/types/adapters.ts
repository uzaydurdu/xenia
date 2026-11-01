// The 16 official adapters from TypeScript, as the README and each tag
// module show them. Every factory needs `load`; their props, events and
// commands are typed. Nothing here runs; tsc only checks it.

import { createHooks, type Adapter } from "xenia"
import { createChartjs, type ChartjsEvents, type ChartjsInstance, type ChartjsProps } from "xenia/chartjs"
import { createD3 } from "xenia/d3"
import { createFlatpickr } from "xenia/flatpickr"
import { createFullCalendar } from "xenia/fullcalendar"
import { createLeaflet } from "xenia/leaflet"
import { createMonaco, MonacoAdapter } from "xenia/monaco"
import { createMonacoDiff } from "xenia/monaco-diff"
import { createShoelaceRating } from "xenia/shoelace-rating"
import { createSortablejs } from "xenia/sortablejs"
import { createTabulator } from "xenia/tabulator"
import { createTiptap } from "xenia/tiptap"
import { createTomSelect } from "xenia/tom-select"
import { createUppy } from "xenia/uppy"
import { createWaveSurfer } from "xenia/wavesurfer"
import { createWaveSurferMultitrack } from "xenia/wavesurfer-multitrack"
import { createXterm } from "xenia/xterm"

// The libraries aren't installed here (Xenia imports none of them), so the
// fixture stands in for `() => import("...")`.
declare function library(name: string): Promise<any>

const chartjs = createChartjs({
  load: () => library("chart.js/auto"),
  palette: { light: ["#4f46e5"], dark: ["#818cf8"] },
  setup(chart, { ctx }) {
    ctx.emit("point_click", { dataset_index: 0, index: 1, dataset: "Sales", label: "Feb", value: 3 })
    return () => chart.destroy()
  },
})

const d3 = createD3({
  load: () => library("d3"),
  charts: {
    heatmap: {
      create: (view) => view.svg,
      update(svg, view) {
        svg.setAttribute("width", String(view.width))
      },
    },
  },
})

const monaco = createMonaco({ load: () => library("monaco-editor"), setup: (_monaco, editor) => editor })

export const hooks = createHooks({
  ChartJS: chartjs,
  D3: d3,
  Flatpickr: createFlatpickr({ load: () => library("flatpickr") }),
  FullCalendar: createFullCalendar({ load: async () => ({ Calendar: class {}, plugins: [] }) }),
  Leaflet: createLeaflet({ load: () => library("leaflet") }),
  Monaco: monaco,
  MonacoDiff: createMonacoDiff({ load: () => library("monaco-editor") }),
  ShoelaceRating: createShoelaceRating({ load: () => library("@shoelace-style/shoelace") }),
  SortableJS: createSortablejs({ load: () => library("sortablejs") }),
  Tabulator: createTabulator({ load: () => library("tabulator-tables") }),
  Tiptap: createTiptap({
    load: async () => ({ Editor: {}, StarterKit: {}, CharacterCount: {}, Placeholder: {} }),
  }),
  TomSelect: createTomSelect({ load: () => library("tom-select") }),
  Uppy: createUppy({ load: async () => ({ Uppy: {}, Dashboard: {} }) }),
  WaveSurfer: createWaveSurfer({ load: async () => ({ WaveSurfer: {} }) }),
  WaveSurferMultitrack: createWaveSurferMultitrack({
    load: async () => ({ WaveSurfer: {}, RecordPlugin: {}, Multitrack: {} }),
  }),
  Xterm: createXterm({ load: async () => ({ Terminal: {}, FitAddon: {} }) }),
})

// Extending by spreading, with a typed extra command and event.
type RevenueEvents = ChartjsEvents & { total: { sum: number } }
type RevenueCommands = { append_points: { points: number[] } }

export const revenueChart: Adapter<ChartjsInstance, ChartjsProps, RevenueEvents, RevenueCommands> = {
  ...chartjs,
  mount(el, props, ctx) {
    ctx.emit("total", { sum: 0 })
    return chartjs.mount(el, props, ctx)
  },
  destroy: chartjs.destroy,
  events: { ...chartjs.events!, total: {} },
  commands: {
    append_points(instance, { points }) {
      instance.chart?.data.datasets[0].data.push(...points)
    },
  },
}

// MonacoAdapter, standalone in a plain hook.
export async function standalone(el: HTMLElement) {
  const editor = new MonacoAdapter(el, { load: () => library("monaco-editor"), id: "editor" })
  const shown: string | undefined = await editor.applyValue({ value: "hello", version: 1 })
  await editor.onChange(({ value, version }) => console.log(value, version))
  const raw = await editor.raw()
  raw?.editor.focus()
  return shown
}

// Mistakes the types catch.

// @ts-expect-error: `load` is required
createFlatpickr({})

// @ts-expect-error: a misspelled factory option
createChartjs({ load: () => library("chart.js/auto"), pallete: {} })

chartjs.commands!.highlight(
  { chart: null, Chart: null },
  // @ts-expect-error: `index` is a number
  { index: "2" },
  {} as any,
)

monaco.props!.value!(
  {} as MonacoAdapter,
  // @ts-expect-error: a value is a string or {value, version?, revision?}
  { text: "hello" },
  {} as any,
)
