defmodule XeniaExamplesWeb.App.ScratchpadLayout do
  @moduledoc """
  The layout of the two scratchpad pages: links between them, the page, and
  the scratchpad beside it.

  The scratchpad is `persistent.ex`, in this same folder. It stays alive,
  with its Monaco editor, while you move between the pages below this
  layout, next to the root layout's sidebar (its own persistent part).
  """
  use XeniaExamplesWeb, :html
  use Xenia.Layout

  @impl true
  def metadata(_assigns), do: %{title_template: "%s · An editor that stays open"}

  @impl true
  def frame(assigns) do
    ~H"""
    <div class="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div class="min-w-0 space-y-4">
        <nav id="scratchpad-nav" class="flex flex-wrap gap-2" aria-label="Scratchpad pages">
          <.link
            id="to-first"
            navigate={~p"/scratchpad"}
            class="btn btn-sm btn-ghost border border-base-300"
          >
            First page
          </.link>
          <.link
            id="to-second"
            navigate={~p"/scratchpad/second"}
            class="btn btn-sm btn-ghost border border-base-300"
          >
            Second page
          </.link>
        </nav>
        {@inner_content}
      </div>
      <aside id="scratchpad-panel">{@persistent}</aside>
    </div>
    """
  end
end
