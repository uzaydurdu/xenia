defmodule XeniaExamplesWeb.App.ColocatedPage do
  @moduledoc """
  `/colocated`: an island whose adapter lives inside this page.

  The `<script :type={Phoenix.LiveView.ColocatedHook} name=".Sparkline">`
  below holds the adapter. LiveView takes it out when it compiles, and names
  it after this module. `colocated(".Sparkline")` gives `<.xenia>` that same
  name. `assets/js/app.js` didn't change for this island.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "Island in a page", points: [4, 7, 5, 9, 6])}
  end

  @impl true
  def handle_event("add_point", _params, socket) do
    {:noreply, update(socket, :points, &(&1 ++ [Enum.random(1..10)]))}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Island in a page</h1>
    <p>
      This sparkline's adapter is written inside this page's module, not in <code>assets/js</code>.
    </p>

    <.xenia
      id="sparkline"
      adapter={colocated(".Sparkline")}
      props={%{points: @points}}
      style="height: 120px; max-width: 28rem"
    />

    <button id="add-point" phx-click="add_point" class="btn btn-sm">Add a point</button>
    <p id="points">Points on the server: {length(@points)}</p>

    <script :type={Phoenix.LiveView.ColocatedHook} name=".Sparkline">
      import Chart from "chart.js/auto"
      import { adapterHook } from "xenia"

      // The same kind of adapter as in assets/js/islands, wrapped in
      // adapterHook() because a colocated hook exports one hook.
      export default adapterHook({
        mount(el, props) {
          const canvas = el.appendChild(document.createElement("canvas"))

          return new Chart(canvas, {
            type: "line",
            data: {
              labels: props.points.map((_, i) => i + 1),
              datasets: [{ data: props.points, borderColor: "#7c3aed", tension: 0.3 }],
            },
            options: {
              animation: false,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { x: { display: false }, y: { display: false } },
            },
          })
        },

        destroy(chart) {
          chart.destroy()
        },

        props: {
          points(chart, points) {
            chart.data.labels = points.map((_, i) => i + 1)
            chart.data.datasets[0].data = points
            chart.update()
          },
        },
      })
    </script>
    """
  end
end
