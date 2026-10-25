# Xenia

![Xenia](guides/images/xenia-banner-light.png#gh-light-mode-only)
![Xenia](guides/images/xenia-banner-dark.png#gh-dark-mode-only)

<p align="center">
  <strong>Keep Phoenix in charge. Let JavaScript do what it does best.</strong><br>
  Xenia is the small, simple adapter between the two.
</p>

**Xenia** (ZEE-nee-uh) brings JavaScript libraries into Phoenix LiveView:
charts, code editors, maps, terminals, date pickers, players. You write one
small adapter that says how a library starts, updates and stops. Xenia
handles everything between your LiveView and the browser.

## What you get

**JavaScript in your LiveView, the easy way**
- **Any npm library, one small adapter.** `mount`, `destroy`, and code only
  for the props that need it. No fork, and no waiting for official support.
- **Props, events, calls and commands.** Your assigns flow in as props, and
  only the ones that changed reach the library. Its events arrive in
  `handle_event`, and a call gets the reply back, for search boxes and
  completions. `Xenia.push_to/4` tells one component to act.
- **Typed HEEx tags.** `component :chart, adapter: "Chart"` gives you
  `<.chart>`, checked at compile time like any function component.
- **Form fields.** `<.date_picker field={@form[:due]} />` is submitted with
  the form, runs `phx-change`, comes back after a reconnect, and shows errors
  like `<.input>`.
- **App-wide values.** Publish a value once, from the server or the
  browser: the theme, the locale, the time zone, a feature flag, a user
  preference. Every component that asks for it gets it as an ordinary prop,
  and gets every change.
- **Keyboard shortcuts.** `shortcuts={%{"mod+s" => "save"}}` sends a LiveView
  event while the component has focus.
- **Loading and error states.** `<:loading>` shows while a big library
  downloads; `<:error>` shows if it breaks, with a "Try again" button and an
  `on_crash` event for the server. No adapter code.
- **JavaScript next to the page.** An adapter only one page uses can live in
  that page's module, with no change to `app.js`.
- **Sixteen official adapters you configure and extend.** Code and diff
  editors (Monaco), rich text (Tiptap), charts (Chart.js, D3), data tables
  (Tabulator), calendars, maps, terminals, date pickers, tag pickers,
  sortable lists, file uploads and audio. Install the library, pass it in,
  and add your own commands or events without copying a line of the adapter.

**Pages from folders**
- **File-based routing.** `page.ex` makes a route, `[id]` is a parameter, and
  `(group)` folders stay out of the URL, like the Next.js App Router. Xenia
  generates plain Phoenix `live` routes, so `~p` and `mix phx.routes` work as
  usual.
- **Nested layouts.** A `layout.ex` frames every page in its folder and below.
- **Parts that stay alive.** A `persistent.ex` keeps running while the user
  moves between pages: a sidebar keeps its state, an open editor keeps its
  text and undo history.
- **Pages that share state.** A `live.ex` gives several pages, like the tabs
  of a settings screen, one LiveView.
- **Titles, social cards and a sitemap.** `metadata/1` on pages and layouts
  fills `<title>`, the description and Open Graph tags; `Xenia.Sitemap`
  lists your pages for search engines.

**Made for everyday work**
- **A clean start.** `mix xenia.install` turns a new Phoenix app into a
  Xenia app: a plain light and dark theme in Xenia's colors, a layout, a
  home page from the app folder, and the hooks already wired.
- **Generators:** `mix xenia.gen.component`, `mix xenia.gen.page`,
  `mix xenia.gen.layout`.
- **Clear errors** that name the fix: an unregistered adapter, two pages with
  one URL, a shortcut that belongs to the browser.
- **Icons, notifications and languages**, with Phoenix's own tools: Iconify
  icon sets as Tailwind classes, success and error messages with
  `put_flash/3`, and Gettext translations that reach your JavaScript
  islands as props. See the
  [guide](guides/icons-notifications-languages.md) and the examples.
- **A runnable examples app**, one page per feature, each with a short
  README.
- **Free and open source,** under the MIT license.

## Why Xenia

The JavaScript community is huge, and it has already built an excellent
library for almost anything a browser can do. Phoenix developers shouldn't
have to rebuild that work, or hand-wire a LiveView hook for every library.

I built Xenia to make bringing JavaScript into Phoenix simple. Your app
stays server-rendered Phoenix, with your state on the server. The few parts
that need real browser JavaScript, which Xenia calls **JS islands**, get a
clear and tested home. The JavaScript library keeps doing its browser work;
Xenia standardizes how it talks to your LiveView and when it starts and
stops. You don't learn a new framework: Xenia extends LiveView, and you keep
using the npm packages you already know.

How much it saves, measured on a real integration: the Monaco editor took a
58-line hand-written hook. As a Xenia adapter it is 21 lines plus one line
to register it, and it can also take commands from the server.

## The name and the logo

*Xenia* (ξενία) is the ancient Greek bond between a host and a guest. The
host gives shelter, the guest respects the house, and both know their part.

That's how Xenia works. Phoenix is the host: it renders the page, owns the
state and stays in charge. A JavaScript library is the guest: it gets an
element of its own, and does its work there. Xenia is the agreement between
them, written down and kept.

The logo tells the same story: a purple Elixir crystal and a golden
JavaScript bolt, fitted together into one shape.

## How it works

A JS island has three parts. You write the first two; Xenia is the third:

```
your LiveView (Elixir)              Xenia                  your adapter (JavaScript)
----------------------              -----                  -------------------------
<.chart data={@sales}      ──►  sends changed props  ──►  props: { data(chart, data) }
        on_click="clicked" />
def handle_event("clicked") ◄──  delivers the event   ◄──  ctx.emit("click", payload)
Xenia.push_to(socket,      ──►  routes it to one     ──►  commands: { highlight(chart, args) }
  "sales", "highlight")         component
```

- **Props** flow from your assigns to the library. Only the ones that
  changed are sent.
- **Events** flow from the library to your `handle_event`.
- **Commands** let the server tell one component to do something.

Xenia also takes care of what's easy to get wrong in a hand-written hook:
cleaning up when the user navigates away, a library that loads slowly,
events sent just before a navigation, form fields, and the theme.

## Start a new app

```bash
mix phx.new my_app && cd my_app
# add {:xenia, "~> 0.1.0"} to the deps in mix.exs
mix deps.get
mix xenia.install
mix phx.server
```

`mix xenia.install` replaces Phoenix's welcome page with Xenia's starter:

- a plain light and dark theme in Xenia's purple and gold, with a faint grid
  at the top of the page. Phoenix's theme toggle switches it.
- a layout (header, theme toggle, footer) and a home page, in
  `lib/my_app_web/app/`, where folders are routes
- Xenia's hooks in `app.js`, with the theme published to the components
  that follow it
- better flash messages: a success kind next to info and error, stacked
  newest first, and closing by themselves after 5 seconds with a countdown
  line around their border (errors stay until dismissed)

Each change is printed. A file you already changed is left alone, and the
step is printed for you to do by hand. Running it again changes nothing.

To add Xenia to an app you already have, follow the quickstart below.

## Quickstart: a Chart.js chart in a Phoenix app

About ten minutes, in an app made with `mix phx.new` (Phoenix 1.8,
LiveView 1.2). `MyApp`/`my_app` stand for your app's name. If you ran
`mix xenia.install`, step 4's `createHooks` is already in `app.js`: add
your adapter to it.

**1. Add Xenia** to `mix.exs` and run `mix deps.get`:

```elixir
{:xenia, "~> 0.1.0"}
```

**2. Install the library** in your app's assets:

```bash
npm install chart.js@4.5.1 --save-exact --prefix assets
```

**3. Write an adapter**, `assets/js/chart_adapter.js`. It only says how the
library is created, updated and destroyed:

```js
import Chart from "chart.js/auto"

export const chart = {
  mount(el, props, ctx) {
    const canvas = el.appendChild(document.createElement("canvas"))
    return new Chart(canvas, {
      type: props.type,
      data: props.data,
      options: {
        onClick: (_e, points, chart) =>
          points[0] && ctx.emit("click", { label: chart.data.labels[points[0].index] }),
      },
    })
  },
  destroy(chart) { chart.destroy() },
  props: {
    data(chart, data) { chart.data = data; chart.update() },
    type(_chart, _type, ctx) { ctx.remount() }, // Chart.js can't change type in place
  },
  events: { click: {} },
}
```

**4. Register it** in `assets/js/app.js`. Add Xenia's hooks to the ones
already there; keep the rest of the options as Phoenix generated them:

```js
import {createHooks} from "xenia"
import {chart} from "./chart_adapter"

const liveSocket = new LiveSocket("/live", Socket, {
  longPollFallbackMs: 2500,
  params: {_csrf_token: csrfToken},
  hooks: {...colocatedHooks, ...createHooks({Chart: chart})},
})
```

**5. Declare the tag**, `lib/my_app_web/components/charts.ex`:

```elixir
defmodule MyAppWeb.Charts do
  use Xenia.Components

  component :chart, adapter: "Chart" do
    prop :type, :string, required: true
    prop :data, :map, required: true
    event :click
  end
end
```

Then make it available in every template: in `lib/my_app_web.ex`, inside
`html_helpers`, add `import MyAppWeb.Charts`. In `.formatter.exs`, add
`:xenia` to `import_deps`, so `mix format` keeps the declarations without
parentheses.

**6. Use it in a LiveView**, `lib/my_app_web/live/sales_live.ex`, with
`live "/sales", SalesLive` in your router:

```elixir
defmodule MyAppWeb.SalesLive do
  use MyAppWeb, :live_view

  def mount(_params, _session, socket) do
    {:ok, assign(socket, sales: sales(), clicked: nil)}
  end

  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <button phx-click="refresh" class="btn btn-sm">New data</button>
      <.chart id="sales" type="bar" data={@sales} on_click="bar_clicked" style="height: 300px" />
      <p :if={@clicked}>You clicked {@clicked}</p>
    </Layouts.app>
    """
  end

  def handle_event("bar_clicked", %{"label" => label}, socket),
    do: {:noreply, assign(socket, clicked: label)}

  def handle_event("refresh", _params, socket),
    do: {:noreply, assign(socket, sales: sales())}

  defp sales do
    labels = ~w(Jan Feb Mar Apr May Jun)

    %{
      labels: labels,
      datasets: [%{label: "Sales", data: Enum.map(labels, fn _ -> Enum.random(10..100) end)}]
    }
  end
end
```

With the app folder ([Pages from folders](#pages-from-folders), set up by
`mix xenia.install`), the same LiveView goes in
`lib/my_app_web/app/sales/page.ex` with `use Xenia.Page` after
`use MyAppWeb, :live_view`. Then you need no `live` route, and no
`<Layouts.app>` wrapper: the folder is the route, and your `layout.ex`
frames the page.

Run `mix phx.server` and open `/sales`:
- clicking a bar sends `bar_clicked` to your LiveView
- "New data" updates the same chart in place
- the declared tag is an ordinary function component, so HEEx warns at
  compile time about a missing required prop or a misspelled attribute

A library Xenia has never heard of works the same way. That's the point:
your adapter, your library, no change to Xenia.

**Next:**
- [The examples app](https://github.com/uzaydurdu/xenia/tree/main/examples)
  runs every feature, one page each: adapters written by hand, every
  official adapter, a form full of editors, the theme, and file-based
  routing. Each example has a short README next to its code.
- [Wrapping any JavaScript library](guides/wrapping-a-library.md) builds an
  adapter step by step, including a date picker that is a form field.
- [What Xenia owns, what your adapter owns](guides/ownership-boundary.md) is
  the full contract: every guarantee about mount, props, destroy, events and
  commands.
- [Building pages from folders](guides/app-folder.md): routes, layouts and
  persistent parts from an app folder.
- [Icons, notifications and languages](guides/icons-notifications-languages.md):
  Iconify icons, success and error messages, and English and German with
  Gettext, in your islands too.

## The adapter

```js
{
  mount(el, props, ctx)       // create the library inside `el`; return the instance (or a Promise of it)
  destroy(instance, ctx)      // clean up, synchronously
  props:    { name(instance, value, ctx) {} },  // apply one changed prop
  events:   { name: { debounce: ms } },         // events this component can send
  commands: { name(instance, args, ctx) {} },   // things the server can ask it to do
  consumes: ["theme"],                          // app-wide values, received as props
}
```

Only `mount` and `destroy` are required. Xenia compares the props on every
render, and calls a prop's handler only when its value changed. A prop
without a handler is assigned to the instance (`instance[name] = value`),
which is all a web component needs.

`el` is an empty element Xenia creates inside the LiveView container, and it
is yours: put the library's DOM there. The container itself belongs to
LiveView.

`ctx`, one per instance:

| | |
|---|---|
| `ctx.emit(name, payload)` | send an event; the page decides which LiveView event it becomes (`on_<name>`) |
| `ctx.call(name, payload)` | send an event and get the server's reply: a Promise of what `handle_event` returns as `{:reply, map, socket}` |
| `ctx.remount()` | rebuild the instance with the latest props, for libraries that can't change a setting in place |
| `ctx.isAlive()` | false once destroyed; check it after your own async work |
| `ctx.id` | the component's id, for naming global resources |
| `ctx.setFormValue(value)` | see [Components in forms](#components-in-forms) |
| `ctx.upload(name, files)` | see [Sending files](#sending-files-to-the-server) |
| `ctx.hook` | the raw LiveView hook, if you need something Xenia doesn't offer |

**Events** go to the LiveView event named by the `on_<name>` attribute
(`on_click="bar_clicked"`). Unbound events are dropped. A chatty event can be
debounced: `events: { change: { debounce: 300 } }`. Pending events are still
sent when the user navigates away.

**Calls** are events that get an answer, for libraries that ask for data:
a search box asking for matches, an editor asking for completions, a
calendar asking for a month of events. Declare and bind them like events;
the server replies in the usual Phoenix way:

```js
// In the adapter: Tom Select asks for results, and gets that query's reply.
load: (query, callback) =>
  ctx.call("search", { query }).then((reply) => callback(reply.options), () => callback()),
```

```elixir
def handle_event("search_countries", %{"query" => query}, socket) do
  {:reply, %{options: Countries.search(query)}, socket}
end
```

Each reply belongs to its own call, so a slow answer can't fill in the
results of a newer query. Pending events are sent before a call, and calls
aren't debounced. A call rejects if the page didn't bind it, or if
LiveView can't deliver it; after awaiting one, check `ctx.isAlive()` before
using the reply.

**Commands** go from the server to one component, by id:

```elixir
socket |> Xenia.push_to("sales", "highlight", %{index: 2})
```

```js
commands: {
  highlight(chart, { index }) { chart.setActiveElements([{ datasetIndex: 0, index }]); chart.update() },
}
```

**Without a declared tag**, render the container yourself
(`import Xenia.Component`): `<.xenia id="sales" adapter="Chart"
props={%{type: "bar", data: @sales}} events={%{click: "bar_clicked"}} />`.
Other attributes (`class`, `style`, `aria-*`, `phx-click`) pass through to
the container. `id`, `phx-hook`, `phx-update` and `data-xenia-*` belong to
Xenia, and passing them raises.

If a component's adapter was never registered, the browser console says so,
naming the element and the line to add to `createHooks`.

### An adapter only one page uses

It can live in the page's module, in a LiveView colocated hook, with no
change to `app.js`:

```heex
<.xenia id="sales" adapter={colocated(".Chart")} props={%{values: @values}} />

<script :type={Phoenix.LiveView.ColocatedHook} name=".Chart">
  import Chart from "chart.js/auto"
  import { adapterHook } from "xenia"
  export default adapterHook({ mount(el, props) { /* ... */ }, destroy(chart) { chart.destroy() } })
</script>
```

`colocated(".Chart")` resolves to this module's hook, so two pages can each
have a `.Chart`. See
[Wrapping a library](guides/wrapping-a-library.md#an-adapter-only-one-page-uses-keep-it-in-the-page).

### Keyboard shortcuts

Give any component `shortcuts`, and the keys send LiveView events while
focus is inside it:

```heex
<.monaco id="editor" value={@code} shortcuts={%{"mod+s" => "save", "mod+shift+." => "bigger"}} />
```

```elixir
def handle_event("save", %{"shortcut" => "mod+s"}, socket), do: ...
```

`mod` is Cmd on a Mac and Ctrl elsewhere. The library and the browser don't
act on a matched shortcut, and the component's pending events are sent
first, so a save right after typing sees the last change. Browser shortcuts
such as zoom (`mod+=`) or closing a tab (`mod+w`) can't be used: Xenia
raises an error. See `Xenia.Shortcuts`.

### Loading and errors

Every tag takes two slots, and neither needs adapter code:

```heex
<.monaco id="editor" value={@code} on_crash="editor_crashed" style="height: 400px">
  <:loading>Loading the editor…</:loading>
  <:error>
    The editor couldn't start.
    <button type="button" data-xenia-retry>Try again</button>
  </:error>
</.monaco>
```

- **`<:loading>`** is rendered by the server, so it shows from the first
  paint, and stays until the island has loaded. Give the island a height,
  and the placeholder fills it. The island underneath is still sized while
  it loads, so libraries that measure themselves work.
- **`<:error>`** shows instead of the island if its adapter throws: while
  loading, in a prop update, in a command or in a remount.
- **`data-xenia-retry`** on any element inside it starts the island again.
- **`on_crash`** sends a LiveView event with
  `%{"id" => id, "phase" => phase, "message" => message}`.

A component removed by a navigation is not a crash.

## Official adapters

Xenia ships ready-made adapters for popular libraries. You install the
library in your app and pass it in, so Xenia never adds a JavaScript
dependency you don't use. Each one has its own entry point and its own tag:

| Library | Import from | Tag | Form field |
|---|---|---|---|
| Monaco (code editor) | `xenia/monaco` | `<.monaco>` | yes |
| Monaco (diff editor) | `xenia/monaco-diff` | `<.monaco_diff>` | yes |
| Tiptap (rich text) | `xenia/tiptap` | `<.tiptap>` | yes |
| Chart.js | `xenia/chartjs` | `<.chartjs>` | |
| D3 (bar, line, pie, your own) | `xenia/d3` | `<.d3_chart>` | |
| Tabulator (data table) | `xenia/tabulator` | `<.tabulator>` | |
| FullCalendar | `xenia/fullcalendar` | `<.full_calendar>` | |
| Leaflet (map) | `xenia/leaflet` | `<.leaflet_map>` | |
| xterm.js (terminal) | `xenia/xterm` | `<.xterm>` | |
| flatpickr (date picker) | `xenia/flatpickr` | `<.flatpickr>` | yes |
| Tom Select (select, tags) | `xenia/tom-select` | `<.tom_select>` | yes |
| Shoelace rating | `xenia/shoelace-rating` | `<.shoelace_rating>` | yes |
| SortableJS (drag and drop) | `xenia/sortablejs` | `<.sortable_list>` | |
| Uppy (file uploads) | `xenia/uppy` | `<.uppy>` | |
| wavesurfer.js (audio) | `xenia/wavesurfer` | `<.wavesurfer>` | |
| wavesurfer multitrack | `xenia/wavesurfer-multitrack` | `<.wavesurfer_multitrack>` | |

They all work the same way, shown here with Chart.js. Each tag module's
docs (`Xenia.Adapters.Tiptap`, `Xenia.Adapters.Tabulator`, ...) list the npm packages, the
`load` line, the CSS to import, and every prop, event and command.

### Chart.js

```bash
npm install chart.js --prefix assets
```

```js
// assets/js/app.js
import {createChartjs} from "xenia/chartjs"

const chartjs = createChartjs({load: () => import("chart.js/auto")})

hooks: {...colocatedHooks, ...createHooks({ChartJS: chartjs})},
```

With `import Xenia.Adapters.Chartjs` in `html_helpers`:

```heex
<.chartjs id="sales" type="bar" data={@sales} on_point_click="clicked" style="height: 300px" />
```

`data` and `options` are Chart.js's own, so every chart type and option
works. The chart follows your app's theme. Events: `point_click`,
`legend_click`, `hover`, `error`. Commands: `highlight`, `clear_highlight`,
`toggle_dataset`, `reset`, `download_image`.

**Configure it** once for your whole app. Chart.js is loaded once, and each
plugin is registered once, however many charts you have:

```js
const chartjs = createChartjs({
  load: () => import("chart.js/auto"),
  plugins: [zoomPlugin],                  // any Chart.js plugin
  options: {animation: false},            // defaults; a chart's own options win
  palette: {light: [...], dark: [...]},   // dataset colors
  setup: (chart) => chart.canvas.setAttribute("aria-label", "Sales chart"),
})
```

**Extend it** without copying it. The adapter is a plain object, so spread
it and add what you need:

```js
export const salesChart = {
  ...chartjs,
  commands: {
    ...chartjs.commands,
    zoom_out(instance) { instance.chart.resetZoom() },
  },
}
```

The examples app's [Chart.js page](https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/adapters/chartjs)
does all three, and it has a page for every other official adapter.

**Libraries made of several packages** (Tiptap, FullCalendar, Uppy, xterm,
wavesurfer) take an object with the parts the adapter uses, so you choose
which extensions or plugins to bundle:

```js
import {createTiptap} from "xenia/tiptap"

const tiptap = createTiptap({
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
```

## Monaco

Xenia ships a Monaco adapter and a `<.monaco>` tag. Monaco is the heaviest
library to set up, so here is all of it.

**1. Install it:** `npm install monaco-editor@0.57.0 --save-exact --prefix assets`

**2. Create the adapter** in `assets/js/monaco.js`. Monaco finds its web
workers with `new URL(..., import.meta.url)`, which esbuild doesn't bundle,
so tell it where they are. The `import("monaco-editor")` is written here, in
your app, so esbuild finds it in your `assets/node_modules`:

```js
import {createMonaco} from "xenia/monaco"

const WORKERS = {
  json: "json", css: "css", scss: "css", less: "css",
  html: "html", handlebars: "html", razor: "html",
  typescript: "ts", javascript: "ts",
}

self.MonacoEnvironment = {
  getWorker: (_id, label) => new Worker(`/assets/js/monaco/${WORKERS[label] ?? "editor"}.worker.js`),
}

export const monaco = createMonaco({load: () => import("monaco-editor")})
```

Register it next to your other adapters: `import {monaco} from "./monaco"`
and `createHooks({Chart: chart, Monaco: monaco})`. To add completion
providers or commands, pass `setup: (monaco, editor) => disposable` to
`createMonaco`.

**3. Build the workers** in `config/config.exs`: give `app.js` an entry name,
add the five worker files, and a loader for Monaco's icon font:

```elixir
config :esbuild,
  my_app: [
    args: ~w(app=js/app.js
             monaco/editor.worker=node_modules/monaco-editor/esm/vs/editor/editor.worker.js
             monaco/json.worker=node_modules/monaco-editor/esm/vs/language/json/json.worker.js
             monaco/css.worker=node_modules/monaco-editor/esm/vs/language/css/css.worker.js
             monaco/html.worker=node_modules/monaco-editor/esm/vs/language/html/html.worker.js
             monaco/ts.worker=node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js
             --bundle --target=es2022 --outdir=../priv/static/assets/js
             --external:/fonts/* --external:/images/* --alias:@=. --loader:.ttf=file),
    # cd and env as Phoenix generated them
  ]
```

Restart `mix phx.server` after changing `config.exs`.

**4. Load Monaco's CSS.** esbuild writes the CSS Monaco imports next to
`app.js`. Add a second stylesheet to `root.html.heex`:

```heex
<link phx-track-static rel="stylesheet" href={~p"/assets/js/app.css"} />
```

**5. Use it** (`import Xenia.Adapters.Monaco` in `html_helpers`):

```heex
<.monaco id="editor" value={@code} version={@version} language="elixir"
         on_change="code_changed" style="height: 400px" />
```

```elixir
def handle_event("code_changed", %{"value" => code, "version" => version}, socket) do
  {:noreply, assign(socket, code: code, version: version)}
end
```

Echo the client's `version` back from your change handler: that's how the
editor tells your echo of its own typing apart from a real update. Pass
`version={nil}` for an authoritative update. To force the server's value onto
the editor, for example after rejecting an edit, increment `revision`.
Commands: `Xenia.push_to(socket, "editor", "focus")`, and
`"insert"` with `%{text: "..."}`.

The editor follows your app's theme ([App-wide values](#app-wide-values-theme-locale)):
light → `vs`, dark → `vs-dark`. Bring your own themes with `themes`, a name
or a full theme map per app theme, or pin one with `theme`:

```heex
<.monaco id="editor" themes={%{dark: %{name: "midnight", base: "vs-dark",
                                       colors: %{"editor.background" => "#0b1020"}}}} />
```

Monaco themes are global, so the last one applied wins for every editor.

## Components in forms

Give a component a form field, and it is submitted with the form, fires the
form's `phx-change`, and comes back after a reconnect like any input:

```heex
<.form for={@form} phx-change="validate" phx-submit="save">
  <.input field={@form[:title]} />
  <.monaco field={@form[:code]} language="elixir" />
  <.rating field={@form[:rating]} />
</.form>
```

The field gives the component its id, its input name and its value. `<.xenia>`
takes `field` too. A declared component opts in by naming the prop that
carries its value:

```elixir
component :rating, adapter: "Rating", form_value: :value do
  prop :value, :any, default: 0
end
```

Xenia renders an invisible input inside the component, so errors appear only
once the user has used the field, as with `<.input>`. Your adapter keeps the
input equal to what the component shows:

```js
// The user changed it: write the value and fire the form's phx-change.
node.addEventListener("sl-change", () => ctx.setFormValue(node.value))

props: {
  // The server changed it: write it quietly, the server already knows.
  value(node, value, ctx) {
    node.value = Number(value) // form values arrive as strings ("4")
    ctx.setFormValue(node.value, { notify: false })
  },
},
```

Outside a form, `ctx.setFormValue` does nothing, so one adapter works in both
places. Monaco's adapter does all of this already.

## Web components

A custom element is already most of an adapter: each prop is set as a
property, so no prop handlers are needed. For example, Shoelace's rating:

```js
import "@shoelace-style/shoelace/dist/components/rating/rating.js"

export const rating = {
  mount(el, props, ctx) {
    const node = Object.assign(document.createElement("sl-rating"), props)
    node.addEventListener("sl-change", () => ctx.emit("change", { value: node.value }))
    return el.appendChild(node)
  },
  destroy(node) { node.remove() },
  events: { change: {} },
}
```

## Sending files to the server

Events carry JSON. To send a file a component produced (a recording, a
drawing), use `ctx.upload("recording", [file])`. It goes through LiveView's
upload channel, so the page needs a matching `allow_upload` and a
`<.live_file_input>`. It returns `false` and logs the reason if the upload
can't start.

## App-wide values: theme, locale

Some values belong to the whole app, not one component. Publish them once,
and every adapter that asks for them gets them as an ordinary prop:

```js
export const chart = {
  consumes: ["theme"],
  mount(el, props) { /* props.theme is already here */ },
  props: {
    theme(chart, theme) { /* you decide what "dark" means to your library */ },
  },
  // ...
}
```

Publish from the browser, e.g. Phoenix 1.8's theme toggle, which keeps
`<html data-theme>` at "light" or "dark". In `app.js`, before
`liveSocket.connect()`, so components get the value at mount:

```js
import {setProvider} from "xenia"

const publishTheme = () => setProvider("theme", document.documentElement.dataset.theme)
publishTheme()
new MutationObserver(publishTheme)
  .observe(document.documentElement, {attributes: true, attributeFilter: ["data-theme"]})
```

Or from the server, in your layout, so every page publishes its own value:

```heex
<Xenia.Provider.provider name="locale" value={@locale} />
```

Use one source per name. An explicit prop wins over the published value:
`<.chart theme="light">` stays light in dark mode. Other JavaScript can read
the same values with `readProvider("theme")` and
`subscribeProvider("theme", fn)`.

## Pages from folders

Optional, but it's how most Xenia apps are built: **your folders are your
routes.** Put a `page.ex` in a folder, and the folder's path is its URL, like
the Next.js App Router. `mix xenia.install` sets this up in a new app.

**1. Add one line to the router.** It makes a route for every page in the
folder:

```elixir
# lib/my_app_web/router.ex
import Xenia.Routes

scope "/", MyAppWeb do
  pipe_through :browser

  live_session :app do
    xenia_routes "lib/my_app_web/app"
  end
end
```

**2. Make folders.** Each folder's name says what it is:

```
lib/my_app_web/app/
  layout.ex                   frames every page
  page.ex                     /
  posts/[slug]/page.ex        /posts/:slug
  docs/[...path]/page.ex      /docs/*path
  (auth)/layout.ex            a frame and a sign-in check, for the pages inside
  (auth)/persistent.ex        a sidebar that stays alive across those pages
  (auth)/dashboard/page.ex    /dashboard
  settings/live.ex            one LiveView for the pages below
  settings/profile/page.ex    /settings/profile
  _components/card.ex         never a route
```

| In the folder | What it means |
|---|---|
| `posts/` | A fixed part of the URL. |
| `[slug]/` | A parameter. The page gets `params["slug"]`. |
| `[...path]/` | The rest of the URL, as a list: `/docs/a/b` gives `params["path"] == ["a", "b"]`. It also matches `/docs`, with `[]`. |
| `(auth)/` | A group. It isn't in the URL; its `layout.ex` applies only to the pages inside it. |
| `_components/` | A private folder. Never a route; for code your pages share. |
| `page.ex` | The page for its folder's URL. |
| `layout.ex` | A frame around every page in its folder and below. Layouts nest. |
| `persistent.ex` | Next to a `layout.ex`: a LiveView that stays alive while the user moves between that layout's pages, like a sidebar or a music player. |
| `live.ex` | One LiveView for every page below it, so they share state, like the tabs of a settings screen. |

**3. Write the page.** A page is an ordinary LiveView with `use Xenia.Page`:

```elixir
# lib/my_app_web/app/posts/[slug]/page.ex
defmodule MyAppWeb.App.Posts.SlugPage do
  use MyAppWeb, :live_view
  use Xenia.Page

  def mount(%{"slug" => slug}, _session, socket) do
    {:ok, assign(socket, post: Blog.get_post!(slug))}
  end

  def render(assigns) do
    ~H"""
    <h1>{@post.title}</h1>
    """
  end
end
```

**4. Frame pages with a layout.** A layout draws `@inner_content` (the
page) wherever it wants it. Its `on_mount:` runs before any page below it
mounts, so this is where a group gets its sign-in check. The folder name
`(auth)` grants nothing by itself.

```elixir
# lib/my_app_web/app/(auth)/layout.ex
defmodule MyAppWeb.App.AuthLayout do
  use MyAppWeb, :html
  use Xenia.Layout, on_mount: {MyAppWeb.UserAuth, :require_authenticated}

  def frame(assigns) do
    ~H"""
    <div class="flex">
      <aside>{@persistent}</aside>
      <main>{@inner_content}</main>
    </div>
    """
  end
end
```

**Everything generated is plain Phoenix.** `mix phx.routes` lists the
routes, `~p"/posts/hello"` checks links at compile time, and
`mix xenia.routes` also shows each page's layouts. Adding, renaming or
deleting a page updates the routes without restarting the server, and two
pages with the same URL are a compile error that names both files.
`mix xenia.gen.page "posts/[slug]"` and `mix xenia.gen.layout "(auth)"`
write these files for you.

**Titles and social cards.** A page and its layouts can define
`metadata/1`. Xenia merges them, layouts first, and the page's title goes
through the nearest layout's `title_template`:

```elixir
# app/layout.ex
def metadata(_assigns), do: %{title: "Acme", title_template: "%s · Acme", description: "Rockets."}

# app/posts/[slug]/page.ex: computed after mount, so it can use the post
def metadata(assigns), do: %{title: assigns.post.title, description: assigns.post.summary}
```

`<Xenia.Metadata.tags metadata={assigns[:xenia_metadata]} />` in
`root.html.heex` renders the description, canonical URL, robots, and Open
Graph and Twitter tags. The title becomes `@page_title`, so the browser tab
follows live navigation. `mix xenia.install` sets this up.

**A sitemap.** One route lists every page in the folder:

```elixir
get "/sitemap.xml", Xenia.Sitemap, []   # outside the :browser pipeline
```

Pages without parameters are listed. A page with parameters is listed for
the values its `sitemap/0` returns (`def sitemap, do: [%{slug: "hello"}]`),
and `use Xenia.Layout, sitemap: false` leaves out every page below a layout,
such as a signed-in area.

See it working in the examples app's
[File-based routing](https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/routing)
example. The guide, [Building pages from folders](guides/app-folder.md),
covers persistent parts, `live.ex`, metadata, the sitemap and navigation in
detail.

## Generators

```
mix xenia.gen.component chart data:map --events click   # adapter + tag; prints the app.js line
mix xenia.gen.component chart data:map --colocated      # prints a version to paste into a page
mix xenia.gen.layout "(auth)" --persistent              # layout.ex + persistent.ex in the app folder
mix xenia.gen.page reports/sales                        # page.ex in the app folder
```

The component's adapter works right away, showing the props it receives,
until you replace it with your library. `mix help xenia.gen.component` and
the others list their options.

## Configuration

**Binding prefix.** If your `LiveSocket` uses a custom `bindingPrefix`,
configure the same prefix for Xenia:

```elixir
config :xenia, binding_prefix: "pop-"
```

**Xenia as a path dependency** (`{:xenia, path: "../xenia"}`). Mix creates no
`deps/xenia` for a path dependency, so `import ... from "xenia"` can't be
found. Add the folder that **contains** the `xenia` checkout to `NODE_PATH`
in your esbuild config, for example when the two projects are siblings:

```elixir
env: %{"NODE_PATH" => [Path.expand("../deps", __DIR__), Mix.Project.build_path(), Path.expand("../..", __DIR__)]}
```

## Troubleshooting

**"Could not resolve "xenia"".** Run `mix deps.get`. With a path dependency,
see the `NODE_PATH` note above.

**"You must restart your server after changing configuration files".**
Restart `mix phx.server` after editing `config.exs`, such as the esbuild
arguments.

**Changes to a path dependency don't show up.** If the app still sees an old
`xenia` build, clear its cached copy: `mix deps.clean xenia --build`, then
restart.

## Examples

[`examples/`](https://github.com/uzaydurdu/xenia/tree/main/examples) is a
small Phoenix app with one page per feature. Run it with `cd examples`,
`mix setup` and `mix phx.server`.

## Developing Xenia

The JavaScript ships prebuilt in `priv/static`: `xenia.esm.js` for `"xenia"`,
and one `xenia-<name>.esm.js` per official adapter (`"xenia/monaco"`,
`"xenia/tiptap"`, ...). Apps never build it.

Where things are:

```
lib/xenia.ex           Xenia.push_to/4
lib/xenia/core/        the JS-island boundary: <.xenia>, the component DSL, providers, shortcuts
lib/xenia/app/         pages from folders: routes, pages, layouts, metadata, sitemap
lib/xenia/adapters/    the official adapters' tags (Xenia.Adapters.Monaco, ...)
lib/mix/               mix xenia.install, xenia.routes and the generators
assets/core/           the JavaScript core: createHooks, the controller, providers
assets/adapters/       the official adapters' JavaScript
test/                  the same layout, plus test/js for the JavaScript
examples/              a runnable Phoenix app, one page per feature
```

To work on Xenia itself:

```bash
mix setup   # deps, esbuild, the bundles, npm packages for the JS tests
mix check   # format, compile, bundles, Elixir and JS tests, the Hex package
```

Commit the rebuilt `priv/static` with your change. CI fails if it differs
from the sources.

## Contact

Xenia is made by Uzay Durdu. Bugs, questions and ideas are welcome as
GitHub issues. For anything else, including a security problem you'd
rather not post publicly, use the contact page on
[uzaydurdu.com](https://www.uzaydurdu.com/).

## License

MIT. Xenia is free to use, in open-source and commercial projects alike.
