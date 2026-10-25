# CLAUDE.md

**Xenia** — hosting the JavaScript ecosystem inside Phoenix LiveView.

App: `:xenia` · Module: `Xenia` · Pronounced **ZEE-nee-uh**

Greek *xenía* (ξενία): the sacred bond between host and guest. The host
provides shelter; the guest respects the house. Both sides have obligations,
and the contract is explicit. That is the architecture.

**Companion documents.** `docs/ROADMAP.md` — milestones and stop conditions.
`docs/EXAMPLE_APP.md` — a design sketch of an app using Xenia, written before
the implementation so the API can be criticised cheaply.
`docs/MENTOR_PROMPT.md` — session starter.

**Current status (2026-10-24):** every milestone through M11 is complete,
M8 is decided (a JS island, §2), and `examples/` holds a runnable examples
app (§13). Next: the release (`docs/RELEASING.md`), when the author says so.
The paragraphs below say what each milestone delivered.

**M5 complete** (one criterion, "written from the docs alone", moved
to M7). The adapter contract and its rules are written (§4) and implemented in
the core (`createHooks`). All three channels work: props, events, and commands
through `Xenia.push_to/4`. `<.xenia>` renders the container, and
`use Xenia.Components` declares a real tag with HEEx compile-time checking.
Monaco ships as the first Tier 2 adapter. Without any change to the adapter
contract, the demo runs Chart.js, D3, xterm.js, wavesurfer.js and a Shoelace
custom element. Apps import Xenia with `import ... from "xenia"`. Both
falsification tests (§10) passed.

**M5.5 complete** (form participation). Components are form fields through
`field={@form[:x]}` and `ctx.setFormValue`, including Phoenix's
`used_input?/1` error display. Files reach LiveView uploads through
`ctx.upload`.

**M6 complete** (shared providers, §5). An adapter declares
`consumes: ["theme"]` and receives the value as an ordinary prop, with no
new lifecycle concept. Values come from the server
(`<Xenia.Provider.provider>`) or from app JavaScript (`setProvider`). The
demo's app-wide theme comes from Phoenix's own theme toggle, and Monaco and
Chart.js follow it with no listener of their own.

**M7 complete** (docs). Publishing and the outside user moved to the final
Release milestone (see "Release policy" below):
- **The dry run.** A fresh Phoenix app using Xenia unpacked as Hex ships it.
  It found two build blockers, both fixed by giving Monaco its own entry
  point, `"xenia/monaco"`, where the app passes `import("monaco-editor")` to
  `createMonaco` (§6 M7 findings).
- **Docs.** The README is rewritten from the dry run. There are two
  user-facing guides, `guides/wrapping-a-library.md` and
  `guides/ownership-boundary.md`. The first was tested by building its
  flatpickr example from the guide alone.
- **Release prep.** ExDoc (checked in `mix check`), `CHANGELOG.md`,
  `LICENSE`, and `docs/RELEASING.md`.

