defmodule XeniaExamplesWeb.App.LargeDataPage do
  @moduledoc """
  `/large-data`: the same series in two charts, 100 points at first, up
  to 10,000.

    * The left chart gets it as a prop, `data`: every change resends the
      whole series, even when only `type` changed.
    * The right chart gets it by commands (`liveChart` in
      `assets/js/islands/chartjs.js`): the whole series once, when the chart
      says `ready`, then only what changed.

  The page shows about how much each update sent to each chart.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @sizes [100, 1_000, 10_000]

  # Chart.js options, passed as they are. Bars fill their whole slot, so a
  # dense series is still visible as bars.
  @options %{
    datasets: %{bar: %{barPercentage: 1, categoryPercentage: 1}},
    plugins: %{legend: %{display: false}}
  }

  # The dataset's own settings win over the official adapter's defaults:
  # no dot on every point (thousands of dots are slow, and hide the line).
  @dataset %{label: "Readings", pointRadius: 0}
  @empty %{labels: [], datasets: [Map.put(@dataset, :data, [])]}

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(page_title: "Large data", sizes: @sizes, type: "line", options: @options)
     |> assign(empty: @empty, sent: nil)
     |> assign_series(hd(@sizes))}
  end

  defp assign_series(socket, size) do
    labels = Enum.to_list(1..size)
    assign(socket, size: size, labels: labels, values: Enum.map(labels, &reading/1))
  end

  # The new point goes to the left chart as its whole `data` prop, and to
  # the right chart as one command with just that point.
  @impl true
  def handle_event("add_point", _params, socket) do
    label = length(socket.assigns.labels) + 1
    args = %{labels: [label], values: [reading(label)]}

    socket =
      socket
      |> update(:labels, &(&1 ++ [label]))
      |> update(:values, &(&1 ++ [reading(label)]))

    {:noreply,
     socket
     |> Xenia.push_to("by-command", "append_points", args)
     |> assign(sent: %{prop: prop_size(socket.assigns), command: json_size(args)})}
  end

  # Only `type` changes, but it's in the same props as `data`: the left
  # chart gets everything again. The right chart's props are just `type`
  # and `options`.
  def handle_event("switch_type", _params, socket) do
    socket = update(socket, :type, &if(&1 == "line", do: "bar", else: "line"))
    command_props = %{type: socket.assigns.type, options: @options, data: @empty}

    {:noreply,
     assign(socket, sent: %{prop: prop_size(socket.assigns), command: json_size(command_props)})}
  end

  # A new series: the left chart gets it as its props, the right one as
  # one replace_points command. Either way, the whole series.
  def handle_event("set_size", %{"points" => points}, socket) do
    size = Enum.find(@sizes, hd(@sizes), &(Integer.to_string(&1) == points))
    socket = assign_series(socket, size)
    args = %{labels: socket.assigns.labels, values: socket.assigns.values}

    {:noreply,
     socket
     |> Xenia.push_to("by-command", "replace_points", args)
     |> assign(sent: %{prop: prop_size(socket.assigns), command: json_size(args)})}
  end

  # The right chart started (or its LiveView reconnected): send the series once.
  def handle_event("chart_ready", _params, socket) do
    %{labels: labels, values: values} = socket.assigns

    {:noreply,
     Xenia.push_to(socket, "by-command", "replace_points", %{labels: labels, values: values})}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Large data</h1>
    <p>
      The same series of {format(length(@labels))} points, twice. Add a point, or switch the type, and compare what each chart was sent. A longer series makes the difference bigger.
    </p>

    <p class="flex flex-wrap items-center gap-2">
      <span class="text-sm opacity-70">Points:</span>
      <button
        :for={size <- @sizes}
        id={"size-#{size}"}
        phx-click="set_size"
        phx-value-points={size}
        class={["btn btn-sm", size == @size && "btn-active"]}
      >
        {format(size)}
      </button>
    </p>

    <p class="flex flex-wrap gap-2">
      <button id="add-point" phx-click="add_point" class="btn btn-sm">Add a point</button>
      <button id="switch-type" phx-click="switch_type" class="btn btn-sm">
        Switch to {if @type == "line", do: "bars", else: "a line"}
      </button>
    </p>

    <div class="grid gap-6 lg:grid-cols-2">
      <section class="space-y-2">
        <h2 class="font-medium">Data as a prop</h2>
        <.chartjs
          id="by-prop"
          type={@type}
          data={series(@labels, @values)}
          options={@options}
          style="height: 220px"
        />
        <p id="sent-prop" class="text-sm opacity-70">{sent(@sent, :prop)}</p>
      </section>

      <section class="space-y-2">
        <h2 class="font-medium">Data by commands</h2>
        <.xenia
          id="by-command"
          adapter="LiveChart"
          props={%{type: @type, options: @options, data: @empty}}
          events={%{ready: "chart_ready"}}
          style="height: 220px"
        />
        <p id="sent-command" class="text-sm opacity-70">{sent(@sent, :command)}</p>
      </section>
    </div>

    <h2 class="text-lg font-semibold">How the right chart is made</h2>
    <.snippet title="The tag, in page.ex" code={tag_snippet()} />
    <div class="space-y-4">
      <.snippet title="The server, in page.ex" code={server_snippet()} />
      <.snippet title="The adapter, in assets/js/islands/chartjs.js" code={adapter_snippet()} />
    </div>
    """
  end

  defp series(labels, values),
    do: %{labels: labels, datasets: [Map.put(@dataset, :data, values)]}

  # A repeatable reading for each label: a wave you can see in 100 points,
  # on a slower one you can see in 10,000.
  defp reading(label),
    do: Float.round(50 + 15 * :math.sin(label / 1500) + 10 * :math.sin(label / 12), 2)

  # About what LiveView sends for the left chart: its props, encoded.
  defp prop_size(assigns) do
    json_size(%{
      type: assigns.type,
      data: series(assigns.labels, assigns.values),
      options: @options
    })
  end

  defp json_size(term), do: term |> Jason.encode!() |> byte_size()

  defp sent(nil, _chart), do: "Press a button."
  defp sent(sizes, chart), do: "This update sent about #{bytes(sizes[chart])}."

  defp bytes(size) when size >= 1_000_000, do: "#{Float.round(size / 1_000_000, 2)} MB"
  defp bytes(size) when size >= 1_000, do: "#{round(size / 1_000)} KB"
  defp bytes(size), do: "#{size} bytes"

  defp format(n), do: n |> Integer.to_string() |> String.replace(~r/\B(?=(\d{3})+$)/, ",")

  # The code on the page: how the right chart is made.
  defp tag_snippet,
    do: ~S"""
    <.xenia
      id="by-command"
      adapter="LiveChart"
      props={%{type: @type}}
      events={%{ready: "chart_ready"}}
    />
    """

  defp server_snippet,
    do: ~S"""
    # The chart says it's ready: the whole series, once.
    def handle_event("chart_ready", _params, socket) do
      series = %{labels: socket.assigns.labels, values: socket.assigns.values}
      {:noreply, Xenia.push_to(socket, "by-command", "replace_points", series)}
    end

    # After that, only what's new.
    Xenia.push_to(socket, "by-command", "append_points", %{labels: [label], values: [value]})
    """

  defp adapter_snippet,
    do: ~S"""
    // The official Chart.js adapter, extended by spreading.
    export const liveChart = {
      ...chartjs,
      async mount(el, props, ctx) {
        const instance = await chartjs.mount(el, props, ctx)
        ctx.emit("ready", {})
        return instance
      },
      events: { ...chartjs.events, ready: {} },
      commands: {
        ...chartjs.commands,
        replace_points(instance, { labels, values }) { /* the whole series */ },
        append_points(instance, { labels, values }) { /* just these */ },
      },
    }
    """
end
