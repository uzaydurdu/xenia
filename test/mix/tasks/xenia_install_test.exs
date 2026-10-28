defmodule Mix.Tasks.Xenia.InstallTest do
  @moduledoc """
  Tests `mix xenia.install` against the files a fresh Phoenix 1.8 app has
  (test/fixtures/phoenix_1_8, copied from `mix phx.new pristine`, stored as
  .txt so the formatter leaves them alone). Synchronous: the task works in
  the current directory, which is global to the VM.
  """

  use ExUnit.Case, async: false

  @moduletag :tmp_dir
  @fixtures Path.expand("../../fixtures/phoenix_1_8", __DIR__)
  @args ["--web-module", "PristineWeb", "--web-path", "lib/pristine_web"]

  setup %{tmp_dir: tmp} do
    for source <- Path.wildcard(Path.join(@fixtures, "**/*.txt")) do
      target =
        Path.join(tmp, source |> Path.relative_to(@fixtures) |> String.trim_trailing(".txt"))
        |> String.replace(~r/formatter\.exs$/, ".formatter.exs")

      File.mkdir_p!(Path.dirname(target))
      File.cp!(source, target)
    end

    previous = Mix.shell()
    Mix.shell(Mix.Shell.Process)
    cwd = File.cwd!()
    File.cd!(tmp)

    on_exit(fn ->
      File.cd!(cwd)
      Mix.shell(previous)
    end)

    :ok
  end

  defp output do
    receive do
      {:mix_shell, :info, [message]} -> IO.iodata_to_binary(message) <> "\n" <> output()
    after
      0 -> ""
    end
  end

  test "a fresh Phoenix app gets Xenia's theme, hooks, routes, layout and home page" do
    Mix.Tasks.Xenia.Install.run(@args)
    printed = output()

    css = File.read!("assets/css/app.css")
    assert css =~ ~s|--color-primary: oklch(54.1% 0.247 293);|, "Xenia's purple"

    assert css =~ ~s(@plugin "daisyui/packages/bundle/daisyui-theme" {),
           "the app's own plugin path"

    assert length(Regex.scan(~r/daisyui-theme/, css)) == 2
    refute css =~ "inspired on Phoenix colors"
    assert css =~ ".xenia-grid {"

    js = File.read!("assets/js/app.js")
    assert js =~ ~s(import {createHooks, setProvider} from "xenia")
    assert js =~ "hooks: {...colocatedHooks, ...createHooks({})},"
    assert js =~ ~s{setProvider("theme", document.documentElement.dataset.theme ?? "light")}

    assert File.read!("lib/pristine_web.ex") =~
             "import PristineWeb.CoreComponents\n      # Xenia's <.xenia> and colocated/1\n      import Xenia.Component\n"

    assert File.read!(".formatter.exs") =~ "import_deps: [:phoenix, :xenia]"

    core = File.read!("lib/pristine_web/components/core_components.ex")
    assert core =~ "attr :kind, :atom, values: [:info, :success, :error]"
    assert core =~ ~s|phx-hook=".Flash"|
    assert core =~ "flash-countdown"
    assert core =~ ~s|name="hero-check-circle"|
    assert core =~ ~s|aria-label="close"|, "the app's own close label, without Gettext"
    refute core =~ "toast toast-top", "the column is flash_group's now"

    layouts = File.read!("lib/pristine_web/components/layouts.ex")
    assert layouts =~ ~s|class="toast toast-top toast-end z-50 pointer-events-none"|

    assert layouts =~
             "<.flash kind={:success} flash={@flash} shape={@shape} duration={@duration} />"

    assert layouts =~ "<.flash kind={:error} flash={@flash} shape={@shape} />"
    assert layouts =~ "attr :duration, :any,"

    assert css =~ ".flash-countdown rect {"

    # The title comes from the project's :app, :xenia here.
    root = File.read!("lib/pristine_web/components/layouts/root.html.heex")

    assert root =~
             ~s|    <.live_title default="Xenia" phx-no-format>{assigns[:page_title]}</.live_title>\n| <>
               ~s|    <Xenia.Metadata.tags metadata={assigns[:xenia_metadata]} />\n|

    refute root =~ "Phoenix Framework"

    router = File.read!("lib/pristine_web/router.ex")
    assert router =~ "use PristineWeb, :router\n\n  import Xenia.Routes\n"
    assert router =~ ~s(xenia_routes "lib/pristine_web/app")
    refute router =~ ~s(get "/", PageController, :home)

    # Phoenix's test of its home page checks the new one, so `mix test` passes.
    home_test = File.read!("test/pristine_web/controllers/page_controller_test.exs")
    assert home_test =~ ~s|    assert html_response(conn, 200) =~ "Xenia"\n|
    refute home_test =~ "Peace of mind"
    assert Code.string_to_quoted!(home_test)

    layout = File.read!("lib/pristine_web/app/layout.ex")
    assert layout =~ "defmodule PristineWeb.App.RootLayout do"
    assert layout =~ ~s(<div class="xenia-grid)
    assert layout =~ "<Layouts.theme_toggle />"
    assert layout =~ ~s|title_template: "%s · Xenia"|

    page = File.read!("lib/pristine_web/app/page.ex")
    assert page =~ "defmodule PristineWeb.App.HomePage do"
    assert page =~ "use Xenia.Page"

    assert File.exists?("priv/static/images/xenia-mark.png")

    # The generated and edited Elixir is valid and formatted.
    for file <- [
          "lib/pristine_web/app/layout.ex",
          "lib/pristine_web/app/page.ex",
          "lib/pristine_web/components/core_components.ex",
          "lib/pristine_web/components/layouts.ex"
        ] do
      source = File.read!(file)
      assert Code.string_to_quoted!(source)

      # As an app's `mix format` sees it: Phoenix's attr/slot without parens.
      opts = [locals_without_parens: [attr: :*, slot: :*, embed_templates: :*]]

      assert source == IO.iodata_to_binary([Code.format_string!(source, opts), "\n"]),
             "#{file} is formatted"
    end

    refute printed =~ "by hand"
    assert printed =~ "* creating lib/pristine_web/app/page.ex"
  end

  test "running it twice changes nothing the second time" do
    Mix.Tasks.Xenia.Install.run(@args)

    files =
      for f <- Path.wildcard("**/*", match_dot: true),
          File.regular?(f),
          into: %{},
          do: {f, File.read!(f)}

    _ = output()

    Mix.Tasks.Xenia.Install.run(@args)
    printed = output()

    assert files ==
             for(
               f <- Path.wildcard("**/*", match_dot: true),
               File.regular?(f),
               into: %{},
               do: {f, File.read!(f)}
             )

    refute printed =~ "* updating"
    refute printed =~ "* creating"
    assert length(Regex.scan(~r/\* skipping/, printed)) == 12
  end

  test "an app set up with Surface: Xenia's hooks join Surface's" do
    surface = Path.expand("../../fixtures/surface_0_12", __DIR__)
    File.cp!(Path.join(surface, "assets/js/app.js.txt"), "assets/js/app.js")

    Mix.Tasks.Xenia.Install.run(@args)
    printed = output()

    js = File.read!("assets/js/app.js")
    assert js =~ "hooks: {...Hooks, ...colocatedHooks, ...createHooks({})},"
    assert js =~ ~s(import Hooks from "./_hooks")
    assert js =~ ~s(import {createHooks, setProvider} from "xenia")
    assert js =~ ~s{setProvider("theme", document.documentElement.dataset.theme ?? "light")}
    refute printed =~ "by hand"
    assert_valid_js(js)

    Mix.Tasks.Xenia.Install.run(@args)
    assert output() =~ "* skipping assets/js/app.js: already imports Xenia"
    assert File.read!("assets/js/app.js") == js
  end

  test "a file the installer doesn't know prints the whole JavaScript setup to add" do
    File.write!("assets/js/app.js", "// my own setup\n")

    Mix.Tasks.Xenia.Install.run(@args)
    printed = output()

    assert printed =~ "by hand  assets/js/app.js: add these lines after the imports"
    assert printed =~ ~s(    import {createHooks, setProvider} from "xenia")
    assert printed =~ ~s{    new MutationObserver(publishTheme)}
  end

  test "a home page test the app changed is left alone" do
    path = "test/pristine_web/controllers/page_controller_test.exs"
    File.write!(path, "defmodule PristineWeb.PageControllerTest do\nend\n")

    Mix.Tasks.Xenia.Install.run(@args)
    printed = output()

    assert File.read!(path) == "defmodule PristineWeb.PageControllerTest do\nend\n"
    assert printed =~ "* skipping #{path}: doesn't check Phoenix's home page"
  end

  # Node parses `source` as an ES module, without running it or resolving
  # its imports.
  defp assert_valid_js(source) do
    if node = System.find_executable("node") do
      file = Path.join(File.cwd!(), "check-#{System.unique_integer([:positive])}.mjs")
      File.write!(file, source)
      assert {_, 0} = System.cmd(node, ["--check", file], stderr_to_stdout: true)
    end
  end

  test "a file that doesn't look like Phoenix's is left alone, with the step to do by hand" do
    File.write!("assets/js/app.js", "// my own setup\n")
    File.rm!("lib/pristine_web/router.ex")

    Mix.Tasks.Xenia.Install.run(@args)
    printed = output()

    assert File.read!("assets/js/app.js") == "// my own setup\n"
    assert printed =~ "by hand  assets/js/app.js: add these lines after the imports"
    assert printed =~ "by hand  lib/pristine_web/router.ex is missing"
    assert printed =~ "Some steps need you"

    # The other steps still ran.
    assert File.read!(".formatter.exs") =~ ":xenia"
  end

  test "an app made with Gettext keeps its translated close label" do
    gettext = Path.expand("../../fixtures/phoenix_1_8_gettext", __DIR__)

    File.cp!(
      Path.join(gettext, "core_components.ex.txt"),
      "lib/pristine_web/components/core_components.ex"
    )

    File.cp!(Path.join(gettext, "layouts.ex.txt"), "lib/pristine_web/components/layouts.ex")

    Mix.Tasks.Xenia.Install.run(@args)
    _ = output()

    core = File.read!("lib/pristine_web/components/core_components.ex")
    assert core =~ ~s|aria-label={gettext("close")}|
    assert core =~ "flash-countdown"
    assert File.read!("lib/pristine_web/components/layouts.ex") =~ "<.flash kind={:success}"
  end

  test "a flash/1 the app changed is left alone, with the step to do by hand" do
    path = "lib/pristine_web/components/core_components.ex"
    changed = String.replace(File.read!(path), ~s|"alert w-80|, ~s|"alert shadow-xl w-80|)
    File.write!(path, changed)

    Mix.Tasks.Xenia.Install.run(@args)
    printed = output()

    assert File.read!(path) == changed
    assert printed =~ "flash/1 isn't the one Phoenix generates, so it's left alone"
  end
end
