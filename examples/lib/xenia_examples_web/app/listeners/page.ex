defmodule XeniaExamplesWeb.App.ListenersPage do
  @moduledoc """
  `/listeners`: an island that listens to the whole page, and leaves nothing
  behind when it goes.

  Its adapter, in the `<script>` below, adds a `keydown` listener to
  `document`, outside the island, with `{ signal: ctx.signal }`. Xenia
  aborts that signal when the island is destroyed, which removes the
  listener, so the adapter's `destroy` has nothing to undo.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "Listeners outside the island")}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Listeners outside the island</h1>
    <p>
      Press any key, anywhere on this page. The island hears it through a listener on the whole document, not just on itself.
    </p>

    <.xenia
      id="keys"
      adapter={colocated(".KeyLog")}
      class="block rounded-box border border-base-300 p-5"
    />

    <p>
      Go to another example and come back: the listener went with the island,
      and the new one has its own. Listeners never pile up, and the adapter
      never removes one by hand.
    </p>

    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet title="The island and its adapter, both in page.ex" code={island_snippet()} />

    <script :type={Phoenix.LiveView.ColocatedHook} name=".KeyLog">
      import { adapterHook } from "xenia"

      export default adapterHook({
        mount(el, _props, ctx) {
          const doc = el.ownerDocument
          const instance = { output: el.appendChild(doc.createElement("output")), count: 0 }
          show(instance, null)

          // On the whole page, outside the island. Xenia aborts ctx.signal
          // when the island is destroyed, and that removes the listener.
          doc.addEventListener(
            "keydown",
            (event) => {
              if (event.target.closest?.("input, textarea, select, [contenteditable]")) return
              instance.count += 1
              show(instance, event.key)
            },
            { signal: ctx.signal },
          )

          return instance
        },

        // Nothing outside el to undo: the listener went with ctx.signal,
        // and Xenia removes el itself.
        destroy() {},
      })

      function show(instance, key) {
        instance.output.textContent =
          key == null ? "Press any key." : `Last key: ${key} (${instance.count} pressed)`
      }
    </script>
    """
  end

  # The code on the page: how this example is made (a shorter version of
  # the adapter below).
  defp island_snippet,
    do: ~S"""
    <.xenia id="keys" adapter={colocated(".KeyLog")} />

    <script :type={Phoenix.LiveView.ColocatedHook} name=".KeyLog">
      import { adapterHook } from "xenia"

      export default adapterHook({
        mount(el, _props, ctx) {
          const output = el.appendChild(document.createElement("output"))
          // On the whole page. ctx.signal removes it when the island goes.
          el.ownerDocument.addEventListener("keydown", (event) => {
            output.textContent = `Last key: ${event.key}`
          }, { signal: ctx.signal })
          return output
        },
        destroy() {}, // nothing to undo
      })
    </script>
    """
end
