# Changelog

## Unreleased

- **An official adapter for AG Grid Community** (MIT), the 17th:
  `createAgGrid` from `"xenia/ag-grid"` and the `<.ag_grid>` tag
  (`Xenia.Adapters.AgGrid`). AG Grid's own `column_defs` in snake_case,
  rows matched by id (`row_id`) so a new `row_data` updates only the rows
  that changed and keeps selection, sorting and filters; selection,
  pagination, a quick filter, a filter model and a sort from the server,
  none of them reported back as the user's; events for edits, clicks,
  selection, sorting and filtering; commands for transactions (large data),
  selecting rows, scrolling to a row, filters, CSV export, column sizing
  and reverting an edit. It follows the app's theme. Functions (value
  formatters and the like) live in the factory's `options.columnTypes`,
  and columns name them with `type`. Built and tested with AG Grid
  Community 36 only, not Enterprise. Example: `/adapters/ag-grid`.

## 0.2.0 (2026-11-01)

- **Large data, measured and documented:** a prop is sent again whole when
  it changes, and Xenia sends all of a component's props as one attribute.
  For a 10,000-point chart, a new point is 109 KB as a prop and 99 bytes as
  a command. The guide's "Large data" shows the pattern (the adapter asks
  with `ready`, the server sends the data once, then only changes), and the
  examples app's `/large-data` compares both ways, from 100 to 10,000
  points, with the script that measured them. Xenia's own share in the
  browser is small (under half a millisecond to parse and compare those
  props); the library's redraw is the cost.
- **TypeScript declarations:** `Adapter<Instance, Props, Events, Commands>`
  types any adapter, for any library: a typed `ctx` (`emit` and `call` only
  take declared events and their payloads), props, commands and the
  library's own instance type. Use it from a `.ts` file, which Phoenix's
  esbuild compiles as it is, or from JavaScript with
  `/** @type {import("xenia").Adapter<...>} */`. The 16 official adapters
  come typed (factory options, props, events, commands), and so do
  `createHooks`, `adapterHook` and the provider functions. The guide's
  "Typed adapters" has the `tsconfig.json` setup; example: `/typed`. Checked
  with TypeScript 5.9 and 7.0.
- **`mix xenia.install` sets up the TypeScript paths:** in
  `assets/tsconfig.json`, next to Phoenix's `"*": ["../deps/*"]`, two
  entries that point `"xenia"` and `"xenia/<adapter>"` at Xenia's types
  (Phoenix's alone doesn't find `"xenia/chartjs"`). Also with
  `--islands-only`. A tsconfig it doesn't recognize gets the lines printed;
  an app without one is left alone.
- **`ctx.signal`:** an `AbortSignal` for each island instance, aborted when
  it's destroyed or replaced, or its mount fails. Pass it to `fetch` and to
  listeners on `document` or `window`
  (`addEventListener("keydown", fn, { signal: ctx.signal })`), and they're
  cancelled and removed for you; `destroy` no longer has to undo them.
  Example: `/listeners`.
- **The connection value:** `consumes: ["connection"]` gives an island
  `"connected"` or `"disconnected"`, the state of its own LiveView (lost
  connection, or a crash on the server until it has joined again). It
  arrives as an ordinary prop, so an editor can turn read-only while its
  edits can't reach the server. Example: `/connection`. The name is
  reserved: `setProvider("connection", ...)` is ignored with a warning, and
  `<Xenia.Provider.provider name="connection">` raises.
- **Breaking: multi-value form fields submit a list.** Tom Select
  (`multiple`), flatpickr (`multiple`/`range`) and SortableJS used to
  submit one JSON string, e.g. `"[\"a\",\"b\"]"`, which an Ecto array
  field couldn't cast. They now submit a list, one hidden input per value
  (`post[tags][]`), so `{:array, :string}` casts it directly. An empty list
  is submitted as `[""]`, so removing the last value still reaches the
  server; Ecto's cast turns it into `[]`. **To upgrade:** remove the
  `Jason.decode/1` of these fields; without Ecto, drop the `""`. In your own
  adapters, `ctx.setFormValue(["a", "b"])` now writes a list (it used to
  write the JSON string `'["a","b"]'`).
- **Docs:**
  - the ownership guide lists what Xenia guarantees, each with the test
    that proves it, and explains things outside `el` (overlays, listeners)
    and reconnects;
  - the wrapping guide shows how to turn several prop changes into one
    redraw.
