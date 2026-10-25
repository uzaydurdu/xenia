defmodule XeniaExamplesWeb.App.Adapters.MonacoDiffPage do
  @moduledoc "`/adapters/monaco-diff`: Monaco's diff editor (`<.monaco_diff>`)."
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @original """
  defmodule Greeter do
    def hello(name), do: "Hello " <> name
  end
  """

  @modified """
  defmodule Greeter do
    def hello(name), do: "Hello, " <> name <> "!"

    def bye(name), do: "Bye, " <> name
  end
  """

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Diff editor",
       original: @original,
       modified: @modified,
       version: 0,
       changes: nil
     )}
  end

  # The editor reports each edit of the right side, and each new diff.
  @impl true
  def handle_event("changed", %{"value" => value, "version" => version}, socket),
    do: {:noreply, assign(socket, modified: value, version: version)}

  def handle_event("diffed", %{"changes" => changes}, socket),
    do: {:noreply, assign(socket, changes: changes)}

  def handle_event("next", _params, socket),
    do: {:noreply, Xenia.push_to(socket, "diff", "next_diff")}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Diff editor</h1>
    <p>
      Monaco's diff editor: the old code on the left, the new code on the right. Edit the right side.
    </p>

    <.monaco_diff
      id="diff"
      original={@original}
      modified={%{value: @modified, version: @version}}
      language="elixir"
      on_change="changed"
      on_diff="diffed"
      style="height: 240px"
    />

    <div class="flex flex-wrap gap-2">
      <button id="next" phx-click="next" class="btn btn-sm">Go to the next change</button>
    </div>

    <p id="changes">{if @changes, do: "Changed blocks: #{@changes}."}</p>
    <p id="lines">The server has {length(String.split(@modified, "\n"))} lines on the right.</p>
    """
  end
end
