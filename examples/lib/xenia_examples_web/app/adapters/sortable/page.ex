defmodule XeniaExamplesWeb.App.Adapters.SortablePage do
  @moduledoc "`/adapters/sortable`: two lists that share cards (`<.sortable_list>`)."
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @cards %{
    "a" => %{id: "a", label: "Write the README"},
    "b" => %{id: "b", label: "Add a chart"},
    "c" => %{id: "c", label: "Ship the release"},
    "d" => %{id: "d", label: "Set up CI"}
  }

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Sortable lists",
       todo: cards(~w(a b c)),
       done: cards(~w(d))
     )}
  end

  # Each list reports its new order as `ids`, after a move within it, to it,
  # or away from it.
  @impl true
  def handle_event("todo_changed", %{"ids" => ids}, socket),
    do: {:noreply, assign(socket, todo: cards(ids))}

  def handle_event("done_changed", %{"ids" => ids}, socket),
    do: {:noreply, assign(socket, done: cards(ids))}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Sortable lists</h1>
    <p>SortableJS: drag cards to reorder them, or from one list to the other.</p>

    <div class="grid gap-6 sm:grid-cols-2">
      <div>
        <h2 class="mb-2 font-medium">To do</h2>
        <.sortable_list
          id="todo"
          items={@todo}
          group="board"
          options={%{force_fallback: true, animation: 0}}
          on_sort="todo_changed"
          on_add="todo_changed"
          on_remove="todo_changed"
        />
      </div>
      <div>
        <h2 class="mb-2 font-medium">Done</h2>
        <.sortable_list
          id="done"
          items={@done}
          group="board"
          options={%{force_fallback: true, animation: 0}}
          on_sort="done_changed"
          on_add="done_changed"
          on_remove="done_changed"
        />
      </div>
    </div>

    <p id="server-order">The server has: to do {labels(@todo)}; done {labels(@done)}.</p>
    """
  end

  defp cards(ids), do: Enum.map(ids, &Map.fetch!(@cards, &1))
  defp labels(cards), do: Enum.map_join(cards, ", ", & &1.label)
end
