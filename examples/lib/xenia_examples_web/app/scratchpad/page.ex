defmodule XeniaExamplesWeb.App.ScratchpadPage do
  @moduledoc """
  `/scratchpad`: the first of two pages that share a scratchpad, a Monaco
  editor that stays open while you move between them (`persistent.ex`).
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket), do: {:ok, socket}

  def metadata(_assigns), do: %{title: "First page"}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">An editor that stays open</h1>
    <p>
      Write something in the scratchpad, then open the second page. The page
      changes; the scratchpad doesn't. It's the same editor, with your text,
      your cursor and your undo history (try ⌘Z or Ctrl+Z after switching).
    </p>
    <p>
      This page is <code>scratchpad/page.ex</code>. The scratchpad is <code>scratchpad/persistent.ex</code>, the persistent part of <code>scratchpad/layout.ex</code>: a LiveView of its own, which stays
      alive while you move between the pages below that layout.
    </p>
    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet
      title="The layout, with a place for its persistent part: scratchpad/layout.ex"
      code={layout_snippet()}
    />
    <.snippet
      title="The persistent part, next to it: scratchpad/persistent.ex"
      code={persistent_snippet()}
    />
    """
  end

  # The code on the page: how this example is made.
  defp layout_snippet,
    do: ~S'''
    defmodule MyAppWeb.App.ScratchpadLayout do
      use MyAppWeb, :html
      use Xenia.Layout

      def frame(assigns) do
        ~H"""
        <div class="grid grid-cols-[1fr_22rem]">
          <div>{@inner_content}</div>
          <aside>{@persistent}</aside>
        </div>
        """
      end
    end
    '''

  defp persistent_snippet,
    do: ~S'''
    defmodule MyAppWeb.App.ScratchpadLive do
      use MyAppWeb, :live_view
      use Xenia.Persistent

      # Its own LiveView: it stays alive while you move between the pages below.
      def mount(_params, _session, socket), do: {:ok, assign(socket, notes: "", version: 0)}

      # Told about every page change (it can't see the URL itself)
      def handle_navigation(_uri, socket), do: {:noreply, socket}

      def handle_event("notes_changed", %{"value" => notes, "version" => version}, socket),
        do: {:noreply, assign(socket, notes: notes, version: version)}

      def render(assigns) do
        ~H"""
        <.monaco id="scratchpad-editor" value={@notes} version={@version} on_change="notes_changed" />
        """
      end
    end
    '''
end
