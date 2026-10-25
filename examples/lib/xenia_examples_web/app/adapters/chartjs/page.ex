defmodule XeniaExamplesWeb.App.Adapters.ChartjsPage do
  @moduledoc """
  `/adapters/chartjs`: Xenia's official Chart.js adapter.

  The first chart is `<.chartjs>`, the adapter as Xenia ships it, set up
  once in `assets/js/islands/chartjs.js`. The second is the same adapter
  extended with a `total` event. Nothing is copied from Xenia.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @months ~w(Jan Feb Mar Apr May Jun)

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Chart.js adapter",
       type: "bar",
       data: data([40, 55, 70, 45, 80, 95], [30, 35, 40, 38, 45, 50]),
       clicked: nil,
       legend: nil,
       total: nil
     )}
  end

  @impl true
  def handle_event("new_numbers", _params, socket) do
    random = fn -> Enum.map(@months, fn _ -> Enum.random(20..100) end) end
    {:noreply, assign(socket, data: data(random.(), random.()))}
  end

  def handle_event("switch_type", _params, socket) do
    type = if socket.assigns.type == "bar", do: "line", else: "bar"
    {:noreply, assign(socket, type: type)}
  end

  # Events from the official adapter.
  def handle_event("point_clicked", params, socket) do
    %{"dataset" => dataset, "label" => label, "value" => value} = params
    {:noreply, assign(socket, clicked: "#{dataset}, #{label}: #{value}")}
  end

  def handle_event("legend_clicked", %{"label" => label, "hidden" => hidden}, socket),
    do: {:noreply, assign(socket, legend: "#{label} #{if hidden, do: "hidden", else: "shown"}")}

  # Commands the official adapter understands.
  def handle_event("highlight_march", _params, socket),
    do: {:noreply, Xenia.push_to(socket, "official", "highlight", %{index: 2})}

  def handle_event("toggle_costs", _params, socket),
    do: {:noreply, Xenia.push_to(socket, "official", "toggle_dataset", %{index: 1})}

  # The event our extension adds.
  def handle_event("total", %{"total" => total}, socket),
    do: {:noreply, assign(socket, total: total)}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Chart.js adapter</h1>
    <p>
      Xenia's official Chart.js adapter, used without copying it. It follows the app's theme;
      click a bar or a legend entry, or use the buttons.
    </p>

    <.chartjs
      id="official"
      type={@type}
      data={@data}
      on_point_click="point_clicked"
      on_legend_click="legend_clicked"
      style="height: 260px"
    />

    <div class="flex flex-wrap gap-2">
      <button id="new-numbers" phx-click="new_numbers" class="btn btn-sm">New numbers</button>
      <button id="switch-type" phx-click="switch_type" class="btn btn-sm">
        Show as {if @type == "bar", do: "lines", else: "bars"}
      </button>
      <button id="highlight-march" phx-click="highlight_march" class="btn btn-sm">
        Highlight March
      </button>
      <button id="toggle-costs" phx-click="toggle_costs" class="btn btn-sm">Hide or show costs</button>
    </div>

    <p id="clicked">{@clicked || "Click a bar."}</p>
    <p id="legend">{@legend}</p>

    <h2 class="text-lg font-semibold">Extended: the same adapter, plus a total</h2>
    <p>
      This chart uses <code>revenueChart</code>
      from <code>assets/js/islands/chartjs.js</code>: the official adapter, spread into a new object
      that also sends a <code>total</code>
      event.
    </p>

    <.xenia
      id="revenue"
      adapter="RevenueChart"
      props={%{type: "line", data: @data}}
      events={%{total: "total"}}
      style="height: 200px"
    />

    <p id="total">{if @total, do: "The adapter reports a total of #{@total}."}</p>
    """
  end

  defp data(sales, costs) do
    %{
      labels: @months,
      datasets: [%{label: "Sales", data: sales}, %{label: "Costs", data: costs}]
    }
  end
end
