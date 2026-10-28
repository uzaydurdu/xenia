# Wrapping any JavaScript library

Xenia doesn't need to know a library to run it. You write a small **adapter**
in your app, which says how the library is created, updated and destroyed.
Xenia handles everything around it:
- props from your assigns, compared on every render
- events to your LiveView
- commands to one instance
- cleanup when the user navigates
- form fields and app-wide values

This guide goes through an adapter from first decision to finished
component, with two complete examples: the Chart.js chart from the README,
and a date picker that is a form field. The rules every adapter can rely on
are in [What Xenia owns, what your adapter owns](ownership-boundary.md).

For sixteen popular libraries you don't need to write anything: Monaco,
Tiptap, Chart.js, D3, Tabulator, FullCalendar, Leaflet, xterm.js,
flatpickr, Tom Select and more have official adapters you configure and
extend (see "Official adapters" in the README). This guide is for every
other library.

To skip the typing, `mix xenia.gen.component` writes the skeleton this
guide fills in: the adapter in `assets/js/` and its tag (step 8). It prints
the line to add to `app.js`.

```
$ mix xenia.gen.component date_picker value:string min:string --events change
* creating assets/js/date_picker_adapter.js
* creating lib/my_app_web/components/date_picker.ex
```

The adapter it writes works right away: it shows the props it receives.
Replace its body with your library, step by step below. With
`--colocated`, it prints a version to paste into a page instead (see
[An adapter only one page uses](#an-adapter-only-one-page-uses-keep-it-in-the-page)).

## 1. Decide what goes where

Every interaction with the library is one of three things:

| | Direction | Use it for | Example |
|---|---|---|---|
| **Prop** | server → component, on every render | state the server owns | chart data, a date, a language, read-only |
| **Event** | component → server | something the user did | clicked a bar, picked a date, typed |
| **Command** | server → one component, once | an action, not a state | focus, highlight a bar, reset the zoom |

Ask: "if the page re-rendered from scratch, should this still be true?" If
yes, it's a prop. If it should happen once, it's a command.

## 2. Install the library

```bash
npm install flatpickr@4.6.13 --save-exact --prefix assets
```

`--save-exact` pins the version, so a reinstall gets the same library.

If the library has CSS, import it from your adapter
(`import "flatpickr/dist/flatpickr.min.css"`). esbuild writes imported CSS to
`priv/static/assets/js/app.css`, next to `app.js`, so the root layout needs a
second stylesheet. A Phoenix app doesn't load that file by default:

```heex
<link phx-track-static rel="stylesheet" href={~p"/assets/js/app.css"} />
```

## 3. `mount`: create the library

```js
mount(el, props, ctx) {
  const input = el.appendChild(document.createElement("input"))
  return flatpickr(input, { defaultDate: props.value, static: true })
}
```

- **`el` is yours.** It's an empty `<div>` that Xenia creates inside the
  LiveView container, at full width and height. Put all of the library's DOM
  inside it. Never write to the container itself: LiveView owns it and
  deletes attributes it didn't render. Many libraries write `data-*`
  attributes onto their root element, and losing them breaks the library in
  odd ways. (flatpickr's `static: true` keeps its calendar inside `el`, not
  appended to `<body>`.)
- **Return the instance.** Xenia passes it back to every prop handler,
  command and `destroy`.
- **`props`** is everything the server sent, as plain JSON.
- **Loading lazily is fine:** return a Promise.

  ```js
  async mount(el, props) {
    const { default: L } = await import("leaflet")
    return L.map(el).setView(props.center, props.zoom)
  }
  ```

  While it's pending, Xenia records prop changes and queues commands. When
  the Promise resolves, it applies the props that changed and replays the
  commands in order. If the component is removed first, `destroy` runs as
  soon as the Promise resolves.

## 4. `props`: apply a change

```js
props: {
  value(picker, value) { picker.setDate(value || null, false) },
  min(picker, min) { picker.set("minDate", min) },
}
```

- A handler runs **only when that prop's value changed**, compared as JSON.
  It never runs before mount resolves, or after destroy.
- **A prop with no handler is assigned:** `instance[name] = value`. For a web
  component, that's usually all you need.
- **A prop that disappears** arrives as `undefined`. You decide whether that
  means "reset", "keep" or "use the default".
- **The order of handlers within one render is not defined.** If two props
  depend on each other, keep both values on your side and apply them
  together.
- **If the library can't change something in place**, call `ctx.remount()`.
  Chart.js can't change a chart's `type`, for example. Xenia destroys the
  instance and mounts a new one with the latest props. Several calls during
  one render cause one remount.
- **If the library redraws everything on each change** (D3 often does),
  apply all the changes from one render in a single redraw. Mark the
  instance dirty in each handler, and redraw once in `queueMicrotask`.

## 5. `events`: tell the server

```js
mount(el, props, ctx) {
  const input = el.appendChild(document.createElement("input"))
  return flatpickr(input, {
    defaultDate: props.value,
    static: true,
    onChange: (_dates, value) => ctx.emit("change", { value }),
  })
},
events: { change: {} },
```

- Declare every event in `events`. Emitting an undeclared name logs a
  warning, so typos show up.
- The page decides which LiveView event it becomes: with a declared tag,
  `on_change="date_picked"`. An event the page didn't bind is dropped,
  just like an unbound `phx-` binding.
- Payloads are JSON.
- A chatty event (every keystroke, every mouse move) can be debounced:
  `change: { debounce: 300 }`. Only the latest payload is sent. Don't
  debounce events where every occurrence matters, such as "save". If the
  user navigates away during the debounce window, the pending event is sent
  first.

## 6. `commands`: do something once

```js
commands: {
  open(picker) { picker.open() },
  clear(picker) { picker.clear() },
}
```

```elixir
socket |> Xenia.push_to("due", "open")
socket |> Xenia.push_to("sales", "highlight", %{index: 2})
```

A command reaches only the component with that id. While its mount is still
pending, it waits in a queue. A command name the adapter doesn't declare
logs a warning and is dropped.

**Don't throw from a handler.** If a prop handler or command throws, Xenia
destroys the component rather than leave it half-updated. Validate the
arguments, and log a warning if they're wrong.

## 7. `destroy`: clean up

```js
destroy(picker) { picker.destroy() }
```

- **`destroy` is synchronous.** It must leave the instance inert before it
  returns, and Xenia doesn't wait for a returned Promise. If the library's
  teardown is async, mark the instance as destroyed at once and finish later.
- **Don't assume `el` is still in the page, or that it's gone.** Both
  happen. Clean up with the references you kept.
- **Your own async work:** a `fetch` or `setTimeout` started by the adapter
  can finish after destroy. Check `ctx.isAlive()` before touching the
  instance.

## 8. Register it, and declare a tag

In `assets/js/app.js`, next to your other adapters:

```js
import {datePicker} from "./date_picker"

hooks: {...colocatedHooks, ...createHooks({DatePicker: datePicker})},
```

In Elixir, declare a tag, so HEEx checks its attributes at compile time:

```elixir
defmodule MyAppWeb.Pickers do
  use Xenia.Components

  component :date_picker, adapter: "DatePicker", form_value: :value do
    prop :value, :string, doc: "the date, as YYYY-MM-DD"
    prop :min, :string, doc: "the earliest date that can be picked"
    event :change
  end
end
```

- `prop name, type, opts` takes the same options as Phoenix's `attr`:
  `required:`, `default:`, `values:`, `doc:`. A prop that isn't required and
  has no default is left out when not given.
- `event :change` becomes the `on_change` attribute.
- Every tag requires an `id`, except form fields, which take it from the
  field.
- `form_value: :value` makes it a form field (step 9).

Import the module in `html_helpers` (`lib/my_app_web.ex`), and add `:xenia`
to `import_deps` in `.formatter.exs`.

## 9. Make it a form field

With `form_value:` declared, the tag takes a form field:

```heex
<.form for={@form} phx-change="validate" phx-submit="save">
  <.input field={@form[:title]} label="Title" />
  <.date_picker field={@form[:due]} />
</.form>
```

Xenia renders an invisible input with the field's name and value inside the
component, so the date is submitted with the form, and comes back after a
reconnect. The adapter keeps that input equal to what the picker shows:
- **When the user picks a date:** `ctx.setFormValue(value)` writes the input
  and fires the form's `phx-change`.
- **When the server changes the date:** `ctx.setFormValue(value, { notify: false })`
  writes the input quietly. The server already knows, and LiveView never
  updates that input by itself.

A form value arrives as the form holds it: a string from the params.

## The complete date picker

`assets/js/date_picker.js`:

```js
import flatpickr from "flatpickr"
import "flatpickr/dist/flatpickr.min.css"

export const datePicker = {
  mount(el, props, ctx) {
    const input = el.appendChild(document.createElement("input"))

    return flatpickr(input, {
      defaultDate: props.value || null,
      minDate: props.min,
      static: true, // keep the calendar inside el
      // flatpickr calls onChange for the user's picks only, not for setDate(_, false)
      onChange: (_dates, value) => {
        ctx.emit("change", { value })
        ctx.setFormValue(value)
      },
    })
  },

  destroy(picker) { picker.destroy() },

  props: {
    value(picker, value, ctx) {
      picker.setDate(value || null, false)
      ctx.setFormValue(picker.input.value, { notify: false })
    },
    min(picker, min) { picker.set("minDate", min) },
  },

  events: { change: {} },

  commands: {
    open(picker) { picker.open() },
    clear(picker, _args, ctx) {
      picker.clear(false) // false: no onChange, the server asked for this
      ctx.setFormValue("", { notify: false })
    },
  },
}
```

Outside a form, `ctx.setFormValue` does nothing, so the same adapter works
standalone:

```heex
<.date_picker id="due" value={@due} min={Date.to_iso8601(Date.utc_today())} on_change="due_changed" />
```

## Follow the app's theme

To react to light and dark mode without a listener of your own, ask for the
app's theme. Once the app publishes it (see the README), it arrives as an
ordinary prop:

```js
consumes: ["theme"],
props: {
  theme(chart, theme) { /* "light" or "dark": what that means for your library is up to you */ },
},
```

`props.theme` is already set in `mount`. An explicit `theme` attribute on
the tag wins over the app's value.

## An adapter only one page uses: keep it in the page

An adapter that several pages share belongs in `assets/js/` and
`createHooks`, as above. One that only a single page uses can live in that
page's module instead, inside a LiveView
[colocated hook](https://hexdocs.pm/phoenix_live_view/Phoenix.LiveView.ColocatedHook.html).
The page and its JavaScript stay together, and `app.js` doesn't change.

```elixir
defmodule MyAppWeb.SalesPage do
  use MyAppWeb, :live_view

  def render(assigns) do
    ~H"""
    <.xenia id="sales" adapter={colocated(".Chart")} props={%{values: @values}} />

    <script :type={Phoenix.LiveView.ColocatedHook} name=".Chart">
      import Chart from "chart.js/auto"
      import { adapterHook } from "xenia"

      export default adapterHook({
        mount(el, props) {
          const canvas = el.appendChild(document.createElement("canvas"))
          return new Chart(canvas, {
            type: "bar",
            data: { labels: ["Mon", "Tue", "Wed"], datasets: [{ data: props.values }] },
          })
        },
        destroy(chart) {
          chart.destroy()
        },
        props: {
          values(chart, values) {
            chart.data.datasets[0].data = values
            chart.update()
          },
        },
      })
    </script>
    """
  end
end
```

- **`adapterHook({...})`** takes the same adapter as `createHooks`:
  `mount`, `destroy`, `props`, `events`, `commands`, `consumes`. It runs on
  the same core, so everything in this guide works the same, including form
  fields and the app's theme.
- **The name.** LiveView names the hook after the module, so `.Chart` in
  `MyAppWeb.SalesPage` becomes `MyAppWeb.SalesPage.Chart`. Another page can
  define its own `.Chart` without a collision.
- **Point the component at it with `colocated(".Chart")`.** It expands to
  that full name at compile time. A bare `adapter=".Chart"` raises an error:
  `<.xenia>` runs at render time and can't tell which module called it. So
  `colocated(".Chart")` and the `<script>` must be in the same module.
- **Or declare a tag** in the same module, with the same dot name:

  ```elixir
  use Xenia.Components

  component :sales_chart, adapter: ".Chart" do
    prop :values, :list, default: []
  end
  ```

- **npm imports work** (`chart.js/auto` above). LiveView links your
  `assets/node_modules` for the extracted files.
- **`app.js` is set up once, not per adapter.** It still calls
  `createHooks` (for Xenia's own hooks, even when every adapter is
  co-located), and passes LiveView's extracted hooks to the LiveSocket.
  Phoenix 1.8 apps already import them:

  ```js
  import { hooks as colocatedHooks } from "phoenix-colocated/my_app"

  hooks: {...colocatedHooks, ...createHooks({ /* shared adapters */ })},
  ```

  If a page's co-located adapter is missing from the LiveSocket, Xenia says
  so in the browser console, naming the `<script>` and the import to check.

### In a Surface app

[Surface UI](https://surface-ui.org) templates (`~F`) call `<.xenia>` and
your declared tags like any Phoenix function component: props, events,
commands and the `<:loading>` and `<:error>` slots all work. A
`use Surface.Component` module doesn't get your app's `html_helpers`, so add
`import Xenia.Component` there.

LiveView's colocated hooks only run in HEEx (`~H`), so `colocated/1` raises
in a Surface module. Put the adapter in the component's own `.hooks.js`
file instead, which Surface collects into `assets/js/_hooks`:

```js
// lib/my_app_web/components/clock.hooks.js
import { adapterHook } from "xenia"

export default adapterHook({
  mount(el, props) { /* ... */ },
  destroy(instance) { /* ... */ },
})
```

Surface names the hook `"MyAppWeb.Components.Clock#default"`, so that's the
adapter:

```elixir
~F"""
<.xenia id={@id} adapter="MyAppWeb.Components.Clock#default" props={%{label: @label}} />
"""
```

`app.js` spreads Surface's hooks next to Xenia's:
`hooks: {...Hooks, ...colocatedHooks, ...createHooks({})}`, which
`mix xenia.install` writes for you. A Surface LiveView can also be a page in
the app folder (`use Xenia.Page`). On Phoenix 1.8, remove the `layout:`
option that `mix surface.init` gives `surface_live_view`: Phoenix 1.8's
`Layouts.app` takes its content as a slot, so LiveView can't use it as a
layout.

## Things that save debugging time

- **Name global resources by `ctx.id`.** Some libraries keep resources in a
  global registry: Monaco's model URIs, map containers, chart registries. Use
  `ctx.id` in the key, because during a navigation the old page's instance
  and the new page's instance can briefly exist side by side.
- **Content that isn't a prop doesn't survive a remount.** A terminal's
  screen, a log or a chat is a stream of commands, not a state. If it must
  survive, keep it on the server, and replay it when the adapter reports
  that it's ready.
- **One instance per id.** Give each component a stable, unique `id`. It's
  also the address for commands.
- **A forgotten registration is reported.** If a tag's adapter wasn't
  passed to `createHooks`, the browser console names the element and the
  line to add.
- **Testing:** `Phoenix.LiveViewTest` sees what the server renders: the
  container's `data-xenia-props`, and the form input. The adapter itself runs
  only in a browser. A Playwright test that mounts the page, changes a prop,
  triggers an event and navigates away covers it.
