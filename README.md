# Xenia

![Xenia](guides/images/xenia-banner-light.png#gh-light-mode-only)
![Xenia](guides/images/xenia-banner-dark.png#gh-dark-mode-only)

<p align="center">
  <strong>Keep Phoenix in charge. Let JavaScript do what it does best.</strong><br>
  Xenia is the small, simple adapter between the two.
</p>

Xenia puts any JavaScript library (a chart, a code editor, a map, a
terminal) into Phoenix LiveView as a tag in your templates:

```heex
<.chart id="sales" data={@sales} on_click="bar_clicked" />
```

Your assigns reach the library, its events reach `handle_event`, and the
server can send it commands. No hand-written hooks. Seventeen popular
libraries have ready-made adapters, and any other takes a short one.

[Install](#install) · [Your first island](#your-first-island) ·
[What else it does](#what-else-it-does) · [Official adapters](#official-adapters) ·
[Pages from folders](#pages-from-folders) · [Guides](#guides)

## Install

Xenia needs Elixir 1.15 or later, Phoenix 1.8 and LiveView 1.2. Add it to
the deps in `mix.exs`:

```elixir
{:xenia, "~> 0.2.1"}
```

Then:

```bash
mix deps.get
mix xenia.install                  # in a new app (mix phx.new)
mix xenia.install --islands-only   # or in an existing app
```

The installer adds Xenia's hooks to `app.js` (next to the ones you have),
imports its components, and adds it to the formatter. In a new app it also
adds a light and dark theme, a layout and home page, and flash messages
that close by themselves; `--islands-only` leaves your theme, layout and
routes alone. It prints every change.

## Your first island

A Chart.js chart in three steps. Install the library first:
`npm install chart.js --prefix assets`.

**1. Write the adapter**, `assets/js/chart.js`: how the library starts,
updates and stops.

```js
import Chart from "chart.js/auto"

export const chart = {
  mount(el, props, ctx) {
    const canvas = el.appendChild(document.createElement("canvas"))
    return new Chart(canvas, {
      type: "bar",
      data: props.data,
      options: {
        onClick: (_event, [bar], chart) =>
          bar && ctx.emit("click", { label: chart.data.labels[bar.index] }),
      },
    })
  },
  destroy(chart) { chart.destroy() },
  props: {
    data(chart, data) { chart.data = data; chart.update() },
  },
  events: { click: {} },
}
```

**2. Register it** in `assets/js/app.js`, in the `createHooks({})` the
installer added:

```js
import {chart} from "./chart"

// in the LiveSocket options:
hooks: {...colocatedHooks, ...createHooks({Chart: chart})},
```

**3. Use it in a LiveView.** `component` declares the tag, so HEEx checks
its attributes when it compiles:

```elixir
defmodule MyAppWeb.SalesLive do
  use MyAppWeb, :live_view
  use Xenia.Components

  component :chart, adapter: "Chart" do
    prop :data, :map, required: true
    event :click
  end

  def mount(_params, _session, socket) do
    sales = %{labels: ~w(Jan Feb Mar), datasets: [%{label: "Sales", data: [12, 19, 7]}]}
    {:ok, assign(socket, sales: sales, clicked: nil)}
  end

  def handle_event("bar_clicked", %{"label" => label}, socket),
    do: {:noreply, assign(socket, clicked: label)}

  def render(assigns) do
    ~H"""
    <.chart id="sales" data={@sales} on_click="bar_clicked" style="height: 300px" />
    <p :if={@clicked}>You clicked {@clicked}.</p>
    """
  end
end
```

Add `live "/sales", SalesLive` to your router and open `/sales`. Clicking a
bar runs `handle_event`, and a new `@sales` updates the same chart. Every
npm library works this way.

## What else it does

Each row is a page in the [examples app][examples], with its code and a
short README.

| You want | You write | Example |
|---|---|---|
| A ready-made adapter | `createChartjs({load: () => import("chart.js/auto")})` | [Chart.js][ex-chartjs] |
| The server to tell one island to act | `Xenia.push_to(socket, "sales", "highlight", %{index: 2})` | [Chart][ex-chart] |
| An answer from the server, such as search results | `await ctx.call("search", {query})` | [Tag picker][ex-tom-select] |
| A JavaScript component as a form field | `field={@form[:code]}` | [A form with editors][ex-forms] |
| Islands that follow light and dark mode | `consumes: ["theme"]` | [Theme][ex-theme] |
| Something to show while it loads, or if it breaks | `<:loading>` and `<:error>` | [Loading and errors][ex-loading] |
| Start it only when it scrolls into view | `lazy="visible"` | [Lazy islands][ex-lazy] |
| Keyboard shortcuts while it has focus | `shortcuts={%{"mod+s" => "save"}}` | [Code editor][ex-monaco] |
| Read-only while the connection is down | `consumes: ["connection"]` | [Connection][ex-connection] |
| Thousands of data points | send what changed, as commands | [Large data][ex-large-data] |
| Files from a component, through a LiveView upload | `ctx.upload("photos", files)` | [File uploads][ex-uppy] |
| A web component | nothing: props are set as properties | [Rating][ex-rating] |
| The adapter inside the page that uses it | `adapter={colocated(".Chart")}` | [Island in a page][ex-colocated] |
| TypeScript | `Adapter<Chart, Props, Events>` | [A typed island][ex-typed] |
| Tests for a page with an island | `import Xenia.Test` | [islands_test.exs][ex-tests] |
| Pages and layouts from folders | `page.ex`, `layout.ex`, `[id]/` | [File-based routing][ex-routing] |

To run them all:

```bash
git clone https://github.com/uzaydurdu/xenia && cd xenia/examples
mix setup && mix phx.server   # then open localhost:4000
```

[examples]: https://github.com/uzaydurdu/xenia/tree/main/examples
[ex-chartjs]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/adapters/chartjs
[ex-chart]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/chart
[ex-tom-select]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/adapters/tom-select
[ex-forms]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/forms
[ex-theme]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/theme
[ex-loading]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/loading
[ex-lazy]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/lazy
[ex-monaco]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/adapters/monaco
[ex-connection]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/connection
[ex-large-data]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/large-data
[ex-uppy]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/adapters/uppy
[ex-rating]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/rating
[ex-colocated]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/colocated
[ex-typed]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/typed
[ex-tests]: https://github.com/uzaydurdu/xenia/blob/main/examples/test/xenia_examples_web/islands_test.exs
[ex-routing]: https://github.com/uzaydurdu/xenia/tree/main/examples/lib/xenia_examples_web/app/routing

## Official adapters

Install the library in your app and pass it in. Xenia never adds a
JavaScript dependency you don't use.

| Library | Import from | Tag |
|---|---|---|
| Monaco, code and diff editors | `xenia/monaco`, `xenia/monaco-diff` | `<.monaco>`, `<.monaco_diff>` |
| Tiptap, rich text | `xenia/tiptap` | `<.tiptap>` |
| Chart.js, D3 | `xenia/chartjs`, `xenia/d3` | `<.chartjs>`, `<.d3_chart>` |
| Tabulator, data tables | `xenia/tabulator` | `<.tabulator>` |
| AG Grid Community, data grids | `xenia/ag-grid` | `<.ag_grid>` |
| FullCalendar | `xenia/fullcalendar` | `<.full_calendar>` |
| Leaflet, maps | `xenia/leaflet` | `<.leaflet_map>` |
| xterm.js, terminals | `xenia/xterm` | `<.xterm>` |
| flatpickr, Tom Select, Shoelace rating | `xenia/flatpickr`, `xenia/tom-select`, `xenia/shoelace-rating` | `<.flatpickr>`, `<.tom_select>`, `<.shoelace_rating>` |
| SortableJS, drag and drop | `xenia/sortablejs` | `<.sortable_list>` |
| Uppy, file uploads | `xenia/uppy` | `<.uppy>` |
| wavesurfer.js, audio | `xenia/wavesurfer`, `xenia/wavesurfer-multitrack` | `<.wavesurfer>`, `<.wavesurfer_multitrack>` |

They all work the same way:

```js
// assets/js/app.js
import {createChartjs} from "xenia/chartjs"

const chartjs = createChartjs({load: () => import("chart.js/auto")})
// hooks: {...colocatedHooks, ...createHooks({ChartJS: chartjs})}
```

```heex
<.chartjs id="sales" type="bar" data={@sales} on_point_click="clicked" />
```

Configure one with options (`createChartjs({load, plugins, options})`), and
extend it by spreading: `{...chartjs, commands: {...chartjs.commands, mine() {}}}`.
Each tag module (`Xenia.Adapters.Tiptap`, ...) lists its npm packages,
`load` line, CSS, props, events and commands. Monaco needs a few build
steps for its workers: see `Xenia.Adapters.Monaco`.

## The adapter

```js
{
  mount(el, props, ctx)                        // create the library in `el`; return it (or a Promise)
  destroy(instance, ctx)                       // clean up, synchronously
  props:    { name(instance, value, ctx) {} }, // apply one changed prop
  events:   { name: { debounce: ms } },        // events it can send
  commands: { name(instance, args, ctx) {} },  // things the server can ask it to do
  consumes: ["theme"],                         // app-wide values, received as props
}
```

Only `mount` and `destroy` are required. A prop's handler runs only when
its value changed; a prop without one is assigned to the instance. `el` is
yours; the container around it belongs to LiveView.

| `ctx` | |
|---|---|
| `emit(name, payload)` | send an event; the page names its LiveView event (`on_<name>`) |
| `call(name, payload)` | send an event, get a Promise of the server's `{:reply, map, socket}` |
| `remount()` | rebuild the instance, for settings a library can't change in place |
| `isAlive()` | false once destroyed; check it after your own async work |
| `signal` | an `AbortSignal` aborted at destroy: pass it to `fetch` and to listeners on `document` |
| `setFormValue(value)` | write the component's form value |
| `upload(name, files)` | send files through a LiveView upload |
| `id`, `hook` | the component's id; the raw LiveView hook |

**App-wide values** reach every adapter that `consumes` them.
`mix xenia.install` publishes Phoenix's theme toggle as `"theme"`. Publish
your own from the browser with `setProvider("locale", value)`, or from the
server with `<Xenia.Provider.provider name="locale" value={@locale} />`.

Without a declared tag, render the container yourself:
`<.xenia id="sales" adapter="Chart" props={%{data: @sales}} events={%{click: "bar_clicked"}} />`.
The full contract is in
[What Xenia owns, what your adapter owns](guides/ownership-boundary.md).

## Pages from folders

Optional: your folders define your routes, like the Next.js App Router.
Islands work in any LiveView without it.

```
lib/my_app_web/app/
  layout.ex                   frames every page
  page.ex                     /
  posts/[slug]/page.ex        /posts/:slug
  (auth)/layout.ex            a sign-in check for the pages inside
  (auth)/persistent.ex        a sidebar that stays alive between them
  (auth)/dashboard/page.ex    /dashboard
  settings/live.ex            one LiveView for the pages below
  _components/card.ex         never a route
```

One line in the router, inside a `live_session`, makes the routes:
`xenia_routes "lib/my_app_web/app"` (after `import Xenia.Routes`). They're
ordinary `live` routes, so `mix phx.routes` and `~p` work as usual.
`metadata/1` sets page titles and social tags, and `Xenia.Sitemap` serves
a sitemap. The guide: [Building pages from folders](guides/app-folder.md).

Generators write the files:

```
mix xenia.gen.component chart data:map --events click   # an adapter and its tag
mix xenia.gen.page reports/sales                        # a page.ex
mix xenia.gen.layout "(auth)" --persistent              # a layout.ex and persistent.ex
```

## Why Xenia

*Xenia* (ξενία) is the ancient Greek bond between a host and a guest.
Phoenix is the host: it renders the pages, owns the state and stays in
charge. A JavaScript library is the guest: it gets a place of its own on
the page and does its work there. Xenia is the agreement between them,
written once: Monaco took a 58-line hook by hand, and is 21 lines as an
adapter.

**When a plain hook is enough.** You don't need Xenia for every piece of
JavaScript. A plain `phx-hook` is fine for a web component that only
forwards an event, or a widget the server never changes after it starts.
Xenia pays off when the server keeps updating the library, it loads
slowly, it's a form field, the server sends it commands, or you have
several libraries to wire the same way.

## Code splitting

By default, esbuild puts every library into `app.js`, so every page
downloads all of them. With code splitting, each `load: () => import(...)`
becomes its own file, fetched only when an island needs it. In the
examples app, a page downloads 0.59 MB of JavaScript up front instead of
7.9 MB (production build).

Add this to your esbuild profile's `args` in `config/config.exs`:

```
--splitting --format=esm --chunk-names=chunks/[name]-[hash]
```

and load `app.js` as a module in `root.html.heex`:

```heex
<script defer phx-track-static type="module" src={~p"/assets/js/app.js"}></script>
```

A library an adapter imports at the top of a file
(`import Chart from "chart.js/auto"`) stays in the first download. Using
Monaco? Its workers need a profile of their own: see `Xenia.Adapters.Monaco`.

## Troubleshooting

- **"Could not resolve "xenia"":** run `mix deps.get`. For a path
  dependency, add the folder that contains the `xenia` checkout to
  `NODE_PATH` in your esbuild config.
- **Changes to a path dependency don't show up:** `mix deps.clean xenia --build`,
  then restart `mix phx.server`.
- **A custom binding prefix** in your `LiveSocket`: set the same one,
  `config :xenia, binding_prefix: "pop-"`.
- **Surface UI:** islands work in `~F` templates. For adapters next to a
  component, use its `.hooks.js` file: see
  [In a Surface app](guides/wrapping-a-library.md#in-a-surface-app).

## Guides

- [Wrapping any JavaScript library](guides/wrapping-a-library.md): an
  adapter step by step, then forms, testing, TypeScript and large data
- [What Xenia owns, what your adapter owns](guides/ownership-boundary.md)
- [Building pages from folders](guides/app-folder.md)
- [Icons, notifications and languages](guides/icons-notifications-languages.md)
- [The examples app](https://github.com/uzaydurdu/xenia/tree/main/examples)

## Contributing

```bash
mix setup   # dependencies, esbuild and the bundles
mix check   # format, compile, bundles, tests, the Hex package and the docs
```

[CONTRIBUTING.md](https://github.com/uzaydurdu/xenia/blob/main/CONTRIBUTING.md)
covers where things are, the browser tests and the rules for changes.

## Contact

Bugs, questions and ideas: GitHub issues. Anything else, including security
problems you'd rather not post publicly:
[uzaydurdu.com](https://www.uzaydurdu.com/).

## License

MIT. Free to use in open-source and commercial projects.
