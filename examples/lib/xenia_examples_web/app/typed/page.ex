defmodule XeniaExamplesWeb.App.TypedPage do
  @moduledoc """
  `/typed`: an island whose adapter is written in TypeScript
  (`assets/js/islands/budget.ts`).

  Phoenix's esbuild compiles the `.ts` file as it is. The adapter's types
  name the props this page sends (`spent`, `left`), the event it receives
  (`segment_click`) and the command it can send (`highlight`), so
  `npm run typecheck` catches a misspelled name or a wrong payload.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @budget 100

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "A typed island", spent: 30, clicked: nil)}
  end

  @impl true
  def handle_event("spend", _params, socket),
    do: {:noreply, update(socket, :spent, &min(&1 + 10, @budget))}

  def handle_event("reset", _params, socket), do: {:noreply, assign(socket, spent: 0)}

  # The island's segment_click, routed here by events={%{segment_click: ...}}.
  def handle_event("segment_clicked", %{"segment" => segment, "amount" => amount}, socket),
    do: {:noreply, assign(socket, clicked: "#{segment}: #{amount}")}

  # A command, typed in the adapter as highlight: {segment: "spent" | "left"}.
  def handle_event("highlight_left", _params, socket),
    do: {:noreply, Xenia.push_to(socket, "budget", "highlight", %{segment: "left"})}

  @impl true
  def render(assigns) do
    assigns = assign(assigns, budget: @budget)

    ~H"""
    <h1 class="text-2xl font-semibold">A typed island</h1>
    <p>
      This chart's adapter is written in TypeScript, in <code>assets/js/islands/budget.ts</code>. Its types say what this page sends, what the chart reports and what the page can ask, so a typo is an error before the page runs.
    </p>

    <.xenia
      id="budget"
      adapter="Budget"
      props={%{spent: @spent, left: @budget - @spent}}
      events={%{segment_click: "segment_clicked"}}
      style="height: 240px; max-width: 24rem"
    />

    <p class="flex flex-wrap gap-2">
      <button id="spend" phx-click="spend" class="btn btn-sm">Spend 10</button>
      <button id="reset" phx-click="reset" class="btn btn-sm">Reset</button>
      <button id="highlight-left" phx-click="highlight_left" class="btn btn-sm">
        Highlight what's left
      </button>
    </p>

    <p id="spent">Spent {@spent} of {@budget}.</p>
    <p id="clicked">
      {if @clicked, do: "You clicked #{@clicked}.", else: "Click a part of the chart."}
    </p>

    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet title="The adapter, in assets/js/islands/budget.ts" code={adapter_snippet()} />
    <div class="space-y-4">
      <.snippet title="The tag, in page.ex" code={tag_snippet()} />
      <.snippet title="The type check" code={check_snippet()} />
    </div>
    """
  end

  # The code on the page: how this example is made.
  defp adapter_snippet,
    do: ~S"""
    import Chart from "chart.js/auto"
    import type { Adapter } from "xenia"

    type Props = { spent: number; left: number }
    type Events = { segment_click: { segment: "spent" | "left"; amount: number } }
    type Commands = { highlight: { segment: "spent" | "left" } }

    export const budget: Adapter<Chart<"doughnut">, Props, Events, Commands> = {
      mount(el, props, ctx) {
        const canvas = el.appendChild(document.createElement("canvas"))
        return new Chart(canvas, { type: "doughnut", data: { ... } })
      },
      destroy: (chart) => chart.destroy(),
      events: { segment_click: {} },
    }
    """

  defp tag_snippet,
    do: ~S"""
    <.xenia
      id="budget"
      adapter="Budget"
      props={%{spent: @spent, left: @budget - @spent}}
      events={%{segment_click: "segment_clicked"}}
    />
    """

  defp check_snippet,
    do: ~S"""
    cd assets
    npm install --save-dev typescript
    npx tsc --noEmit
    """
end
