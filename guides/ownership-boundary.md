# What Xenia owns, what your adapter owns

Xenia is named after the Greek bond between host and guest. The host gives
shelter, the guest respects the house, and both know their obligations. In
Xenia, LiveView and Xenia are the host, your library is the guest, and this
page is the contract: what each side owns, and what it can rely on.

Each **JS island** on a page is one such guest: a part that needs
interactive JavaScript and lives in the browser, a chart or an editor, while
the rest of the page stays server-rendered Phoenix.

## The two elements

```
container — rendered by your LiveView, owned by LiveView and Xenia
┌──────────────────────────────────────┐   id, phx-hook, phx-update="ignore",
│  el — created by Xenia,              │   data-xenia-props, data-xenia-events
│       owned by your adapter          │
│  ┌────────────────────────────────┐  │
│  │ your library's DOM             │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

`<.xenia>` and every declared tag render the **container**. LiveView keeps
updating its attributes; that's how props travel. Xenia creates **`el`**
inside it and hands it to your adapter's `mount`. LiveView never touches the
children of the container, so `el` and everything in it are safe.

Never write to the container from JavaScript. LiveView deletes any `data-*`
attribute on it that the server didn't render, at the next update.

With a `<:loading>` slot, `el` sits in a grid cell together with the
placeholder, inside an element of Xenia's (`data-xenia-frame`). It is still
full size and visible while your `mount` runs, so libraries that measure
their element at mount work as usual.

## Who owns what

| Xenia owns | Your adapter owns |
|---|---|
| Finding and mounting the component | How the library is created and configured |
| Decoding and comparing props | How each changed prop is applied |
| Knowing whether an instance is alive | The library's cleanup |
| The order of mount, update and destroy | Global resources, keyed by `ctx.id` |
| Sending events, with debounce and the flush on navigation | Which events exist, and their payloads |
| Delivering commands to one instance | Which commands exist |
| The form input, and its `phx-change` | Telling Xenia when the value changed |
| Delivering app-wide values (`consumes`) | What a value means for the library |
| Recovering from a failing adapter | Validating its own input |
| | Loading the library (bundled or lazy) |
| | Echo handling: telling its own changes apart from the server's |

Xenia never applies a value to your library for you, beyond the default
`instance[name] = value`, and never tries to guess which changes are echoes.
Both depend on the library.

## Lifecycle

### mount(el, props, ctx) → instance or Promise

- Called once per instance, when LiveView mounts the container. After
  `ctx.remount()`, it's called again for a new instance.
- With `lazy="visible"` on the tag, it waits until the container is within
  200 px of the viewport (an `IntersectionObserver`). Until then, commands
  are queued, props are only recorded, and a removed component is never
  mounted, so `destroy` isn't called either. Without `IntersectionObserver`,
  it mounts at once.
- `props` is the decoded props, always an object.
- If it returns a Promise:
  - prop changes are recorded, and the changed ones are applied when it
    resolves
  - commands are queued, and delivered in order after those props
  - if the component is removed meanwhile, nothing is applied, queued
    commands are dropped, and `destroy` runs when the Promise resolves
- If it throws or rejects, the error is logged and `destroy` isn't called,
  because there is no instance. The component's `<:error>` slot shows, if it
  has one (see Failures).
- A `<:loading>` slot stays on top of `el` until the first `mount` resolves.
  Your adapter does nothing for it.

### props: { name(instance, value, ctx) }

- Called only for props whose value changed, compared as JSON, one call per
  changed key.
- Never called before mount resolves, and never after destruction begins.
- A prop without a handler is assigned: `instance[name] = value`.
- A prop that disappears is passed as `undefined`.
- The order of calls within one update is not defined.
- If a handler calls `ctx.remount()`, the remaining handlers of that update
  don't run on the old instance. The new one gets the latest props in
  `mount`.

### destroy(instance, ctx)

- The instance is already marked dead: `ctx.isAlive()` is false here.
- Synchronous. Xenia doesn't wait for a returned Promise (it logs a
  warning). A library with async teardown marks itself destroyed at once and
  finishes later.
- `el` may or may not still be in the page. Use the references you kept.
- Pending events are sent first, if the LiveView is still connected: when
  the component was removed by a re-render, or before a remount. On
  navigation they were already sent when the navigation started.
- After `destroy`, Xenia removes `el`.

### ctx.remount()

Destroys the current instance and mounts a new one with the latest props,
in the same container. The order: send pending events, `destroy`, remove
`el`, create a fresh `el`, `mount`. Any number of calls during one update or
one handler cause one remount, after the current handler returns. Commands
that arrive meanwhile go to the new instance.

## ctx

Each instance gets its own `ctx`. After a remount, the old one is dead: its
`emit`, `remount`, `setFormValue` and `upload` do nothing, its `call`
rejects, and its `signal` is aborted.

| | |
|---|---|
| `ctx.id` | the container's id. Use it to name global resources |
| `ctx.isAlive()` | true from mount until destruction begins, while the element is in the page |
| `ctx.emit(name, payload)` | send an event (see Events) |
| `ctx.call(name, payload)` | send an event and get a Promise of the server's reply (see Calls) |
| `ctx.remount()` | rebuild the instance with the latest props |
| `ctx.setFormValue(value, { notify })` | write the form input (see Forms). Returns whether the component is a form field |
| `ctx.upload(name, files)` | send files through a LiveView upload. Returns `false` and logs the reason if it can't start; it never throws |
| `ctx.signal` | an `AbortSignal`, aborted when this instance's destruction begins (before `destroy` runs). Pass it to `fetch` and to listeners outside `el`, and they clean themselves up |
| `ctx.hook` | the raw LiveView hook. Don't keep references to it across destroy or remount |

## Events

- The adapter declares which events exist: `events: { change: { debounce: 300 } }`.
- The page decides which LiveView event each one becomes: `on_change="..."`
  on a declared tag, or `events={%{change: "..."}}` on `<.xenia>`.
- An event the page didn't bind is dropped. An event the adapter didn't
  declare logs a warning and is dropped.
- Debounce is per event, and keeps the latest payload.
- When a LiveView navigation starts, every pending debounced event is sent
  immediately, while the LiveView is still connected.
- Payloads must be JSON. Xenia sends events from a small element of its own
  inside the container, which protects the container's props from a LiveView
  lock issue when several events overlap.

## Calls

A call is an event that gets an answer: `ctx.call("search", { query })`
returns a Promise of what the server's `handle_event` returns as
`{:reply, map, socket}`.

- It is declared and bound like any event: in the adapter's `events`, and
  with `on_search="..."` (or `events={%{search: "..."}}`) on the page.
- It is sent at once, never debounced. Pending debounced events go first, so
  a call can't overtake input it depends on.
- Each reply belongs to its call. Results for an old query can't end up in
  a newer one.
- It rejects if the adapter didn't declare it or the page didn't bind it, if
  the instance is no longer alive, or if LiveView can't deliver it (for
  example, while disconnected). Handle the rejection.
- The reply can arrive after the instance is gone. Check `ctx.isAlive()`
  before using it.
- Like events, calls are sent from a small hidden element of Xenia's, inside
  the container (the `XeniaCall` hook, which `createHooks` adds), so the
  container's props are safe while a reply is pending.

## Commands

- Server: `Xenia.push_to(socket, id, command, args)`. `args` is a map, `%{}`
  by default.
- A command reaches only the current instance with that id.
- While its mount is pending, commands are queued and delivered in order.
- No instance for the id: dropped. A command the adapter doesn't declare:
  logged and dropped.

## Keyboard shortcuts

`shortcuts={%{"mod+s" => "save"}}` on any component maps key combinations
to LiveView events. Xenia owns the key handling, so adapters need no code:
- Only key presses **while focus is inside the component** count. The same
  keys keep their usual meaning everywhere else on the page.
- A matched shortcut is handled before the library sees the key, and the
  browser's default action is prevented. Other keys reach the library as
  usual.
- The component's pending events are sent before the shortcut's event. A
  debounced `change` can't arrive after the `save` it belongs to.
- The event's params are `%{"shortcut" => "mod+s"}`.
- Browser shortcuts (zoom, tabs, reloading, back and forward, developer
  tools) are refused with an error when the component renders. A held-down
  key and typing with an input method never trigger a shortcut.

## Failures

If any adapter callback throws after a successful mount, Xenia destroys the
component, including `destroy`, so nothing leaks. That covers prop handlers,
commands, the catch-up after an async mount, and the old instance's
`destroy` during a remount. If `mount` itself throws, there is no instance,
so `destroy` isn't called.

Either way, the island has crashed, and then:

- the page's `on_crash` event, if it has one, receives
  `%{"id" => id, "phase" => phase, "message" => message}`, where phase is
  `"mount"`, `"update"`, `"command"` or `"remount"`
- the component's `<:error>` slot is shown where the island was, if it has
  one. Without it, the component stays empty, as before
- a click on an element marked `data-xenia-retry` inside the error slot
  starts the island again, with a fresh `mount`. The `<:loading>` slot shows
  again while it loads

A component removed from the page (by a navigation, say) never counts as a
crash. Validate arguments in your handlers instead of throwing: a crash is
for failures you can't handle, like a library that didn't load.

## Forms

A component given `field={@form[:name]}` is a form field. That works on
`<.xenia>`, on `<.monaco>`, and on a declared tag with `form_value: :prop`.
- The field supplies the id (an explicit `id` wins) and the value. For a
  declared tag, the value fills the `form_value` prop, and it wins over that
  prop.
- The server renders `<input type="text" hidden autocomplete="off" data-xenia-field>`
  inside the container. A text input, not `type="hidden"`, so that
  `used_input?/1` works: errors appear only once the user has changed the
  field, as with `<.input>`.
- The value is written as text: `nil` becomes `""`, numbers, booleans and
  atoms become text, maps become JSON. The browser side uses the same rule.
- A list is submitted as a list: one input per value, named
  `post[tags][]`, so an Ecto `{:array, _}` field casts it directly. An
  empty list is submitted as `[""]`, so removing the last value still
  reaches the server; Ecto's cast turns it into `[]`. A declared tag's
  `form_value` prop gets the list without that `""`.
- LiveView never updates that input after the first render. So your adapter
  writes it:
  - when the user changes the value: `ctx.setFormValue(value)`. This fires
    the form's `phx-change`, unless the value is unchanged. Pass a list
    (`ctx.setFormValue(["a", "b"])`) for a multi-value field: one
    `phx-change` for the whole list.
  - when the server changes it: `ctx.setFormValue(value, { notify: false })`.
- Submit, `phx-change` and LiveView's form recovery after a reconnect all
  work through that input.
- Outside a form, `ctx.setFormValue` does nothing and returns `false`.

## App-wide values

An adapter with `consumes: ["theme"]` receives the theme as an ordinary
`theme` prop: in `mount`, then through its `theme` handler, under the prop
rules above.
- A `theme` prop given explicitly to the component wins, even when it's
  `nil`. A removed one falls back to the app's value.
- Values live in one store per page. They survive navigation, so a
  component that mounts during a navigation still gets the current value.
- Publish from the server, with `<Xenia.Provider.provider name="locale" value={@locale} />`
  in the layout. Or from the browser, with `setProvider("theme", value)`.
  Use one source per name.
- Other JavaScript can read the same values with `readProvider(name)` and
  `subscribeProvider(name, fn)`.

One value comes from Xenia itself: `consumes: ["connection"]` gives the
island `"connected"` or `"disconnected"`, the state of its own LiveView.
- It's `"disconnected"` while the LiveView has lost its connection, or has
  crashed on the server and is joining again. Events the island sends then
  are dropped, so an editor can turn read-only, for example.
- It arrives like any other: in `mount`, then through the `connection`
  handler. Check it in `mount` too: an island can start while disconnected
  (a lazy one, say).
- Each island follows its own LiveView, so a nested LiveView that crashes
  doesn't change the islands outside it.
- The name is reserved: `setProvider("connection", ...)` is ignored with a
  warning, and `<Xenia.Provider.provider name="connection">` raises.
- For a notice for the whole page, use Phoenix's own: the "We can't find
  the internet" flash, or the `phx-disconnected` binding.

## Attributes on the container

Global attributes given to a component go on the container: `class`,
`style`, `aria-*`, `role`, `title`, `phx-click` and other bindings. `id`,
`phx-hook`, `phx-update` and every `data-xenia-*` belong to Xenia, and
passing them raises an `ArgumentError`. Other `data-*` attributes pass
through.

If your `LiveSocket` uses a custom `bindingPrefix`, configure the same prefix
for Xenia: `config :xenia, binding_prefix: "pop-"`. The server can't see the
browser's setting, so the two must match.

## Things outside `el`

- **Overlays added to `document.body`** (a date picker's calendar, a
  dropdown, a tooltip) are outside the island, and neither LiveView nor
  Xenia touches them. The library's own teardown usually removes them, so
  call it in `destroy`. flatpickr's `destroy()` removes its calendar, and a
  browser test checks it across navigations.
- **Listeners on `document` or `window`:** add them with
  `{ signal: ctx.signal }`. Xenia aborts the signal when the island is
  destroyed or replaced, and that removes them, also after a failed mount,
  where `destroy` isn't called.
- **Requests:** `fetch(url, { signal: ctx.signal })` is cancelled if the
  island goes first. A `mount` waiting for it then rejects, and that isn't
  a crash: the island is gone, so nothing is reported.
- **Global resources** (Monaco's models, a map's container): key them by
  `ctx.id`, and reuse one that already exists.
- **Focus:** LiveView never patches inside the island, so focus and
  selection inside it survive the page's updates.
- **The rest of the page:** don't change elements LiveView renders. Send an
  event, and let the server render the change.

## Reconnects

A reconnect is a new LiveView process: `mount` runs again, and the server's
state starts over. In the browser nothing is torn down: islands keep their
instances, their text and their undo history.

- **Form fields** get their values back through LiveView's form recovery.
- **Any other island's value** reaches the server with its next event.
  Events emitted while LiveView is disconnected are dropped. An event that
  carries the whole value, like Monaco's `change`, puts the server right
  again; if the server must know the value as soon as it reconnects, make
  the island a form field.

## What Xenia guarantees, and the tests that prove them

Each of these is tested on every push, unit tests in Node and browser tests
in Chromium. The browser tests also run every night against the newest
releases of LiveView and of each official adapter's library.

| Guarantee | Tested in |
|---|---|
| An adapter's `destroy` runs exactly once. | [`teardown.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/teardown.test.js) |
| An island removed while its library is still loading is never drawn. Its `destroy` runs when the load finishes. | [`controller.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/controller.test.js), [`official_adapters.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/official_adapters.test.js) (all 16 adapters), [`lifecycle.test.mjs`](https://github.com/uzaydurdu/xenia/blob/main/examples/assets/e2e/lifecycle.test.mjs) |
| `ctx.isAlive()` is false once destruction begins, or once the element leaves the page. | [`teardown.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/teardown.test.js) |
| Events sent just before a navigation reach the server while LiveView is still connected. | [`teardown.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/teardown.test.js), [`lifecycle.test.mjs`](https://github.com/uzaydurdu/xenia/blob/main/examples/assets/e2e/lifecycle.test.mjs) |
| A command reaches only the island with its id. While the island mounts, commands wait, in order. | [`controller.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/controller.test.js), [`lazy.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/lazy.test.js), [`lifecycle.test.mjs`](https://github.com/uzaydurdu/xenia/blob/main/examples/assets/e2e/lifecycle.test.mjs) (two editors) |
| A prop that changes while the island mounts arrives once the mount has finished; the latest value wins. | [`controller.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/controller.test.js), [`lazy.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/lazy.test.js) |
| A crash shows `<:error>` and sends `on_crash`. A retry starts a fresh instance. | [`slots.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/slots.test.js), [`examples.test.mjs`](https://github.com/uzaydurdu/xenia/blob/main/examples/assets/e2e/examples.test.mjs) |
| Rapid navigation leaves exactly one working set of islands, with no errors. | [`lifecycle.test.mjs`](https://github.com/uzaydurdu/xenia/blob/main/examples/assets/e2e/lifecycle.test.mjs) |
| 50 navigations leave no editors, models or memory behind. | [`lifecycle.test.mjs`](https://github.com/uzaydurdu/xenia/blob/main/examples/assets/e2e/lifecycle.test.mjs) |
| A persistent part keeps its island across pages: the same instance, text and undo history. | [`lifecycle.test.mjs`](https://github.com/uzaydurdu/xenia/blob/main/examples/assets/e2e/lifecycle.test.mjs) |
| A reconnect keeps the islands' instances. Form fields are recovered, and other islands' values come back with their next event. | [`reconnect.test.mjs`](https://github.com/uzaydurdu/xenia/blob/main/examples/assets/e2e/reconnect.test.mjs) |
| An overlay a library adds to `document.body` goes with its island (flatpickr's calendar). | [`lifecycle.test.mjs`](https://github.com/uzaydurdu/xenia/blob/main/examples/assets/e2e/lifecycle.test.mjs) |
| Several props changed in one update cause one redraw (Chart.js). | [`chartjs.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/chartjs.test.js) |
| `lazy="visible"` mounts, and downloads, nothing before the island is near the screen. | [`lazy.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/lazy.test.js), [`lazy.test.mjs`](https://github.com/uzaydurdu/xenia/blob/main/examples/assets/e2e/lazy.test.mjs) |
| An island that consumes `connection` gets `"disconnected"` while its own LiveView is disconnected or rejoining after a crash, then `"connected"`, on the same instance. | [`connection.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/connection.test.js), [`connection.test.mjs`](https://github.com/uzaydurdu/xenia/blob/main/examples/assets/e2e/connection.test.mjs) |
| A listener or `fetch` given `ctx.signal` is removed or cancelled when its island is destroyed, replaced, or fails to mount. Listeners never pile up across navigations. | [`signal.test.js`](https://github.com/uzaydurdu/xenia/blob/main/test/js/signal.test.js), [`listeners.test.mjs`](https://github.com/uzaydurdu/xenia/blob/main/examples/assets/e2e/listeners.test.mjs) |
