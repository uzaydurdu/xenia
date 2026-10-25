// Xenia's official adapters, set up for this app. Each one gets its library
// from this app's assets/node_modules through `load`; Xenia itself imports
// none of them. Chart.js and Monaco are set up in chartjs.js and monaco.js.
//
// Each export is a plain adapter object: register it with createHooks
// (app.js), or spread it to change it (see chartjs.js).

import { createFlatpickr } from "xenia/flatpickr"
import { createShoelaceRating } from "xenia/shoelace-rating"
import { createSortablejs } from "xenia/sortablejs"
import { createTomSelect } from "xenia/tom-select"
import { createLeaflet } from "xenia/leaflet"
import { createTabulator } from "xenia/tabulator"
import { createFullCalendar } from "xenia/fullcalendar"
import { createXterm } from "xenia/xterm"
import { createMonacoDiff } from "xenia/monaco-diff"
import { createTiptap } from "xenia/tiptap"
import { createUppy } from "xenia/uppy"
import { createWaveSurfer } from "xenia/wavesurfer"
import { createWaveSurferMultitrack } from "xenia/wavesurfer-multitrack"
import { createD3 } from "xenia/d3"

export const flatpickr = createFlatpickr({ load: () => import("flatpickr") })

export const shoelaceRating = createShoelaceRating({
  load: () => import("@shoelace-style/shoelace/dist/components/rating/rating.js"),
})

export const sortablejs = createSortablejs({ load: () => import("sortablejs") })

export const tomSelect = createTomSelect({ load: () => import("tom-select") })

export const leaflet = createLeaflet({ load: () => import("leaflet") })

export const tabulator = createTabulator({ load: () => import("tabulator-tables") })

export const fullcalendar = createFullCalendar({
  load: async () => {
    const [core, dayGrid, timeGrid, list, interaction] = await Promise.all([
      import("@fullcalendar/core"),
      import("@fullcalendar/daygrid"),
      import("@fullcalendar/timegrid"),
      import("@fullcalendar/list"),
      import("@fullcalendar/interaction"),
    ])
    return {
      Calendar: core.Calendar,
      plugins: [dayGrid.default, timeGrid.default, list.default, interaction.default],
    }
  },
})

export const xterm = createXterm({
  load: async () => ({
    ...(await import("@xterm/xterm")),
    ...(await import("@xterm/addon-fit")),
    ...(await import("@xterm/addon-search")),
    ...(await import("@xterm/addon-web-links")),
  }),
})

// The diff editor shares Monaco with the code editor (monaco.js), and its
// web workers.
export const monacoDiff = createMonacoDiff({ load: () => import("monaco-editor") })

export const tiptap = createTiptap({
  load: async () => {
    const [core, starterKit, extensions] = await Promise.all([
      import("@tiptap/core"),
      import("@tiptap/starter-kit"),
      import("@tiptap/extensions"),
    ])
    return {
      Editor: core.Editor,
      StarterKit: starterKit.default,
      CharacterCount: extensions.CharacterCount,
      Placeholder: extensions.Placeholder,
    }
  },
})

export const uppy = createUppy({
  load: async () => {
    const [core, dashboard, xhr, tus] = await Promise.all([
      import("@uppy/core"),
      import("@uppy/dashboard"),
      import("@uppy/xhr-upload"),
      import("@uppy/tus"),
    ])
    return { Uppy: core.default, Dashboard: dashboard.default, XHRUpload: xhr.default, Tus: tus.default }
  },
})

export const wavesurfer = createWaveSurfer({
  load: async () => {
    const [ws, regions, timeline, minimap, hover, spectrogram] = await Promise.all([
      import("wavesurfer.js"),
      import("wavesurfer.js/dist/plugins/regions.esm.js"),
      import("wavesurfer.js/dist/plugins/timeline.esm.js"),
      import("wavesurfer.js/dist/plugins/minimap.esm.js"),
      import("wavesurfer.js/dist/plugins/hover.esm.js"),
      import("wavesurfer.js/dist/plugins/spectrogram.esm.js"),
    ])
    return {
      WaveSurfer: ws.default,
      RegionsPlugin: regions.default,
      TimelinePlugin: timeline.default,
      MinimapPlugin: minimap.default,
      HoverPlugin: hover.default,
      SpectrogramPlugin: spectrogram.default,
    }
  },
})

export const wavesurferMultitrack = createWaveSurferMultitrack({
  load: async () => {
    const [ws, record, spectrogram, multitrack] = await Promise.all([
      import("wavesurfer.js"),
      import("wavesurfer.js/dist/plugins/record.esm.js"),
      import("wavesurfer.js/dist/plugins/spectrogram.esm.js"),
      import("wavesurfer-multitrack"),
    ])
    return {
      WaveSurfer: ws.default,
      RecordPlugin: record.default,
      SpectrogramPlugin: spectrogram.default,
      Multitrack: multitrack.default,
    }
  },
})

export const d3 = createD3({ load: () => import("d3") })
