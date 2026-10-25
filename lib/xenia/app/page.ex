defmodule Xenia.Page do
  @moduledoc """
  A page in a Xenia app folder: the `page.ex` that makes its folder a route.

  A standalone page is an ordinary LiveView. `use Xenia.Page` after your app's
  `use MyAppWeb, :live_view` adds two things:

    * its `render/1` is drawn inside the layouts of its folder and above,
      outermost first, with the persistent part of each layout that has a
      `persistent.ex` (`Xenia.Layout`)
    * those layouts' `on_mount` hooks run before its `mount/3`

  ```elixir
  # app/(auth)/dashboard/page.ex  →  /dashboard
  defmodule MyAppWeb.DashboardPage do
    use MyAppWeb, :live_view
    use Xenia.Page

    def mount(_params, _session, socket), do: {:ok, assign(socket, alerts: [])}

    def render(assigns) do
      ~H"<h1>Dashboard</h1>"
    end
  end
  ```

  Under a `live.ex` (see `Xenia.Live`), a page is rendered by that shared
  LiveView instead: only its `render/1` is used, with the owner's assigns. A
  page there can `use Xenia.Page` too, or be any module with `render/1`.

  Which layouts apply comes from the router: `xenia_routes` records them for
  every page. A page served by a hand-written route has none.

  ## Metadata and the sitemap

  A page can define `metadata/1`, for its title, description and social
  tags (see `Xenia.Metadata`), and `sitemap/0`, for `Xenia.Sitemap`:

      def metadata(assigns), do: %{title: assigns.post.title}

      # A page with parameters is listed only with the params you give:
      def sitemap, do: for(post <- Blog.list_posts(), do: %{slug: post.slug})
  """

  alias Xenia.Layout

  defmacro __using__(_opts) do
    Xenia.Page.__check_live_view__!(__CALLER__, "Xenia.Page")

    quote do
      on_mount({Xenia.Page, :layouts})
      on_mount({Xenia.Page, :metadata})
      @before_compile Xenia.Page
    end
  end

  @doc false
  defmacro __before_compile__(env) do
    unless Module.defines?(env.module, {:render, 1}) do
      raise ArgumentError,
            "#{inspect(env.module)} uses Xenia.Page but defines no render/1 " <>
              "(and has no colocated template)"
    end

    quote do
      defoverridable render: 1

      def render(var!(assigns)) do
        Xenia.Page.__render__(var!(assigns), super(var!(assigns)))
      end

      unquote(Xenia.Page.__metadata_after_handle_params__(env))
    end
  end

  @doc false
  # Metadata is computed once the page has its data. A LiveView with its own
  # handle_params/3 may load data there, after every hook, so its
  # handle_params is wrapped and the metadata is assigned after it. Without
  # one, a handle_params hook (on_mount :metadata) does it, after mount.
  def __metadata_after_handle_params__(env) do
    if Module.defines?(env.module, {:handle_params, 3}) do
      quote do
        defoverridable handle_params: 3

        def handle_params(params, uri, socket) do
          {:noreply, socket} = super(params, uri, socket)
          {:noreply, Xenia.Metadata.__assign__(socket)}
        end

        @doc false
        def __xenia_metadata__, do: :handle_params
      end
    end
  end

  @doc false
  # `use Xenia.Page`/`use Xenia.Live` must come after `use Phoenix.LiveView`
  # (usually through `use MyAppWeb, :live_view`), whose on_mount they call.
  def __check_live_view__!(env, what) do
    unless {:macro, Phoenix.LiveView} in Macro.Env.lookup_import(env, {:on_mount, 1}) do
      raise ArgumentError,
            "use #{what} after `use Phoenix.LiveView` (for example after " <>
              "`use MyAppWeb, :live_view`) in #{inspect(env.module)}"
    end
  end

  # ---------------------------------------------------------------------------
  # on_mount: the layouts' hooks
  # ---------------------------------------------------------------------------

  @doc false
  # Runs the on_mount hooks of the page's layouts, outermost first, as
  # live_session runs its own. A {:halt, socket} stops the chain.
  def on_mount(:layouts, params, session, socket) do
    socket
    |> layouts(socket.assigns[:live_action])
    |> Enum.flat_map(&Layout.on_mount/1)
    |> Enum.reduce_while({:cont, socket}, fn {module, arg}, {:cont, socket} ->
      case module.on_mount(arg, params, session, socket) do
        {:cont, %Phoenix.LiveView.Socket{}} = cont ->
          {:cont, cont}

        {:halt, %Phoenix.LiveView.Socket{}} = halt ->
          {:halt, halt}

        other ->
          raise ArgumentError,
                "#{inspect(module)}.on_mount/4 must return {:cont, socket} or " <>
                  "{:halt, socket}, got: #{inspect(other)}"
      end
    end)
  end

  @doc false
  # Assigns the page's metadata (Xenia.Metadata) after mount, unless the
  # LiveView's own handle_params/3 does it (see __before_compile__).
  def on_mount(:metadata, _params, _session, socket) do
    # Without a router (live_isolated in tests, a nested live_render),
    # LiveView refuses handle_params hooks, and there are no layouts anyway.
    if is_nil(socket.router) or function_exported?(socket.view, :__xenia_metadata__, 0) do
      {:cont, socket}
    else
      {:cont,
       Phoenix.LiveView.attach_hook(socket, :xenia_metadata, :handle_params, fn _params,
                                                                                _uri,
                                                                                socket ->
         {:cont, Xenia.Metadata.__assign__(socket)}
       end)}
    end
  end

  # ---------------------------------------------------------------------------
  # render: frames and persistent parts
  # ---------------------------------------------------------------------------

  @doc false
  # The page's own render, `inner`, inside its layouts' frames. A shared
  # LiveView asks for the bare page with `__xenia_bare__`, then frames it
  # once itself.
  def __render__(%{__xenia_bare__: true}, inner), do: inner

  def __render__(%{socket: socket} = assigns, inner) do
    route = route(socket, assigns[:live_action])

    route.layouts
    |> Enum.reverse()
    |> Enum.reduce(inner, fn layout, content ->
      layout.frame(
        assigns
        |> Map.put(:inner_content, content)
        |> Map.put(:persistent, persistent(layout, route, socket))
        |> changed(:inner_content)
      )
    end)
  end

  def __render__(_assigns, inner), do: inner

  # The frame's change tracking reads `__changed__`, which comes from the
  # page's assigns and never lists `inner_content`. Without this, the frame
  # would keep the page as first rendered: a patch under a live.ex showed
  # the old page. The page itself is still change-tracked inside.
  # `persistent` stays untracked: a layout's persistent part never changes.
  defp changed(%{__changed__: changed} = assigns, key) when is_map(changed),
    do: %{assigns | __changed__: Map.put(changed, key, true)}

  defp changed(assigns, _key), do: assigns

  # The persistent.ex next to the layout, as recorded by xenia_routes.
  # Rendered by the page's LiveView, never by another persistent part:
  # LiveView destroys a sticky nested inside another sticky (S1).
  defp persistent(layout, route, socket) do
    case Map.get(route, :persistent, %{}) do
      %{^layout => live} ->
        Phoenix.Component.live_render(socket, live,
          id: Layout.persistent_id(layout),
          sticky: true
        )

      _none ->
        nil
    end
  end

  @doc """
  The layout modules that apply to the page `socket` is showing, outermost
  first, as recorded by `xenia_routes`. Empty for a page served by a
  hand-written route.

  For a shared LiveView, the page is its `live_action`; for a standalone page,
  the LiveView itself.
  """
  @spec layouts(Phoenix.LiveView.Socket.t(), atom()) :: [module()]
  def layouts(socket, live_action), do: route(socket, live_action).layouts

  @doc false
  # The page module the socket shows: the live action under a live.ex, the
  # LiveView itself for a standalone page.
  def current_page(%Phoenix.LiveView.Socket{router: router, view: view} = socket) do
    action = socket.assigns[:live_action]

    if (is_atom(action) and not is_nil(action) and router) &&
         function_exported?(router, :__xenia_page__, 1) && router.__xenia_page__(action) do
      action
    else
      view
    end
  end

  # The router's record for the page: its layouts and their persistent parts.
  defp route(%Phoenix.LiveView.Socket{router: router, view: view}, live_action) do
    route =
      if router && function_exported?(router, :__xenia_page__, 1) do
        (is_atom(live_action) && live_action && router.__xenia_page__(live_action)) ||
          router.__xenia_page__(view)
      end

    route || %{layouts: [], persistent: %{}}
  end
end
