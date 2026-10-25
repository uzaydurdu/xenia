// If you want to use Phoenix channels, run `mix help phx.gen.channel`
// to get started and then uncomment the line below.
// import "./user_socket.js"

// You can include dependencies in two ways.
//
// The simplest option is to put them in assets/vendor and
// import them using relative paths:
//
//     import "../vendor/some-package.js"
//
// Alternatively, you can `npm install some-package --prefix assets` and import
// them using a path starting with the package name:
//
//     import "some-package"
//
// If you have dependencies that try to import CSS, esbuild will generate a separate `app.css` file.
// To load it, simply add a second `<link>` to your `root.html.heex` file.

// Include phoenix_html to handle method=PUT/DELETE in forms and buttons.
import "phoenix_html"
// Establish Phoenix Socket and LiveView configuration.
import {Socket} from "phoenix"
import {LiveSocket} from "phoenix_live_view"
import {hooks as colocatedHooks} from "phoenix-colocated/xenia_examples"
import topbar from "../vendor/topbar"

// Xenia: the islands this app uses everywhere. An island used by one page
// only can live in that page instead (see app/colocated).
import {createHooks, setProvider} from "xenia"
import {chart} from "./islands/chart"
import {datePicker} from "./islands/date_picker"
import {rating} from "./islands/rating"
import {monaco} from "./islands/monaco"
import {slow} from "./islands/slow"
import {stepper} from "./islands/stepper"
import {toggles} from "./islands/toggles"
// Xenia's official Chart.js adapter, configured and extended (islands/chartjs.js).
import {chartjs, revenueChart} from "./islands/chartjs"
// Every other official adapter, set up in one place (islands/official.js).
import * as official from "./islands/official"

// The app's theme, for every island that asks for it (consumes: ["theme"]).
// Phoenix's theme toggle keeps <html data-theme> at "light" or "dark".
const publishTheme = () =>
  setProvider("theme", document.documentElement.dataset.theme ?? "light")

publishTheme()
new MutationObserver(publishTheme)
  .observe(document.documentElement, {attributes: true, attributeFilter: ["data-theme"]})

// The language, for Gettext on the server (XeniaExamplesWeb.Locale). It's a
// cookie, so the first page load (an HTTP request) sees it too. The params
// below are read on every LiveView join, live navigation included.
const currentLocale = () => document.cookie.match(/(?:^|; )locale=(\w+)/)?.[1]

window.addEventListener("phx:locale", ({detail: {locale}}) => {
  document.cookie = `locale=${locale}; path=/; max-age=31536000; SameSite=Lax`
})

const csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content")
const liveSocket = new LiveSocket("/live", Socket, {
  longPollFallbackMs: 2500,
  params: () => ({_csrf_token: csrfToken, locale: currentLocale()}),
  hooks: {
    ...colocatedHooks,
    ...createHooks({
      Chart: chart,
      DatePicker: datePicker,
      Rating: rating,
      Monaco: monaco,
      Slow: slow,
      Stepper: stepper,
      Toggles: toggles,
      ChartJS: chartjs,
      RevenueChart: revenueChart,
      Flatpickr: official.flatpickr,
      ShoelaceRating: official.shoelaceRating,
      SortableJS: official.sortablejs,
      TomSelect: official.tomSelect,
      Leaflet: official.leaflet,
      Tabulator: official.tabulator,
      FullCalendar: official.fullcalendar,
      Xterm: official.xterm,
      MonacoDiff: official.monacoDiff,
      Tiptap: official.tiptap,
      Uppy: official.uppy,
      WaveSurfer: official.wavesurfer,
      WaveSurferMultitrack: official.wavesurferMultitrack,
      D3: official.d3,
    }),
  },
})

// Show progress bar on live navigation and form submits
topbar.config({barColors: {0: "#29d"}, shadowColor: "rgba(0, 0, 0, .3)"})
window.addEventListener("phx:page-loading-start", _info => topbar.show(300))
window.addEventListener("phx:page-loading-stop", _info => topbar.hide())

// connect if there are any LiveViews on the page
liveSocket.connect()

// expose liveSocket on window for web console debug logs and latency simulation:
// >> liveSocket.enableDebug()
// >> liveSocket.enableLatencySim(1000)  // enabled for duration of browser session
// >> liveSocket.disableLatencySim()
window.liveSocket = liveSocket

// The lines below enable quality of life phoenix_live_reload
// development features:
//
//     1. stream server logs to the browser console
//     2. click on elements to jump to their definitions in your code editor
//
if (process.env.NODE_ENV === "development") {
  window.addEventListener("phx:live_reload:attached", ({detail: reloader}) => {
    // Enable server log streaming to client.
    // Disable with reloader.disableServerLogs()
    reloader.enableServerLogs()

    // Open configured PLUG_EDITOR at file:line of the clicked element's HEEx component
    //
    //   * click with "c" key pressed to open at caller location
    //   * click with "d" key pressed to open at function component definition location
    let keyDown
    window.addEventListener("keydown", e => keyDown = e.key)
    window.addEventListener("keyup", _e => keyDown = null)
    window.addEventListener("click", e => {
      if(keyDown === "c"){
        e.preventDefault()
        e.stopImmediatePropagation()
        reloader.openEditorAtCaller(e.target)
      } else if(keyDown === "d"){
        e.preventDefault()
        e.stopImmediatePropagation()
        reloader.openEditorAtDef(e.target)
      }
    }, true)

    window.liveReloader = reloader
  })
}

