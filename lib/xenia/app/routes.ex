defmodule Xenia.Routes do
  @moduledoc """
  Generates Phoenix LiveView routes from a Xenia app folder.

      # lib/my_app_web/router.ex
      import Xenia.Routes

      scope "/" do
        pipe_through :browser

        xenia_routes "lib/my_app_web/app"
      end

  For a folder like

      lib/my_app_web/app/
        page.ex                      defmodule MyAppWeb.HomePage
        projects/page.ex             defmodule MyAppWeb.ProjectsPage
        projects/[id]/page.ex        defmodule MyAppWeb.ProjectDetailsPage
        settings/live.ex             defmodule MyAppWeb.SettingsLive
        settings/profile/page.ex     defmodule MyAppWeb.ProfilePage
        settings/security/page.ex    defmodule MyAppWeb.SecurityPage

  this generates ordinary routes, in the order Phoenix should match them:

      live "/", MyAppWeb.HomePage
      live "/projects", MyAppWeb.ProjectsPage
      live "/projects/:id", MyAppWeb.ProjectDetailsPage
      live "/settings/profile", MyAppWeb.SettingsLive, MyAppWeb.ProfilePage
      live "/settings/security", MyAppWeb.SettingsLive, MyAppWeb.SecurityPage

  A standalone page is its own LiveView. Pages under a `live.ex` share its
  LiveView, and the page module is the live action, so the owner can render
  `@live_action`. Switching between them with `<.link patch>` keeps the
  process and its state.

  `mix phx.routes`, `~p` verified routes, pipelines and `live_session` work
  as usual. Module names are read from the files with
  `Xenia.Routes.PageModule`; nothing in them is run at compile time.

  ## Folder and scope

  The folder is relative to the project root (where `mix` runs) and must be
  a literal string. Module names are used as written: a surrounding
  `scope "/", MyAppWeb` alias is not prepended to them.

  ## Authentication

  Route groups such as `(auth)` grant nothing. Put `xenia_routes` inside
  the `pipe_through` and `live_session` that should protect it.

  ## Recompilation

  Editing a `page.ex`, `layout.ex`, `persistent.ex` or `live.ex` recompiles
  the router (`@external_resource`).
  Adding, moving or removing one changes the folder's file list, which the
  router's `__mix_recompile__?/0` notices on the next `mix compile`, also
  through Phoenix's code reloader.
  """

  alias Xenia.Routes.{Discovery, PageModule, Route}

  @doc """
  The pages in `root` with their modules and owners, in route order.

  Raises `ArgumentError` when two files define the same module (almost
  always a copied file that wasn't renamed).
  """
  @spec routes(Path.t()) :: [Route.t()]
  def routes(root) do
    root = Path.expand(root)
    pages = Discovery.scan(root)

    # Each file is read once, however many pages share it.
    modules =
      pages
      |> Enum.flat_map(
        &([&1.file | List.wrap(&1.live) ++ &1.layouts] ++ Map.values(&1.persistent))
      )
      |> Enum.uniq()
      |> Map.new(&{&1, PageModule.resolve!(Path.join(root, &1))})

    routes =
      for page <- pages do
        module = Map.fetch!(modules, page.file)

        route = %Route{
          page: page,
          module: module,
          owner: module,
          mode: :standalone,
          layouts: Enum.map(page.layouts, &Map.fetch!(modules, &1)),
          persistent:
            Map.new(page.persistent, fn {layout, live} ->
              {Map.fetch!(modules, layout), Map.fetch!(modules, live)}
            end)
        }

        case page.live do
          nil -> route
          live -> %{route | owner: Map.fetch!(modules, live), mode: :shared}
        end
      end

    check_unique_modules!(routes)
    check_owner_layouts!(routes, root)
    routes
  end

  @doc """
  Generates a `live` route for every page in `dir`. See the module docs.
  """
  defmacro xenia_routes(dir) do
    dir = Macro.expand(dir, __CALLER__)

    unless is_binary(dir) do
      raise ArgumentError,
            "xenia_routes expects the app folder as a literal string, got: #{Macro.to_string(dir)}"
    end

    root = Path.expand(dir)
    routes = routes(root)
    files = Discovery.files(root)

    lives =
      for route <- routes do
        case route.mode do
          :standalone ->
            quote do
              Phoenix.LiveView.Router.live(unquote(route.page.path), unquote(route.owner))
            end

          :shared ->
            quote do
              Phoenix.LiveView.Router.live(
                unquote(route.page.path),
                unquote(route.owner),
                unquote(route.module)
              )
            end
        end
      end

    block = {:__block__, [], lives}

    resources =
      for file <- files do
        quote do: @external_resource(unquote(Path.join(root, file)))
      end

    # What a page needs at runtime to draw its layouts (Xenia.Page).
    pages =
      for route <- routes do
        {route.module,
         %{
           layouts: route.layouts,
           persistent: route.persistent,
           owner: route.owner,
           file: route.page.file
         }}
      end

    quote do
      require Phoenix.Router
      require Phoenix.LiveView.Router

      unless Module.has_attribute?(__MODULE__, :xenia_routes_folders) do
        Module.register_attribute(__MODULE__, :xenia_routes_folders, accumulate: true)
        Module.register_attribute(__MODULE__, :xenia_routes_pages, accumulate: true)
        @before_compile Xenia.Routes
      end

      @xenia_routes_folders {unquote(root), unquote(digest(files))}

      for page <- unquote(Macro.escape(pages)) do
        @xenia_routes_pages page
      end

      unquote_splicing(resources)

      # alias: false keeps a surrounding scope alias off the full module names.
      Phoenix.Router.scope "/", alias: false do
        unquote(block)
      end
    end
  end

  @doc false
  defmacro __before_compile__(env) do
    folders = Module.get_attribute(env.module, :xenia_routes_folders)
    pages = env.module |> Module.get_attribute(:xenia_routes_pages) |> Enum.reverse()

    quote do
      @doc false
      def __mix_recompile__? do
        Xenia.Routes.__stale__?(unquote(Macro.escape(folders)))
      end

      @doc false
      # The page's layouts and their persistent parts, its owner and its
      # file, for Xenia.Page; nil for a module xenia_routes didn't generate a
      # route for.
      def __xenia_page__(module) do
        Map.get(unquote(Macro.escape(Map.new(pages))), module)
      end

      @doc false
      # Every generated page, in route order, for `mix xenia.routes`.
      def __xenia_pages__, do: unquote(Macro.escape(pages))
    end
  end

  @doc false
  # True when a folder's page and layout files differ from compile time.
  def __stale__?(folders) do
    Enum.any?(folders, fn {root, digest} ->
      not File.dir?(root) or digest(Discovery.files(root)) != digest
    end)
  end

  defp digest(files), do: :erlang.phash2(files)

  # Each page.ex, live.ex and persistent.ex must define its own module.
  defp check_unique_modules!(routes) do
    pages = for route <- routes, do: {route.module, route.page.file}

    owners =
      for route <- routes, route.mode == :shared, uniq: true, do: {route.owner, route.page.live}

    persistent =
      for route <- routes,
          {file, layout} <- Enum.zip(route.page.layouts, route.layouts),
          Map.has_key?(route.persistent, layout),
          uniq: true,
          do: {route.persistent[layout], route.page.persistent[file]}

    entries = pages ++ owners ++ persistent

    for {module, [_, _ | _] = files} <- Enum.group_by(entries, &elem(&1, 0), &elem(&1, 1)) do
      raise ArgumentError,
            "#{inspect(module)} is defined by more than one file: " <>
              (files |> Enum.sort() |> Enum.join(", "))
    end

    :ok
  end

  # Under a live.ex, layouts' on_mount hooks run once, when the shared
  # LiveView mounts. Switching to another of its pages is a patch, which
  # mounts nothing. So a layout.ex *below* the live.ex, which covers only
  # some of its pages, must not declare on_mount: its hooks (an auth check,
  # say) would be skipped on a patch.
  defp check_owner_layouts!(routes, root) do
    for %Route{mode: :shared, page: page} <- routes,
        owner_dir = page.live |> Path.dirname() |> Path.split() |> Enum.reject(&(&1 == ".")),
        layout <- page.layouts,
        layout_dir = layout |> Path.dirname() |> Path.split() |> Enum.reject(&(&1 == ".")),
        length(layout_dir) > length(owner_dir),
        List.starts_with?(layout_dir, owner_dir),
        uniq: true do
      {layout, page.live}
    end
    |> Enum.each(fn {layout, live} ->
      source = File.read!(Path.join(root, layout))

      if PageModule.uses_option?(source, Xenia.Layout, :on_mount, layout) do
        raise ArgumentError,
              "#{layout} declares on_mount, but it is below #{live}. Its pages share " <>
                "#{live}'s LiveView, and switching between them is a patch, which runs " <>
                "no on_mount: the check would be skipped. Move on_mount to a layout.ex " <>
                "in #{Path.dirname(live)} or above."
      end
    end)
  end
end