- **`mix xenia.install --islands-only`, for an existing app:** only Xenia's
  hooks in `app.js` (next to the hooks it already spreads),
  `import Xenia.Component`, and `:xenia` in the formatter. It leaves the
  app's theme, layout, flash messages, routes and home page alone, and
  prints the code-splitting steps instead of editing the esbuild config.
  `mix xenia.gen.component` now says to add the adapter to an existing
  `createHooks({...})`, instead of printing a whole hooks line that would
  drop the app's own hooks.
- **`Xenia.Test`:** test helpers for pages with islands, on top of
  `Phoenix.LiveViewTest`:
  - `xenia_props/2` reads an island's props;
  - `render_xenia_event/4` sends an event as the adapter's `ctx.emit`
    would (to the page's bound event; it raises if the event isn't bound);
  - `assert_xenia_command/5` asserts a `Xenia.push_to/4` command;
  - `xenia_call/5` returns a `ctx.call`'s reply.

  Tests no longer need Xenia's attribute or event names.
- **Lazy islands:** `lazy="visible"` on `<.xenia>`, every declared tag and
  `<.monaco>` starts an island only when it scrolls near the screen. With
  code splitting, its library downloads only then too. Commands sent before
  then wait, and it starts with the latest props. The examples app's
  `/lazy` shows it.
- **Code splitting, documented and used by the examples app.** With
  `--splitting --format=esm` and `<script type="module">`, each
  `load: () => import(...)` becomes its own file. In the examples app, a
  page downloads 0.59 MB of JavaScript up front instead of 7.9 MB
  (production build). The README's "Code splitting" shows the setup, and
  `Xenia.Adapters.Monaco` shows the second esbuild profile Monaco's workers
  then need.

## 0.1.2 (2026-10-28)

- **Requirements match what's tested.**
  - LiveView `~> 1.2`, was `~> 1.1`: 1.1 was never tested.
  - Elixir `~> 1.15` is unchanged, and now tested: CI runs the suite on
    Elixir 1.15 with OTP 26 as well as on the newest versions.
  - The official adapters' library versions (npm peer ranges) are the ones
    tested:
    - Uppy `^6`, was `^4 || ^5 || ^6`;
    - xterm.js `^6`, was `^5 || ^6`;
    - wavesurfer.js `^7`, was `^7 || ^8`.
- **Surface UI.** Islands and declared tags work in Surface's `~F`
  templates; the guide's new "In a Surface app" section shows how. An
  adapter next to a Surface component goes in its `.hooks.js` file
  (`export default adapterHook({...})`, then
  `adapter="MyAppWeb.Components.Clock#default"`). In a Surface module,
  `colocated/1` now raises an error explaining this, instead of rendering a
  hook that never exists.
- **`mix xenia.install`:**
  - It now adds Xenia's hooks when the LiveSocket already spreads other
    hooks, such as Surface's `{...Hooks, ...colocatedHooks}`.
  - When it can't, it prints the whole snippet to add, including the theme
    setup.
  - It updates Phoenix's generated `page_controller_test.exs` to check the
    new home page. Before, the first `mix test` after installing failed.
- **Multi-value form fields:** the Tom Select (`multiple`) and flatpickr
  (`multiple`/`range`) docs now say how to read their JSON list string
  safely: `Jason.decode/1`, treating anything that isn't a list as empty.
  An Ecto array field can't cast the string directly. The examples' form
  page no longer crashes on a malformed value.
- **CI** now also runs:
  - the examples app's 50 browser tests (Playwright, Chromium);
  - the test suite on the oldest supported Elixir and OTP;
  - every night, both suites on the newest releases of LiveView, Phoenix
    and each official adapter's library.
- **Examples:** two new pages.
  - "Two editors": each island has its own events, and a command reaches
    only one of them.
  - "An editor that stays open": a persistent part holding a Monaco
    editor.

  Also 6 new browser tests of an island's lifecycle: an edit sent before
  leaving, rapid navigation, two editors, a persistent editor, leaving
  while loading, and no leaks across 50 navigations.
- **Monaco:** Monaco 0.57.0 pins DOMPurify 3.4.15, which `npm audit`
  reports. `Xenia.Adapters.Monaco` shows the npm override to 3.4.17, and
  the examples app uses it.
- **README:** shorter, with a contents list. It has a new "When a plain
  hook is enough" section, and marks pages from folders as optional.
  Monaco's full setup moved to `Xenia.Adapters.Monaco`.
- **`CONTRIBUTING.md`:** setup, the browser tests, and the rules for
  changes.

## 0.1.1 (2026-10-25)

- The README's banner follows the light or dark theme on hex.pm and HexDocs
  too, not only on GitHub.

## 0.1.0 (2026-10-25)

The first release. The repository also has `examples/`, a runnable
Phoenix app with one page per feature, including a file-based routing
example that uses every kind of folder.