**Release policy (the author's decision, 2026-10-24).** Nothing is published
and nobody else gets access to the repository until the whole implementation
(M8–M11) is done. Then: Hex, plus one Elixir Forum post. Don't propose an
early release, a public repository or a private test user before then.

S1 is done (§9).

**M9 complete** (the app directory). `xenia_routes` turns a folder into
Phoenix routes. `use Xenia.Page` draws a page inside its folders'
`layout.ex` frames. A `persistent.ex` next to a layout (`use Xenia.Persistent`)
survives navigation between its pages, and the layout's `on_mount:` protects
them. A `live.ex` (`use Xenia.Live`) shares one LiveView between the pages
below it. Folders are the source of truth: there are no `parent:`, `layout:`
or `persistent:` declarations (§9 "As built (M9)").

**M10 complete** (co-located adapters). An adapter only one page uses lives
in that page's module, in LiveView's `ColocatedHook`, exporting
`adapterHook({...})` from `"xenia"`. `colocated(".Chart")` and
`component ..., adapter: ".Chart"` resolve the name to the module's hook at
compile time. No change to `app.js` per adapter, and no new lifecycle
concept: `adapterHook` is the hook `createHooks` already built (§6 M10
findings).

**M11 complete** (generators). `mix xenia.gen.component` writes an
adapter (a working placeholder) and its typed tag, or prints a co-located
version with `--colocated`. `mix xenia.gen.page` and `mix xenia.gen.layout`
(`--persistent`, `--on-mount`) write app-folder files. Generated files
compile without warnings and pass the demo's `mix format`, including the
HEEx formatter (§6 M11 findings). Next: the M8 decision, then Release
(`docs/ROADMAP.md`).

**Official adapters: all stages done (2026-10-25).** After reviewing
Stage 1 (Chart.js), the author asked for the other fourteen at once. Each
is a `create<Name>({ load })` factory with its own entry point and bundle,
and a tag module (§11 "Official adapters"). Every examples page and its
browser test passes (§6 "Official adapters, the other fourteen").

**Inspired by Next.js (2026-10-25), the author's four picks, all done:**
`<:loading>` and `<:error>` slots with `on_crash` and a retry (§4 Loading
and errors, Failures), `ctx.call` for replies (§4 Calls), and page
metadata plus a sitemap for the app folder (§9 "Metadata and the
sitemap"). The rest of Next.js's list was judged already covered by
Phoenix or out of scope.

**M12 complete (2026-10-25): icons, notifications and languages.** In
the examples app and a guide (`guides/icons-notifications-languages.md`),
with Phoenix's own tools; no Xenia API was needed (§11 "M12"). Pages:
`/icons`, `/notifications`, `/languages`, `/settings`.

**`mix xenia.install` (2026-10-25).** It turns a new Phoenix 1.8 app into a
Xenia app: Xenia's plain light and dark theme with a grid pattern, a
layout and home page in the app folder, and the hooks wired (§11 "Starter
template"). The examples app uses the same theme.

---

## 1. Rules for the assistant

**Do not write implementation code unless explicitly asked.**

Default mode is mentor, not implementer:

1. Say what to build
2. Say why
3. Give acceptance criteria
4. Name the files/modules/concepts involved
5. Stop and wait

Exceptions, only on explicit request:
- "Generate this boilerplate" → generate it
- "I implemented this" → review it
- "Give me the implementation" → give it

When debugging, reason about the cause first. Do not jump to a patch.

Be direct. If an idea is weak, say so and say why. Do not hype the project.
Do not silently shrink the scope the author has chosen — argue openly or accept it.

**Sections 6, 7, 8 and 11 record work already completed or already decided.**
Do not propose milestones that redo them. If you think something there is
wrong, name the specific claim and say why.

---

## 2. Thesis

> Xenia provides the interoperability boundary between Phoenix/LiveView and
> imperative JavaScript components — and it works regardless of whether the
> surrounding LiveView state is server-authoritative or local.

> Xenia makes shared browser and application state a first-class boundary
> between Elixir and JavaScript. Values with meaning on both sides should be
> definable once and consumable by both, rather than independently
> reimplemented in every component.

**JS islands (the author's term; M8, 2026-10-24).** A JS island is any part
of a page that needs interactive JavaScript and is maintained in the browser:
a chart, an editor, a map. Everything around it stays server-rendered
Phoenix. Xenia is what hosts islands: the boundary between them and the
server. An island is a concept, not a Xenia type; in code it is a component
rendered through `<.xenia>` or a declared tag, with its adapter.

The developer's only question should be *"how does this JavaScript component
work?"* — never *"how do I wire a hook to it?"* and never *"how does this
component find out what the theme is?"*

The second clause of the first sentence matters. Popcorn's Local LiveView (§7)
moves *where Elixir runs*; it does not turn Monaco, Chart.js, Tiptap, or
Leaflet into Elixir. The boundary Xenia owns is **Elixir ↔ JavaScript**, not
**server ↔ browser**. Keeping that framing costs nothing now and keeps Xenia
relevant under either execution model.

The author has chosen the **"new way to write Phoenix apps"** path, not the
"small additive library" path. Respect that choice.

### The two-tier model — this is the centre of the product

**Tier 1 — any npm package, day one.** A developer writes a small adapter in
their own app and gets a working component. This must never require Xenia to
know the library exists, and never a fork, a PR, or a wait.

**Tier 2 — first-party adapters.** Convenience for genuinely hard libraries:
Monaco (workers, model URIs, undo stack), Tiptap (contenteditable, cursor
mapping), D3 (imperative DOM ownership). Ship few.

**Tier 1 is the product. Tier 2 is marketing.** If Xenia becomes an adapter
catalogue, it becomes a maintenance treadmill a solo maintainer loses, and its
value evaporates the moment someone needs a library not on the list.

**Clarified 2026-10-24 (the author): a growing, staged ecosystem of reusable
official adapters, not a commitment to maintain all of them now.** The goal
is an adapter written once, reused across apps, configured and extended
without forking. So official adapters (Tier 2) grow a few at a time, each
only after it passes the same gates (§11 "Official adapters"), and the
warning above still applies: every official adapter follows its library's
API changes. Two things keep the treadmill small:
- the app passes the library in (`load: () => import(...)`), so Xenia never
  resolves, bundles or pins a library version, and apps install only what
  they use;
- an adapter ships only once it passes the gates. (On 2026-10-25 the author
  asked for all sixteen at once, so none stays experimental; each passed
  the gates, §6.)

Short adapters written in the app (the examples' recipes) stay the way to
learn Tier 1. Official adapters and recipes serve different purposes.

Every design decision gets tested against: *does this still work for a library
Xenia has never heard of?*

## 3. What Xenia is not

- Not a React/Vue/Svelte replacement
- Not a competitor to Hologram (opposite direction: Hologram compiles Elixir → JS)
- Not a replacement for Phoenix routing, layouts, or LiveView itself
- Not a new template language
- Not a collection of JS adapters — see the two-tier model above
- Not a general-purpose state manager — see §5
- **Not a way to make LiveView local.** That is Popcorn's territory. Xenia must
  never depend on Popcorn — that would recreate exactly the mistake the Tier 1
  philosophy exists to avoid
- **Not a React integration.** React comes last, if at all. Order is: plain JS
  → Web Component → React
- Not a backend-for-frontend for JS SPAs. That is Inertia's and LiveState's space. "Users should not need to know Elixir" is a different product
- Not a TypeScript codegen or GraphQL mapping layer

---

## 4. Architecture

```
Elixir side                         JS side
-----------                         -------
<.chart data={@data} />             Xenia.createHooks({ name: adapter })
  |                                   |- decode data-xenia-props
  |- generated from declarations       |- diff vs previous
  |- renders container div            |- isAlive() guard
     id, phx-hook,                    |- scoped command channel
     phx-update="ignore",             |- destroy ordering
     data-xenia-props (JSON)          |- dispatch to per-prop handler
                                              |
Xenia.push_to(socket, id, cmd, args)          v
  |                                    adapter (library-specific)
  +--> routed to one instance            mount / destroy / prop handlers
```

Three channels, all of which must be proven before the contract is frozen:

```
Elixir  ---- props ---->  JS component     (data-xenia-props, diffed)
Elixir  <--- events ----  JS component     (pushEvent)
Elixir  --- commands -->  JS component     (push_to, scoped to one instance)
```

### Ownership boundary — the host/guest contract

| Xenia core owns (host) | Adapter owns (guest) |
|---|---|
| Finding and mounting the component | How the library is created and configured |
| Decode props from `data-xenia-props` | How each prop is applied |
| Diff against previous props | Library cleanup / dispose |
| `isAlive()` liveness check | Global resource keys (e.g. Monaco model URIs) |
| DOM ownership rules | How the library is loaded (bundled vs lazy) |
| Destroy ordering | Two-way / echo policy |
| Event transport | Which events exist and their payloads |
| Command routing | Library-specific quirks |
| Registration and discovery | Business-specific behaviour |
| Provider subscription lifecycle | Applying a provider value to the library |

**This boundary is the product.** More than routing, more than the registry.

### Adapter contract (v1)

```
mount(el, props, ctx)    -> instance | Promise<instance>
destroy(instance, ctx)
props:    { <name>: (instance, value, ctx) => void, ... }
events:   { <name>: { debounce?: ms }, ... }
commands: { <name>: (instance, args, ctx) => void, ... }
consumes: [ <provider name>, ... ]          # see §5, implemented in M6
```

**Required: `mount` and `destroy`.** Everything else is opt-in: `props` only
for props that need more than the default handler, `events` only if the
component reports back to the server, `commands`, `consumes`, and the `ctx`
helpers. A typical adapter uses `mount`, `destroy`, `props`, and maybe
`events`. When measuring against the §6 baseline, count concepts per adapter,
not per contract.

Deliberately **no public `update()`**. The core owns diffing and calls the
per-prop handler. The subtraction study (§6) showed every `updated()` has the
same shape — decode, diff, dispatch per key — so the per-prop map is the right
factoring.

Default prop handler: assign to the instance, `instance[name] = value`. For a
Custom Element the instance is the element, so any Custom Element works with
zero adapter code.

**Every layer must be usable standalone.** An adapter must work when imported
directly into a plain LiveView hook with no other part of Xenia present. The
abstraction and the escape hatch are the same object.

### Adapter contract — rules

The signatures say what exists. This section says when each part is called
and what the core guarantees. Anything not written here is not promised.

**Two words used below.**
- An instance is **alive** from the call to `mount` until its destruction
  begins, and only while its `el` is connected to the document.
- The **current** instance for an id is the most recently mounted instance
  with that id whose destruction has not begun. Commands go only to it.

#### mount(el, props, ctx) -> instance | Promise<instance>

- Called once per instance, from the hook's `mounted()`. After `ctx.remount()`
  it is called again, for a new instance.
- `el` is an empty element the core creates inside the LiveView container
  (`width` and `height` 100%), and removes after `destroy`. The adapter owns
  it completely: children, attributes, listeners. The adapter never touches
  the container itself: LiveView deletes any `data-*` attribute on it that the
  server didn't render (§6, M1 findings).

  ```
  container — LiveView/Xenia own it  (id, phx-hook, phx-update, data-xenia-*)
  ┌─────────────────────────────┐
  │  el — created by the core,  │
  │       owned by the adapter  │
  │  ┌───────────────────────┐  │
  │  │ Monaco / Chart.js     │  │
  │  └───────────────────────┘  │
  └─────────────────────────────┘
  ```
- `props` is the decoded `data-xenia-props`. Always an object, never null.
- May return a Promise, for lazy-loaded libraries. While it is pending:
  - prop changes are recorded, not dispatched. When it resolves, the core
    dispatches every prop whose value differs from what mount received.
  - commands for this instance are queued, and delivered in order after
    those props.
  - if destruction begins (the component is removed), nothing is dispatched
    and queued commands are dropped. `destroy` is called as soon as the
    Promise resolves.
- If mount throws or rejects: log it, never call handlers or destroy, drop
  queued commands. (Proper error handling is §16, later.)

#### props: { <name>: (instance, value, ctx) => void }

- Called only for keys whose value changed since the last dispatch.
  Changed means: per top-level key, the JSON values differ.
- Never called before mount has resolved. Never called after destruction
  begins.
- A key with no handler gets the default: `instance[name] = value`.
  For a Custom Element, the instance is the element, so this is enough.
- A key that disappears from `data-xenia-props`: the handler is called with
  `undefined`. Missing props are not sticky; the adapter decides whether
  removal means reset, inherit, or no-op.
- The order in which handlers run within one update is unspecified. Adapters
  must not depend on it.
- If a handler calls `ctx.remount()`, no further handlers of that update run
  on the old instance. The new instance receives the latest props through
  `mount`.

#### destroy(instance, ctx)

- The core marks the instance dead before calling `destroy`, so
  `ctx.isAlive()` returns false during destroy. No new events are accepted
  once destruction begins.
- Pending outbound events are flushed before `destroy` **only while the
  LiveView is still connected**: the component was removed by a re-render,
  or `ctx.remount()` was called. On navigation this is too late: LiveView
  disconnects the view before it calls `destroyed()`, and `pushEvent` is
  rejected (measured, §6). For navigation, the core flushes earlier, when
  navigation starts (see Events). Anything still pending at a disconnected
  destroy is dropped.
- `destroy` must not assume `el` is still connected, or that it is already
  disconnected: both happen (§6). Cleanup must use references the adapter
  already owns.
- `destroy` is synchronous and must make the instance inert before returning.
  It does not return a Promise. If it returns one anyway, the core doesn't
  wait for it: it logs a warning, and logs the Promise's rejection so it
  doesn't go unhandled. (Decided in M2: nothing can wait during a
  navigation.) A library whose own teardown is async marks itself destroyed
  synchronously and finishes later, as Xenia's Monaco adapter does.
- After `destroy` returns, the core removes `el`.

#### ctx

`ctx` is the adapter's interface to Xenia Core. Adapters should prefer it
over accessing LiveView directly. Each instance gets its own `ctx`.

- `ctx.isAlive()`: true while the instance is alive (defined above). False
  during and after destroy, and for an instance replaced by a remount. Only
  needed for the adapter's own async work, e.g. a fetch started inside a
  handler. The core already guards every call it makes.
- `ctx.emit(name, payload)`: reports a logical event to Xenia Core. The core
  owns mapping to the LiveView event, debounce, flushing, and transport.
  Ignored after destruction begins, and dropped if the page didn't bind the
  event (see Events). For instance:
  ```
    ctx.emit("change", {
      value: "hello",
      version: 4,
    });
  ```
- `ctx.remount()`: destroys the current instance and mounts a new one with the
  latest props. The container is preserved.
  - Order: flush the instance's pending events (the view is connected), call
    `destroy`, remove its `el`, create a fresh `el`, then call
    `mount(el, latestProps, newCtx)`.
  - Coalesced: any number of calls during one update or one handler cause one
    remount, after the current handler returns.
  - Called while `mount` is still pending: that mount is abandoned (destroyed
    as soon as it resolves) and a new mount starts with the latest props.
  - Commands that arrive while the new mount is pending are queued for the
    new instance, which is now the current one.
  - **Justification (required for a new lifecycle concept, §1).** Some
    libraries cannot change structural config in place: Chart.js `type`,
    Leaflet `crs`. Without `remount`, an adapter would destroy and rebuild
    the library inside a prop handler. But the core holds the instance
    reference, and would keep dispatching props and commands to the dead
    one. Only the core can swap the instance, so remount must be core-owned.
    It is the fourth lifecycle concept (mount, destroy, prop handlers,
    remount). A fifth is a kill condition (§10).
- `ctx.id`: the component's stable id (the container's `id`). Use it to key
  global resources (§6), e.g. Monaco model URIs, because `el` has no id.
- `ctx.setFormValue(value, { notify = true } = {})`: writes the component's
  form value (see Form fields below). Returns `true` if the component is a
  form field, `false` if it isn't, or if the instance is no longer alive.
- `ctx.upload(name, files)`: hands files (an array of `File`/`Blob`) to the
  LiveView upload `name` (`allow_upload/3`), through LiveView's own upload
  channel, because Xenia events carry JSON only. Returns `false` and logs the
  reason if it can't: a bad name or bad files, no upload support on the hook,
  or `upload` throwing. It never throws into the adapter, because a throwing
  adapter callback destroys the component (Failures, below). Since M5.5.
- `ctx.call(name, payload)`: sends an event and returns a Promise of the
  server's reply (`{:reply, map, socket}`). Since 2026-10-25; rules under
  "Calls" below.
- `ctx.hook`: the raw LiveView hook, the escape hatch. Use only when an
  integration needs a LiveView capability Xenia doesn't expose. References
  must not be retained across destroy or remount. Since `ctx.upload`, no
  adapter in the demo uses it.

#### Events (adapter → server)

Adapters emit logical events through `ctx.emit(name, payload)`. The adapter
never chooses the LiveView event name and never implements transport timing.
Two parties decide transport:

- **The adapter declares** which events exist and how chatty they are. That
  is library knowledge: a Monaco `change` fires on every keystroke.

      events: {
        change: { debounce: 300 },
        save:   {}
      }

- **The page decides** which LiveView event each one maps to, on the
  container. The same adapter can send `"save_draft"` on one page and
  `"update_query"` on another:

      data-xenia-events='{"change":"editor_changed"}'

  Since M3, `<.xenia events={%{change: "editor_changed"}} />` renders it.
  Since M4, a declared `event :change` becomes an `on_change` attribute
  (`<.chart on_click="...">`, `<.monaco on_change="...">`), and unbound
  events are left out.

Rules:

- **Transport.** The core pushes events with LiveView's public
  `liveSocket.execJS` and a `push` command, from a hidden `<span>` it keeps
  inside the container, not with `hook.pushEvent` from the container.
  LiveView locks the element an event is pushed from until the reply; a
  locked container can get a stale copy of itself restored on unlock, which
  reverts `data-xenia-props` (§6, M5 findings). Payloads that aren't plain
  objects, and hooks without a `liveSocket`, still use `hook.pushEvent`.
- An event the page didn't bind is dropped silently, like an unbound `phx-`
  binding. Emitting a name the adapter didn't declare in `events` logs a
  warning and is dropped, so typos show up in development.
- Debounce is per logical event. `0` or absent sends immediately. Debounce
  keeps only the latest payload ("last write wins"). That is right for
  state-like events such as `change`. Events where every occurrence matters,
  such as `save`, must not be debounced.
- **Flush on navigation start.** When LiveView starts a navigation (the
  `phx:page-loading-start` window event), the core immediately sends every
  pending debounced event. This is the last moment the view is still
  connected: by the time LiveView calls `destroyed()`, `pushEvent` is rejected
  with "unable to push hook event. LiveView not connected" (measured, §6).
  Without this, whatever was typed during the last debounce window before a
  navigation never reaches the server.
  - `phx:` here is LiveView's window-event prefix, hardcoded in LiveView's
    `live_socket.ts`. It is not the configurable binding prefix of §11. S2
    must check what Local LiveView dispatches instead.
- Pending events are also flushed before `remount`, and before `destroy` while
  the view is still connected (see destroy).

#### Calls (adapter → server → adapter, 2026-10-25)

`ctx.call(name, payload)` returns a Promise of the server's reply. On the
server it's plain Phoenix: `handle_event` returns `{:reply, map, socket}`.

- **Declared and bound like events** (`events: { search: {} }`, the page's
  `on_search`). Not debounced. Pending events are flushed first, the same
  ordering rule as shortcuts.
- **Transport:** the server renders a hidden
  `<span id="<id>-xenia-call" data-xenia-call phx-hook="XeniaCall">` inside
  the container whenever the page binds an event (a call needs a binding).
  `XeniaCall` is a built-in hook (`createHooks`); a call uses its public
  `pushEvent`, whose Promise is the reply. LiveView locks the element a
  hook event is pushed from: this span, never the container, so the M5
  revert can't happen. Without the span or the hook, the container's own
  hook pushes, as a fallback. A call made during mount waits one microtask
  for the span's hook.
- **Rejects** when undeclared, unbound, from a dead ctx, or when LiveView
  rejects the push. The reply may arrive after the instance is gone: the
  adapter checks `ctx.isAlive()`, as with any async work.
- **Justification.** Not a lifecycle concept (no new callback; it's
  transport, like `emit`), but it extends the contract, so it's written
  down here. Pull-style libraries ask for data and wait for the answer:
  Tom Select's `load(query, callback)`, Monaco's completion providers
  (Promise-returning), FullCalendar's ranges, Tabulator's remote pages.
  With only `emit` and props, the Tom Select adapter called `callback()`
  empty and let results arrive later through the `options` prop, so a slow
  reply for "el" could fill the list after the user typed "eli", and
  Monaco completions couldn't use server data at all.

#### Commands (server → adapter)

Server side:

    Xenia.push_to(socket, id, command, args)

sends `push_event(socket, "xenia:command:" <> id, %{command: command, args: args})`.
`args` is always a JSON-encodable map, `%{}` by default. One event name per
component id, as implemented in M2.

Adapter side:

    commands: {
      focus(instance, args, ctx) {},
      revealLine(instance, args, ctx) {}
    }

Rules:

- **Transport.** Each hook subscribes with `handleEvent` to its own event
  name, `xenia:command:<id>`, in `mounted()`, and unsubscribes in
  `destroyed()`. LiveView delivers every `push_event` to every `handleEvent`
  listener on the page (`view_hook.ts` registers them with
  `window.addEventListener`), so the id has to be in the event name for a
  command to reach one instance only. LiveView cleans the subscription up;
  there is no module-level registry. This replaced the first design (one
  `xenia:command` event plus an `id → instance` registry) because it is
  simpler and the overlap that registry guarded against wasn't observed on
  LiveView 1.2.10 (§6).
- A command is delivered only to the **current** instance for its id. If two
  instances with the same id ever overlap, destroying the older one must not
  unregister the newer one.
- While the current instance's `mount` is pending, its commands are queued and
  delivered in order after the props catch-up. This makes "focus the editor
  right after the page loads" work with lazy-loaded libraries.
- No instance at all for the id: the command is dropped.
- A command name the adapter doesn't declare: warn and drop.

#### Form fields (M5.5)

A component inside a `<.form>` is a form field when it is given
`field={@form[:code]}` (`<.xenia>`, `<.monaco>`, or a declared component with
`form_value: :prop`).

**Server side.**
- The field supplies the `id` (an explicit `id` wins), and the server renders
  an invisible input inside the container:
  `<input type="text" hidden autocomplete="off" data-xenia-field name="snippet[code]" value="...">`.
  - **`type="text"` with `hidden`, not `type="hidden"`.** LiveView never
    reports a hidden-only field as unused, so `used_input?/1` would be true
    from the start, and errors would show before the user touched the field
    (§6 M5.5 findings). A text input is unused until the adapter's first
    `ctx.setFormValue` dispatches `input`, as with `<.input>`.
  - **`autocomplete="off"`**, so browsers don't restore or autofill a stale
    value.
  - **`data-xenia-field`** is how the core finds it: the direct child of the
    container with that marker. No other input is ever written.
- The value becomes the string an input holds: `nil` → `""`, numbers, booleans
  and atoms → text, maps and lists → JSON. That's the same rule as the core's
  `ctx.setFormValue`, so the server and the browser write equal strings.
- For a declared component, the field's value fills the `form_value` prop.
  When a field is given, its value wins over the prop (also for `<.monaco>`).

**Browser side.** Submit, `phx-change` and LiveView's form recovery see the
input like any other, so the component takes part in all three. The
adapter keeps the input equal to what the component shows:
- **The user changed the value:** `ctx.setFormValue(value)` writes it and
  dispatches a bubbling `input` event, which fires the form's `phx-change`.
  An unchanged value dispatches nothing.
- **The server changed the value:** `ctx.setFormValue(value, { notify: false })`
  writes it quietly. This is required, not optional: the input sits inside the
  `phx-update="ignore"` container, so LiveView never updates it after the first
  render (§6). Without the quiet write, a submit after a server change (a
  reset after Save, "load an example") would send the old value. Quiet,
  because the server already knows: a `phx-change` here would be a pointless
  validation, and would count as the user using the field.
- Outside a form, `ctx.setFormValue` does nothing and returns `false`, so one
  adapter works in and out of forms.

**What the adapter owns**, as with every two-way value (§6): which events
count as the user's changes, and its echo policy. A form's validation reply
re-renders the value from the submitted params, possibly with text the user
has since typed past. Monaco handles that with pending echoes
(`assets/adapters/monaco.js`). A custom element whose events fire only for
user input (Shoelace) needs nothing.

**Values arrive as the form holds them.** After a `phx-change`, a field's
value is the submitted param, a string (`"4"`, not `4`). The adapter converts
it (`xenia_demo/assets/js/rating_adapter.js`, `toRating`).

#### Keyboard shortcuts (2026-10-24)

`shortcuts={%{"mod+s" => "save"}}` on `<.xenia>`, every declared tag and
`<.monaco>` maps key combinations to LiveView events. The author decided
the scope: **only while focus is inside the island**, **never a browser
shortcut**, and **server events only** for now.

- **Server.** `Xenia.Shortcuts.normalize!/2` writes each combination in one
  form (modifiers in the order mod, ctrl, meta, alt, shift, then the key,
  lowercase; `cmd` is `meta`, `option` is `alt`), and renders it as
  `data-xenia-shortcuts`. Browser and system shortcuts raise an
  `ArgumentError` (zoom, tabs and windows, reloading, the address bar, back
  and forward, full screen, developer tools, downloads and history; the list
  is `Xenia.Shortcuts.reserved/0`), also when written with `ctrl`/`meta`
  instead of `mod`. App shortcuts browsers also use (`mod+s`, `mod+p`,
  `mod+f`, `mod+k`) are allowed.
- **Browser.** The controller listens for `keydown` on the container in the
  capture phase (`assets/core/shortcuts.js`):
  - keydown only passes through the container while focus is inside it, so
    focus scoping needs no checks;
  - the capture phase runs before the library's own handlers; a match calls
    `preventDefault` and `stopPropagation`, so neither the library nor the
    browser acts on it;
  - `mod` is Cmd on a Mac (`navigator.platform`) and Ctrl elsewhere;
  - a key press matches by its character (`event.key`, the user's layout)
    first, then by its physical key (`event.code`), for keys a modifier
    changes (Shift+. is ">", Option+S is "ß" on a Mac);
  - a held-down key, typing with an input method, and a modifier alone
    never match;
  - the attribute is read on each keydown, so a re-rendered map applies at
    once; the listener is removed on destroy.
- **Ordering.** The component's pending events are flushed before the
  shortcut's event, through the same transport (§4 Events). A debounced
  `change` can't arrive after the `save` it belongs to.
- **Params:** `%{"shortcut" => "mod+s"}`, the combination as normalized.
- **No new lifecycle concept and no adapter code:** it works for any island
  (§10 Tier 1 test).

#### Failures

As implemented in M2 (`controller.js`):
- `mount` throws or rejects: the controller is torn down, `destroy` is not
  called, because no instance exists.
- Any adapter callback throws after a successful mount (a prop handler, a
  command, the catch-up after mount, the old instance's `destroy` during a
  remount): the controller is destroyed, including `destroy`, so nothing
  leaks.

Since 2026-10-25 either one is a **crash** (`Controller.crash(phase, error,
teardown)`), and then:
- the page's `on_crash` event (`data-xenia-crash`) gets `%{id, phase,
  message}`, phase `"mount" | "update" | "command" | "remount"`. It is sent
  before the teardown, through the normal transport, while the controller
  can still push;
- the `<:error>` slot (`<template data-xenia-error>`) is cloned where the
  island was (`data-xenia-crashed`); without it the component stays empty,
  as before;
- a click on `[data-xenia-retry]` inside it removes it and calls
  adapterHook's `start()` again: a **new Controller** on the same hook. The
  crashed controller stays destroyed (the state machine is unchanged).
  `_xeniaDestroyed` stops a retry after the hook's `destroyed()`.
- A component no longer in the page never crashes visibly: no event, no
  slot.

#### Loading and errors (2026-10-25)

`<:loading>` and `<:error>` on `<.xenia>`, every declared tag (the DSL
forwards them) and `<.monaco>`. Server-rendered, so no adapter code and no
new lifecycle concept (§10 Tier 1 test holds).

- **`<:loading>`** renders `<div data-xenia-loading style="height: 100%">`
  inside the container: visible from the first paint, before any JS. On
  mount the controller moves it into a core-owned frame
  (`<div data-xenia-frame>`, `display: grid`, 100% × 100%) and puts `el` in
  the same grid cell, the placeholder on top. Once the first mount resolves,
  the placeholder is hidden, not removed, so a retry shows it again. A
  remount doesn't show it.
- **Why a grid cell:** `el` must stay visible and sized while `mount` runs,
  because Chart.js, Monaco and Leaflet measure it. Hiding `el` or stacking
  the two would give them 0×0 or half the box. Positioning the placeholder
  absolutely would need `position: relative` on the container, which would
  override a user's `class="absolute ..."` (inline style wins). In a grid,
  a container with a height gives both its full size; a container without
  one takes the placeholder's height, so `el` gets that size.
- Without `<:loading>`, the structure is unchanged: `el` is a direct child
  of the container.
- **`on_crash`, not `on_error`:** Chart.js, D3, Uppy and wavesurfer
  multitrack already declare an `error` event, so `on_error` would clash
  with their generated attribute. `loading`, `error` and `on_crash` are
  reserved in the DSL (`event :crash` would generate `on_crash`).

### Known contract gaps — found by writing `EXAMPLE_APP.md`

**No way to force a remount. — Resolved in M2:** `ctx.remount()`, with its
rules and justification above.

**Attribute passthrough. — Rule decided in M2, implemented in M3** (`Xenia.Component`; a reserved attribute raises `ArgumentError`, tested):
- Global attributes given to a component (`class`, `style`, `aria-*`, `role`,
  `title`, `phx-click` and other bindings) go on the container.
- Reserved, set only by Xenia: `id`, `phx-hook`, `phx-update`, and every
  `data-xenia-*`. Other `data-*` pass through to the container.
- JavaScript never writes `data-*` attributes onto the container, because
  LiveView deletes them on the next patch (§6). Library DOM lives in `el`.
- `phx-` above means the configured binding prefix (§11).

**Event naming. — Resolved in M2:** logical names declared by the adapter,
mapped per page through `data-xenia-events` (see Events). Monaco's cursor
moves, focus, blur and save intent are just more keys in `events`.

**No component id in `ctx`. — Found and resolved in M2:** `ctx.id`. An
adapter that owns a keyed global resource must namespace the key by the
component's id (§6), but `el` is the core's anonymous child element. Running
Monaco on the core first failed with "MonacoAdapter requires an element with a
stable id". The demo had to work around it through the escape hatch: the
"adapters routinely bypass the core" kill condition (§10) in small. `ctx.id`
is data, not a lifecycle concept.

**No new lifecycle concept without a written justification in this file.**

---

## 5. Shared state and providers

**Implemented in M6.** The design below was written before M6 and held. The
rules as built are under "As built (M6)" at the end of this section.

### The problem

Some values are not owned by any one component. Theme, locale, timezone,
reduced-motion, viewport, feature flags, user preferences. Today every
JavaScript component reimplements its own detection and synchronisation:

```
Monaco  -> its own theme listener
Chart   -> its own theme listener
Tiptap  -> its own theme listener
Map     -> its own theme listener
```

The target: define once, consume from both sides.

### Prop versus provider value

A prop belongs to one component. A provider value belongs to the application
or browser context.

**The guiding question:** is this a value that multiple Xenia components need
to understand, *and* that has meaning on both sides of the Elixir/JavaScript
boundary? If not, it is a prop.

### Three kinds of provider — the hard part

| Kind | Examples | Authority |
|---|---|---|
| Server-authoritative | feature flags, user preferences from the DB, app config | Elixir; browser only reads |
| Browser-authoritative | reduced-motion, viewport, timezone, OS colour scheme | Browser; Elixir cannot know until told |
| Two-way | theme — a stored preference that may also follow the OS | Both, and they can disagree |

**Two-way providers are the echo problem at application scope.** §6 establishes
that echo suppression does not generalise per-prop. Assume the same at provider
scope: make origin explicit rather than inferred. Do not attempt a single
generic mechanism for all three kinds until at least two are working.

### Design to try first: providers are props with a different source

Route provider values through the **same per-prop handler map**:

```js
export const chart = {
  consumes: ["theme"],
  mount(el, props, ctx) { /* ctx.theme available here */ },
  props: {
    data(chart, data) { ... },
    theme(chart, theme) { ... },     // same shape as any other prop
  },
}
```

The adapter author learns **no new lifecycle concept**. Xenia owns the
subscription, the cleanup, and the re-delivery on remount.

### Precedence

An explicit prop beats a provider value of the same name.
`<.monaco theme="vs-dark" />` overrides the application theme.

### Lifetime — a constraint from §6

The provider store must be a **module-level singleton in the JS bundle, keyed
by provider name**, not owned by a hook instance. During the ~700ms
double-mount window (§6), a new page's component hooks mount while the old
page's provider hook is still alive.

Providers must work across mount, update, destroy, dynamic add and remove,
navigate away and back, and both sticky and non-sticky layouts.

### Deliberately small

Not Redux, Zustand, LiveStore, or a general-purpose state manager. **Ship
exactly one provider — theme — and hardcode it.** Only generalise when a second
one hurts.

(M6: names are not hardcoded. Any lowercase identifier works, because the
store is keyed by name anyway, and hardcoding would have cost the same. Only
theme ships in Xenia's own adapters. The demo adds a server-owned `locale`.)

### As built (M6)

**Adapter side.** `consumes: ["theme"]` on the adapter. The value arrives in
the mount props and then through the ordinary `theme` prop handler, under the
§4 prop rules: called only when the value changed, never before mount
resolves, never after destroy. The adapter decides what the value means to
its library. Monaco maps `"light"`/`"dark"` to `vs`/`vs-dark` by default,
and `<.monaco themes={%{dark: ...}}>` replaces either with the app's own
Monaco theme, which can be a name or a theme map. `theme` still pins one
theme. The adapter keeps the app theme and the map per editor, so the two
resolve correctly in either handler order. The demo's Chart.js adapter
picks its colours. Xenia only delivers the value.

**Precedence.** A key present in `data-xenia-props` beats the provider, even
when its value is `null`. A key that disappears falls back to the provider
value. Monaco can't honour this per editor, because its themes are global (§6).

**The store** (`assets/core/providers.js`) is a module-level singleton keyed
by name.
- It notifies only when a value changes (JSON-equal values are ignored).
- One failing listener doesn't stop the others.
- A value outlives the element or code that published it, so a component that
  mounts during a navigation still gets the last value.

**Two ways to publish, one store:**
- **Server-owned:** `<Xenia.Provider.provider name="locale" value={@locale} />`
  renders a hidden element with the `XeniaProvider` hook, which publishes on
  `mounted` and `updated` and does nothing on `destroyed`. `createHooks` adds
  this hook itself; the name is reserved.
- **Browser-owned:** app code calls `setProvider("theme", value)`. The demo
  publishes Phoenix 1.8's theme toggle with one `MutationObserver` on
  `<html data-theme>` in `app.js`. The toggle's "system" mode follows the OS,
  so the components do too.

**Rules that follow:**
- **One source per name.** Publishing one name from both the server and the
  browser makes them overwrite each other. That is the two-way provider
  (above) and remains undesigned.
- **Put a server-owned provider in the layout**, so every page publishes its
  own value. A provider rendered on one page only leaves its value behind
  after a navigation, because values outlive their element.
- **Render it before the components**, so they get the value at mount. If a
  component mounts first, the value arrives a moment later through its
  handler, so order affects only a brief flash, never correctness.

**Core side.** Each controller subscribes once, in its first `mount()`. A
provider change re-runs the ordinary `update()`, which re-reads the props and
dispatches the changed keys. The subscription is kept across remounts and
released on destroy and on a failed mount.

**Public JS API** (`import ... from "xenia"`): `setProvider(name, value)`,
`readProvider(name)` (`{ value }` or `null`), and
`subscribeProvider(name, fn)`, which returns the unsubscribe function. Code
outside Xenia's adapters can read the same values.

---

## 6. Verified findings — do not re-litigate

### LiveView behaviour (confirmed against 1.2, in a browser)

**Props travel via `data-*` attributes.**
On a `phx-update="ignore"` container, LiveView ignores children and normal
attributes but diffs and merges `data-*`. `updated()` fires when the dataset
actually changes. Confirmed live: 3/3 fires, ignored child content untouched.
No `push_event` needed for props.

**`destroyed()` is late — do not trust it for liveness.**
`View.destroy()` waits on a channel leave ack, not same-tick DOM removal.
Measured ~660–710ms after navigation. A cached dynamic `import()` resolves in
~0–1ms, long before `destroyed()` fires.

- Guard async continuations with `this.el.isConnected`, never a flag.
- For ~700ms after navigation, the old instance is alive while the new page has
  already mounted. Two instances coexist.
- Adapters owning keyed global resources (Monaco model URIs, Leaflet map
  containers, chart canvas registrations) MUST namespace the key by element id,
  or reuse-if-exists rather than create.
- This is also why provider stores cannot be hook-owned — §5.
- **Under Local LiveView this window likely collapses** (no WebSocket, no leave
  ack). Likely, not proven — S2 measures it. `el.isConnected` is a DOM
  property and works either way, so the design is already robust here.

**Re-measured 2026-10-17. This conflicts with the finding above and is
unresolved.** Setup: LiveView 1.2.10, Chromium, live navigation from
`/editor` to `/editor` (same LiveView), with and without
`liveSocket.enableLatencySim(500)`:
- The old `destroyed()` ran **0–1 ms** after `phx:page-loading-start`, before
  the new page's `mounted()` (18–46 ms later, about 1 s with simulated
  latency). No overlap was observed in 3 of 3 navigations, with or without
  latency.
- Inside `destroyed()`, the old `el` was still connected
  (`isConnected === true`).
- Inside `destroyed()`, the view was already disconnected: `pushEvent` was
  rejected with "unable to push hook event. LiveView not connected". The same
  event flushed at `phx:page-loading-start` reached `handle_event/3`.

What follows until this is resolved:
- Keep designing for overlap. It costs little, and the 660–710 ms above came
  from a real measurement, perhaps a different version or navigation kind.
- Don't detect a dying instance with `isConnected` alone. Pair it with a flag
  set at destroy, as `ctx.isAlive()` in §4 does. This amends "never a flag"
  above.
- Never flush outbound events in `destroyed()`. Flush at navigation start
  (§4 Events).

To resolve it, re-run the original measurement and record what differs:
LiveView version, navigation kind, `live_session`.

**Monaco: `setValue()` is wrong.**
It destroys all but one cursor/selection, and silently clears the entire undo
stack (`canUndo()` true → false). Use `executeEdits(source, edits, endCursorState)`
with the prior `getSelections()`, then `pushUndoStop()`. Verified: selections
preserved, undo history intact. (Server updates now use the model-level
variant, because `executeEdits` fails while read-only. See M1 findings below.)

**Therefore `value` is not a normal prop.** Xenia core must never apply `value`
itself — it hands the change to the adapter.

**Echo suppression does not generalise.** Chart.js needs none. A Custom Element
needs a boolean flag. Monaco needs a version counter plus selection restoration
plus a `getValue()` comparison. Per-prop and opt-in. Never in the core.

### M1 findings — Monaco adapter (verified in a browser, 2026-09)

**Never mount a library on the ignored container itself.** On every patch,
LiveView syncs the `data-*` attributes of a `phx-update="ignore"` element to
the server's HTML. It deletes any `data-*` attribute the server didn't render
(`mergeAttrs` in `phoenix_live_view.esm.js`, the `isIgnored` branch). Monaco
writes `data-keybinding-context` and `data-mode-id` onto its container.

Losing `data-keybinding-context` silently disables every keybinding after the
first server round-trip: arrows, Backspace on a selection, delete line, select
all + delete. Typing keeps working, because it doesn't go through keybindings.
Putting the attribute back by hand restored the keys.

Fix: the library mounts into a child element. LiveView never touches the
children of an ignored element. This is why §4 gives adapters an `el` inside
the container. It applies to any library that writes `data-*` attributes onto
its container.

**Monaco: `executeEdits` refuses every edit while `readOnly` is set.** Server
updates were silently dropped in read-only mode. Use
`model.pushEditOperations(selections, edits, () => selections)` between two
`model.pushStackElement()` calls, then `editor.setSelections(selections)`.
This gives the same guarantees as the `executeEdits` recipe above (verified:
multi-cursor preserved, `canUndo()` stays true), and it works while read-only.
Read-only stops the user, not the server.

**Monaco workers and esbuild.** Monaco 0.57 finds its workers with
`new URL(..., import.meta.url)`, which esbuild doesn't bundle. Monaco then logs
"Could not create web worker(s)" and "Failed to construct 'URL': Invalid URL",
and every worker-based feature is broken: word, TypeScript, JSON, CSS and HTML
suggestions. Fix, in the consuming app: build the worker files as separate
esbuild entry points, and set `self.MonacoEnvironment.getWorker(_, label)` to
map language labels to them (see `xenia_demo`). The app owns this, not Xenia,
because worker URLs depend on the app's asset pipeline. Document it in the
README.

**Monaco themes are global.** `monaco.editor.setTheme` changes every editor on
the page. With two editors and different `theme` props, the last one applied
wins. So §5's "an explicit prop beats the provider value" cannot hold per
instance for Monaco. This is a known exception; take it into account in M6.

### M4 findings — declarations (verified 2026-10-19)

**A macro that generates a function component can't simply write `def` in
its `quote`.** `use Phoenix.Component` replaces `def` with its own macro,
which marks the function as a component so the pending `attr`s attach to it.
Inside a library macro's `quote`, macro hygiene binds `def` to `Kernel.def`
at the library's definition site. Phoenix then rejects the attrs: "could not
define attributes for function chart/1". Fix: build the `def` node
separately and drop its `:imports`/`:context` metadata, so it resolves in
the calling module (`lib/xenia/core/components.ex`). This doesn't depend on
Phoenix's private `Declarative` module.

**Running `use Phoenix.Component` twice in one module breaks
`--warnings-as-errors`.** Once the module calls another component, Phoenix
defines `__phoenix_component_verify__` twice, which is a "redundant clause"
warning. Apps declare components in modules that already use it, so
`use Xenia.Components` must skip its own `use` when one has run. Detect that
with `Macro.Env.lookup_import(__CALLER__, {:def, 2})` returning
`{:macro, Phoenix.Component.Declarative}`. Imports are lexical, so they're
known at expansion time. **`Module.has_attribute?(module, :__attrs__)` does
not work:** it is `false` at expansion time even after the `use` (verified
with a probe).

**A DSL needs a formatter export.** Without
`export: [locals_without_parens: [component: 3, prop: 2, prop: 3, event: 1]]`
in Xenia's `.formatter.exs`, `mix format` rewrites `prop :type, :string` to
`prop(:type, :string)` in every app. Apps opt in with
`import_deps: [:xenia]`.

**Phoenix and LiveView list Jason only as optional.** A library that
encodes JSON at runtime must depend on it directly. Otherwise
`Phoenix.json_library()` names `Jason` in the test environment while Jason
isn't loaded (found in M3, kept in `mix.exs`).

**Monaco: a `revision` bump alone didn't force the server's value.** When
the server rejects an edit, it keeps its older `version`. The adapter took
that for a stale echo and ignored it, so the rejected text stayed in the
editor. A changed `revision` now means "the server forces its value", and
the version check is skipped (`monaco.props.value` in
`assets/adapters/monaco.js`). Verified in the browser with the fix switched
off (the test fails, the text stays) and on (it passes).

**Chart.js confirms the reason for `ctx.remount()`.** Chart.js can't change
`type` in place: changing it remounts the chart, and the new instance gets
the latest props. `data` updates in place on the same instance and canvas
(browser tests in `xenia_demo/assets/e2e/chart.test.mjs`).

### M5 findings — unknown libraries and custom elements (verified 2026-10-20)

**LiveView can revert `data-*` attributes on a locked, ignored container.**
`hook.pushEvent` locks the hook's element until the server replies. Shoelace's
rating emits `hover`, `focus` and `change` in quick succession, so several
locks overlapped. A reply that left the container unchanged made LiveView save
a copy of it (it was "skipped" while locked, `dom_patch.ts`). The next reply's
new `data-xenia-props` went straight into the DOM, because the element is
`phx-update="ignore"`, but not into the copy. On unlock, LiveView restored the
copy.

Observed: `data-xenia-props` went 0 → 4 → back to 0 within 6 ms, while the
server held 4. It was reproduced on `/rating` (LiveView 1.2.10). Three plain
LiveView reproductions (two events, inside a loop, through a function
component) did not trigger it; the exact conditions are still being isolated.

**Fix:** the core pushes events with `liveSocket.execJS` and a `push`
command, from a hidden `<span>` of its own inside the container (§4 Events).
LiveView never patches that element, so locking it is harmless. Verified on
the same page: without the fix the rating snaps back to 0, with it the
server's 4 stays. Any hook that pushes several events from an element
LiveView patches is exposed to this.

**Files can't travel as events.** Xenia events are JSON. Uploading a
wavesurfer recording needed `ctx.hook.upload` (LiveView's upload channel),
the only escape-hatch use across six adapters. It is tested end to end in the
browser. **Resolved in M5.5:** `ctx.upload` (§4 ctx), and the wavesurfer
adapter uses it.

**Destroy-before-mount holds across different LiveViews too.** `/chart` →
`/graphs` and back, with and without `enableLatencySim(500)`: the old page's
components are destroyed within 1 ms of navigation starting, before the new
page's mount. See the 2026-10-17 entry above.

**Content that isn't a prop survives a remount only if the server keeps
it.** A terminal's screen is a stream of `write` commands. `/terminal` keeps
a transcript on the server and replays it when the adapter reports `ready`.
That's the pattern for any stream-shaped library (terminals, logs, chats).

**Testing notes.**
- **Shoelace's rating** handles clicks on its row of stars, so Playwright
  must click at a star's position, not on the star element.
- **Microphone. Corrected in M5.5:** this note said `getUserMedia` never
  resolves in headless Chromium on macOS. That was wrong. wavesurfer's
  `RecordPlugin.isActive()` returns true before the first recording (it
  compares a missing MediaRecorder's state with "inactive"), so the adapter
  never started. With the adapter checking `isRecording() || isPaused()`
  instead, Record and Stop work on Chromium's fake microphone, and
  `waveform.test.mjs` tests them.
- **Forms:** LiveView rejects an `<input name="id">` inside a form, which
  fails `--warnings-as-errors` and errors at runtime.

### M5.5 findings — form participation (verified 2026-10-23)

Browser tests: `xenia_demo/assets/e2e/form.test.mjs` on `/form`, where
`<.monaco field>` and `<.rating field>` sit next to a plain `<.input>`.

**The form input never follows the server by itself.** It sits inside the
`phx-update="ignore"` container, and LiveView never patches an ignored
element's children (§6, M1). So the adapter copies server changes into it
quietly (§4 Form fields). Tested by "Load example": the server changes every
field without a `revision` bump, and an untouched submit sends the server's
values, with no extra `phx-change`.

**Form echoes are real, and the Monaco adapter now handles them.** Every
`phx-change` reply re-renders the editor's value from the params of that
moment. In the M5.5 spike, a user changed the title and then typed
"IO.puts :hello" at 40 ms per key. In 5 of 8 runs the editor ended up with
"I.puts :helloO". The adapter now keeps the values it reported (pending
echoes) and ignores replies carrying them. A match also drops every earlier
entry, because replies arrive in order. The same scenario now passes 8 of 8
runs.

Two refinements, found by the tests:
- **Monaco can report one final text many times.** An 18-character
  `insertText` gave 18 change events, each reading the finished text. Only
  the first changes the form's input, so only one reply comes back. The
  other 17 stayed pending and later swallowed a real value. A value equal to
  the last one reported is now not recorded again.
- **Applying any server value clears the pending echoes.** After a
  reconnect, the fresh render (`""`) arrived first, then form recovery's
  reply with the user's text. That text was a pending echo, so it was
  ignored, and the editor stayed empty while the server held the text.
  Replies arrive in order, so once a value from the server is applied, every
  earlier report was either answered or its reply was lost.

**`type="hidden"` inputs never count as "unused", so errors showed too
early. Fixed.** Phoenix shows a field's errors once `used_input?/1` is true,
and LiveView sends `_unused_<name>` for inputs nobody touched. It never sends
that for a field made only of `type="hidden"` inputs (`serializeForm` in
`phoenix_live_view.esm.js`). Measured on `/form`: changing only the title
made the code and rating errors appear at once. With
`<input type="text" hidden>`, they behave like `<.input>`: no error until the
user changes the field (dispatching `input` marks it used), and every error
after a submit. Xenia renders that now (§4 Form fields), and the browser test
passes.

**A custom element pays one prop handler for being a form field.** The
Shoelace rating had no `props` map at M5. As a form field it needs a `value`
handler: it turns the form's string back into a number, and copies server
changes into the form quietly. Being a form field also costs one line in its
change listener. Monaco needed pending echoes, about 40 lines.

**Form recovery works.** After a disconnect and reconnect, LiveView resent the
components' inputs, and the server got the editor's text and the rating back.

### M6 findings — shared providers (verified 2026-10-24)

Browser tests: `xenia_demo/assets/e2e/theme.test.mjs` on `/theme` (8 tests).
Core tests: `test/js/provider.test.js` (the store) and
`test/js/provider_props.test.js` (delivery, precedence, lifetime, the
`XeniaProvider` hook, Monaco's mapping).

**Providers reuse the per-prop handler map. No new lifecycle concept.** The
§10 kill condition "providers need their own lifecycle" didn't trigger. In
the core, a provider change re-runs the existing `update()`; in an adapter,
the theme is one more prop handler.

**Phoenix 1.8's theme is browser-owned.** Its header toggle stores the choice
in `localStorage` and sets `<html data-theme>`. In "system" mode it follows
the OS, and the root layout updates `data-theme` when the OS setting
changes. The server never sees it. So the app-wide theme is published from
the browser (§5 As built), and Elixir doesn't know it (§12).

**The Chart.js adapter lost its theme watcher.** Its dark mode was a
`MutationObserver` plus an OS media query per chart, started in `mount` and
stopped in `destroy`. It is now `consumes` plus a one-line `theme` handler:
29 lines for the same features (31 before), 33 with the new `locale`
handler. The native element and the classic hook on `/chart-compare` still
watch the page themselves.

**Verified in the browser:**
- Monaco and the chart follow the toggle into dark and back, including
  "system" with the OS emulated, on the same instances.
- A pinned chart (`theme="light"`) ignores the toggle.
- Plain app code reads `theme` and `locale` back through
  `readProvider`/`subscribeProvider`.
- The server-owned `locale` reformats the chart's numbers ("6,000" →
  "6.000") without a remount.
- Components that mount after a change, on another page and back, get the
  value at mount, and the handler isn't called.
- After that navigation, one toggle calls the handler exactly once: no
  duplicate subscriptions.
- The next page's layout publishes its own `locale`, so a value isn't left
  over from the previous page.

### M7 findings — the dry run (verified 2026-10-24)

A fresh `mix phx.new` app (Phoenix 1.8.9, LiveView 1.2), following only the
README, with Xenia unpacked exactly as `mix hex.build` would publish it. Step
log: `xenia-m7-scratch/first_xenia_app/XENIA_STEPS.md`.

**A path dependency on the dev checkout hides packaging bugs.** The checkout
has `node_modules` from Xenia's own development, and the published package
doesn't. esbuild resolved `monaco-editor` from the checkout's copy, so
`xenia_demo` never showed either problem below. **Dry-run against the
unpacked package, never the checkout.**

**Monaco in the core bundle broke every app's first build.**
`import { createHooks } from "xenia"` failed with `Could not resolve
"monaco-editor"` in an app that doesn't use Monaco: esbuild resolves every
import in a bundle at build time, used or not.

**Monaco imported from inside the package broke Monaco apps too.** With
`monaco-editor` installed in the app's `assets/node_modules`, as documented,
esbuild still couldn't find it. It resolves a bare import starting from the
importing file, which was inside Xenia's package, and Phoenix's `NODE_PATH`
doesn't include `assets/node_modules`.

**Fix: Monaco is its own entry point, and the app passes the import.**
- `"xenia"` is the core only (`priv/static/xenia.esm.js`).
- `"xenia/monaco"` (`priv/static/xenia-monaco.esm.js`) exports
  `createMonaco({ load, setup })` and the `MonacoAdapter` class.
- The app writes `load: () => import("monaco-editor")`, so the import
  resolves from the app's own code.
- Neither bundle imports anything. `mix check` proves it by bundling each
  file on its own with esbuild, with no `monaco-editor` installed. It fails
  on the old bundle with the dry run's exact error.
- Xenia's lockfile no longer installs `monaco-editor` (now an optional peer),
  so the checkout can't hide this again.

**Verified:**
- An app without Monaco builds with `monaco-editor` not installed at all.
- The dry-run app and the demo build without any `NODE_PATH` workaround.
- The dry-run app's chart, editor, theme and form field work in a browser.
- The demo's browser suite passes (67 tests, twice).

**What the README lacked** (fixed in the rewrite): the user README
contained the contributor setup; its first snippet replaced `LiveSocket`'s
options, dropping the CSRF token; the first example was Monaco; Monaco's
workers, font loader and second stylesheet were only in `xenia_demo`; and
there was no complete first LiveView. The quickstart's LiveView was run
verbatim in the dry-run app.

**The "wrapping a library" guide works on its own.** Its complete
flatpickr date picker, a library Xenia had never seen, was copied verbatim
into the dry-run app as a form field. Verified in the browser:
- a user's pick reaches the form and is submitted
- a server change shows in the picker and is copied into the form quietly
- the `clear` command empties both
- no console errors

Writing it surfaced one trap: flatpickr's `clear()` fires its change
callback, which would send a `phx-change` for a change the server asked for,
so the guide uses `clear(false)`. Any library whose programmatic setters
fire user-change callbacks has the same trap.

**The GitHub repository returns 404** for anonymous visitors (private or
not pushed). The Hex package links to it, and so does every docs "View
source" link. It has to be public before publishing (`docs/RELEASING.md`).

### M9 findings — generated routes (verified 2026-10-24)

`xenia_routes` against real Phoenix: `test/xenia/routes_test.exs` (12
tests, compiling real routers) and `xenia_demo` (`/app`, from
`lib/xenia_demo_web/app`; browser tests in `assets/e2e/app_routes.test.mjs`).

- **Phoenix accepts the generated routes.** `mix phx.routes` lists them. The
  module name as live action (`live "/settings/profile", SettingsLive,
  ProfilePage`) works. A surrounding scope's path and `live_session` apply,
  and its alias isn't prepended (`scope "/", alias: false`). `~p` verified
  routes accept the generated paths. `__mix_recompile__?/0` doesn't clash
  with anything in a Phoenix router.
- **Both modes render, and behave as Phoenix documents.** Switching pages
  under a `live.ex` is a patch: same process, shared state kept, and
  `handle_params` runs again. Navigating to another owner mounts a new
  LiveView. Private `_folders` and the bare group URL are 404.
- **Recompilation works without a restart.** Through the dev server's code
  reloader, adding a page turns 404 into 200, renaming moves the URL, and
  removing it gives 404. From the command line, adding a page compiles it
  and the router, and removing it recompiles the router. A duplicate path is
  a compile error naming both files (500 in the dev server), and fixing it
  recovers without a restart.
- **Phoenix checks every route's LiveView at compile time.** It warns when
  a module has no `__live__/0`, which fails `--warnings-as-errors`. So a
  standalone `page.ex` must be a LiveView, or the route must point at a
  generated LiveView. This bears on the `Xenia.Page`/`Xenia.Live` design.
- **What was wrong, and is fixed:**
  - `Xenia.Routes` was in `test/xenia/routes.ex`, which Mix never compiles,
    so the library had no `xenia_routes`. Moved to `lib/`.
  - The Phoenix stand-ins were removed; tests use the real router.
  - `xenia_routes: 1` was added to the formatter export. After updating a
    path dependency's `.formatter.exs`, apps may need to delete
    `_build/*/lib/<app>/.mix/cached_dot_formatter`.
  - `Xenia.Layout` now skips a second `use Phoenix.Component` (the M4
    warning) and declares `frame/1` as a behaviour callback.
- **A catch-all also matches zero parts (verified 2026-10-25).** Phoenix's
  `*path` matches `/docs` as well as `/docs/a/b`, with `params["path"] ==
  []`, unlike Next.js, where `[...path]` needs at least one part and
  `[[...path]]` is the optional form. So `[...path]` is already optional:
  the `[[...path]]` error now says to write `[...path]`, and `[[id]]` says
  to put a `page.ex` in the folder above. Measured on the examples app's
  `/routing/docs` (`examples.test.mjs`).
- **Test isolation:** `capture_io(:stderr)` is global, so in async tests
  compiler warnings leak between tests. Collect them with
  `Code.with_diagnostics([log: false], fun)` instead.
- **The runtime, verified in the browser** (`xenia_demo/assets/e2e/app_layouts.test.mjs`,
  8 tests, on `/app`, a skeleton of `docs/EXAMPLE_APP.md`):
  - signed out, the `(auth)` layout's `on_mount` redirects to the sign-in page
  - frames nest root, then auth, then runbooks; the panel sits beside the
    shell, not inside it
  - the shell keeps its process, its state and its Monaco editor (the same
    instance, with its text) across the group's pages
  - the shell's highlight follows `handle_navigation/2`
  - the runbooks panel lives across runbook pages and goes away outside them
  - leaving the group removes the shell
  - signing out ends access
- **Change tracking through frames.** A frame gets the page's assigns,
  including `__changed__`, which never lists `inner_content`. So the frame
  kept the page as first rendered: a patch under a `live.ex` showed the old
  page. `Xenia.Page` marks `inner_content` as changed; the page inside is
  still change-tracked. Tested in `test/xenia/page_test.exs`.
- **A running dev server doesn't reload a path dependency.** After changing
  Xenia, restart the demo server. Phoenix's code reloader only recompiles
  the app itself.
- **In-browser tests should wait for LiveView to connect**
  (`[data-phx-main].phx-connected`), not a fixed delay. `npm run e2e` runs
  the files in parallel, and under that load a fixed delay wasn't enough
  once.

### M10 findings — co-located adapters (verified 2026-10-24)

Browser tests: `xenia_demo/assets/e2e/colocated.test.mjs` (3 tests) on
`/app/reports/sales` and `/app/reports/traffic`, two pages that each define
`.Chart`. Core tests: `test/js/adapter_hook.test.js`, and co-located cases
in `test/js/adapter_check.test.js`, `test/xenia/component_test.exs` and
`test/xenia/components_test.exs`.

- **LiveView resolves `.Name` only in a literal `phx-hook=".Name"` on a
  plain HTML tag.** Its HEEx compiler rewrites that attribute with the
  template's module (`postprocess_attrs` in
  `phoenix_live_view/tag_engine/compiler.ex`). `<.xenia>` is a function
  component that runs at render time and never learns its caller, so it
  can't resolve `.Chart`. Xenia does it at compile time instead: the
  `colocated/1` macro (`__CALLER__.module`), or the `component` macro for a
  declaration. A bare `adapter=".Chart"` raises an error naming
  `colocated/1`, instead of rendering a hook name that never matches.
- **The naming is ColocatedHook's:** `".Chart"` in `MyAppWeb.SalesPage`
  becomes `"MyAppWeb.SalesPage.Chart"` (`"#{inspect(module)}.#{name}"`).
  LiveView accepts any text after the dot; Xenia refuses spaces and further
  dots, which would make a confusing name. The `<script>` renders nothing.
  Its JS is exported from `phoenix-colocated/<app>` under `hooks`, which a
  Phoenix 1.8 `app.js` already spreads into the LiveSocket. So "no change
  to `app.js`" means per adapter; the one-time setup is Phoenix's.
- **`adapterHook` is not a second implementation.** `createHooks` builds
  each of its hooks with it, so a co-located adapter has every channel:
  props, events, commands (`Xenia.push_to/4`), forms, providers. It is
  registration, not a lifecycle concept (§10 kill condition untouched).
  `createHooks` is still called once, for the built-in `XeniaProvider` and
  `XeniaNavigation` hooks.
- **One copy of `"xenia"`.** The co-located file imports `"xenia"` itself.
  esbuild resolves it to the same file as `app.js`'s import (both through
  `NODE_PATH`, real paths), so there is one provider store. Verified: the
  traffic page's co-located adapter follows the theme toggle. Two copies
  would have left its `theme` prop empty.
- **The missing-adapter check needed to know co-located hooks.** It only
  knew `createHooks` names, so it would have reported every co-located
  adapter as unregistered. It now also accepts hooks in
  `window.liveSocket.hooks` (Phoenix's `app.js` sets `window.liveSocket`).
  A dotted name the LiveSocket lacks gets its own message (the `<script>`
  and the `phoenix-colocated` import to check). Without `window.liveSocket`,
  a dotted name isn't checked. Error messages from `adapterHook` name the
  adapter the server rendered (`data-xenia-adapter`).
- **A declared tag in a page module can clash with a globally imported
  component.** The demo imports a `<.chart>` everywhere, so
  `component :chart` in a page failed with "imported
  XeniaDemoWeb.Charts.chart/1 conflicts with local function". The page uses
  `component :traffic_chart`. An app naming question, not a Xenia one.

### M11 findings — generators (verified 2026-10-24)

Tests: `test/mix/tasks/xenia_gen_test.exs` (20 tests: each generator runs in
a temporary folder, its Elixir is compiled with warnings collected, and Node
parses its JavaScript). Browser: `xenia_demo/assets/e2e/generated.test.mjs`
(2 tests) on pages, a layout, a persistent part and a component generated
in the demo.

- **Generated files are clean in a real app.** In `xenia_demo`, every
  generated file compiled with `--warnings-as-errors` and passed
  `mix format --check-formatted`, HEEx formatter included. The generators
  run their Elixir through `Code.format_string!` with Xenia's DSL calls
  without parentheses, as `import_deps: [:xenia]` formats them.
- **The generated component works unedited.** After the two printed
  `app.js` lines, `<.gauge>` mounted its placeholder (a `<pre>` of its
  props) and followed a server change. The generated layout framed both
  generated pages, and its persistent part kept its DOM element across the
  navigation between them, reporting each URL through `handle_navigation/2`.
- **A page under a `live.ex` must not be a LiveView.** The generator reads
  the folder (Discovery) and writes a render-only module there, since the
  `live.ex` owns state and events.
- **Generators check the folder before writing,** with Discovery over the
  existing files plus the new ones: a conflicting URL, a `persistent.ex`
  without its `layout.ex`, `--on-mount` below a `live.ex`. One check is
  skipped: a `live.ex` that owns no pages yet is the folder's unfinished
  state, not the new file's fault (`Discovery.pages(files, check_owners:
  false)`). Without that, a layout couldn't be generated next to a new
  `live.ex` before its first page.
- **Co-located output is printed, not inserted.** Generators don't edit
  existing modules. `--colocated` prints the declaration and the
  `<script :type={ColocatedHook}>`; Node parses the printed script.
- **Names.** Module names mirror the folders: `(auth)/runbooks/[id]` gives
  `MyAppWeb.App.Auth.Runbooks.IdPage`, `(auth)` gives
  `MyAppWeb.App.AuthLayout` and `MyAppWeb.App.AuthPersistentLive`, and the
  app folder itself gives `HomePage` and `RootLayout`. The app's web module
  and folder come from its `:app` (`:my_app` → `MyAppWeb`,
  `lib/my_app_web`), as Phoenix generates them; `--web-module`,
  `--web-path` and `--root` override them.

### Official adapters, Stage 1: Chart.js (verified 2026-10-25)

`createChartjs` from `"xenia/chartjs"` (`assets/adapters/chartjs.js`) and
`<.chartjs>` (`Xenia.Adapters.Chartjs`), from the author's adapter set. Tests:
`test/js/chartjs.test.js` (11, with a fake Chart.js passed in),
`test/xenia/chartjs_test.exs`, the entry-point test, and three browser
tests on the examples app's `/chartjs`.

- **Passing the library in removes the M7 build blocker.** The bundle
  imports nothing; `mix check` bundles it on its own with no Chart.js
  installed. Verified end to end in a fresh `mix phx.new` app with Xenia
  unpacked as Hex ships it (three bundles in `priv/static`), Chart.js
  installed only in the app: esbuild resolved both, the chart rendered, and
  a bar click reached `handle_event`.
- **It also makes the adapter testable.** A fake Chart class passed through
  `load` records what the adapter asks of it: no jsdom canvas, no real
  library.
- **Load once, register once.** `load` runs once per factory (the first
  mount), and a failed load is retried by the next mount. Plugins are
  registered once per Chart.js module, tracked by a WeakMap keyed by the
  module, so several factories sharing a plugin don't register it twice.
- **Removed while loading.** A chart destroyed before Chart.js resolved is
  never drawn: `mount` checks `ctx.isAlive()` after the await, and the core
  calls `destroy` on the returned instance.
- **The theme moved to `consumes`.** The original adapter watched
  `<html data-theme>` and the OS itself (a §5 anti-pattern). Now the app's
  theme arrives as the `theme` prop; `theme="light"` pins one, `false` turns
  colors off. The original's `"auto"` value is gone: an explicit prop can't
  see the provider's value.
- **Global state became factory options.** `registerChartPlugins()` (a global
  on Chart.js) is now `plugins:`. Factory `options` sit between the themed
  defaults and each chart's `options`. `setup(chart, {Chart, ctx})` runs
  for each new chart, and a returned function runs before it's destroyed.
- **Extension by spreading works,** in a unit test and in the browser
  (`revenueChart` adds a `total` event by wrapping `props.data` and
  `mount`). `instance.chart` is documented for handlers.

### Official adapters, the other fourteen (verified 2026-10-25)

flatpickr, Shoelace rating, SortableJS, Tom Select, Leaflet, Tabulator,
FullCalendar, xterm, Monaco diff, Tiptap, Uppy, wavesurfer, wavesurfer
multitrack and D3, from the author's adapter set. Tests:
`test/js/official_adapters.test.js` (62: the `load` contract for every
factory, with no library installed), `test/xenia/official_tags_test.exs`,
and one browser test per adapter in `examples/assets/e2e/adapters.test.mjs`
(15, plus the forms page), all passing.

- **The conversion was mechanical.** Each original module's body moved
  inside its factory, and the library names became `let` bindings assigned
  when `load` resolves (`withLibrary` in `assets/adapters/shared.js`). One
  trap: module-level values computed from the library (D3's curve table)
  must become lazy, because the library doesn't exist until the first
  mount.
- **`load` is shadowed easily.** wavesurfer had an inner `function load`,
  which hid the factory's `load` parameter, so the factory never got the
  library. Every factory now names it `{ load: libraryImport }`.
- **Leaflet's default marker requested images that 404.** Leaflet guesses
  its icon images' URL from the stylesheet's location, which a bundled app
  doesn't have. Markers are now created with the adapter's own icon
  (`markerIcon`: an SVG pin, or the marker's `icon_url`).
- **wavesurfer multitrack had the M5.5 `isActive()` bug** (true before the
  first recording), so Record did nothing. It asks
  `isRecording() || isPaused()` (`recorderBusy`), as the wavesurfer adapter
  already did.
- **Theme watchers moved to `consumes`,** as in Chart.js: xterm (a light and
  a dark palette, or a theme object) and Uppy no longer watch
  `<html data-theme>` themselves.
- **Custom D3 charts are a factory option.** The original exported a global
  `registerD3Chart`; it is now `createD3({ load, charts: { name: { create,
  update, destroy } } })`, kept per factory like Chart.js's plugins.
- **Third-party CSS is the app's.** Tom Select's and Tabulator's styles are
  light only. The examples app maps them onto the theme's colour tokens in
  its own `app.css`; Xenia ships no library CSS.
- **Browser-testing notes.**
  - flatpickr appends its calendar to `body`, so use page-level selectors.
  - Tom Select: wait for the active option before pressing Enter.
  - SortableJS (with `force_fallback`): drag in small steps, and pause
    before releasing.
  - In Monaco's diff editor, click a real line, not the empty space below.
- **The examples app must not set `"type": "module"`** in its
  `package.json`: esbuild then treats Phoenix's CommonJS `vendor/topbar.js`
  as ESM, and the build breaks.

### Starter template — `mix xenia.install` (verified 2026-10-25)

Tested against the files of a pristine `mix phx.new` (Phoenix 1.8.9,
`test/fixtures/phoenix_1_8`, stored as `.txt` so the root formatter leaves
them alone; `test/mix/tasks/xenia_install_test.exs`, 3 tests), and in a
fresh app with Xenia unpacked as Hex ships it:
- every step reports `updating` or `creating`, nothing by hand
- `mix compile --warnings-as-errors` passes, and the assets build
- the generated `layout.ex` and `page.ex` pass `mix format` with the HEEx
  formatter
- light and dark render with no console errors

Findings:
- **The HEEx formatter rewraps long text in templates.** A paragraph mixing
  text and `<code>` had to stay on one line in `page.ex.eex`, or the first
  `mix format` in the new app changed a file it had just generated. The
  test now formats both generated files and compares.
- **The daisyUI plugin path is the app's.** Phoenix 1.8.9 writes
  `"daisyui/packages/bundle/daisyui-theme"`. The installer doesn't hardcode
  it: it keeps whatever path the app's own theme block uses
  (`DAISYUI_THEME_PATH` in `theme.css`), because that path depends on how
  the app gets daisyUI. A design choice, not a measured difference.

### M12 findings — icons, notifications, languages (verified 2026-10-25)

Browser: `examples/assets/e2e/everyday.test.mjs` (9). Server:
`examples/test/xenia_examples_web/everyday_test.exs` (7).

- **`@iconify/tailwind4` doesn't load in Phoenix's standalone Tailwind
  binary** (4.3.0). In either mode the build exits 1 with no message; a
  `require` from a vendor plugin shows "Cannot find module
  '@iconify/tailwind4'". It is an ES module ("type": "module"); the
  binary resolves and reads `@iconify-json/<set>/icons.json` fine. So the
  examples use `assets/vendor/iconify.js`, Phoenix's `heroicons.js`
  pattern over the Iconify JSON: `lucide-save`, `mdi-check-circle`.
- **The production build includes exactly the named icons.** Proven with
  `MIX_ENV=prod mix tailwind --minify`: a bare class string and a name
  written as `<.icon name="...">` are both in the CSS; unreferenced icons
  aren't. A name built at runtime would be missing, as for any Tailwind
  class, so names are written in full (documented).
- **LiveView never re-renders an expression without assigns**
  (`engine.ex`, `to_conditional_var/3` with no keys: `nil` once `changed`
  is a map). So `{gettext("Save")}` stays in the old language after an
  in-place switch. Pages that switch live keep their words in an assign
  (`@t`), recomputed after the switch; interpolated text takes `@locale`.
  Without live switching, `gettext` in templates is fine.
- **LiveSocket calls its `params` function on every view join**
  (`view.ts`, `connectParams`), live navigation included. The examples
  put the `locale` cookie there, so the next page mounts in the new
  language; a plug reads the same cookie for the first HTTP render.
- **Flash kinds:** `put_flash` takes any key, but Phoenix's generated
  `<.flash>` renders only `:info` and `:error`. The examples add
  `:success` to the component and to `flash_group/1`.
- **The flash countdown is a CSS animation, closed by a colocated hook.**
  An SVG `<rect pathLength="100">` over the border, its stroke running out
  over `--flash-duration`; `animationend` runs the message's own
  `phx-click` (`this.js().exec(...)`: `lv:clear-flash` + hide), so the
  server's flash is cleared too (tested: no flash after the next render).
  Hover pauses it with `animation-play-state`, no JS timer. A dynamic
  `phx-hook={...}` wouldn't resolve a `.Name` (M10), so the hook is on
  every flash, and does nothing without a countdown.
- **LiveView calls a hook's `updated()` after every patch that touches its
  element, not only when its content changes.** The first flash hook
  restarted the countdown and re-sorted the stack on every unrelated
  update (measured: all three messages' `order` changed on each click).
  The hook now compares the message's text and acts only when it changed;
  a browser test checks a countdown survives another update.
- **Newest first without moving DOM nodes:** each message gets
  `style="order: -n"` through `this.js().setAttribute` (sticky across
  patches); `flash_group` is one flex column (daisyUI `toast`).
- **A pill-shaped `<rect>` needs `ry: 50%; rx: auto`.** `rx: 9999px`
  alone gives an ellipse: `ry` copies `rx` before both are clamped to half
  the width and half the height.
- **Two dev servers on one `_build`** (the author's on 4000 and the test
  server on 4002) make `mix compile` wait for the build lock while the
  other recompiles. Harmless; it clears.

### Metadata and sitemap findings (verified 2026-10-25)

Tests: `test/xenia/metadata_test.exs` (13), `test/xenia/sitemap_test.exs`
(6, real routers compiled from an app folder), installer tests. Browser:
`examples.test.mjs`, "metadata and sitemap".

- **`attach_hook(:handle_params)` raises without a router** ("the view was
  not mounted at the router"), e.g. under `live_isolated` in an app's own
  tests. `on_mount :metadata` skips when `socket.router` is nil.
- **A layout's default title overwrote pages' own `page_title`** in the
  first version (every examples page became "Xenia examples"). Fixed: it
  only fills in for pages without one.
- **An empty catch-all gave `/docs/`**; the sitemap trims it to `/docs`.
- **A catch-all page with `sitemap/0` returning `%{path: []}`** is the
  folder's own URL, consistent with the routing finding above.
- Verified on the examples app: templated titles on the first load, the
  tab title following live navigation, `og:type` from the page beating the
  root layout's, `robots: noindex` for a missing post, and a sitemap
  without the `sitemap: false` group. And in a fresh `mix phx.new` with
  Xenia unpacked as Hex ships it: `mix xenia.install` adds the tags, and
  the home page is "Welcome · Demo App" with the layout's description.

### Calls findings — the spike (verified 2026-10-25)

Question: can a reply come back without locking the container (§6 M5)?
Read in LiveView 1.2.12's source (`view_hook.ts`, `view.ts`, `js.js`):
- `hook.pushEvent` and `hook.pushEventTo` both lock the hook's own element
  (`pushHookEvent(this.el, …)`), so a reply through the container's hook
  locks the container.
- `liveSocket.execJS` accepts an array (`EncodedJS = string | Array`), and
  `exec_push` passes an internal `callback` to the view's `pushEvent`,
  which calls it with the reply. But `callback` is undocumented: private
  API, rejected.
- So: a second, never-patched hook inside the container (`XeniaCall`).

Measured on the examples app's `/adapters/tom-select` (server search, 200
ms per reply, each reply also changing the island's `placeholder` prop):
- **A hook inside a `phx-update="ignore"` container mounts:** the span was
  locked once per call, which only its own `pushEvent` does.
- **The container was never locked** (0 times), and the props never went
  back (1, 2, 3, 4), with several calls in flight during fast typing.
- **Each query got its own results** ("and" → 5 countries, "er" → 3).
- No console errors. Browser test: `adapters.test.mjs`, "server search
  through ctx.call". Unit tests: `test/js/call.test.js` (8).
- Not measured: whether LiveView mounts the span's hook in the same tick as
  the container's (a call made inside `mount`). The core waits one
  microtask, then falls back to the container's hook.

### Loading and errors findings (verified 2026-10-25)

Tests: `test/js/slots.test.js` (13), slot and `on_crash` cases in
`test/xenia/component_test.exs`, `components_test.exs` and
`monaco_test.exs`. Browser: `examples/assets/e2e/examples.test.mjs` on
`/loading`, with a stand-in adapter that loads slowly and fails once.

- **The placeholder is in the server's HTML,** so it shows before any JS.
- **It fills the island and so does the island:** with
  `style="height: 140px"`, the placeholder measured 140 px while loading,
  and the loaded island 140 px after it.
- **`on_crash` reaches the server** from a mount that rejects, before the
  teardown removes the core's event element.
- **A retry starts a fresh controller,** shows the placeholder again, and
  the island loads.
- **Found while doing it:** a failed mount left the shortcut `keydown`
  listener on the container (`abandonMount` didn't remove it). Harmless
  then, because the handler checks `isAlive()`, but each retry would have
  added one more. Fixed.

### Keyboard shortcut findings (verified 2026-10-24)

Tests: `test/js/shortcuts.test.js` (14), `test/xenia/shortcuts_test.exs`,
and shortcut cases in the component tests. Browser:
`examples/assets/e2e/examples.test.mjs` on `/monaco`.

- **The flush-first rule matters with real libraries.** Monaco debounces
  `change` by 300 ms. Typing a line and pressing ⌘S at once, the save saw
  4 lines without the flush (the test fails) and 5 with it (passes).
  Verified by removing the flush and running the browser test.
- **Matching by `event.code` is needed for Shift combos.** Playwright's
  ⌘⇧. sends `key: ">"`; `mod+shift+.` matches only through `code:
  "Period"`. The character is still tried first, so a non-QWERTY layout
  matches what's printed on the keycap (tested with AZERTY in the unit
  tests).
- **Focus scoping holds.** With focus on a button outside the editor, the
  same keys didn't change the font size.

### Subtraction study — completed

Three hooks hand-written to the same standard, every line annotated as
infrastructure or library-specific:

| Library | Lines | INFRA | LIB | INFRA % |
|---|---|---|---|---|
| Monaco | ~58 | 25 | 33 | 43% |
| Chart.js | ~33 | 15 | 18 | 45% |
| Custom Element | ~26 | 18 | 8 | 69% |

Identical across all three (~20 lines): decode props, hold/compare/write-back
previous, destroyed-check inside async `.then()`, `!instance` guard, scoped
`handleEvent` command channel, `applying` flag around server-originated writes.

- `updated()` has the same shape everywhere. Hence the per-prop handler map.
- A Custom Element collapses the map to one default handler (`node[k] = v`).
  This is the falsification test — see §10.
- The highest-value single fix is server-side: `push_event` is global and
  dispatched to all hooks handling that name. `Xenia.push_to/4` removes both the
  boilerplate and a class of cross-instance bugs.

**Do not redo this study.** Measuring Xenia against this baseline is an
acceptance criterion of M2.

**M2 re-measurement (2026-10-18).** Same counting as above: non-blank,
non-comment lines of the app-side Monaco integration. Worker setup and the
demo's completion provider are excluded from both, because the app needs them
with or without Xenia.

| Monaco integration | Lines | Concepts the author must know |
|---|---|---|
| Raw hook (baseline above) | ~58 | ~11: `mounted`/`updated`/`destroyed`, `pushEvent`, `handleEvent`, dataset + `JSON.parse`, prev-value diffing, debounce timer, navigation flush, `isConnected` guard, `applying` flag |
| M1 hook on `MonacoAdapter` | 51 | ~10 |
| **M2, Tier 1:** an adapter object written in the app | **21, plus 1 registration line** | **5**: `mount`, `destroy`, `props`, `events` + `ctx.emit`, `commands` |
| **M2, Tier 2:** Xenia's `monaco` adapter (`xenia_demo/assets/js/monaco.js`) | **4, plus 1 registration line** (only to add the demo's `setup`; without it, 1 line) | **1**: an adapter is a plain object you can spread |

The M2 version is also the only one with commands (`focus`, `insert`). Better
on both axes, so the M2 exit gate is met. The Tier 1 count is the same object
Xenia now ships as `monaco` (`assets/adapters/monaco.js`). It is what an app
would write for a library Xenia doesn't know.

Verified by `xenia_demo/assets/e2e/editor.test.mjs`, 9 of 9 passing twice:
- keyboard after round-trips, in both input modes
- multi-cursor and undo across a server push
- server pushes while read-only
- echo handling
- the flush when navigating
- rapid navigation
- workers
- a `focus` command
- two editors, where commands and events stay with their own instance

### Asset delivery (M0, learned the hard way)

**The `:esbuild` Hex package's `version:` is the *binary* version, not the
package version.** Setting it to the Hex version silently downloads a 2021
esbuild that mishandles modern syntax.

**The esbuild profile name must match the alias.** `config :esbuild, xenia:
[...]` requires `["esbuild xenia"]` in the alias, not `esbuild default`. A
mismatch produces `no arguments passed to esbuild`, which does not name the
profile.

**`NODE_PATH` does not resolve Elixir deps as JS packages.** `import from
"xenia/priv/static/xenia.esm"` fails because `deps/xenia` has no `package.json`.
Either use a relative path from `assets/js/`, or add a `package.json` to the
library (and list it in `files:`).

**Path deps are symlinked at `deps.get` time — this is the trap.** Adding
`{:xenia, path: "../xenia"}` *before* `priv/static/` exists caches a dep with
no assets. The resulting error points at the consuming app's `app.js`, not at
the stale dep. Fix: `mix deps.clean xenia --build && mix deps.get`.
**Mitigation: commit the built ESM**, so a fresh clone always has it present.
Document this in the README — every early adopter will hit it.

**`files:` in `mix.exs` must include `priv`.** Without it the package publishes
successfully and ships no JavaScript. Verify with `mix hex.build`, which prints
the file list without publishing.

---

## 7. Prior art — researched, do not re-derive

| Project | Solves | Relationship to Xenia |
|---|---|---|
| **LiveVue / LiveSvelte / LiveReact** | Embedding reactive framework components; props, slots, SSR. LiveVue diffs props with RFC 6902 JSON Patch | Mature but assume the child framework does its own reconciliation. No help for imperative class-based libraries. **This is the gap Xenia targets** |
| **Corex** | Accessible unstyled Phoenix components over Zag.js state machines; installs from Hex, no Node required; props updatable without resetting state | Closest existing implementation of the thesis. Bound to one upstream and to UI primitives. **Study hardest** |
| **live_monaco_editor** | Monaco in LiveView | Ships a prebuilt hook from `priv/static`, lazy-loads Monaco rather than bundling it. Xenia's Monaco baseline |
| **LiveView colocated hooks (1.1+)** | JS beside the component that uses it | `<script :type={ColocatedHook}>`; `ColocatedJS` extracts and generates a manifest; hook names auto-namespaced by module. **Xenia's co-location story builds on this** |
| **Popcorn / Local LiveView** | Elixir in the browser via AtomVM+WASM; experimental client-side LiveView | **Orthogonal, not a competitor.** Answers "where does LiveView code run"; Xenia answers "how do I integrate a JS component". See below |
| **React context / CSS custom properties** | Shared values without prop drilling | Closest analogues to §5. Study subscription lifetime and override precedence |
| **Hologram** | Elixir compiled to JS, plus JS interop | Opposite direction. Competitor for mindshare, not users |
| **LiveState** | Server state for non-LiveView clients | Different axis |

### Popcorn / Local LiveView — assessment

Software Mansion's Popcorn runs Elixir in the browser on AtomVM/WASM.
`local-live-view/` in that repo is labelled **experimental**.

Three facts that matter:

1. **They reuse the LiveView client rather than replacing it.** Their plan is to
   modify `phoenix_live_view.js` to route events to AtomVM via `popcorn.call()`
   instead of liveSocket, using **`pop-` as a custom BINDING_PREFIX**. If hooks,
   DOM patching, and `phx-update` semantics come along unchanged, Xenia's
   contract should largely transfer.
2. **Not production-ready.** Pinned to Elixir 1.17.3 and OTP 26.0.2 due to
   stdlib patching; compiled artifacts exceed 3MB. The team says so themselves.
3. **It does not weaken Xenia's thesis.** Local LiveView makes Elixir UI logic
   local. It does not turn Monaco into Elixir. If anything it strengthens the
   case: the more the ecosystem owns the client programming model, the more
   obvious the remaining Elixir ↔ npm boundary becomes.

**Actionable now:** the `pop-` prefix means **never hardcode `phx-`** — §11.
**Actionable later:** S2, the compatibility spike, after M2. There is no point
testing contract compatibility before the contract exists.

**Residual gap:** no generic bridge exists for imperative, DOM-owning,
instance-based JS libraries — editors, charts, maps, terminals, players,
diagram engines, 3D canvases. Framework bridges assume reconciliation; Corex
assumes Zag.js. That gap is Xenia's reason to exist.

---

## 8. Settled design questions

**A `.jsex` file format and compiler. Rejected.**

- Colocated hooks already provide co-location, upstream and supported.
- A new extension breaks syntax highlighting, LSP, ESLint, Prettier,
  TypeScript, source maps and every esbuild plugin.
- There is nothing for a compiler to do. Input is a declarative object; output
  is a hook. `createHooks` does that at runtime at zero toolchain cost.
- `MacroComponent` is private API in LiveView 1.2 anyway. 

**Auth-protected JS components. Rejected as a non-problem.**
If `on_mount` rejects the user, the LiveView never renders, the DOM node never
exists, and the hook never mounts. Authorization is settled server-side before
any JS runs.

**Rejected feature proposals**

- Unified client/server navigation — non-problem, `on_mount` + `{:halt,
  redirect()}` already solves it, no race exists because LiveView navigation
  is server-mediated
- Server-authoritative UI state — already LiveView's design
- Shared Elixir/JS validation — separate product; LiveView's answer is
  server-side validation
- Framework-agnostic client API for non-Elixir users — contradicts positioning
- TypeScript generation from Ecto/Absinthe — third product, and §14 rules out
  massive code generation
- Client router API (`push`/`replace`/`back`/`forward`) — exists as
  `push_navigate`, `push_patch`, `js().patch`, `history.back()`. Typed routes
  exist as `~p`

---

## 9. Open architectural question — layout hierarchy and persistence

- **Phoenix layouts are functions, not runtime nodes.** Applied on every render.
  No state, no identity, no lifetime. Nothing there to persist.
- **Nested LiveViews are runtime nodes.** `live_render(@socket, MyLive,
  id: "x", sticky: true)` spawns a real child process, and `sticky: true` is
  designed so it survives live navigation of its parent. This is Phoenix's
  answer to Next.js layout persistence.

So a `layout.ex` / `page.ex` hierarchy is buildable — a layout segment compiles
to a **sticky nested LiveView**, not to a layout function. Nothing in the
Phoenix ecosystem packages this.

Costs: each persistent segment is a separate process with its own mount,
assigns, and diff stream. Sticky constraints (nesting depth, `live_patch`
inside a segment, non-sticky ancestor replacement) are unestablished.

Value is broader than persistence: URL derivation, UI hierarchy, layout
hierarchy, and code organisation are four separate benefits; the first three
hold even if persistence does not.

**Experiment S1 decides this.** Until it runs, do not finalise the file
convention, and do not treat the question as closed in either direction.

### S1 answer (verified 2026-10-24): persistence works, with three limits

Setup: `xenia_demo`, `/s1/a`–`/s1/g`, one `live_session`, LiveView 1.2.10,
Chromium. The pages render a sticky shell holding a server counter, a plain
hook counting clicks in JS, and a Monaco editor through Xenia. Browser tests:
`xenia_demo/assets/e2e/s1_sticky.test.mjs`, 9 tests passing twice.

**What survives live navigation between pages that render the sticky:**
- **Everything.** The same server process (pid and assigns), the hook
  (`mounted` once, never `destroyed`), its JS state, and the Xenia
  component: the same Monaco instance, with its text and undo history.
- It also survives 500 ms simulated latency, and the shell is never missing
  from the DOM during the navigation.
- **It lands where each page renders it.** Last on one page, first on the
  next, never duplicated. So each page can put the persistent part in its
  own slot.
- `live_patch` leaves it alone, whether the page patches or a `<.link patch>`
  inside the shell does. The shell's patch reaches the page's
  `handle_params`.

**The limits:**
1. **A sticky nested inside another sticky is destroyed on the first
   navigation, and never comes back**, even on returning to a page that
   renders it. **Stickies side by side work:** the page renders each
   persistent part next to the others, and each lives exactly while
   consecutive pages render it. The outer one persists across all pages,
   the inner one only while you stay in its subtree.
2. **A sticky is configured once.** The `session` passed to `live_render` only
   counts at the first mount. The next page can't reconfigure it by
   rendering it differently.
3. **A sticky can't see the URL.** Defining `handle_params/3` in it raises
   "handle_params/3 is not allowed on child LiveViews, only at the root"
   and crashes it. A layout that highlights the current page has to be told,
   for example by the page through PubSub, or by a hook on LiveView's
   `phx:navigate` event.

Also: a page that doesn't render the sticky destroys it, and the next page
that does starts a fresh one. Leaving the `live_session` is a full page load
(documented by LiveView).

**What this means for M9 (layouts):** a layout can't *be* a sticky LiveView
that wraps the page. LiveView has no slots across LiveViews, so a sticky
can't contain the page's content; the page renders the sticky. This follows
from `live_render`'s API; it wasn't measured. So a layout splits into two
parts:
- **a frame**: a function component around the page, re-rendered on every
  navigation, which is cheap and stateless
- **its persistent part** (optional): a sticky LiveView that the page renders
  into a slot of the frame, next to the persistent parts of the layouts
  around it, never inside them

`app/(auth)/layout.ex` becomes a frame with a persistent shell, and
`runbooks/layout.ex` a nested frame with a persistent panel, rendered side by
side. The layout's persistent part learns about navigation through a message
(limit 3), and its configuration can't change from page to page (limit 2).

**Still unverified:** a sticky rendered from the root layout (outside the main
LiveView); many stickies at once (2 tested); sticky plus streams; S2's Local
LiveView.

### As built (M9, verified 2026-10-24)

- **Folders are the source of truth.** `Xenia.Routes.Discovery` turns paths
  into routes:
  - `(group)` folders stay out of the URL
  - `[id]` and `[...path]` folders are parameters
  - `_private` folders are never routes
  - the special files are `page.ex`, `layout.ex`, `persistent.ex` and
    `live.ex`

  `xenia_routes "lib/my_app_web/app"` generates ordinary `live` routes, and
  records each page's layout modules in the router (`__xenia_page__/1`).
  There's no `parent:` or `layout:` anywhere.
- **A page** is a LiveView with `use Xenia.Page` (after the app's
  `:live_view`). Its `render/1` is wrapped (`defoverridable`, in a
  `@before_compile` that runs after LiveView's own), and drawn inside its
  layouts' `frame/1`, outermost first. It also gets an `on_mount` that runs
  its layouts' `on_mount` hooks, outermost first, like `live_session`'s.
- **A layout's frame** gets the page's assigns plus `@inner_content` and
  `@persistent`. It is redrawn on every navigation.
- **A persistent part** is the `persistent.ex` next to a `layout.ex`
  (without that `layout.ex`, a compile error: nothing would place it). It is
  the S1 design: a sticky LiveView with a stable id
  per layout, rendered by the page (never inside another sticky) into the
  frame's `@persistent`. It learns the URL through `handle_navigation/2`,
  which a built-in `XeniaNavigation` hook feeds from `phx:navigate` (and
  once on connect).
- **A `live.ex`** (`use Xenia.Live`) is the LiveView for every page below it.
  The route's live action is the page module, and `Xenia.Live.page/1`
  renders it with the owner's assigns. A layout `on_mount` below a `live.ex`
  is a compile error, because patching runs no `on_mount`.
- **Auth** is a layout's `on_mount:`; the folder name grants nothing. One
  `live_session` around the folder keeps persistent parts alive. The
  layouts' hooks run on every page mount, so navigating within that session
  can't skip them.

### Metadata and the sitemap (2026-10-25)

- **`metadata/1`** on pages and layouts (`Xenia.Metadata`), merged
  outermost layout → page; `open_graph`/`twitter` merge per key; the page's
  `title` goes through the nearest `title_template`. Unknown keys raise.
- **When it's computed:** after the page has its data. A LiveView that
  defines `handle_params/3` gets it wrapped (`defoverridable`, in
  `__before_compile__`): the metadata is assigned after the page's own
  `handle_params`, where data is often loaded. One without gets a
  `handle_params` hook from `on_mount {Xenia.Page, :metadata}`, which runs
  after `mount`. Hooks alone wouldn't do: LiveView runs them before the
  module's `handle_params`. Same for a `live.ex` owner.
- **Where it goes:** `@xenia_metadata`, and the title into `@page_title`.
  `<Xenia.Metadata.tags>` in `root.html.heex` renders it. LiveView renders
  the root layout with the LiveView's assigns on the first (dead) render,
  after `mount` and `handle_params` (`Phoenix.LiveView.Controller`,
  `Static`), which is what crawlers read. Live navigation updates only
  `<title>`.
- **Titles:** a page's metadata title always wins. A layout's default title
  only fills in for a page without a `page_title`, so pages that assign
  `page_title` in `mount` keep theirs (and it becomes `og:title`).
- **`Xenia.Sitemap`**, a plug: `get "/sitemap.xml", Xenia.Sitemap, []`.
  Built from `Phoenix.Router.routes/1`, so scopes apply; only routes with
  a `__xenia_page__` record. Static pages listed unless `sitemap/0` returns
  `[]`; dynamic pages only with `sitemap/0`'s params; `use Xenia.Layout,
  sitemap: false` excludes everything below. Explicit, no guessing from
  `on_mount`.

---

## 10. Strategic tests

**The Tier 1 test.** Does this still work for a library Xenia has never heard
of? If a feature only works for first-party adapters, it is the wrong feature.

**The Custom Element test.** If Xenia adds nothing over `phx-update="ignore"`
plus property assignment plus an event listener, the framework-neutral contract
already exists and Xenia should become a Custom Element conformance layer. Run
at M5 and take the answer seriously.

**M5 answer (2026-10-20): Xenia stays an adapter layer, not a Custom Element
conformance layer.** Both sides are built and browser-tested in `xenia_demo`:
the rating on `/rating` through Xenia and on `/without-xenia` without it, and
Chart.js three ways side by side on `/chart-compare`.
- **For something that is already a custom element, Xenia adds little.** That
  was expected. Shoelace's `<sl-rating>` works as a plain tag: LiveView's
  attribute updates reach the property, and a 7-line hook forwards its event.
  Through Xenia, the adapter needs no prop handlers at all (acceptance met), but
  isn't shorter. (Since M5.5 it has one, `value`, for forms; §6 M5.5 findings.)
- **For a library that isn't one, a hand-written custom element rebuilds what
  Xenia does.** `/chart-compare` builds the same Chart.js chart three ways,
  from one server state, with the same features: data updates, a bar/line
  switch, adding and removing series, a point-click event, highlight commands
  addressed to one chart, dark mode, removal, and a DOM move. Nine browser
  tests (`chart_compare.test.mjs`) run on all three. Lines are non-blank and
  non-comment; the shared Chart.js styling (83 lines) is excluded from all
  three:

  | Integration | Lines |
  |---|---|
  | Xenia adapter (`chart_adapter.js`) | **31**, plus a 5-line declaration |
  | Native custom element (`x_chart.js`) | **78**, plus a 17-line bridge hook |
  | Classic `phx-hook` (`chart_hook.js`) | **39** |

  Rendering inside a custom element is cheap; talking to the server isn't.
  The element and its bridge hook hand-write:
  - props as one attribute: a string, so `data` is JSON, parsed again on every change
  - a shadow root, or LiveView's patching removes the canvas
  - a hook per element type to forward events
  - per-instance commands, by a naming convention of its own (`push_event`
    is global, the §6 study finding)
  - surviving a DOM move: `disconnectedCallback` also fires when the element
    is only moved, so destruction waits a microtask

  It still has no debounce or flush on navigation, and no typed tag or HEEx
  checking. The classic hook is short, but it hand-writes the same wiring:
  its own command naming, and its own decision in `updated()` whether `type`
  or `data` changed. It has none of Xenia's transport guarantees either.
- **Xenia's transport now protects against a LiveView lock bug** that plain
  hooks are exposed to whenever they push overlapping events from the element
  LiveView patches (§6, M5 findings). That is concrete value over
  "`phx-update="ignore"` plus a listener".
- **Follow-up, no core change:** custom elements are already a zero-handler
  adapter (`/rating`). A small adapter *factory* for them, e.g.
  `customElement("sl-rating", { events: [...] })`, would be convenience, not
  contract. Consider it for M7 docs.

**Project-level kill conditions.** Abandon or radically rescope if:
- After M2, a Xenia-based Monaco integration is not clearly simpler than the raw
  hook on both line count and concept count
- The contract needs a fifth lifecycle concept after `remount` is added
- Providers cannot reuse the per-prop handler map and need their own lifecycle
  (M6 answer: they reuse it; §6 M6 findings)
- Adapters routinely need to bypass the core to do ordinary things
- Using an unsupported npm library is meaningfully harder than a first-party one
- Docs explaining Xenia exceed docs explaining `phx-hook`
- Six months in, nobody outside the author has adopted it (the clock starts
  at Release: by the author's decision, nobody outside sees Xenia before then)

Write the answer down when each triggers. Do not renegotiate silently.

---

## 11. Decisions made

| Decision | Choice | Note |
|---|---|---|
| JS delivery | **Ship prebuilt** in `priv/static`, user imports from `deps/` | Proven working in M0 |
| Output format | ESM only | No CJS, no IIFE |
| Bundling | One bundle to start | Split per-adapter only if size hurts |
| Build output in git | **Committed** | Also fixes the stale-symlink trap — §6 |
| esbuild source | `:esbuild` Hex package, not npm | No Node required for users |
| Component syntax | `<.chart />`, generated at compile time | `<Chart />` is not valid HEEx |
| Data attribute | `data-xenia-props` | Namespaced to avoid collisions |
| Public `update()` | **No** | Core owns diffing; per-prop handlers |
| Co-location mechanism | LiveView colocated hooks | Not a custom file format — §8 |
| Adapter location | Tier 1 in the app, Tier 2 in Xenia's bundle; identical shape | Only the import path differs |
| Provider delivery | Through the per-prop handler map | §5. Confirmed in M6: `consumes` plus an ordinary prop handler |
| Provider precedence | Explicit prop wins; a present key wins even when `null`, and a removed key falls back | §5, M6 |
| Provider store | Module-level singleton keyed by name; values outlive their publisher | M6. Survives navigation, so components mounting mid-navigation get the value |
| Provider sources | Server: `<Xenia.Provider.provider>` (hidden element, built-in `XeniaProvider` hook). Browser: `setProvider` from app code. One source per name | M6. Two-way providers stay undesigned (§5) |
| App-wide theme | Published from the browser (Phoenix 1.8's theme toggle), not from the server | M6, the author's decision: the toggle is browser-owned, and "system" follows the OS |
| Provider JS API | `setProvider`, `readProvider`, `subscribeProvider` exported from `"xenia"` | M6. Code outside adapters can use the same values |
| **Binding prefix** | **Never hardcode `phx-`.** `config :xenia, binding_prefix: "phx-"` (the default, with the dash, like LiveView's JS `bindingPrefix`) | Local LiveView uses `pop-` — §7. Implemented in M3. The server can't see the client's `bindingPrefix`, so the two must be configured to match |
| Declarations | **Split** (§12): Elixir declares the tag, JS supplies the adapter | Decided at M4. Since M10 the JS can also sit in the same module (co-located adapters, below) |
| Co-located adapters | `<script :type={Phoenix.LiveView.ColocatedHook} name=".Chart">` exporting `adapterHook({...})`; named with `colocated(".Chart")` on `<.xenia>`, or `adapter: ".Chart"` on a declaration in the same module; a bare `".Chart"` on `<.xenia>` raises | M10. LiveView's public ColocatedHook, not a Xenia file format (§8). Compile-time resolution, because `<.xenia>` can't know its caller (§6 M10 findings) |
| `adapterHook` | Exported from `"xenia"`; `createHooks` builds its hooks with it | M10. One Controller for both ways of registering |
| Official adapters | A factory per library from its own entry point (`createChartjs` from `"xenia/chartjs"`, like `createMonaco` from `"xenia/monaco"`); the app passes the library with `load: () => import(...)`, or an object of named parts for libraries made of several packages (Tiptap, FullCalendar, Uppy, xterm, wavesurfer); factory options configure it (library plugins, default options, `setup`, D3's `charts`); the factory returns a plain adapter object, extended by spreading; an Elixir tag per adapter (`<.chartjs>`, `<.tiptap>`, ...); the theme through `consumes`. Sixteen ship: Monaco, Monaco diff, Tiptap, Chart.js, D3, Tabulator, FullCalendar, Leaflet, xterm, flatpickr, Tom Select, Shoelace rating, SortableJS, Uppy, wavesurfer, wavesurfer multitrack | The author, 2026-10-24/25. Stage 1 (Chart.js) was reviewed first; then the author asked for all fourteen others at once (2026-10-25), replacing the staged plan and the "experimental" status of Uppy, the wavesurfers and D3. Gates per adapter, all met: tests with no library installed, a browser test in `examples/`, the standalone-bundle check, docs in the tag module. Entry points live in the core package: decided for 0.1.0 by the author (2026-10-25), because moving them later would change users' imports. All MIT; no paid adapters |
| Keyboard shortcuts | `shortcuts` on every component: key combination → LiveView event, only while focus is inside, browser shortcuts refused, server events only, pending events flushed first | The author, 2026-10-24 (§4 Keyboard shortcuts). Plain `handle_event`, not a `handle_key_event`: nothing new to learn. Instant client-side shortcuts (mapping to an adapter command) can come later |
| Examples | `examples/`: a runnable Phoenix app in the repository, built with the app folder, one page per feature (chart, form field, web component, theme, co-located adapter, `live.ex` tabs), one page per official adapter under `adapters/`, a form with five official adapters as fields under `forms/`, and a file-based routing example under `routing/` that uses every kind of folder (parameter, catch-all, group, private folder, nested layouts) and shows which file answers each URL, each with a plain-English README; depends on `{:xenia, path: ".."}` and links `"xenia": "file:../.."` in its `package.json` | The author's choice over copy-paste folders (2026-10-24): `xenia_demo` is private, so this is the only runnable showcase users see. The npm link resolves `"xenia"` whatever the checkout's folder is called |
| Starter template | `mix xenia.install` edits a new Phoenix 1.8 app in place (since 2026-10-25 also `flash/1` in `core_components.ex` and `flash_group/1` in `layouts.ex`: a success kind, stacked, auto-closing with a countdown, replaced only when byte-for-byte what Phoenix 1.8 generates, with or without Gettext; since the metadata work also `root.html.heex`: `<Xenia.Metadata.tags>`, and `<.live_title>` without Phoenix's suffix; the layout and home page use `metadata/1`): Xenia's daisyUI themes (plain, purple primary, gold accent, `--depth: 0`, 1px borders) and a `.xenia-grid` pattern in `app.css`; `createHooks` and the theme provider in `app.js`; `import Xenia.Component`; `:xenia` in `import_deps`; `xenia_routes` in place of the `PageController` home route; a `layout.ex` and home `page.ex` from `priv/templates/xenia.install/`; the logo. Each step is skipped when already done, and left to the user ("by hand") when the file doesn't look like Phoenix's | The author, 2026-10-25, over forking Phoenix's generator (`mix phx.new` templates would have to follow every Phoenix release). Plain and Next.js-like, not fancy. The examples app uses the same theme |
| Logo | Transparent PNGs cut from the brand showcase's hero: `xenia-banner-light.png` (dark name, for light pages) and `xenia-banner-dark.png` (white name), a wide banner across the README's full width through `<picture>` and `prefers-color-scheme`; `xenia-mark.png` (the mark alone, square) for the HexDocs sidebar (`logo:`) and the examples header | 2026-10-24, the author: no background, full width. The source's soft glow around the name is trimmed, or it shows as a grey haze on light pages. The showcase lives in `docs/brand/` (local only), because everything in `priv` ships in the Hex package |
| README opening | The motto ("Keep Phoenix in charge. Let JavaScript do what it does best."), then every feature up front ("What you get"), then "Why Xenia" (the JS ecosystem is huge; Xenia makes bringing it to Phoenix simple), then the name and the logo | 2026-10-24, the author. Claims stay verifiable: the one number used is the measured Monaco integration (§6, 58 → 21 lines) |
| Generators | `mix xenia.gen.component`, `mix xenia.gen.page`, `mix xenia.gen.layout`; module names mirror folders; existing files need `--force`; co-located output is printed, never inserted into a module | M11, the author's call to include page and layout generators. The component's adapter is a working placeholder, so the tag works before the library is wired in |
| Declaration DSL | `use Xenia.Components` with `component`/`prop`/`event`, generating ordinary Phoenix function components | M4. Kept after measuring (`docs/ROADMAP.md` M4). Apps add `import_deps: [:xenia]` to `.formatter.exs` |
| Event attributes | `event :click` becomes `attr :on_click`; unbound events are omitted | Phoenix's `on_*` convention. M4 |
| Tier 2 tags | Hand-written over `<.xenia>` when props need shaping (`<.monaco>`: `{value, version, revision}`), not a "transform props" hook in the DSL | M4. Explicit over magic (§14) |
| Unregistered adapters | Reported once per element in the browser console, naming the fix | M4. "Registered but never declared" is not detected: it would need cross-language parsing, and it is only unused code. Since M5 only added and changed nodes are checked, not the whole document on every DOM change. Since M10 co-located hooks count as registered when `window.liveSocket.hooks` has them |
| JS import | `import { createHooks } from "xenia"`, through `package.json` `exports` | M5. Hex deps resolve through `deps/xenia` with Phoenix's default `NODE_PATH`; a path dep needs its parent directory on `NODE_PATH` (see `xenia_demo/config/config.exs`). `mix check` verifies every exports target is in the Hex package |
| JS entry points | `"xenia"` is the core only; each Tier 2 adapter has its own entry point (`"xenia/monaco"`, a separate bundle); the app passes the library import (`createMonaco({ load: () => import("monaco-editor") })`) | M7. A library import inside Xenia's bundles broke every app's build (§6 M7 findings). `mix check` bundles each file on its own |
| User docs | `README.md` plus two guides in `guides/`, published with ExDoc (`main: "readme"`) and shipped in the package; `mix check` builds them with `--warnings-as-errors` | M7. `CLAUDE.md` is internal; the guides are the user-facing contract |
| Release timing | One release when M8–M11 are done: Hex plus one forum post. The repository stays private until then; no outside users before | The author, 2026-10-24. Supersedes M7's "publish" and "first external user" tasks |
| Public history | A fresh one-commit public repository `uzaydurdu/xenia`, committed with GitHub's private email address; the full history stays in a renamed private repository (`xenia-private`) | The author, 2026-10-25: keeps `docs/` and the personal email out of public history without rewriting it. Public contact is uzaydurdu.com (README, `SECURITY.md`, Hex links) |
| App folder | Folders define routes and layouts; `xenia_routes` generates plain `live` routes; no `parent:` or `layout:` | M9, the author's call: discovery made explicit declarations redundant |
| Page | A LiveView with `use Xenia.Page`; its render is wrapped in its layouts' frames | M9. Phoenix checks every route's LiveView at compile time, so the page stays a real LiveView |
| Layout | `frame/1` with `@inner_content` and `@persistent`; one option, `on_mount:` | M9. `@inner_content` as in Phoenix's layouts, because Xenia calls frames, not HEEx tags |
| Persistent part | A sticky LiveView per layout, rendered by the page side by side; `handle_navigation/2` from `phx:navigate` | M9, from S1's limits |
| Persistent part's file | Always `persistent.ex`, next to its `layout.ex`; the module name is free. The `persistent:` layout option is removed and raises, pointing at the file | The author, 2026-10-24: a fixed name like `page.ex` and `layout.ex`. Not `live.ex`, which already means the shared-pages owner, the module the generated route points at. Each special file now matches the module it uses (`page.ex`/`Xenia.Page`, `layout.ex`/`Xenia.Layout`, `persistent.ex`/`Xenia.Persistent`, `live.ex`/`Xenia.Live`). Cost accepted: two layouts can't name one shared sidebar; put it in a layout above both |
| Shared pages | `live.ex` with `use Xenia.Live`; the page module is the live action; its pages only render | M9 |
| Group auth | A layout's `on_mount:`; one `live_session` around the folder; no `on_mount` in a layout below a `live.ex` | M9. A folder name grants nothing |
| Loading and errors | `<:loading>` and `<:error>` slots on every tag; `on_crash` event; `data-xenia-retry` | The author, 2026-10-25, inspired by Next.js `loading.tsx`/`error.tsx`, but per island: route-level loading is LiveView's `assign_async`, and route-level error boundaries would fight "let it crash". `on_crash` because `on_error` clashes with adapters' own `error` events (§4) |
| M12: icons | In the app, not Xenia: `assets/vendor/iconify.js` (the `heroicons.js` pattern over `@iconify-json/*`), and the app's `<.icon>` taking any icon class, decorative by default (`aria-hidden`), `label` for meaningful icons | The author's brief, 2026-10-25: no `Xenia.Icons` unless clearly simpler. It isn't: the class is the API, and Tailwind discovers it. Xenia core stays free of Tailwind and Iconify (§6 M12) |
| M12: notifications | Phoenix's `put_flash/3`, with a `:success` kind added to the app's `<.flash>`; errors `role="alert"`, others `role="status"`. Since 2026-10-25 (the author's request) info and success close by themselves after `duration` ms, with a countdown line around the border (CSS animation; hover pauses), and `shape` rounded/sharp/pill; errors never auto-close. Messages stack in one column (`flash_group` is the `toast`), newest first. App code: `flash/1` + a colocated hook + app.css; `mix xenia.install` gives new apps the same (with Heroicons) | No `Xenia.notify`: it would only rename `put_flash`. No toast runtime. Island failures use `<:error>`/`on_crash`, not toasts |
| M12: languages | Gettext only. The locale per process: a plug (cookie → session) for the first render, `on_mount` (connect params → session), `put/2` on switch + `push_event` to store the cookie. Islands get translated words as props and the `locale` provider for formatting | No `ctx.t()`, no JS string extraction (out of scope by the brief). Live switching needs words in assigns (§6 M12) |
| Metadata | `metadata/1` on pages and layouts → `@xenia_metadata` and `@page_title`; `<Xenia.Metadata.tags>` in the root layout | The author, 2026-10-25, from Next.js's metadata API. Computed after the page's data (§9) |
| Sitemap | `Xenia.Sitemap` plug from the router's routes; `sitemap/0` for pages with params; `sitemap: false` on layouts | The author, 2026-10-25. Uses what only the app folder knows: every page at compile time |
| Calls | `ctx.call(name, payload)` → Promise of `{:reply, map, socket}`; declared and bound like events; pushed from a server-rendered hidden `XeniaCall` hook inside the container | The author, 2026-10-25, inspired by Next.js Server Actions, at island level. A second hook, not the container's, because a reply locks the element it's pushed from (§4 Calls, §6) |
| Source layout | `lib/xenia/core/`, `lib/xenia/app/`, `lib/xenia/adapters/` (tests mirror it under `test/xenia/`). Adapters are namespaced `Xenia.Adapters.*`; core and app-folder modules keep their short names (`Xenia.Component`, `Xenia.Page`) | The author, 2026-10-25, before the first release, so the rename was free. A deliberate exception to "path mirrors module name" for `core/` and `app/`: users type those names constantly. Mirrors `assets/core/` and `assets/adapters/`. The docs sidebar uses the same groups |
| Event transport | `liveSocket.execJS` with a `push` command, from a hidden core-owned element | M5. Avoids LiveView's lock on the container (§4 Events, §6) |
| Custom elements | Supported as ordinary adapters; Xenia is not a conformance layer | M5, §10 |
| CI | GitHub Actions runs `mix check` and checks the committed bundle matches the sources | M5. Browser tests still run by hand against a dev server |
| Form participation | A server-rendered input inside the container, filled by the adapter through `ctx.setFormValue`: loud for the user's changes, quiet (`notify: false`) for the server's | M5.5. No form system: submit, `phx-change` and recovery are LiveView's (§4 Form fields) |
| Form field API | `field={@form[:x]}` on `<.xenia>` and `<.monaco>`; `form_value: :prop` on a declaration. The field supplies id, name and value, and its value wins over the prop | M5.5. Phoenix's own `field` convention |
| Form echoes | Adapter-owned (§6: echo suppression never in the core). Monaco keeps pending echoes; a custom element whose events fire only for user input needs none | M5.5 |
| Files | `ctx.upload(name, files)` over LiveView's upload channel; logs and returns `false` instead of throwing | M5.5. Replaced the only `ctx.hook` use (wavesurfer) |

### Consequences accepted

- We own version pinning. **Never `latest`.** Pin every npm dependency.
- Duplicate library copies if the user already has one. Document it.
- Monaco cannot be flattened into one ESM (~5MB, worker files). Ship the adapter
  only; lazy-load Monaco at runtime.

## 12. Open decisions

- ~~Split declarations~~ — decided at M4: **split**. Elixir declares names
  and attrs, JS supplies the adapter in the app's `assets/js/` and registers
  it with `createHooks`. Rejected for now: co-locating the adapter in the
  `.ex` file with `Phoenix.LiveView.ColocatedJS`. LiveView extracts that JS
  into `_build/.../phoenix-colocated/`, and its own docs scope it to code
  *without* third-party libraries, so `import Chart from "chart.js/auto"`
  would not resolve `assets/node_modules` without extra configuration.
  Revisit in M9 (co-location), which can build on the split without changing
  the declaration. **Done in M10:** co-located adapters build on the split;
  a declaration names one with `adapter: ".Chart"`.
  **Corrected before M9 (2026-10-24):** the scoping above is about
  *dependencies* bundling their own colocated JS. For an app's own colocated
  JS, LiveView 1.2 symlinks `assets/node_modules` into
  `_build/.../phoenix-colocated/<app>/node_modules` (`:node_modules_path`,
  default `assets/node_modules`), and its docs say npm imports "work out of
  the box". `ColocatedJS` and `ColocatedHook` are public API; only
  `MacroComponent`, which they're built on, is private.
- ~~`import from "xenia"`~~ — resolved in M5: `package.json` `exports`
  (§11). Verified with a simulated Hex install.
- ~~Files from a component (`ctx.upload`?)~~ — resolved in M5.5:
  `ctx.upload(name, files)` (§4 ctx, §11).
- ~~The form input's type~~ — resolved in M5.5:
  `<input type="text" hidden autocomplete="off" data-xenia-field>`, so
  `used_input?/1` works (§4 Form fields, §6 M5.5 findings).
- **Co-located adapters as sibling `.js` files** (`chart.adapter.js` next to
  `page.ex`), instead of an inline `<script>`. Considered after M10 and
  deferred by the author (2026-10-24). It would give real JS tooling, but
  Xenia would own a build step (a manifest written at compile time), and
  npm imports from `lib/` don't resolve without LiveView's `node_modules`
  link trick (§6 M7 findings). Revisit if inline scripts get painful.
  Hologram as a way to write hooks was rejected: a dependency like Popcorn
  (§3).
- **Report the LiveView lock bug upstream** (§6, M5 findings) once a plain
  LiveView reproduction is isolated. Xenia is protected either way.
- **The "D3 pattern".** Adapters that redraw everything (D3) batch several
  prop changes into one redraw with `queueMicrotask`, 8 lines. Seen once so
  far; document it in M7 if a second adapter needs it. Not a core change:
  §4 rules out a public `update()`.
- ~~Is `destroy` synchronous?~~ — decided in M2: yes. A returned Promise is
  not awaited and gets a warning (§4 destroy).
- **The double-mount window.** Re-measured twice on LiveView 1.2.10 (§6):
  no overlap in any navigation tested, same LiveView or different ones, with
  or without 500 ms latency. Unverified: nested and sticky LiveViews (S1).
  The overlap-safe design stays, because it costs little.
- ~~`ctx.remount()` shape~~ — decided in M2, §4
- ~~Attribute passthrough rules~~ — rule decided in M2 (§4), implemented in M3
- ~~Multi-event naming convention~~ — decided in M2, §4 Events
- ~~Command payload shape for `Xenia.push_to/4`~~ — decided in M2, §4 Commands
- ~~Provider API~~ — decided in M6 (§5 As built, §11)
- **How browser-authoritative providers report upward to Elixir** — §5.
  Still open after M6: the server doesn't know the demo's theme. Needed only
  if server-rendered output must depend on it.
- **Two-way providers** (one name with two sources, e.g. a theme stored per
  user that can also follow the OS). Undesigned; M6 rules it out with "one
  source per name".
- Layout hierarchy — S1 answered (§9): persistence works for stickies side by side, not nested. M9 builds it from the folder structure: layouts are a frame plus an optional persistent part, found by discovery, not declared with `parent:`
- ~~What an "island" is beyond `phx-update="ignore"` with a name~~ —
  decided in M8 by the author: a JS island is any part of a page that needs
  interactive JavaScript and lives in the browser, while the rest stays
  server-rendered Phoenix. Xenia hosts them (§2). No new API.
- ~~Form participation: hidden input, or something better?~~ — decided in
  M5.5: an input the server renders inside the container (§4 Form fields)

---

## 13. Repo layout

```
xenia/
  CLAUDE.md             <- this file, repo root
  README.md             # user-facing; the HexDocs landing page
  CHANGELOG.md  LICENSE
  guides/               # user-facing contract (HexDocs extras, in the package)
    wrapping-a-library.md
    ownership-boundary.md
    app-folder.md
    icons-notifications-languages.md
    images/                 # the README banner (light and dark) and the mark, transparent
  examples/             # a runnable Phoenix app, one page per feature (not in the package)
  docs/                 # internal working documents, not in the package
    ROADMAP.md
    EXAMPLE_APP.md
    MENTOR_PROMPT.md
    RELEASING.md        # the release checklist
    brand/              # the brand showcase image the logo was cut from
    FORUM_POST.md       # the announcement draft
    FIRST_USER_BRIEF.md # the brief and question log for an outside user
  lib/xenia.ex          # Xenia: push_to/4
  lib/xenia/
    core/               # the JS-island boundary: Xenia.Component (<.xenia>),
                        #   Xenia.Components (the DSL), Xenia.Provider, Xenia.Shortcuts
    app/                # pages from folders: Xenia.Page, Layout, Live, Persistent,
                        #   Routes (+ routes/: discovery), Metadata, Sitemap
    adapters/           # the official adapters' tags: Xenia.Adapters.Monaco, ...Tiptap, ...
  lib/mix/              # mix xenia.install, mix xenia.routes, the xenia.gen.* generators
  assets/
    index.js            # entry point for "xenia": the core
    monaco.js           # entry point for "xenia/monaco"
    <name>.js           # one entry point per official adapter ("xenia/tiptap", ...)
    core/               # createHooks, diffing, ctx, provider store
    adapters/           # the sixteen official adapters and their shared.js
  test/
    fixtures/phoenix_1_8/  # a pristine mix phx.new's files, for xenia.install
  priv/static/          # built ESM, one bundle per entry point (17) — committed
  priv/templates/xenia.install/  # theme, grid, layout and home page for new apps
  mix.exs
```

`CLAUDE.md` belongs at the repo root — that is where Claude Code looks. The
rest go in `docs/`. None are in `files:` in `mix.exs`, so they stay out of
the Hex package. **Since 2026-10-24 the `docs/` working documents are
local only** (the author's decision): `.gitignore` lists them, and they were
untracked with `git rm --cached`. They are still in the history already on
`origin`, so that history must not become public as it is (see the release
plan in `docs/RELEASING.md`).

Since M7, users read `README.md` and `guides/`, which are in the package and
on HexDocs. `CLAUDE.md` stays the internal source of truth. When a rule in
§4 or §5 changes, update `guides/ownership-boundary.md` too, written for
users (no § references).

Demo app is a sibling directory, not nested:

```
xenia/
xenia_demo/             # mix phx.new, depends on {:xenia, path: "../xenia"}
```

## 14. Conventions

- Elixir formatter, `mix format --check-formatted` in CI
- No new lifecycle concept without a written justification in this file
- Every adapter ships with a working example in `xenia_demo`
- **`examples/` is the public showcase; `xenia_demo` is the private test
  bed.** A user-facing feature gets a page in `examples/`, with a short
  README in plain English next to its code, and a browser test in
  `examples/assets/e2e/`. CI compiles and builds the examples; their browser
  tests run before a release.
- **At least one demo uses a library with no first-party adapter**, to keep
  Tier 1 honest. Since M4: Chart.js (`xenia_demo/assets/js/chart_adapter.js`,
  `/chart`)
- Run `mix hex.build` before every release and check `priv/static` is listed
- Prefer explicit mechanisms over magic; where magic exists, write down where

**Testing.** Hook behaviour gets no coverage from `LiveViewTest`, which never
runs client JS. Do not defer past M2.

- Elixir side (`LiveViewTest`): container has the right id, hook attribute,
  update attribute, and encoded `data-xenia-props`
- JS side: unit-test the core against a fake hook context and a jsdom element —
  diffing, dispatch, `isAlive()`, destroy ordering, provider delivery
- Integration: one Playwright or Wallaby smoke test per adapter covering mount,
  prop update, event round-trip, navigate-away cleanup

The double-mount window (§6) is what integration tests must catch. Unit tests
will not find it. The same applies to provider store lifetime.

## 15. Name, logo, pronunciation

**Pronunciation.** English: **ZEE-nee-uh** — like *xenon*, *xylophone*. Put it
in the README's first line. Ancient Greek was *kse-NEE-ah*; German and Slavic
speakers will say *KSEH-nee-ah*. Nobody is wrong, don't correct anyone.

**Logo.** A *symbolon*: a clay token broken in two, each party keeping a half.
Fitting the halves together proved the bond. A contract as a physical object.
Purple half for Elixir, warm orange half for Phoenix's flame. Two colours.

**Keep the metaphor light.** Host/guest explains the ownership boundary in
docs. It is not a naming scheme. No `Xenia.Guest`, `Xenia.Host`, `Xenia.Hearth`.
Module names should say what they do: `Xenia.Provider`, `Xenia.Component`.

## 16. Candidate features — after M5

1. ~~Form participation — how a JS component behaves as a form field~~ —
   done in M5.5 (§4 Form fields)
2. Devtools panel — mounted components, props, providers, recent events
3. ~~First-paint contract — placeholder, dimensions, loading state~~ —
   done 2026-10-25: `<:loading>` (§4 Loading and errors)
4. ~~Adapter error boundaries — defined failure mode on `mount` throw~~ —
   done 2026-10-25: `<:error>`, `on_crash`, `data-xenia-retry` (§4 Failures)
5. Typed props from the adapter declaration