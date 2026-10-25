defmodule XeniaExamplesWeb.App.Adapters.TabulatorPage do
  @moduledoc "`/adapters/tabulator`: an editable, sortable data table (`<.tabulator>`)."
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @columns [
    %{title: "Name", field: "name", editor: "input"},
    %{title: "Role", field: "role", editor: "input"},
    %{title: "Age", field: "age", sorter: "number", hoz_align: "right", editor: "number"}
  ]

  @impl true
  def mount(_params, _session, socket) do
    people = [
      %{id: 1, name: "Ada", role: "Engineer", age: 36},
      %{id: 2, name: "José", role: "Designer", age: 29},
      %{id: 3, name: "Mei", role: "Manager", age: 41}
    ]

    {:ok, assign(socket, page_title: "Data table", people: people, columns: @columns, last: nil)}
  end

  # The user edited a cell: update the server's rows.
  @impl true
  def handle_event("edited", %{"id" => id, "field" => field, "value" => value}, socket) do
    people =
      Enum.map(socket.assigns.people, fn row ->
        if row.id == id, do: Map.put(row, String.to_existing_atom(field), value), else: row
      end)

    {:noreply, assign(socket, people: people, last: "Row #{id}: #{field} is now #{value}.")}
  end

  def handle_event("clicked", %{"row" => %{"name" => name}}, socket),
    do: {:noreply, assign(socket, last: "You clicked #{name}.")}

  def handle_event("add", _params, socket) do
    id = length(socket.assigns.people) + 1
    row = %{id: id, name: "New person #{id}", role: "Guest", age: 30}
    {:noreply, update(socket, :people, &(&1 ++ [row]))}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Data table</h1>
    <p>
      Tabulator: click a header to sort, double-click a cell to edit it, or add a row from the server.
    </p>

    <.tabulator
      id="people"
      data={@people}
      columns={@columns}
      height="240px"
      on_cell_edited="edited"
      on_row_click="clicked"
    />

    <button id="add" phx-click="add" class="btn btn-sm">Add a row</button>
    <p id="last">{@last}</p>
    <p id="count">The server has {length(@people)} rows.</p>
    """
  end
end
