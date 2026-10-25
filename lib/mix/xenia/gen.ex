defmodule Mix.Xenia.Gen do
  @moduledoc false
  # Shared by the xenia.gen.* tasks: the app's names and folders, module
  # names from app-folder paths, and writing files.

  alias Xenia.Routes.Discovery

  # The app's web module and folder, as Phoenix generates them:
  # :my_app → MyAppWeb in lib/my_app_web. Both can be overridden.
  def web(opts) do
    app = Mix.Project.config()[:app] |> to_string()
    module = opts[:web_module] || Macro.camelize(app) <> "Web"
    path = opts[:web_path] || Path.join("lib", app <> "_web")
    %{module: module, path: path}
  end

  # The app folder `xenia_routes` reads; lib/my_app_web/app by default.
  def app_root(opts, web), do: opts[:root] || Path.join(web.path, "app")

  # "(auth)/runbooks/[id]" → ["(auth)", "runbooks", "[id]"], refusing
  # absolute paths, "..", and file names.
  def segments!(path) do
    path = path |> to_string() |> String.trim("/") |> then(&if(&1 == ".", do: "", else: &1))

    if Path.type(path) != :relative or ".." in Path.split(path) or
         String.ends_with?(path, ".ex") do
      Mix.raise("expected a folder inside the app folder, like reports/sales, got: #{path}")
    end

    if path == "", do: [], else: Path.split(path)
  end

  # Folder names follow the app-folder conventions, also for a layout with
  # no pages below it yet.
  def validate_folders!(segments) do
    Discovery.page(Path.join(segments ++ ["page.ex"]), [])
    :ok
  rescue
    error in ArgumentError -> Mix.raise(Exception.message(error))
  end

  # A module name that mirrors the folders: MyAppWeb.App.Auth.RunbooksLayout.
  # Groups and parameters lose their brackets: (auth) → Auth, [id] → Id,
  # [...path] → Path. The app folder itself uses `root_name`.
  def module_name(web, segments, suffix, root_name) do
    parts = Enum.map(segments, &camelize_segment/1)

    {namespace, last} =
      case parts do
        [] -> {[], root_name}
        _ -> {Enum.drop(parts, -1), List.last(parts)}
      end

    Enum.join([web.module, "App" | namespace] ++ [last <> suffix], ".")
  end

  defp camelize_segment(segment) do
    segment
    |> String.replace(~r/[()\[\]]|\.\.\./, "")
    |> String.replace(~r/[^A-Za-z0-9_]+/, "_")
    |> Macro.camelize()
  end

  # The app folder's special files, relative to the root ([] when the folder
  # doesn't exist yet).
  def app_files(root) do
    if File.dir?(root), do: Discovery.files(root), else: []
  end

  # Runs Discovery over the folder plus the files about to be created, so a
  # conflict or a misplaced file is reported now, not when the router next
  # compiles. A live.ex with no pages yet is the folder's unfinished state,
  # not caused by the new files, so it doesn't block them.
  def check_app!(root, new_files) do
    Discovery.pages(Enum.uniq(app_files(root) ++ new_files), check_owners: false)
  rescue
    error in ArgumentError -> Mix.raise(Exception.message(error))
  end

  # Writes `content` to `path`. An existing file is an error, unless
  # `force` is set.
  def create!(path, content, force) do
    if File.exists?(path) and not force do
      Mix.raise("#{path} already exists. Pass --force to overwrite it.")
    end

    Mix.Generator.create_file(path, content, force: true)
  end

  # Generated Elixir, formatted the way `mix format` leaves it, with Xenia's
  # DSL calls without parentheses (as `import_deps: [:xenia]` does).
  def format(source) do
    locals = [component: 3, prop: 2, prop: 3, event: 1, xenia_routes: 1]
    IO.iodata_to_binary([Code.format_string!(source, locals_without_parens: locals), "\n"])
  end

  # Prints the non-nil lines, if any.
  def info(lines) do
    case lines |> List.wrap() |> Enum.reject(&is_nil/1) do
      [] -> :ok
      lines -> Mix.shell().info(Enum.join(lines, "\n"))
    end
  end
end
