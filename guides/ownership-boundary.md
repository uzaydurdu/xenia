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
`emit`, `remount`, `setFormValue` and `upload` do nothing, and its `call`
rejects.

| | |
|---|---|
| `ctx.id` | the container's id. Use it to name global resources |
| `ctx.isAlive()` | true from mount until destruction begins, while the element is in the page |
| `ctx.emit(name, payload)` | send an event (see Events) |
| `ctx.call(name, payload)` | send an event and get a Promise of the server's reply (see Calls) |
| `ctx.remount()` | rebuild the instance with the latest props |
| `ctx.setFormValue(value, { notify })` | write the form input (see Forms). Returns whether the component is a form field |
| `ctx.upload(name, files)` | send files through a LiveView upload. Returns `false` and logs the reason if it can't start; it never throws |
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
  atoms become text, maps and lists become JSON. The browser side uses the
  same rule.
- LiveView never updates that input after the first render. So your adapter
  writes it:
  - when the user changes the value: `ctx.setFormValue(value)`. This fires
    the form's `phx-change`, unless the value is unchanged.
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

## Attributes on the container

Global attributes given to a component go on the container: `class`,
`style`, `aria-*`, `role`, `title`, `phx-click` and other bindings. `id`,
`phx-hook`, `phx-update` and every `data-xenia-*` belong to Xenia, and
passing them raises an `ArgumentError`. Other `data-*` attributes pass
through.

If your `LiveSocket` uses a custom `bindingPrefix`, configure the same prefix
for Xenia: `config :xenia, binding_prefix: "pop-"`. The server can't see the
browser's setting, so the two must match.
