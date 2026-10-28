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
    """
  end
end
