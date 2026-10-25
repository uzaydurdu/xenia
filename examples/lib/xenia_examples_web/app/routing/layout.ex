defmodule XeniaExamplesWeb.App.RoutingLayout do
  @moduledoc """
  The layout of every page in `routing` and below: the links at the top.

  It sits inside the app's root `layout.ex` (header and sidebar). Layouts
  nest like folders: the outer one draws first, then this one, then the
  page in `@inner_content`.
  """
  use XeniaExamplesWeb, :html
  use Xenia.Layout

  @links [
    {"Overview", "/routing"},
    {"A post", "/routing/posts/hello-xenia"},
    {"Another post", "/routing/posts/folders-are-urls"},
    {"Docs, start", "/routing/docs"},
    {"Docs, two levels", "/routing/docs/guides/install"},
    {"Docs, three levels", "/routing/docs/guides/forms/errors"},
    {"Team", "/routing/team"},
    {"Contact", "/routing/contact"}
  ]

  # Every routing page's title ends with " · File-based routing": the pages
  # below set a title in their metadata/1, and this template wraps it.
  @impl true
  def metadata(_assigns), do: %{title_template: "%s · File-based routing"}

  @impl true
  def frame(assigns) do
    assigns = assign(assigns, :links, @links)

    ~H"""
    <div class="space-y-5">
      <nav id="routing-nav" class="flex flex-wrap gap-2" aria-label="Routing example">
        <.link
          :for={{label, path} <- @links}
          navigate={path}
          class="btn btn-sm btn-ghost border border-base-300"
        >
          {label}
        </.link>
      </nav>
      {@inner_content}
    </div>
    """
  end
end
