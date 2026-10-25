defmodule XeniaExamplesWeb.App.Routing.Docs.PathPage do
  @moduledoc """
  `/routing/docs/*path`: a catch-all. The folder `[...path]` matches the
  rest of the URL, however many parts it has, and the page gets them as a
  list in `params["path"]`. It also matches `/routing/docs` itself, with an
  empty list.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  import XeniaExamplesWeb.App.Routing.RouteInfo

  @impl true
  def mount(%{"path" => path} = params, _session, socket) do
    {:ok, assign(socket, params: params, path: path)}
  end

  def metadata(%{path: path}), do: %{title: Enum.join(["Docs" | path], " / ")}

  # A catch-all takes a list; [] is /routing/docs itself.
  def sitemap, do: [%{path: []}, %{path: ["guides", "install"]}]

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Docs</h1>

    <.route_info route="/routing/docs/*path" file="routing/docs/[...path]/page.ex" params={@params} />

    <p :if={@path == []}>
      This is <code>/routing/docs</code>
      itself. A catch-all matches it too, with an empty list,
      so this page can be the docs' start page. Open <.link
        navigate={~p"/routing/docs/guides/install"}
        class="link"
      >a deeper page</.link>.
    </p>

    <p :if={@path != []}>
      This page got <strong id="segments">{length(@path)}</strong>
      parts of the URL. Each link below goes up to one of them, and the same page answers:
    </p>

    <nav :if={@path != []} id="breadcrumb" class="breadcrumbs text-sm">
      <ul>
        <li :for={{part, n} <- Enum.with_index(@path, 1)}>
          <.link navigate={"/routing/docs/" <> Enum.join(Enum.take(@path, n), "/")}>
            {part}
          </.link>
        </li>
      </ul>
    </nav>

    <p>
      Use a catch-all when a URL can be any depth: documentation, file browsers, nested
      categories.
    </p>
    """
  end
end