A guide, "Icons, notifications and languages", and four examples show
everyday Phoenix with Xenia: Iconify icon sets as Tailwind classes,
success and error messages with `put_flash/3`, and English and German with
Gettext, reaching JavaScript islands as props. They use Phoenix's own
tools; Xenia gains no API for them.

### Components
- `createHooks({ Name: adapter })` turns adapters into LiveView hooks. An
  adapter has `mount`, `destroy`, and optionally `props`, `events`,
  `commands` and `consumes`.
- `<.xenia>` renders the container for any adapter: `props` and `events` as
  JSON, with `class`, `style`, `aria-*` and bindings passing through.
- `use Xenia.Components` declares typed tags: `component :chart, adapter:
  "Chart" do prop ...; event ... end` generates `<.chart>`, checked at compile
  time, with `on_<event>` attributes. Formatter rules via
  `import_deps: [:xenia]`.
- Props are compared on every render, and only changed ones reach the
  adapter. Props without a handler are assigned to the instance, so web
  components need no prop code.
- `ctx.remount()` rebuilds an instance with the latest props, for libraries
  that can't change a setting in place.
- Async `mount` (lazy-loaded libraries): props and commands wait for it.

### Loading and errors
- `<:loading>` on `<.xenia>`, every declared tag and `<.monaco>`: rendered
  by the server, shown from the first paint until the island's first mount
  finishes. The island's element stays full size underneath, so libraries
  that measure themselves while mounting work.
- `<:error>`: shown if the adapter throws in `mount`, a prop handler, a
  command or a remount. An element inside it with `data-xenia-retry` starts
  the island again.
- `on_crash="event"` sends `%{"id", "phase", "message"}` to the LiveView
  when an island crashes. Neither feature needs adapter code.

### Co-located adapters
- An adapter only one page uses can live in that page's module, in LiveView's
  `<script :type={Phoenix.LiveView.ColocatedHook} name=".Chart">`, exporting
  `adapterHook({...})` from `"xenia"`. No change to `app.js` per adapter.
- `<.xenia adapter={colocated(".Chart")}>` and `component ..., adapter:
  ".Chart"` resolve the name to the module's hook at compile time, so two
  pages can each define `.Chart`.
- The console check for unregistered adapters also knows co-located ones,
  and says what to check when one is missing.

### Events and commands
- `ctx.emit(name, payload)`, mapped by the page to a LiveView event, with
  per-event debounce. Pending events are sent when a navigation starts.
- `Xenia.push_to(socket, id, command, args)` sends a command to one
  component.
- Events are sent from an element of Xenia's own, so overlapping events
  can't make LiveView restore stale props on the container.

### Calls
- `ctx.call(name, payload)` sends an event and resolves with the server's
  reply: what `handle_event` returns as `{:reply, map, socket}`. Declared
  and bound like events; pending events go first. Sent from a hidden
  element of Xenia's (the built-in `XeniaCall` hook), so a pending reply
  never locks the container.
- Tom Select's `remote` search uses it: each query's results come from its
  own reply.

### Keyboard shortcuts
- `shortcuts={%{"mod+s" => "save"}}` on any component sends LiveView events
  for key combinations while focus is inside it. `mod` is Cmd on a Mac and
  Ctrl elsewhere. Pending events are sent first; browser shortcuts are
  refused (`Xenia.Shortcuts`).

### Forms and files
- `field={@form[:name]}` on `<.xenia>`, `<.monaco>`, and declared tags with
  `form_value: :prop`. The component is submitted with the form, fires its
  `phx-change`, survives a reconnect, and shows errors like `<.input>`.
- `ctx.setFormValue(value, { notify })` keeps the form input equal to what
  the component shows.
- `ctx.upload(name, files)` sends files through a LiveView upload.

### App-wide values
- `consumes: ["theme"]` delivers app-wide values as ordinary props. An
  explicit prop wins.
- Publish from the server with `<Xenia.Provider.provider name value>`, or
  from the browser with `setProvider`. Read them from any JavaScript with
  `readProvider` and `subscribeProvider`.

### Pages from folders
- `xenia_routes "lib/my_app_web/app"` generates Phoenix `live` routes from a
  folder:
  - `page.ex` makes its folder a route
  - `(group)` folders stay out of the URL
  - `[id]` and `[...path]` folders are parameters
  - `_private` folders are never routes

  Routes update when pages are added, renamed or removed, and conflicting
  paths are compile errors.
- `use Xenia.Page`: a page drawn inside the `layout.ex` files above it.
- `use Xenia.Layout`: a `frame/1` around the pages below, with `on_mount:`
  for hooks such as authentication.
