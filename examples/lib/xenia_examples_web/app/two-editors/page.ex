defmodule XeniaExamplesWeb.App.TwoEditorsPage do
  @moduledoc """
  `/two-editors`: two Monaco editors on one page, each with its own events
  and its own commands.

    * each editor's `on_change` names a different LiveView event, so the
      server always knows which editor changed
    * `Xenia.push_to/4` addresses one editor by its id; the other one never
      sees the command
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Two editors",
       a: "# Editor A\n",
       b: "# Editor B\n",
       version_a: 0,
       version_b: 0
     )}
  end

  # One event per editor: the page decides the event name (`on_change`).
  @impl true
  def handle_event("a_changed", %{"value" => code, "version" => version}, socket),
    do: {:noreply, assign(socket, a: code, version_a: version)}

  def handle_event("b_changed", %{"value" => code, "version" => version}, socket),
    do: {:noreply, assign(socket, b: code, version_b: version)}

  # A command reaches only the editor with that id.
  def handle_event("insert", %{"into" => id}, socket) when id in ["editor-a", "editor-b"],
    do: {:noreply, Xenia.push_to(socket, id, "insert", %{text: "inserted into #{id}\n"})}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Two editors</h1>
    <p>
      Two islands of the same kind on one page. Type in one, or press its
      button: only that editor changes, and the server hears from the right one.
    </p>

    <div class="grid gap-5 lg:grid-cols-2">
      <section :for={{id, label, code, version, event} <- editors(assigns)} class="space-y-2">
        <h2 class="font-medium">{label}</h2>
        <.monaco
          id={id}
          value={code}
          version={version}
          language="markdown"
          on_change={event}
          style="height: 160px"
        />
        <button id={"insert-#{id}"} phx-click="insert" phx-value-into={id} class="btn btn-sm">
          Insert into {label}
        </button>
        <p class="text-sm opacity-70">The server has:</p>
        <pre id={"server-#{id}"} class="rounded-box bg-base-200 p-3 text-sm whitespace-pre-wrap">{code}</pre>
      </section>
    </div>
    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet title="The tags, in page.ex: each picks its own event" code={tags_snippet()} />
    <.snippet title="The server, in page.ex" code={server_snippet()} />
    """
  end

  defp editors(assigns) do
    [
      {"editor-a", "Editor A", assigns.a, assigns.version_a, "a_changed"},
      {"editor-b", "Editor B", assigns.b, assigns.version_b, "b_changed"}
    ]
  end

  # The code on the page: how this example is made.
  defp tags_snippet,
    do: ~S"""
    <.monaco id="editor-a" value={@a} version={@version_a} on_change="a_changed" />
    <.monaco id="editor-b" value={@b} version={@version_b} on_change="b_changed" />
    """

  defp server_snippet,
    do: ~S"""
    def handle_event("a_changed", %{"value" => code, "version" => version}, socket),
      do: {:noreply, assign(socket, a: code, version_a: version)}

    def handle_event("b_changed", %{"value" => code, "version" => version}, socket),
      do: {:noreply, assign(socket, b: code, version_b: version)}

    # A command reaches only the editor with that id
    Xenia.push_to(socket, "editor-b", "insert", %{text: "inserted into editor-b\n"})
    """
end
