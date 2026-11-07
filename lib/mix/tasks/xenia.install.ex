defmodule Mix.Tasks.Xenia.Install do
  @shortdoc "Sets up Xenia in a Phoenix app (--islands-only: just the hooks, for an existing app)"

  @moduledoc """
  Turns a freshly generated Phoenix 1.8 app into a Xenia app.

      $ mix phx.new my_app
      $ cd my_app
      # add {:xenia, "~> 0.2.1"} to mix.exs, then:
      $ mix deps.get
      $ mix xenia.install

  It makes these changes, and says what it did with each:

    * `assets/css/app.css`: Xenia's light and dark themes in place of
      Phoenix's (plain, with Xenia's purple and gold), and a faint grid for
      the top of the page
    * `assets/js/app.js`: `createHooks` from `"xenia"` in the LiveSocket's
      hooks, and the app's theme published for components that follow it
    * `lib/my_app_web.ex`: `import Xenia.Component` in `html_helpers`
    * `lib/my_app_web/components/core_components.ex` and `layouts.ex`:
      Phoenix's flash messages with a success kind, stacked newest first,
      closing by themselves after 5 seconds with a countdown line around
      their border (errors stay). `<.flash_group shape="sharp" duration={8000}>`
      changes them; see `flash/1`
    * `lib/my_app_web/components/layouts/root.html.heex`: the pages' titles,
      descriptions and social tags (`Xenia.Metadata`), in place of
      Phoenix's " · Phoenix Framework" title suffix
    * `.formatter.exs`: `:xenia` in `import_deps`
    * `assets/tsconfig.json`: where Xenia's TypeScript types are, so editors
      and `tsc` find them for `"xenia"` and `"xenia/chartjs"` imports
    * `lib/my_app_web/router.ex`: the home route replaced by
      `xenia_routes "lib/my_app_web/app"`, inside a `live_session`
    * `test/my_app_web/controllers/page_controller_test.exs`: checks the new
      home page instead of Phoenix's, so `mix test` keeps passing
    * `lib/my_app_web/app/`: a `layout.ex` (header, theme toggle, footer)
      and a home `page.ex`
    * `priv/static/images/xenia-mark.png`: the logo the layout shows

  Running it twice changes nothing the second time. A file that doesn't
  look like Phoenix generated it is left alone, and the step to do by hand
  is printed instead. Phoenix's `PageController` files stay; delete them
  when you no longer need them.

  ## In an existing app

      $ mix xenia.install --islands-only

  makes only the changes JavaScript islands need, and leaves the app's
  theme, layout, flash messages, routes and home page alone:

    * `assets/js/app.js`: `createHooks` from `"xenia"` in the LiveSocket's
      hooks, next to any hooks it already spreads (Surface's, for example),
      and the app's theme published for components that follow it
    * `lib/my_app_web.ex`: `import Xenia.Component` in `html_helpers`
    * `.formatter.exs`: `:xenia` in `import_deps`
    * `assets/tsconfig.json`: where Xenia's TypeScript types are

  It doesn't change an existing app's esbuild config: the steps for code
  splitting, so pages download only the libraries their islands use, are
  printed instead.

  ## Options

    * `--islands-only` - only the hooks, the import, the formatter and the
      TypeScript paths, for an app that already has its own theme, layout
      and routes

    * `--web-module` and `--web-path` - `MyAppWeb` and `lib/my_app_web` by
      default, from the app's name
  """

  use Mix.Task

  alias Mix.Xenia.Gen

  @switches [web_module: :string, web_path: :string, islands_only: :boolean]

  @impl true
  def run(args) do
    {opts, _argv} = OptionParser.parse!(args, strict: @switches)
    web = Gen.web(opts)
    app = Mix.Project.config()[:app] |> to_string()

    context = %{
      web: web,
      app: app,
      app_title: app |> String.split("_") |> Enum.map_join(" ", &String.capitalize/1),
      app_folder: Path.join(web.path, "app")
    }

    islands_only? = Keyword.get(opts, :islands_only, false)
    results = Enum.map(steps(islands_only?), & &1.(context))

    for {status, message} <- List.flatten(results), do: report(status, message)

    manual? = Enum.any?(List.flatten(results), &match?({:manual, _}, &1))
    Gen.info(closing(islands_only?, manual?))
  end

  # --islands-only: what islands need. An existing app keeps its theme,
  # layout, flash messages, routes and home page.
  defp steps(true), do: [&javascript/1, &html_helpers/1, &formatter/1, &typescript/1]

  defp steps(false) do
    [
      &css/1,
      &javascript/1,
      &html_helpers/1,
      &flash/1,
      &flash_group/1,
      &root_layout/1,
      &formatter/1,
      &typescript/1,
      &router/1,
      &home_test/1,
      &app_folder/1,
      &logo/1
    ]
  end

  defp closing(true, manual?) do
    [
      "",
      "Done: the app can host JavaScript islands.",
      if(manual?, do: "Some steps need you: see \"by hand\" above."),
      "Add one with `mix xenia.gen.component`, or an official adapter",
      "(Monaco, Chart.js, Tiptap, ...): https://hexdocs.pm/xenia",
      "",
      "So that each page downloads only the libraries its islands use, turn on",
      "code splitting: add `--splitting --format=esm` to the esbuild args in",
      "config/config.exs, and load app.js with <script type=\"module\">. See",
      "\"Code splitting\" in Xenia's README (Monaco's workers need a profile of",
      "their own)."
    ]
  end

  defp closing(false, manual?) do
    [
      "",
      "Done. Start the app with `mix phx.server` and open http://localhost:4000.",
      if(manual?, do: "Some steps need you: see \"by hand\" above."),
      "Add a JavaScript library with `mix xenia.gen.component`, or an official adapter",
      "(Monaco, Chart.js, Tiptap, ...): https://hexdocs.pm/xenia"
    ]
  end

  # --- Steps --------------------------------------------------------------------

  @doc false
  def css(%{}) do
    path = "assets/css/app.css"

    with_file(path, fn source ->
      themes = Regex.scan(~r/@plugin "([^"]*daisyui-theme)" \{.*?\n\}/s, source, return: :index)

      cond do
        String.contains?(source, ".xenia-grid") ->
          {:skipped, "#{path}: Xenia's theme is already there"}

        length(themes) != 2 ->
          {:manual,
           "#{path}: expected Phoenix's two daisyUI themes. Copy Xenia's from " <>
             template_path("theme.css") <> " and " <> template_path("extras.css")}

        true ->
          [[{first, _} | _], [{second, second_length} | _]] = themes
          [_, theme_path] = Regex.run(~r/@plugin "([^"]*daisyui-theme)"/, source)
          theme = template("theme.css") |> String.replace("DAISYUI_THEME_PATH", theme_path)

          # Phoenix's comment above its themes describes Phoenix's colors.
          before =
            Regex.replace(
              ~r/\/\* daisyUI theme plugin\..*?\*\/\n\z/s,
              binary_part(source, 0, first),
              ""
            )

          rest =
            binary_part(
              source,
              second + second_length,
              byte_size(source) - second - second_length
            )

          {:write,
           String.trim_trailing(before <> theme <> rest) <> "\n\n" <> template("extras.css"),
           "#{path}: Xenia's light and dark themes, and the grid pattern"}
      end
    end)
  end

  # The LiveSocket's hooks object on one line, as long as it spreads
  # Phoenix's colocatedHooks: `{...colocatedHooks}` as Phoenix generates it,
  # or `{...Hooks, ...colocatedHooks}` after Surface's setup.
  @hooks_object ~r/hooks: \{([^{}\n]*\.\.\.colocatedHooks[^{}\n]*)\},/

  @doc false
  def javascript(%{}) do
    path = "assets/js/app.js"

    with_file(path, fn source ->
      cond do
        String.contains?(source, ~s(from "xenia")) ->
          {:skipped, "#{path}: already imports Xenia"}

        not (String.contains?(source, ~s(import topbar from "../vendor/topbar")) and
                 Regex.match?(@hooks_object, source)) ->
          {:manual,
           "#{path}: add these lines after the imports, and spread " <>
             "`...createHooks({})` into the LiveSocket's hooks:\n\n" <>
             String.replace(javascript_setup(), ~r/^(?=.)/m, "    ")}

        true ->
          source =
            source
            |> String.replace(
              ~s(import topbar from "../vendor/topbar"),
              ~s(import topbar from "../vendor/topbar") <> "\n" <> javascript_setup(),
              global: false
            )
            |> then(
              &Regex.replace(
                @hooks_object,
                &1,
                "// Register your adapters here, e.g. createHooks({Chart: chart})\n" <>
                  "  hooks: {\\1, ...createHooks({})},",
                global: false
              )
            )

          {:write, source, "#{path}: Xenia's hooks, and the theme for components that follow it"}
      end
    end)
  end

  defp javascript_setup do
    """
    import {createHooks, setProvider} from "xenia"

    // The app's theme, for every Xenia component that asks for it
    // (consumes: ["theme"]). Phoenix's theme toggle keeps <html data-theme> current.
    const publishTheme = () =>
      setProvider("theme", document.documentElement.dataset.theme ?? "light")

    publishTheme()
    new MutationObserver(publishTheme)
      .observe(document.documentElement, {attributes: true, attributeFilter: ["data-theme"]})
    """
  end

  @doc false
  def html_helpers(%{web: web}) do
    path = web.path <> ".ex"
    core = "      import #{web.module}.CoreComponents\n"

    with_file(path, fn source ->
      cond do
        String.contains?(source, "import Xenia.Component\n") ->
          {:skipped, "#{path}: already imports Xenia.Component"}

        not String.contains?(source, core) ->
          {:manual, "#{path}: add `import Xenia.Component` to html_helpers"}

        true ->
          {:write,
           String.replace(
             source,
             core,
             core <> "      # Xenia's <.xenia> and colocated/1\n      import Xenia.Component\n",
             global: false
           ), "#{path}: import Xenia.Component in html_helpers"}
      end
    end)
  end

  # Phoenix's tsconfig maps "*" to "../deps/*". TypeScript reads that as a
  # path, not a package, so it never sees Xenia's package.json "exports":
  # "xenia" resolves, "xenia/chartjs" doesn't. Two explicit entries fix it
  # (CLAUDE.md §6, "TypeScript declarations").
  @phoenix_paths ~r/^([ \t]*)"\*": \["\.\.\/deps\/\*"\](,?)[ \t]*$/m

  @doc false
  def typescript(%{}) do
    path = "assets/tsconfig.json"
    types = relative(Path.join(xenia_dir(), "priv/types"), Path.expand("assets"))
    entries = [~s("xenia": ["#{types}/xenia.d.ts"]), ~s("xenia/*": ["#{types}/*.d.ts"])]

    if File.exists?(path) do
      with_file(path, fn source ->
        cond do
          String.contains?(source, ~s("xenia/*")) ->
            {:skipped, "#{path}: already has Xenia's types"}

          not Regex.match?(@phoenix_paths, source) ->
            {:manual,
             "#{path}: for Xenia's TypeScript types, add to \"paths\" in compilerOptions:\n\n" <>
               Enum.map_join(entries, ",\n", &("    " <> &1))}

          true ->
            source =
              Regex.replace(
                @phoenix_paths,
                source,
                fn _line, indent, comma ->
                  Enum.map_join([~s("*": ["../deps/*"]) | entries], ",\n", &(indent <> &1)) <>
                    comma
                end,
                global: false
              )

            # TypeScript 7 refuses the baseUrl Phoenix generates; it's
            # Phoenix's setting, so it's only pointed out.
            note =
              if String.contains?(source, ~s("baseUrl")),
                do: ~s| (for TypeScript 7, also remove "baseUrl")|,
                else: ""

            {:write, source,
             ~s(#{path}: Xenia's types, for "xenia" and "xenia/<adapter>") <> note}
        end
      end)
    else
      {:skipped, "#{path}: none, so no TypeScript paths to add"}
    end
  end

  # The path from `from` to `to`, both absolute, e.g. "../deps/xenia/priv/types".
  # (Path.relative_to/3 does this with `force: true`, from Elixir 1.16.)
  defp relative(to, from) do
    {to, from} = {Path.split(to), Path.split(from)}
    common = Enum.zip(to, from) |> Enum.take_while(fn {a, b} -> a == b end) |> length()
    Path.join(List.duplicate("..", length(from) - common) ++ Enum.drop(to, common))
  end

  # Phoenix's flash/1 as Phoenix 1.8 generates it, with or without Gettext.
  # Only exactly that is replaced; a flash/1 the app changed is left alone.
  @close_labels [~s|"close"|, ~s|{gettext("close")}|]

  @doc false
  def flash(%{web: web}) do
    path = Path.join(web.path, "components/core_components.ex")

    with_file(path, fn source ->
      phoenix =
        Enum.find_value(@close_labels, fn label ->
          block = EEx.eval_string(template("phoenix_flash.ex.eex"), assigns: [close_label: label])
          if String.contains?(source, block), do: {block, label}
        end)

      cond do
        String.contains?(source, "flash-countdown") ->
          {:skipped, "#{path}: flash/1 already has Xenia's countdown"}

        is_nil(phoenix) ->
          {:manual,
           "#{path}: flash/1 isn't the one Phoenix generates, so it's left alone. " <>
             "Xenia's version: " <> template_path("flash.ex.eex")}

        true ->
          {block, label} = phoenix
          xenia = EEx.eval_string(template("flash.ex.eex"), assigns: [close_label: label])

          {:write, String.replace(source, block, xenia, global: false),
           "#{path}: flash messages with a success kind and a countdown"}
      end
    end)
  end

  @doc false
  def flash_group(%{web: web}) do
    path = Path.join(web.path, "components/layouts.ex")

    edits = [
      {~s|  attr :id, :string, default: "flash-group", doc: "the optional id of flash container"\n|,
       ~s|  attr :id, :string, default: "flash-group", doc: "the optional id of flash container"\n| <>
         ~s|  attr :shape, :string, default: "rounded", doc: "rounded, sharp or pill"\n\n| <>
         ~s|  attr :duration, :any,\n| <>
         ~s|    default: 5000,\n| <>
         ~s|    doc: "ms until info and success messages close by themselves; nil keeps them"\n|},
      {~s|    <div id={@id} aria-live="polite">\n|,
       ~s|    <div id={@id} aria-live="polite" class="toast toast-top toast-end z-50 pointer-events-none">\n|},
      {~s|      <.flash kind={:info} flash={@flash} />\n      <.flash kind={:error} flash={@flash} />\n|,
       ~s|      <.flash kind={:info} flash={@flash} shape={@shape} duration={@duration} />\n| <>
         ~s|      <.flash kind={:success} flash={@flash} shape={@shape} duration={@duration} />\n| <>
         ~s|      <.flash kind={:error} flash={@flash} shape={@shape} />\n|}
    ]

    with_file(path, fn source ->
      cond do
        String.contains?(source, "<.flash kind={:success}") ->
          {:skipped, "#{path}: flash_group/1 already shows success messages"}

        not Enum.all?(edits, fn {from, _to} -> String.contains?(source, from) end) ->
          {:manual,
           "#{path}: flash_group/1 isn't the one Phoenix generates. Render " <>
             "<.flash kind={:success} flash={@flash} duration={5000} /> in it"}

        true ->
          source =
            Enum.reduce(edits, source, fn {from, to}, acc ->
              String.replace(acc, from, to, global: false)
            end)

          {:write, source, "#{path}: success messages, stacked, closing after 5 s"}
      end
    end)
  end

  @doc false
  def root_layout(%{web: web, app_title: title}) do
    path = Path.join(web.path, "components/layouts/root.html.heex")
    live_title = ~r/^( *)<\.live_title[^\n]*<\/\.live_title>\n/m

    with_file(path, fn source ->
      cond do
        String.contains?(source, "Xenia.Metadata.tags") ->
          {:skipped, "#{path}: already renders Xenia.Metadata.tags"}

        not Regex.match?(live_title, source) ->
          {:manual,
           "#{path}: add <Xenia.Metadata.tags metadata={assigns[:xenia_metadata]} /> " <>
             "inside <head>"}

        true ->
          [line, indent] = Regex.run(live_title, source)

          tags =
            indent <>
              ~s|<.live_title default="#{title}" phx-no-format>{assigns[:page_title]}</.live_title>\n| <>
              indent <> ~s|<Xenia.Metadata.tags metadata={assigns[:xenia_metadata]} />\n|

          {:write, String.replace(source, line, tags, global: false),
           "#{path}: titles, descriptions and social tags from the pages' metadata"}
      end
    end)
  end

  @doc false
  def formatter(%{}) do
    path = ".formatter.exs"

    with_file(path, fn source ->
      case Regex.run(~r/import_deps: \[([^\]]*)\]/, source) do
        nil ->
          {:manual, "#{path}: add :xenia to import_deps"}

        [match, deps] ->
          if String.contains?(deps, ":xenia") do
            {:skipped, "#{path}: already imports :xenia"}
          else
            deps = deps |> String.split(",", trim: true) |> Enum.map(&String.trim/1)
            new = "import_deps: [#{Enum.join(deps ++ [":xenia"], ", ")}]"

            {:write, String.replace(source, match, new, global: false),
             "#{path}: :xenia in import_deps"}
          end
      end
    end)
  end

  @doc false
  def router(%{web: web, app_folder: folder}) do
    path = Path.join(web.path, "router.ex")
    home = ~s(    get "/", PageController, :home\n)
    use_router = "  use #{web.module}, :router\n"

    with_file(path, fn source ->
      cond do
        String.contains?(source, "xenia_routes") ->
          {:skipped, "#{path}: already has xenia_routes"}

        not (String.contains?(source, home) and String.contains?(source, use_router)) ->
          {:manual,
           "#{path}: add `import Xenia.Routes`, and `xenia_routes \"#{folder}\"` inside a " <>
             "live_session in your browser scope"}

        true ->
          routes = """
              # Every page.ex in #{folder} is a route (mix xenia.install).
              live_session :app do
                xenia_routes "#{folder}"
              end
          """

          source =
            source
            |> String.replace(use_router, use_router <> "\n  import Xenia.Routes\n",
              global: false
            )
            |> String.replace(home, routes, global: false)

          {:write, source, "#{path}: routes from #{folder}, in place of PageController's home"}
      end
    end)
  end

  @doc false
  # Phoenix's test of its home page fails once `/` is the app folder's home
  # page, so it checks the app's name there instead.
  def home_test(%{web: web, app_title: title}) do
    path = Path.join(["test", Path.basename(web.path), "controllers", "page_controller_test.exs"])

    phoenix =
      ~s|    assert html_response(conn, 200) =~ "Peace of mind from prototype to production"\n|

    if File.exists?(path) do
      with_file(path, fn source ->
        if String.contains?(source, phoenix) do
          new =
            "    # The app folder's home page (mix xenia.install).\n" <>
              "    assert html_response(conn, 200) =~ #{inspect(title)}\n"

          {:write, String.replace(source, phoenix, new, global: false),
           "#{path}: checks the app folder's home page"}
        else
          {:skipped, "#{path}: doesn't check Phoenix's home page"}
        end
      end)
    else
      {:skipped, "#{path}: not there"}
    end
  end

  @doc false
  def app_folder(%{web: web, app_folder: folder, app_title: title}) do
    assigns = [web_module: web.module, app_folder: folder, app_title: title]

    for {file, template} <- [{"layout.ex", "layout.ex.eex"}, {"page.ex", "page.ex.eex"}] do
      path = Path.join(folder, file)

      if File.exists?(path) do
        {:skipped, "#{path}: already there"}
      else
        File.mkdir_p!(folder)
        File.write!(path, EEx.eval_string(template(template), assigns: assigns))
        {:created, path}
      end
    end
  end

  @doc false
  def logo(%{}) do
    path = "priv/static/images/xenia-mark.png"
    source = Path.join(xenia_dir(), "guides/images/xenia-mark.png")

    cond do
      File.exists?(path) ->
        {:skipped, "#{path}: already there"}

      not File.exists?(source) ->
        {:manual, "#{path}: copy Xenia's logo there (guides/images/xenia-mark.png)"}

      true ->
        File.mkdir_p!(Path.dirname(path))
        File.cp!(source, path)
        {:created, path}
    end
  end

  # --- Helpers ------------------------------------------------------------------

  # Reads `path`, and writes it back if the step changed it. A missing file
  # is a manual step.
  defp with_file(path, fun) do
    if File.exists?(path) do
      case fun.(File.read!(path)) do
        {:write, content, message} ->
          File.write!(path, content)
          {:updated, message}

        other ->
          other
      end
    else
      {:manual, "#{path} is missing: the step for it is in `mix help xenia.install`"}
    end
  end

  defp report(:created, path), do: Mix.shell().info([:green, "* creating ", :reset, path])
  defp report(:updated, message), do: Mix.shell().info([:green, "* updating ", :reset, message])
  defp report(:skipped, message), do: Mix.shell().info([:yellow, "* skipping ", :reset, message])
  defp report(:manual, message), do: Mix.shell().info([:red, "* by hand  ", :reset, message])

  defp template(name), do: File.read!(template_path(name))
  defp template_path(name), do: Path.join([xenia_dir(), "priv/templates/xenia.install", name])

  # Xenia's own directory, where its templates and logo are: deps/xenia in
  # an app (or the path of a path dependency), the project in Xenia itself.
  @xenia_dir Path.expand("../../..", __DIR__)
  defp xenia_dir, do: @xenia_dir
end