- `persistent.ex` next to a `layout.ex` with `use Xenia.Persistent`: the
  layout's persistent part, a LiveView that stays alive across navigation
  between its pages, told about navigation through `handle_navigation/2`.
- `live.ex` with `use Xenia.Live`: one LiveView for the pages below it,
  switched by patch.
- `mix xenia.routes` lists the generated routes with their layouts.
- A catch-all (`[...path]`) also matches its folder's own URL, with an
  empty list. `[[...path]]` is an error that says to write `[...path]`.

### Metadata and the sitemap
- `metadata/1` on pages and layouts: title (with a layout's
  `title_template`), description, canonical, robots, Open Graph and Twitter
  tags, merged from the outermost layout to the page. Computed after the
  page's data is loaded; the title becomes `@page_title`.
  `<Xenia.Metadata.tags>` renders the tags in `root.html.heex`.
- `Xenia.Sitemap`: `get "/sitemap.xml", Xenia.Sitemap, []` lists the app
  folder's pages. Pages with parameters list the values their `sitemap/0`
  returns; `use Xenia.Layout, sitemap: false` leaves pages out.
- `mix xenia.install` adds the tags to `root.html.heex`, and its layout and
  home page use `metadata/1`.

### Generators
- `mix xenia.gen.component name prop:type --events a,b`: the adapter in
  `assets/js/` (a working placeholder that shows its props) and its typed
  tag, plus the line to add to `app.js`. `--colocated` prints a version to
  paste into a page instead.
- `mix xenia.gen.page path` and `mix xenia.gen.layout path [--persistent]
  [--on-mount Mod:arg]` write app-folder files, with module names that
  mirror the folders. They refuse conflicting paths, misplaced files and
  existing files (unless `--force`).

### Official adapters
- `createChartjs({ load: () => import("chart.js/auto") })` from
  `"xenia/chartjs"`, a separate entry point, and the `<.chartjs>` tag
  (`Xenia.Adapters.Chartjs`). Every Chart.js type and option; light and dark colors
  from the app's theme; point, legend and hover events; highlight, toggle,
  reset and image commands.
- Configure an official adapter with factory options (Chart.js: `plugins`,
  `options`, `palette`, `setup`); extend it by spreading the plain adapter
  object. Libraries are loaded once per factory, and plugins registered once.
- Fourteen more, each with its own entry point and tag, all set up the same
  way (`create<Name>({ load })`):
  - editors: `xenia/monaco-diff` (`<.monaco_diff>`), `xenia/tiptap`
    (`<.tiptap>`, rich text with a toolbar)
  - data: `xenia/d3` (`<.d3_chart>`, built-in kinds plus your own through
    `charts:`), `xenia/tabulator` (`<.tabulator>`), `xenia/fullcalendar`
    (`<.full_calendar>`), `xenia/leaflet` (`<.leaflet_map>`)
  - inputs: `xenia/flatpickr`, `xenia/tom-select`, `xenia/shoelace-rating`,
    `xenia/sortablejs` (`<.sortable_list>`)
  - media and tools: `xenia/xterm`, `xenia/uppy` (uploads through LiveView,
    XHR or tus), `xenia/wavesurfer`, `xenia/wavesurfer-multitrack`
- Monaco diff, Tiptap, flatpickr, Tom Select and the Shoelace rating are
  form fields (`field={@form[:x]}`). Chart.js, xterm and Uppy follow the
  app's theme.
- Xenia's bundles import no library: apps install only what they use.

### Starter template
- `mix xenia.install` turns a new Phoenix 1.8 app into a Xenia app: a plain
  light and dark theme in Xenia's purple and gold, with a faint grid; a
  layout and a home page in the app folder, routed by `xenia_routes`;
  Xenia's hooks in `app.js`, with the theme published for components that
  follow it. Files that don't look like Phoenix's are left alone, with the
  step to do by hand, and a second run changes nothing.
- It also gives the app better flash messages: a `:success` kind, stacked
  newest first, closing by themselves after 5 seconds with a countdown line
  around their border (hovering pauses it; errors stay), with `shape`
  (rounded, sharp, pill) and `duration` on `<.flash_group>`. It replaces
  `flash/1` only when it is exactly what Phoenix generated.

### Monaco
- `<.monaco>` and `createMonaco({ load: () => import("monaco-editor") })`
  from `"xenia/monaco"`, a separate entry point, so apps without Monaco never
  load or resolve it.
- Server updates keep cursors and undo history, and land while read-only.
  The editor tells echoes of its own typing apart from real updates
  (`version`), and `revision` forces the server's value.
- Follows the app's theme, with `themes` for your own light and dark Monaco
  themes, and `theme` to pin one.
