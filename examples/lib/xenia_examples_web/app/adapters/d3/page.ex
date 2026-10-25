defmodule XeniaExamplesWeb.App.Adapters.D3Page do
  @moduledoc "`/adapters/d3`: bar, line and pie charts drawn with D3 (`<.d3_chart>`)."
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @months ~w(Jan Feb Mar Apr May)

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "D3", kind: "bar", data: orders(), selected: nil)}
  end

  @impl true
  def handle_event("kind", %{"kind" => kind}, socket) when kind in ~w(bar line pie),
    do: {:noreply, assign(socket, kind: kind)}

  def handle_event("selected", %{"x" => x, "y" => y} = point, socket),
    do: {:noreply, assign(socket, selected: "#{point["series"] || "Orders"}, #{x}: #{y}")}

  def handle_event("highlight", _params, socket),
    do: {:noreply, Xenia.push_to(socket, "orders", "highlight", %{x: "Mar", series: "North"})}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">D3</h1>
    <p>D3 draws these charts from data the server sends. Click a mark, or switch the chart kind.</p>

    <.d3_chart
      id="orders"
      kind={@kind}
      data={if @kind == "pie", do: Enum.filter(@data, &(&1.series == "North")), else: @data}
      options={%{y_label: "Orders", duration: 0}}
      on_select="selected"
      style="height: 300px"
    />

    <div class="flex flex-wrap gap-2">
      <button
        :for={kind <- ~w(bar line pie)}
        id={"kind-#{kind}"}
        phx-click="kind"
        phx-value-kind={kind}
        class={["btn btn-sm", @kind == kind && "btn-primary"]}
      >
        {String.capitalize(kind)}
      </button>
      <button id="highlight" phx-click="highlight" class="btn btn-sm">Highlight March</button>
    </div>

    <p id="selected">{@selected || "Click a bar, a point or a slice."}</p>
    """
  end

  defp orders do
    for {month, i} <- Enum.with_index(@months), series <- ["North", "South"] do
      %{x: month, y: if(series == "North", do: 10 + i * 4, else: 18 - i * 2), series: series}
    end
  end
end
