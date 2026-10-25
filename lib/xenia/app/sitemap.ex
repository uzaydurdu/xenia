defmodule Xenia.Sitemap do
  @moduledoc """
  A `sitemap.xml` built from your app folder's pages.

  Add one route to your router, outside the `:browser` pipeline:

      get "/sitemap.xml", Xenia.Sitemap, []

  It lists every page `xenia_routes` generated, with your endpoint's URL in
  front (`MyAppWeb.Endpoint.url()`, or `base_url:` in the options):

    * **A page without parameters** is listed, unless it defines
      `sitemap/0` returning `[]`.
    * **A page with parameters** (`[slug]`, `[...path]`) is listed only
      with the parameters its `sitemap/0` returns, one entry each:

          def sitemap, do: for(post <- Blog.list_posts(), do: %{slug: post.slug})

      A catch-all takes a list: `%{path: ["guides", "install"]}`.
    * **Pages under a layout with `sitemap: false`** are left out, for
      example a signed-in area: `use Xenia.Layout, on_mount: ..., sitemap: false`.

  Hand-written routes aren't listed. To build your own sitemap, start from
  `paths/1`.
  """

  @behaviour Plug

  import Plug.Conn

  @impl Plug
  def init(opts), do: Keyword.validate!(opts, base_url: nil)

  @impl Plug
  def call(conn, opts) do
    router = conn.private.phoenix_router
    base_url = opts[:base_url] || Phoenix.Controller.endpoint_module(conn).url()

    conn
    |> put_resp_content_type("application/xml")
    |> send_resp(200, xml(router, base_url))
    |> halt()
  end

  @doc """
  The sitemap as XML: one `<url>` per path from `paths/1`, after `base_url`.
  """
  @spec xml(module(), String.t()) :: String.t()
  def xml(router, base_url) do
    base_url = String.trim_trailing(base_url, "/")

    urls =
      for path <- paths(router) do
        "  <url><loc>#{escape(base_url <> path)}</loc></url>\n"
      end

    ~s(<?xml version="1.0" encoding="UTF-8"?>\n) <>
      ~s(<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n) <>
      Enum.join(urls) <> "</urlset>\n"
  end

  @doc """
  The paths of the app folder's pages that belong in the sitemap, in route
  order, with the router's scopes applied.
  """
  @spec paths(module()) :: [String.t()]
  def paths(router) do
    if Code.ensure_loaded?(router) and function_exported?(router, :__xenia_page__, 1) do
      router
      |> Phoenix.Router.routes()
      |> Enum.flat_map(&route_paths(&1, router))
      |> Enum.uniq()
    else
      []
    end
  end

  # A generated route's live action is the page under a live.ex; otherwise
  # the page is the LiveView itself.
  defp route_paths(
         %{verb: :get, path: path, metadata: %{phoenix_live_view: {view, action, _, _}}},
         router
       ) do
    page = if is_atom(action) and router.__xenia_page__(action), do: action, else: view

    case router.__xenia_page__(page) do
      %{} = record -> entries(path, page, record)
      nil -> []
    end
  end

  defp route_paths(_route, _router), do: []

  defp entries(path, page, record) do
    cond do
      not Enum.all?(Map.get(record, :layouts, []), &Xenia.Layout.sitemap?/1) ->
        []

      dynamic?(path) ->
        for params <- sitemap(page) || [], do: fill(path, params, page)

      sitemap(page) == [] ->
        []

      true ->
        [path]
    end
  end

  defp dynamic?(path), do: String.contains?(path, [":", "*"])

  defp sitemap(page) do
    if Code.ensure_loaded?(page) and function_exported?(page, :sitemap, 0) do
      case page.sitemap() do
        list when is_list(list) ->
          list

        other ->
          raise ArgumentError,
                "#{inspect(page)}.sitemap/0 must return a list, got: #{inspect(other)}"
      end
    end
  end

  # "/posts/:slug" with %{slug: "hello"} → "/posts/hello".
  defp fill(path, params, page) do
    params = Map.new(params, fn {key, value} -> {to_string(key), value} end)

    path
    |> String.split("/")
    |> Enum.map(fn
      ":" <> name ->
        encode(fetch!(params, name, path, page))

      "*" <> name ->
        params |> fetch!(name, path, page) |> List.wrap() |> Enum.map_join("/", &encode/1)

      segment ->
        segment
    end)
    |> Enum.join("/")
    |> trim_slash()
  end

  # An empty catch-all ("/docs/*path" with []) is the folder's own URL.
  defp trim_slash("/"), do: "/"
  defp trim_slash(path), do: String.trim_trailing(path, "/")

  defp fetch!(params, name, path, page) do
    case Map.fetch(params, name) do
      {:ok, value} ->
        value

      :error ->
        raise ArgumentError,
              "#{inspect(page)}.sitemap/0 returned #{inspect(params)}, without " <>
                "#{inspect(name)} for #{path}"
    end
  end

  defp encode(value), do: value |> to_string() |> URI.encode(&URI.char_unreserved?/1)

  defp escape(text) do
    text
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
    |> String.replace("\"", "&quot;")
    |> String.replace("'", "&apos;")
  end
end
