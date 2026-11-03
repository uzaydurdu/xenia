defmodule XeniaExamplesWeb.App.Adapters.AgGridPage do
  @moduledoc """
  `/adapters/ag-grid`: a data grid with AG Grid Community (`<.ag_grid>`):
  filters, sorting, editing, selection and a CSV export.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @cars [
    %{id: 1, make: "Volvo", model: "EX30", year: 2024, price: 36_000, electric: true},
    %{id: 2, make: "Kia", model: "Niro", year: 2023, price: 31_500, electric: false},
    %{id: 3, make: "Fiat", model: "500e", year: 2024, price: 29_900, electric: true},
    %{id: 4, make: "Toyota", model: "Corolla", year: 2022, price: 24_000, electric: false},
    %{id: 5, make: "Tesla", model: "Model 3", year: 2024, price: 42_990, electric: true},
    %{id: 6, make: "Renault", model: "Clio", year: 2023, price: 19_500, electric: false}
  ]

  # AG Grid's own column definitions, in snake_case. `type: "euro"` names a
  # column type defined in assets/js/islands/official.js: functions such as
  # value formatters live in JavaScript.
  @columns [
    %{field: "make", filter: true, floating_filter: true},
    %{field: "model", filter: true, floating_filter: true},
    %{field: "year", filter: "agNumberColumnFilter", max_width: 110},
    %{field: "price", type: "euro", editable: true, filter: "agNumberColumnFilter"},
    %{field: "electric", max_width: 120}
  ]

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Data grid",
       cars: @cars,
       columns: @columns,
       query: "",
       sort: nil,
       selected: [],
       last: nil
     )}
  end

  # The user edited a price: the server keeps it.
  @impl true
  def handle_event("edited", %{"id" => id, "field" => "price", "value" => price}, socket)
      when is_number(price) do
    cars = Enum.map(socket.assigns.cars, &if(&1.id == id, do: %{&1 | price: price}, else: &1))
    car = Enum.find(cars, &(&1.id == id))

    {:noreply,
     assign(socket, cars: cars, last: "#{car.make} #{car.model} now costs #{euro(price)}.")}
  end

  # A cleared price: the grid shows it empty, the server keeps the old one.
  def handle_event("edited", _params, socket),
    do: {:noreply, assign(socket, last: "A price needs a number.")}

  def handle_event("selected", %{"ids" => ids}, socket),
    do: {:noreply, assign(socket, selected: ids)}

  # The user sorted by a header: the server keeps the sort too.
  def handle_event("sorted", %{"sort" => sort}, socket) do
    order = Enum.map_join(sort, ", ", &"#{&1["col_id"]} #{&1["sort"]}")
    {:noreply, assign(socket, sort: sort, last: "Sorted by #{order}.")}
  end

  def handle_event("search", %{"query" => query}, socket),
    do: {:noreply, assign(socket, query: query)}

  def handle_event("cheapest", _params, socket),
    do:
      {:noreply,
       assign(socket,
         sort: [%{col_id: "price", sort: "asc"}],
         last: "The server sorted by price."
       )}

  def handle_event("add", _params, socket) do
    id = length(socket.assigns.cars) + 1

    car = %{
      id: id,
      make: "Skoda",
      model: "Elroq #{id}",
      year: 2025,
      price: 33_900,
      electric: true
    }

    {:noreply, update(socket, :cars, &(&1 ++ [car]))}
  end

  def handle_event("export", _params, socket),
    do: {:noreply, Xenia.push_to(socket, "cars", "export_csv", %{file_name: "cars.csv"})}

  # 31500 → "€31,500"
  defp euro(price) do
    digits = price |> round() |> Integer.to_string()

    "€" <>
      (digits
       |> String.reverse()
       |> String.replace(~r/(\d{3})(?=\d)/, "\\1,")
       |> String.reverse())
  end

  defp selected_names(cars, ids) do
    for car <- cars, car.id in ids, do: "#{car.make} #{car.model}"
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Data grid</h1>
    <p>
      AG Grid Community: filter and sort the columns, double-click a price to edit it, tick rows to select them.
    </p>

    <form id="search" phx-change="search" class="max-w-xs">
      <input
        id="query"
        name="query"
        value={@query}
        placeholder="Filter every column…"
        class="input input-sm w-full"
        autocomplete="off"
      />
    </form>

    <.ag_grid
      id="cars"
      row_data={@cars}
      column_defs={@columns}
      row_selection="multiple"
      quick_filter={@query}
      sort={@sort}
      height="330px"
      on_cell_edited="edited"
      on_selection="selected"
      on_sort="sorted"
    />

    <div class="flex flex-wrap gap-2">
      <button id="cheapest" phx-click="cheapest" class="btn btn-sm">Cheapest first</button>
      <button id="add" phx-click="add" class="btn btn-sm">Add a car</button>
      <button id="export" phx-click="export" class="btn btn-sm">Export as CSV</button>
    </div>

    <p id="last">{@last || "Edit a price, or sort by a header."}</p>
    <p id="selected">
      Selected: {case selected_names(@cars, @selected) do
        [] -> "none"
        names -> Enum.join(names, ", ")
      end}
    </p>
    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet title="The tag and the server, in page.ex" code={page_snippet()} />
    <.snippet title="The setup, once, in assets/js" code={setup_snippet()} />
    """
  end

  # The code on the page: how this example is made.
  defp page_snippet,
    do: ~S"""
    <.ag_grid
      id="cars"
      row_data={@cars}
      column_defs={@columns}
      row_selection="multiple"
      quick_filter={@query}
      on_cell_edited="edited"
      on_selection="selected"
    />

    @columns [
      %{field: "make", filter: true, floating_filter: true},
      %{field: "price", type: "euro", editable: true}
    ]

    def handle_event("edited", %{"id" => id, "value" => price}, socket), do: ...

    # Commands: a CSV file of what the grid shows
    Xenia.push_to(socket, "cars", "export_csv", %{file_name: "cars.csv"})
    """

  defp setup_snippet,
    do: ~S"""
    import { createAgGrid } from "xenia/ag-grid"

    const euro = new Intl.NumberFormat("en", { style: "currency", currency: "EUR" })

    export const agGrid = createAgGrid({
      load: () => import("ag-grid-community"),
      theme: (ag) => ag.themeQuartz.withParams({ accentColor: "#7c3aed" }),
      // functions live here; columns name them with `type`
      options: {
        columnTypes: { euro: { valueFormatter: (p) => euro.format(p.value) } },
      },
    })

    // app.js
    createHooks({ AgGrid: agGrid })
    """
end
