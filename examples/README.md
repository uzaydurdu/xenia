# Xenia examples

A small Phoenix app that shows Xenia at work. Each page is one example, and
each example has its own folder with its code and a short README.

Most of a Phoenix app runs on the server. Some parts need JavaScript in the
browser: a chart, a code editor, a date picker. We call these parts **JS
islands**. Xenia connects them to your LiveView. You write a small
**adapter** that says how the JavaScript library starts, updates and stops,
and Xenia does the rest.

## Run it

You need Elixir and Node.js (with npm).

```bash
cd examples
mix setup        # Elixir and npm packages, then builds the assets
mix phx.server
```

Then open [localhost:4000](http://localhost:4000).

## Where to start

New to Xenia? Open these four, in order. Each takes a few minutes:

1. **[Chart](lib/xenia_examples_web/app/chart)**: how a LiveView and a
   JavaScript library talk to each other: props, events and commands.
2. **[File-based routing](lib/xenia_examples_web/app/routing)**: how
   folders become pages and URLs.
3. **[Chart.js adapter](lib/xenia_examples_web/app/adapters/chartjs)**:
   use one of Xenia's ready-made adapters, and make it your own.
4. **[A form with editors](lib/xenia_examples_web/app/forms)**: JavaScript
   components as fields of a Phoenix form.

## The examples

**Basics.** Short adapters written by hand, to see how Xenia works.

| Example | What it shows | Code |
|---|---|---|
| **Chart** | How a page and an island talk: props, events and commands. With Chart.js. | [`app/chart`](lib/xenia_examples_web/app/chart) |
| **Date picker** | A JavaScript component as a field of a Phoenix form. With flatpickr. | [`app/date-picker`](lib/xenia_examples_web/app/date-picker) |
| **Rating** | A web component (Shoelace), with no prop code at all. | [`app/rating`](lib/xenia_examples_web/app/rating) |
| **Theme** | Islands that follow the app's light and dark mode. | [`app/theme`](lib/xenia_examples_web/app/theme) |
| **Loading and errors** | What an island shows while it loads, and when it breaks: `<:loading>`, `<:error>`, `on_crash` and a retry. | [`app/loading`](lib/xenia_examples_web/app/loading) |
| **Island in a page** | An adapter that lives inside the page that uses it. | [`app/colocated`](lib/xenia_examples_web/app/colocated) |
| **Two editors** | Two islands of one kind on a page: each reports to its own event, and a command reaches only one. | [`app/two-editors`](lib/xenia_examples_web/app/two-editors) |
| **Tabs** | Two pages that share one LiveView and its state. | [`app/tabs`](lib/xenia_examples_web/app/tabs) |

**Pages from folders.** Routes and layouts come from folders, not from a
router file.

| Example | What it shows | Code |
|---|---|---|
| **File-based routing** | Folders become URLs: a parameter (`[slug]`), a catch-all (`[...path]`), a group (`(company)`), a private folder (`_parts`) and nested layouts. Every page shows which file answers it. | [`app/routing`](lib/xenia_examples_web/app/routing) |
| **An editor that stays open** | A layout's persistent part with a Monaco editor: the same editor, text and undo history across its pages. | [`app/scratchpad`](lib/xenia_examples_web/app/scratchpad) |

**Icons, messages and languages.** Everyday Phoenix, with Phoenix's own
tools: Tailwind, `put_flash/3` and Gettext.

| Example | What it shows | Code |
|---|---|---|
| **Icons** | Lucide, Material Design Icons and Heroicons as Tailwind classes: sizes, colors, themes, accessible buttons. | [`app/icons`](lib/xenia_examples_web/app/icons) |
| **Notifications** | Success, error and info messages with `put_flash/3`: dismissing, navigation, escaping, failures. | [`app/notifications`](lib/xenia_examples_web/app/notifications) |
| **Languages** | English and German from Gettext, in the page, its messages and a JavaScript widget. | [`app/languages`](lib/xenia_examples_web/app/languages) |
| **Settings** | All three together: a translated settings panel with an icon button and a translated message. | [`app/settings`](lib/xenia_examples_web/app/settings) |

**Official adapters.** Xenia's ready-made adapters, configured in
[`assets/js/islands/official.js`](assets/js/islands/official.js). Each one
is a few lines: install the library, pass it in.

| Example | What it shows | Code |
|---|---|---|
| **Chart.js** | Every chart type; used, configured and extended, without copying the adapter. | [`app/adapters/chartjs`](lib/xenia_examples_web/app/adapters/chartjs) |
| **D3** | Bar, line and pie charts drawn with D3. | [`app/adapters/d3`](lib/xenia_examples_web/app/adapters/d3) |
| **Code editor** | Monaco, with our own theme, snippets and keyboard shortcuts. | [`app/adapters/monaco`](lib/xenia_examples_web/app/adapters/monaco) |
| **Diff editor** | Monaco's side-by-side diff, with the changes reported. | [`app/adapters/monaco-diff`](lib/xenia_examples_web/app/adapters/monaco-diff) |
| **Rich text** | A rich-text editor with a toolbar (Tiptap). | [`app/adapters/tiptap`](lib/xenia_examples_web/app/adapters/tiptap) |
| **Date range** | A date range picker (flatpickr). | [`app/adapters/flatpickr`](lib/xenia_examples_web/app/adapters/flatpickr) |
| **Tag picker** | A searchable multi-select that creates tags (Tom Select). | [`app/adapters/tom-select`](lib/xenia_examples_web/app/adapters/tom-select) |
| **Half-star rating** | Shoelace's rating, in half stars. | [`app/adapters/shoelace-rating`](lib/xenia_examples_web/app/adapters/shoelace-rating) |
| **Sortable lists** | Drag cards between two lists (SortableJS). | [`app/adapters/sortable`](lib/xenia_examples_web/app/adapters/sortable) |
| **Data table** | Edit, sort and select rows (Tabulator). | [`app/adapters/tabulator`](lib/xenia_examples_web/app/adapters/tabulator) |
| **Calendar** | Add and open events (FullCalendar). | [`app/adapters/calendar`](lib/xenia_examples_web/app/adapters/calendar) |
| **Map** | Markers you click and drag (Leaflet). | [`app/adapters/map`](lib/xenia_examples_web/app/adapters/map) |
| **Terminal** | A terminal the server answers (xterm.js). | [`app/adapters/terminal`](lib/xenia_examples_web/app/adapters/terminal) |
| **File uploads** | Uppy's dashboard, uploading through LiveView. | [`app/adapters/uppy`](lib/xenia_examples_web/app/adapters/uppy) |
| **Audio waveform** | Play audio, and mark regions (wavesurfer.js). | [`app/adapters/wavesurfer`](lib/xenia_examples_web/app/adapters/wavesurfer) |
| **Audio studio** | Several tracks, and recording from the microphone. | [`app/adapters/multitrack`](lib/xenia_examples_web/app/adapters/multitrack) |

**Forms.**

| Example | What it shows | Code |
|---|---|---|
| **A form with editors** | Monaco, Tiptap, a date, tags and a rating as fields of one Phoenix form, with errors. | [`app/forms`](lib/xenia_examples_web/app/forms) |

The whole app is built with Xenia's app folder: each page's folder is its
URL, and the sidebar stays alive while you move between pages. Start with
the [File-based routing](lib/xenia_examples_web/app/routing) example, then
see [`app/README.md`](lib/xenia_examples_web/app/README.md) for the whole
folder.

## Where things are

| Path | What's there |
|---|---|
| [`lib/xenia_examples_web/app/`](lib/xenia_examples_web/app) | The pages, one folder each, with a README. |
| [`assets/js/islands/`](assets/js/islands) | The adapters. The basics write their own, one file per library. `official.js` configures Xenia's official adapters, and `chartjs.js` extends one. |
| [`assets/js/app.js`](assets/js/app.js) | Registers the adapters with `createHooks`, and publishes the theme. |
| [`lib/xenia_examples_web/components/islands.ex`](lib/xenia_examples_web/components/islands.ex) | The basics' tags: `<.chart>`, `<.date_picker>`, `<.rating>`. The official adapters' tags come from Xenia (`import Xenia.Adapters.Tiptap`, ...). |
| [`assets/css/app.css`](assets/css/app.css) | Xenia's light and dark theme, the same one `mix xenia.install` gives a new app, the icon plugins, and the libraries' CSS. |
| [`assets/vendor/iconify.js`](assets/vendor/iconify.js) | The Iconify icons plugin: `lucide-*` and `mdi-*` classes, like Phoenix's `heroicons.js`. |
| [`lib/xenia_examples_web/locale.ex`](lib/xenia_examples_web/locale.ex) | The language: from a cookie on the first load, per LiveView, and when switching. |
| [`priv/gettext/`](priv/gettext) | The translations, English and German. |
| [`lib/xenia_examples_web/router.ex`](lib/xenia_examples_web/router.ex) | One line, `xenia_routes`, makes a route for every page. |

## Use Xenia in your own app

First add Xenia to `mix.exs`: `{:xenia, "~> 0.1.0"}`. (This app uses the
code in this repository instead: `{:xenia, path: ".."}`.) In a new Phoenix
app, run `mix xenia.install` next: it adds the theme, a layout, a home page
in the app folder, and the hooks.

**A library Xenia has an official adapter for** (Monaco, Tiptap, Chart.js,
Tabulator, ...):

1. Install the library: `npm install tabulator-tables --prefix assets`.
2. In `assets/js/app.js`, create the adapter and register it:

   ```js
   import {createTabulator} from "xenia/tabulator"

   const tabulator = createTabulator({load: () => import("tabulator-tables")})
   // hooks: {...colocatedHooks, ...createHooks({Tabulator: tabulator})}
   ```

3. Add `import Xenia.Adapters.Tabulator` to `html_helpers` in `lib/my_app_web.ex`.
4. If the library has a stylesheet, import it in `assets/css/app.css`:

   ```css
   @import "../node_modules/tabulator-tables/dist/css/tabulator_simple.min.css";
   ```

   Each tag module's docs (`Xenia.Adapters.Tabulator`, ...) name the file.
5. Use the tag: `<.tabulator id="people" data={@people} columns={@columns} />`.

Each official adapter's page here shows it working;
[`official.js`](assets/js/islands/official.js) has the `load` line for
every one of them.

**Any other library:**

1. Install it: `npm install chart.js --prefix assets`.
2. Let the generator write the adapter and its tag:

   ```bash
   mix xenia.gen.component chart data:map --events click
   ```

   It prints the line to add to `assets/js/app.js`.
3. Replace the generated adapter's body with your library. The chart
   example's [`chart.js`](assets/js/islands/chart.js) shows a finished one.
4. Use the tag: `<.chart id="sales" data={@data} on_click="clicked" />`.

**A new page:** `mix xenia.gen.page reports/sales` writes
`lib/my_app_web/app/reports/sales/page.ex`, and `/reports/sales` works
right away.

The [README of Xenia](../README.md) walks through all of this in detail.

## Run the browser tests

Every example has a browser test, in
[`assets/e2e/examples.test.mjs`](assets/e2e/examples.test.mjs),
[`assets/e2e/adapters.test.mjs`](assets/e2e/adapters.test.mjs) and
[`assets/e2e/everyday.test.mjs`](assets/e2e/everyday.test.mjs). Start the app
on another port, then run them:

```bash
PORT=4002 mix phx.server
```

```bash
cd assets
npx playwright install chromium   # the first time only
E2E_URL=http://localhost:4002 npm run e2e
```
