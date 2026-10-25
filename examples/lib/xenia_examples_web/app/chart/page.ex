defmodule XeniaExamplesWeb.App.ChartPage do
  @moduledoc """
  `/chart`: a Chart.js chart, and the three ways a page and an island talk.

    * props: the page sends data to the chart ("New numbers")
    * events: the chart tells the page what was clicked
    * commands: the page asks the chart to do something ("Highlight March")

  The island is `assets/js/islands/chart.js`. The `<.chart>` tag is
  declared in `components/islands.ex`.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @months ~w(Jan Feb Mar Apr May Jun)

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "Chart", type: "bar", data: sales(), clicked: nil)}
  end

  # Props: change an assign, and Xenia sends the new value to the chart.
  @impl true
  def handle_event("new_numbers", _params, socket) do
    {:noreply, assign(socket, data: sales())}
  end

  def handle_event("switch_type", _params, socket) do
    {:noreply, assign(socket, type: other_type(socket.assigns.type))}
  end

  # Events: the chart sends "click", and on_click="bar_clicked" routes it here.
  def handle_event("bar_clicked", %{"label" => label}, socket) do
    {:noreply, assign(socket, clicked: label)}
  end

  # Commands: Xenia.push_to/4 reaches only the chart with this id.
  def handle_event("highlight_march", _params, socket) do
    {:noreply, Xenia.push_to(socket, "sales", "highlight", %{index: 2})}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Chart</h1>
    <p>A Chart.js chart. Click a bar, or use the buttons.</p>

    <.chart id="sales" type={@type} data={@data} on_click="bar_clicked" style="height: 280px" />

    <div class="flex flex-wrap gap-2">
      <button id="new-numbers" phx-click="new_numbers" class="btn btn-sm">New numbers</button>
      <button id="switch-type" phx-click="switch_type" class="btn btn-sm">
        Show as a {other_type(@type)} chart
      </button>
      <button id="highlight-march" phx-click="highlight_march" class="btn btn-sm">
        Highlight March
      </button>
    </div>

    <p id="clicked">{if @clicked, do: "You clicked #{@clicked}.", else: "Click a bar."}</p>
    """
  end

  defp other_type("bar"), do: "line"
  defp other_type(_line), do: "bar"

  defp sales do
    %{
      labels: @months,
      datasets: [%{label: "Sales", data: Enum.map(@months, fn _ -> Enum.random(10..100) end)}]
    }
  end
end
