defmodule XeniaExamplesWeb.App.IntegrityPage do
  @moduledoc """
  `/integrity`: a test fixture, not an example. It isn't on the home page.

  The lifecycle guard's Stage A browser tests (`assets/e2e/integrity.test.mjs`)
  use it to see what happens to islands when things go wrong: an island
  toggled by `:if`, an id that changes on every render, a root removed by
  outside JavaScript, an event sent with `null`, an unbound event, an event
  with no `handle_event` clause, and a slow mount removed before it ends.
  Some of these are mistakes on purpose; don't copy them.

  Every island uses the `.Probe` adapter below, which records what Xenia
  asks of it in `window.__integrity`.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Integrity (test fixture)",
       show: true,
       slow: false,
       renders: 0,
       value: :unset,
       params: nil
     )}
  end

  @impl true
  def handle_event("toggle", _params, socket), do: {:noreply, update(socket, :show, &(!&1))}
  def handle_event("toggle_slow", _params, socket), do: {:noreply, update(socket, :slow, &(!&1))}

  def handle_event("rerender", _params, socket),
    do: {:noreply, update(socket, :renders, &(&1 + 1))}

  def handle_event("ping_victim", _params, socket),
    do: {:noreply, Xenia.push_to(socket, "victim", "ping")}

  def handle_event("changed", params, socket),
    do: {:noreply, assign(socket, value: params["value"], params: params)}

  # No clause for "no_such_clause": the page binds it on purpose (test D).

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Integrity (test fixture)</h1>
    <p>Islands that come and go, for the lifecycle browser tests.</p>

    <div class="flex flex-wrap gap-2">
      <button id="toggle" phx-click="toggle" class="btn btn-sm">Toggle</button>
      <button id="toggle-slow" phx-click="toggle_slow" class="btn btn-sm">Toggle slow</button>
      <button id="rerender" phx-click="rerender" class="btn btn-sm">Re-render</button>
      <button id="ping-victim" phx-click="ping_victim" class="btn btn-sm">Ping the victim</button>
    </div>
    <p id="renders">Renders: {@renders}</p>

    <%!-- A and F: an island toggled by :if. --%>
    <.xenia :if={@show} id="toggled" adapter={colocated(".Probe")} props={%{label: "toggled"}} />

    <%!-- B: a stable id, and an id that changes on every render (a mistake). --%>
    <.xenia id="stable" adapter={colocated(".Probe")} props={%{renders: @renders}} />
    <.xenia id={"unstable-#{@renders}"} adapter={colocated(".Probe")} props={%{renders: @renders}} />

    <%!-- C: removed by outside JavaScript in the test. --%>
    <.xenia id="victim" adapter={colocated(".Probe")} props={%{renders: @renders}} />

    <%!-- D: events. "unbound" isn't bound; "broken" has no handle_event clause. --%>
    <.xenia
      id="emitter"
      adapter={colocated(".Probe")}
      events={%{change: "changed", broken: "no_such_clause"}}
    />
    <p id="value">{inspect(@value)}</p>
    <p id="params">{inspect(@params)}</p>
    <p :if={@value} id="has-value">The server has a value.</p>

    <%!-- F: a mount that takes 500 ms, removed before it ends. --%>
    <.xenia :if={@slow} id="slow" adapter={colocated(".Probe")} props={%{delay: 500}} />

    <script :type={Phoenix.LiveView.ColocatedHook} name=".Probe">
      import { adapterHook } from "xenia"

      // What Xenia asked of each instance, in order.
      const log = (window.__integrity ??= { events: [], alive: [], serial: 0 })

      export default adapterHook({
        async mount(el, props, ctx) {
          const n = ++log.serial
          const name = `${ctx.id} #${n}`
          log.events.push(`mount ${name}`)
          queueMicrotask(() => log.events.push(`mount-microtask ${name}`))

          if (props.delay) await new Promise((resolve) => setTimeout(resolve, props.delay))

          // Like a library: a listener outside el, removed only by destroy.
          const onKey = () => {}
          document.addEventListener("keydown", onKey)
          log.alive.push(name)
          log.events.push(`ready ${name}`)

          el.textContent = name
          return { n, name, ctx, onKey, destroys: 0 }
        },

        destroy(instance) {
          instance.destroys += 1
          log.events.push(`destroy ${instance.name} (${instance.destroys})`)
          log.alive = log.alive.filter((name) => name !== instance.name)
          document.removeEventListener("keydown", instance.onKey)
        },

        props: {
          renders(instance, value) {
            log.events.push(`update ${instance.name} renders=${value}`)
          },
        },

        commands: {
          ping(instance) {
            log.events.push(`ping ${instance.name}`)
          },
        },

        events: { change: {}, unbound: {}, broken: {} },
      })
    </script>
    """
  end
end
