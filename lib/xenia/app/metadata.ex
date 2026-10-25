defmodule Xenia.Metadata do
  @moduledoc """
  Page titles, descriptions and social-card tags for an app folder.

  A page, and any `layout.ex` above it, can define `metadata/1`. It gets
  the page's assigns and returns a map:

  ```elixir
  # app/layout.ex: the defaults for every page
  def metadata(_assigns) do
    %{
      title: "Acme",
      title_template: "%s · Acme",
      description: "Acme makes rockets.",
      open_graph: %{site_name: "Acme", type: "website"}
    }
  end

  # app/posts/[slug]/page.ex
  def metadata(assigns) do
    %{title: assigns.post.title, description: assigns.post.summary}
  end
  ```

  Xenia merges them from the outermost layout to the page: a key set lower
  down wins, and `open_graph` and `twitter` merge key by key. The page's
  `title` goes through the nearest `title_template` (`"Hello · Acme"`); a
  page without a title gets its layouts' `title` as it is.

  The result is assigned as `@xenia_metadata`, and its title as
  `@page_title`, so the browser tab follows live navigation like any
  `page_title`. It's computed after the page has its data: after `mount/3`,
  or after the page's own `handle_params/3` if it has one.

  A page that assigns `page_title` itself, and has no metadata `title`,
  keeps its `page_title`: a layout's default title only fills in for pages
  without one.

  Render the tags in `root.html.heex`, inside `<head>`:

  ```heex
  <.live_title default="Acme">{assigns[:page_title]}</.live_title>
  <Xenia.Metadata.tags metadata={assigns[:xenia_metadata]} />
  ```

  The root layout is rendered once, on the first page load, which is what
  search engines and link previews read. On live navigation LiveView
  updates the `<title>`, but not the other tags in `<head>`.

  ## Keys

    * `:title` - the page title
    * `:title_template` - wraps titles set below this layout; `%s` is the title
    * `:description` - `<meta name="description">`
    * `:canonical` - `<link rel="canonical">`, a full URL
    * `:robots` - `<meta name="robots">`, e.g. `"noindex"`
    * `:open_graph` - `og:` tags, e.g. `%{type: "article", image: "https://..."}`.
      `og:title` and `og:description` default to the title and description
    * `:twitter` - `twitter:` tags, e.g. `%{card: "summary_large_image"}`

  Any other key raises an `ArgumentError`, so a typo doesn't go unnoticed.
  """

  use Phoenix.Component

  @keys [:title, :title_template, :description, :canonical, :robots, :open_graph, :twitter]
  @nested [:open_graph, :twitter]

  @type t :: %{optional(atom()) => String.t() | map()}

  @doc """
  Merges the metadata of `layouts` (outermost first) and `page`, called with
  `assigns`. Modules without `metadata/1` are skipped. Returns `nil` when
  none of them has any.
  """
  @spec resolve([module()], module() | nil, map()) :: t() | nil
  def resolve(layouts, page, assigns) do
    case resolve_with_source(layouts, page, assigns) do
      {meta, _source} -> meta
      nil -> nil
    end
  end

  # The merged metadata, and where its title came from: :page (templated),
  # :layouts (a layout's default) or nil.
  defp resolve_with_source(layouts, page, assigns) do
    layered = for module <- layouts, meta = call(module, assigns), do: meta
    page_meta = page && call(page, assigns)

    if layered == [] and is_nil(page_meta) do
      nil
    else
      base = Enum.reduce(layered, %{}, &merge(&2, &1))
      page_meta = page_meta || %{}
      merged = merge(base, Map.delete(page_meta, :title_template)) |> Map.delete(:title_template)

      case page_meta do
        %{title: title} when is_binary(title) ->
          {Map.put(merged, :title, String.replace(base[:title_template] || "%s", "%s", title)),
           :page}

        _ ->
          {Map.delete(merged, :title) |> put_present(:title, base[:title]),
           if(base[:title], do: :layouts)}
      end
    end
  end

  @doc false
  # Assigns the resolved metadata, and its title as page_title, for the page
  # the socket shows (Xenia.Page, Xenia.Live).
  #
  # A page's own metadata title always becomes page_title. A layout's
  # default title only fills in for a page without a page_title, so pages
  # that assign page_title in mount keep theirs.
  def __assign__(socket) do
    page = Xenia.Page.current_page(socket)
    layouts = Xenia.Page.layouts(socket, socket.assigns[:live_action])
    own_title = socket.assigns[:page_title]

    case resolve_with_source(layouts, page, socket.assigns) do
      nil ->
        socket

      {meta, :page} ->
        assign_title(socket, meta)

      {meta, _layouts_or_none} when is_binary(own_title) ->
        Phoenix.Component.assign(socket, :xenia_metadata, Map.put(meta, :title, own_title))

      {meta, _layouts_or_none} ->
        assign_title(socket, meta)
    end
  end

  defp assign_title(socket, meta) do
    socket = Phoenix.Component.assign(socket, :xenia_metadata, meta)
    if meta[:title], do: Phoenix.Component.assign(socket, :page_title, meta.title), else: socket
  end

  @doc """
  Renders the `<meta>` and `<link>` tags for resolved metadata. Put it in
  `root.html.heex`, inside `<head>`, next to `<.live_title>`, which renders
  the title.
  """
  attr(:metadata, :map, default: nil, doc: "assigns[:xenia_metadata]")

  def tags(assigns) do
    meta = assigns.metadata || %{}

    assigns =
      assign(assigns,
        description: meta[:description],
        canonical: meta[:canonical],
        robots: meta[:robots],
        open_graph: prefixed(open_graph(meta), "og:"),
        twitter: prefixed(meta[:twitter] || %{}, "twitter:")
      )

    ~H"""
    <meta :if={@description} name="description" content={@description} />
    <link :if={@canonical} rel="canonical" href={@canonical} />
    <meta :if={@robots} name="robots" content={@robots} />
    <meta :for={{property, content} <- @open_graph} property={property} content={content} />
    <meta :for={{name, content} <- @twitter} name={name} content={content} />
    """
  end

  # og:title and og:description fall back to the page's own, when the page
  # has Open Graph tags at all.
  defp open_graph(%{open_graph: og} = meta) when is_map(og) do
    %{title: meta[:title], description: meta[:description]}
    |> Map.reject(fn {_key, value} -> is_nil(value) end)
    |> Map.merge(og)
  end

  defp open_graph(_meta), do: %{}

  defp prefixed(map, prefix) do
    for {key, value} <- Enum.sort_by(map, &to_string(elem(&1, 0))), not is_nil(value) do
      {prefix <> to_string(key), to_string(value)}
    end
  end

  defp call(module, assigns) do
    if Code.ensure_loaded?(module) and function_exported?(module, :metadata, 1) do
      module |> apply(:metadata, [assigns]) |> validate!(module)
    end
  end

  defp validate!(nil, _module), do: nil

  defp validate!(meta, module) when is_map(meta) do
    case Map.keys(meta) -- @keys do
      [] ->
        meta

      unknown ->
        raise ArgumentError,
              "#{inspect(module)}.metadata/1 returned unknown keys #{inspect(unknown)}. " <>
                "Known keys: #{inspect(@keys)}"
    end
  end

  defp validate!(other, module) do
    raise ArgumentError,
          "#{inspect(module)}.metadata/1 must return a map, got: #{inspect(other)}"
  end

  # A key set lower down wins; open_graph and twitter merge key by key.
  defp merge(base, meta) do
    Map.merge(base, meta, fn
      key, %{} = outer, %{} = inner when key in @nested -> Map.merge(outer, inner)
      _key, _outer, inner -> inner
    end)
  end

  defp put_present(map, _key, nil), do: map
  defp put_present(map, key, value), do: Map.put(map, key, value)
end
