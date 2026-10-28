# Xenia

![Xenia](guides/images/xenia-banner-light.png#gh-light-mode-only)
![Xenia](guides/images/xenia-banner-dark.png#gh-dark-mode-only)

<p align="center">
  <strong>Keep Phoenix in charge. Let JavaScript do what it does best.</strong><br>
  Xenia is the small, simple adapter between the two.
</p>

Xenia brings JavaScript libraries (charts, code editors, maps, terminals)
into Phoenix LiveView, and lets your folders define your pages.

## Contents

- [What you get](#what-you-get)
- [Why Xenia](#why-xenia)
- [When a plain hook is enough](#when-a-plain-hook-is-enough)
- [How it works](#how-it-works)
- [Start a new app](#start-a-new-app)
- [Quickstart](#quickstart)
- [Writing an adapter](#writing-an-adapter)
- [Official adapters](#official-adapters)
- [More features](#more-features): [forms](#forms), [web components](#web-components), [files](#files), [app-wide values](#app-wide-values), [keyboard shortcuts](#keyboard-shortcuts), [loading and errors](#loading-and-errors), [adapters next to the page](#adapters-next-to-the-page)
- [Pages from folders](#pages-from-folders)
- [Generators](#generators)
- [Configuration and troubleshooting](#configuration-and-troubleshooting)
- [Examples and guides](#examples-and-guides)
- [Developing Xenia](#developing-xenia)
- [Contact](#contact) · [License](#license)

## What you get

**JavaScript in LiveView**
- Any npm library with one small adapter: how it starts, updates and stops.
- 16 official adapters: Monaco, Tiptap, Chart.js, D3, Tabulator, FullCalendar,
  Leaflet, xterm.js, flatpickr, Tom Select, Uppy, wavesurfer.js and more.
- Props from your assigns, events to `handle_event`, replies for search boxes,
  and commands from the server to one component.
- Form fields, app-wide values (theme, locale), keyboard shortcuts, and loading
  and error states, without adapter code.

**Pages from folders** (optional)
- File-based routing: `page.ex` makes a route, `[id]` is a parameter.
- Nested layouts, parts that stay alive between pages, and pages that share one
  LiveView.
- Page titles, social-card tags and a sitemap.

**Everyday work**
- `mix xenia.install` sets up a new Phoenix app; generators write pages,
  layouts and adapters.
- A runnable examples app, and four guides. MIT licensed.

## Why Xenia

*Xenia* (ξενία) is the ancient Greek bond between a host and a guest. Phoenix
is the host: it renders the pages, owns the state and stays in charge. A
JavaScript library is the guest: it gets a place of its own on the page and
does its work there. Xenia is the agreement between them, written once.

The JavaScript community has an excellent library for almost anything a
browser can do. With Xenia you use them without hand-writing a LiveView hook
for each one: Monaco took a 58-line hook by hand, and is 21 lines as an adapter.

## When a plain hook is enough

You don't need Xenia for every piece of JavaScript. A plain `phx-hook` is fine
when the library is simple to wire: a web component that only forwards an
event, or a widget the server never changes after it starts.

Xenia pays off when:
- the server keeps updating the library;
- it loads slowly;
- it's a form field;
- the server sends it commands;
- you have several libraries to wire the same way.

## How it works

```
your LiveView (Elixir)              Xenia                  your adapter (JavaScript)
<.chart data={@sales}      ──►  sends changed props  ──►  props: { data(chart, data) }
        on_click="clicked" />
def handle_event("clicked") ◄──  delivers the event   ◄──  ctx.emit("click", payload)
Xenia.push_to(socket,      ──►  routes it to one     ──►  commands: { highlight(chart, args) }
  "sales", "highlight")         component
```

Xenia also handles cleanup on navigation, libraries that load slowly, and
events sent just before the user leaves a page.

## Start a new app

Xenia needs Elixir 1.15 or later, Phoenix 1.8 and LiveView 1.2.

```bash
mix phx.new my_app && cd my_app
# add {:xenia, "~> 0.1.0"} to the deps in mix.exs
mix deps.get
mix xenia.install
mix phx.server
```

`mix xenia.install` adds a light and dark theme, a layout and home page in the
app folder, Xenia's hooks, and flash messages that stack and close by
themselves. It prints each change, and leaves alone any file you've already
changed.

## Quickstart

A Chart.js chart in an existing Phoenix 1.8 app.

**1. Add Xenia** to `mix.exs` (`{:xenia, "~> 0.1.0"}`), run `mix deps.get`, and
install the library: `npm install chart.js --prefix assets`.

**2. Write the adapter**, `assets/js/chart_adapter.js`:

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

**3. Register it** in `assets/js/app.js`:

```js
import {createHooks} from "xenia"
import {chart} from "./chart_adapter"

// in the LiveSocket options:
hooks: {...colocatedHooks, ...createHooks({Chart: chart})},
```

**4. Declare the tag**, `lib/my_app_web/components/charts.ex`, then add
`import MyAppWeb.Charts` to `html_helpers` in `lib/my_app_web.ex`, and `:xenia`
to `import_deps` in `.formatter.exs`:

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

**5. Use it in a LiveView** (`live "/sales", SalesLive` in your router):

```elixir
def mount(_params, _session, socket), do: {:ok, assign(socket, sales: sales(), clicked: nil)}

def render(assigns) do
  ~H"""
  <.chart id="sales" type="bar" data={@sales} on_click="bar_clicked" style="height: 300px" />
  <p :if={@clicked}>You clicked {@clicked}</p>
  """
end

def handle_event("bar_clicked", %{"label" => label}, socket),
  do: {:noreply, assign(socket, clicked: label)}

defp sales, do: %{labels: ~w(Jan Feb Mar), datasets: [%{label: "Sales", data: [12, 19, 7]}]}
```

Clicking a bar reaches `handle_event`, a new `@sales` updates the same chart,
and HEEx checks the tag's attributes at compile time. Any npm library works the
same way.

## Writing an adapter

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

Only `mount` and `destroy` are required. A prop's handler runs only when its
value changed; a prop without one is assigned to the instance. `el` is yours;
the container around it belongs to LiveView.

| `ctx` | |
|---|---|
| `emit(name, payload)` | send an event; the page names its LiveView event (`on_<name>`) |
| `call(name, payload)` | send an event, get a Promise of the server's `{:reply, map, socket}` |
| `remount()` | rebuild the instance, for settings a library can't change in place |
| `isAlive()` | false once destroyed; check it after your own async work |
| `setFormValue(value)` | write the component's form value ([forms](#forms)) |
| `upload(name, files)` | send files through a LiveView upload ([files](#files)) |
| `id`, `hook` | the component's id; the raw LiveView hook |

**Commands** reach one component: `Xenia.push_to(socket, "sales", "highlight", %{index: 2})`.
Without a declared tag, render the container yourself:
`<.xenia id="sales" adapter="Chart" props={%{data: @sales}} events={%{click: "bar_clicked"}} />`.

The full contract is in [What Xenia owns, what your adapter owns](guides/ownership-boundary.md).

## Official adapters

Install the library in your app and pass it in. Xenia never adds a JavaScript
dependency you don't use.

| Library | Import from | Tag |
|---|---|---|
| Monaco, code and diff editors | `xenia/monaco`, `xenia/monaco-diff` | `<.monaco>`, `<.monaco_diff>` |
| Tiptap, rich text | `xenia/tiptap` | `<.tiptap>` |
| Chart.js, D3 | `xenia/chartjs`, `xenia/d3` | `<.chartjs>`, `<.d3_chart>` |
| Tabulator, data tables | `xenia/tabulator` | `<.tabulator>` |
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
Each tag module (`Xenia.Adapters.Tiptap`, ...) lists its npm packages, `load`
line, CSS, props, events and commands. Monaco needs a few build steps for its
workers: see `Xenia.Adapters.Monaco`.

## More features

### Forms

A component with `field={@form[:code]}` is a form field: submitted with the
form, part of `phx-change`, restored after a reconnect, with errors like
`<.input>`. The official Monaco, Tiptap, flatpickr, Tom Select and Shoelace
rating adapters handle it; your own adapter calls `ctx.setFormValue(value)`.

### Web components

A custom element needs no prop handlers: each prop is set as a property.

### Files

`ctx.upload("recording", [file])` sends files a component produced through a
LiveView upload (`allow_upload` and `<.live_file_input>` on the page).

### App-wide values

Publish a value once, and every adapter with `consumes: ["theme"]` gets it as a
prop: from the browser with `setProvider("theme", value)`, or from the server
with `<Xenia.Provider.provider name="locale" value={@locale} />`.

### Keyboard shortcuts

`shortcuts={%{"mod+s" => "save"}}` sends a LiveView event while the component
has focus. `mod` is Cmd on a Mac and Ctrl elsewhere; browser shortcuts are
refused.

### Loading and errors

```heex
<.monaco id="editor" value={@code} on_crash="editor_crashed">
  <:loading>Loading the editor…</:loading>
  <:error>It broke. <button type="button" data-xenia-retry>Try again</button></:error>
</.monaco>
```

### Adapters next to the page

An adapter only one page uses can live in that page's module, in a LiveView
colocated hook (`adapter={colocated(".Chart")}`), with no change to `app.js`.
See [Wrapping a library](guides/wrapping-a-library.md).

## Pages from folders

Optional: your folders define your routes, like the Next.js App Router.
JavaScript islands work in any LiveView without it.

```elixir
# lib/my_app_web/router.ex
import Xenia.Routes

# inside your browser scope:
live_session :app do
  xenia_routes "lib/my_app_web/app"
end
```

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

- **`page.ex`** is a LiveView with `use Xenia.Page`; its folder is its URL.
- **`[slug]`** is a parameter, **`[...path]`** the rest of the URL, **`(group)`**
  stays out of the URL, **`_private`** is never a route.
- **`layout.ex`** frames the pages below it; its `on_mount:` protects them.
- **`persistent.ex`** keeps its state while users move between those pages.
- **`metadata/1`** sets titles and social tags; `Xenia.Sitemap` serves a sitemap.

It compiles to ordinary `live` routes: `mix phx.routes` and `~p` work as usual.
The guide: [Building pages from folders](guides/app-folder.md).

## Generators

```
mix xenia.gen.component chart data:map --events click   # an adapter and its tag
mix xenia.gen.page reports/sales                        # a page.ex
mix xenia.gen.layout "(auth)" --persistent              # a layout.ex and persistent.ex
```

## Configuration and troubleshooting

- **Custom binding prefix:** if your `LiveSocket` uses one, set the same:
  `config :xenia, binding_prefix: "pop-"`.
- **"Could not resolve "xenia"":** run `mix deps.get`. For a path dependency,
  add the folder that contains the `xenia` checkout to `NODE_PATH` in your
  esbuild config.
- **Changes to a path dependency don't show up:** `mix deps.clean xenia --build`,
  then restart `mix phx.server`.
- **Surface UI:** islands work in `~F` templates. For adapters next to a
  component, use its `.hooks.js` file: see
  [In a Surface app](guides/wrapping-a-library.md#in-a-surface-app).

## Examples and guides

- [Examples](https://github.com/uzaydurdu/xenia/tree/main/examples): a runnable
  Phoenix app, one page per feature, each with a short README.
- [Wrapping any JavaScript library](guides/wrapping-a-library.md)
- [What Xenia owns, what your adapter owns](guides/ownership-boundary.md)
- [Building pages from folders](guides/app-folder.md)
- [Icons, notifications and languages](guides/icons-notifications-languages.md)

## Developing Xenia

```
lib/xenia/core/        the JS-island boundary: <.xenia>, the DSL, providers, shortcuts
lib/xenia/app/         pages from folders: routes, pages, layouts, metadata, sitemap
lib/xenia/adapters/    the official adapters' tags
lib/mix/               mix xenia.install, xenia.routes and the generators
assets/                the JavaScript: core/ and adapters/, prebuilt into priv/static
test/                  the same layout, plus test/js
examples/              the examples app
```

```bash
mix setup   # dependencies, esbuild and the bundles
mix check   # format, compile, bundles, tests, the Hex package and the docs
```

Commit the rebuilt `priv/static` with your change; CI checks it matches the
sources. [CONTRIBUTING.md](https://github.com/uzaydurdu/xenia/blob/main/CONTRIBUTING.md) covers the browser tests and the
rules for changes.

## Contact

Bugs, questions and ideas: GitHub issues. Anything else, including security
problems you'd rather not post publicly:
[uzaydurdu.com](https://www.uzaydurdu.com/).

## License

MIT. Free to use in open-source and commercial projects.
