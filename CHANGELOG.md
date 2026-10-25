# Changelog

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
