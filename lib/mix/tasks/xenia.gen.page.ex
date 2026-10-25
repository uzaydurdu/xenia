defmodule Mix.Tasks.Xenia.Gen.Page do
  @shortdoc "Generates a page.ex in the Xenia app folder"

  @moduledoc """
  Generates a `page.ex` in the app folder, which makes its folder a route.

      $ mix xenia.gen.page reports/sales
      * creating lib/my_app_web/app/reports/sales/page.ex

  The folder follows the app-folder conventions: `(group)` folders stay out
  of the URL, `[id]` is a parameter and `[...path]` a catch-all. Quote such
  paths in your shell:

      $ mix xenia.gen.page "(auth)/runbooks/[id]"

  What you get:

    * a LiveView with `use Xenia.Page`, drawn inside the layouts above it.
      Parameters are assigned in `mount/3`.
    * under a `live.ex`, a module with only `render/1`: the `live.ex` owns
      the state and the events of the pages below it.

  The module name mirrors the folders, `MyAppWeb.App.Reports.SalesPage`.
  The page is routed the next time the router compiles. A path that would
  conflict with an existing page is refused.

  ## Options

    * `--module` - the module name
    * `--root` - the app folder, `lib/my_app_web/app` by default
    * `--web-module` and `--web-path` - `MyAppWeb` and `lib/my_app_web` by
      default
    * `--force` - overwrite an existing file
  """

  use Mix.Task

  alias Mix.Xenia.Gen

  @switches [
    module: :string,
    root: :string,
    web_module: :string,
    web_path: :string,
    force: :boolean
  ]

  @impl true
  def run(args) do
    {opts, argv} = OptionParser.parse!(args, strict: @switches)

    path =
      case argv do
        [path] -> path
        _ -> Mix.raise("expected one folder, like: mix xenia.gen.page reports/sales")
      end

    web = Gen.web(opts)
    root = Gen.app_root(opts, web)
    segments = Gen.segments!(path)

    if Enum.any?(segments, &String.starts_with?(&1, "_")) do
      Mix.raise("#{path} is in a private folder (its name starts with _), which is never routed")
    end

    file = Path.join(segments ++ ["page.ex"])
    page = root |> Gen.check_app!([file]) |> Enum.find(&(&1.file == file))
    module = opts[:module] || Gen.module_name(web, segments, "Page", "Home")

    content =
      case page.live do
        nil -> standalone(module, web, page)
        live -> shared(module, web, page, live)
      end

    Gen.create!(Path.join(root, file), Gen.format(content), opts[:force] || false)

    Gen.info([
      "",
      "#{inspect_path(page.path)} is routed by xenia_routes, below its scope, the next time the router compiles.",
      if(page.live, do: "It renders inside #{page.live}'s LiveView.")
    ])
  end

  defp standalone(module, web, page) do
    {pattern, socket} = mount_params(page.params)

    ~s'''
    defmodule #{module} do
      @moduledoc "The page at `#{page.path}` (`#{page.file}`)."
      use #{web.module}, :live_view
      use Xenia.Page

      @impl true
      def mount(#{pattern}, _session, socket) do
        {:ok, #{socket}}
      end

      @impl true
      def render(assigns) do
        ~H"""
        <h1>#{title(page)}</h1>#{param_lines(page)}
        """
      end
    end
    '''
  end

  defp shared(module, web, page, live) do
    ~s'''
    defmodule #{module} do
      @moduledoc """
      The page at `#{page.path}` (`#{page.file}`).

      It shares the LiveView in `#{live}`, which owns the state and handles
      the events. This module only renders, with that LiveView's assigns.
      """
      use #{web.module}, :html

      def render(assigns) do
        ~H"""
        <h1>#{title(page)}</h1>
        """
      end
    end
    '''
  end

  # %{"id" => id} and assign(socket, id: id) for a page with parameters.
  defp mount_params([]), do: {"_params", "socket"}

  defp mount_params(params) do
    pattern = Enum.map_join(params, ", ", &~s("#{&1}" => #{&1}))
    assigns = Enum.map_join(params, ", ", &"#{&1}: #{&1}")
    {"%{#{pattern}}", "assign(socket, #{assigns})"}
  end

  # A catch-all ([...path]) arrives as a list of segments.
  defp param_lines(page) do
    globs = for "*" <> name <- String.split(page.path, "/"), do: name

    Enum.map_join(page.params, fn param ->
      value = if param in globs, do: ~s|Enum.join(@#{param}, "/")|, else: "@#{param}"
      "\n    <p>#{param}: {#{value}}</p>"
    end)
  end

  # The last folder that is a URL segment, like "Sales"; "Home" at "/".
  defp title(page) do
    page.path
    |> String.split("/", trim: true)
    |> Enum.reject(&String.starts_with?(&1, [":", "*"]))
    |> List.last("home")
    |> String.replace(~r/[-_]+/, " ")
    |> String.capitalize()
  end

  defp inspect_path(path), do: "`#{path}`"
end
