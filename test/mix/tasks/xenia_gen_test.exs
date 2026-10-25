# What the generated files `use`: a Phoenix 1.8 app's web module, reduced to
# what they need. The test project's app is :xenia, so the generators name
# it XeniaWeb.
defmodule XeniaWeb do
  def live_view, do: quote(do: use(Phoenix.LiveView))
  def html, do: quote(do: use(Phoenix.Component))
  defmacro __using__(which) when is_atom(which), do: apply(__MODULE__, which, [])
end

defmodule XeniaWeb.Layouts do
  use Phoenix.Component

  attr(:flash, :map, required: true)
  slot(:inner_block, required: true)
  def app(assigns), do: ~H"<main>{render_slot(@inner_block)}</main>"
end

defmodule Mix.Tasks.Xenia.GenTest do
  @moduledoc """
  Tests the M11 generators: `mix xenia.gen.page`, `mix xenia.gen.layout` and
  `mix xenia.gen.component`. Each test runs a generator in a temporary
  folder, then compiles what it wrote (no warnings allowed) and, for
  JavaScript, has Node parse it.

  Synchronous: the generators write relative to the current directory, which
  is global to the VM.
  """

  use ExUnit.Case, async: false

  require Phoenix.LiveViewTest

  @moduletag :tmp_dir

  setup %{tmp_dir: tmp} do
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

  @app "lib/xenia_web/app"

  # Everything the generator printed, as one string.
  defp output do
    receive do
      {:mix_shell, :info, [message]} -> message <> "\n" <> output()
    after
      0 -> ""
    end
  end

  # Compiles a generated file and returns its compiler warnings.
  defp compile(path) do
    {_modules, diagnostics} =
      Code.with_diagnostics([log: false], fn -> Code.compile_file(path) end)

    for %{severity: :warning, message: message} <- diagnostics, do: message
  end

  defp touch(file, module) do
    path = Path.join(@app, file)
    File.mkdir_p!(Path.dirname(path))
    File.write!(path, "defmodule #{module} do\nend\n")
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

  # --- mix xenia.gen.page -----------------------------------------------------

  describe "xenia.gen.page" do
    test "a page with a parameter: a LiveView that assigns it" do
      Mix.Tasks.Xenia.Gen.Page.run(["(ops)/incidents/[id]"])

      path = Path.join(@app, "(ops)/incidents/[id]/page.ex")
      source = File.read!(path)

      assert source =~ "defmodule XeniaWeb.App.Ops.Incidents.IdPage do"
      assert source =~ "use XeniaWeb, :live_view\n  use Xenia.Page"
      assert source =~ ~s|def mount(%{"id" => id}, _session, socket) do|
      assert source =~ "<p>id: {@id}</p>"
      assert compile(path) == []
      assert output() =~ "`/incidents/:id` is routed by xenia_routes"
    end

    test "a catch-all arrives as a list" do
      Mix.Tasks.Xenia.Gen.Page.run(["docs/[...path]"])
      path = Path.join(@app, "docs/[...path]/page.ex")

      assert File.read!(path) =~ ~s|<p>path: {Enum.join(@path, "/")}</p>|
      assert compile(path) == []
    end

    test "the root page is the HomePage" do
      Mix.Tasks.Xenia.Gen.Page.run(["."])
      assert File.read!(Path.join(@app, "page.ex")) =~ "defmodule XeniaWeb.App.HomePage do"
    end

    test "under a live.ex, a page only renders" do
      touch("account/live.ex", "XeniaWeb.App.AccountLive")
      Mix.Tasks.Xenia.Gen.Page.run(["account/billing"])

      path = Path.join(@app, "account/billing/page.ex")
      source = File.read!(path)

      assert source =~ "use XeniaWeb, :html"
      refute source =~ "Xenia.Page"
      refute source =~ "def mount"
      assert source =~ "It shares the LiveView in `account/live.ex`"
      assert compile(path) == []
      assert output() =~ "It renders inside account/live.ex's LiveView."
    end

    test "a path another page already has is refused" do
      touch("reports/page.ex", "XeniaWeb.App.ReportsPage")

      assert_raise Mix.Error,
                   ~r/resolve to the same path: \(admin\)\/reports\/page.ex, reports\/page.ex/,
                   fn ->
                     Mix.Tasks.Xenia.Gen.Page.run(["(admin)/reports"])
                   end
    end

    test "an existing page is kept, unless --force" do
      touch("about/page.ex", "XeniaWeb.App.Mine")

      assert_raise Mix.Error, ~r/about\/page.ex already exists. Pass --force/, fn ->
        Mix.Tasks.Xenia.Gen.Page.run(["about"])
      end

      Mix.Tasks.Xenia.Gen.Page.run(["about", "--force"])
      assert File.read!(Path.join(@app, "about/page.ex")) =~ "XeniaWeb.App.AboutPage"
    end

    test "--module and --root" do
      Mix.Tasks.Xenia.Gen.Page.run(["status", "--module", "Ops.Status", "--root", "pages"])
      assert File.read!("pages/status/page.ex") =~ "defmodule Ops.Status do"
    end

    test "bad paths are refused" do
      for {args, message} <- [
            {["_drafts/x"], ~r/private folder/},
            {["Bad Name"], ~r/invalid folder name "Bad Name"/},
            {["../outside"], ~r/expected a folder inside the app folder/},
            {[], ~r/expected one folder/}
          ] do
        assert_raise Mix.Error, message, fn -> Mix.Tasks.Xenia.Gen.Page.run(args) end
      end
    end
  end

  # --- mix xenia.gen.layout ---------------------------------------------------

  describe "xenia.gen.layout" do
    test "a layout with a persistent part and an on_mount hook" do
      Mix.Tasks.Xenia.Gen.Layout.run([
        "(team)",
        "--persistent",
        "--on-mount",
        "XeniaWeb.Auth:require_user"
      ])

      layout = Path.join(@app, "(team)/layout.ex")
      persistent = Path.join(@app, "(team)/persistent.ex")

      assert File.read!(layout) =~ "defmodule XeniaWeb.App.TeamLayout do"
      assert File.read!(layout) =~ "use Xenia.Layout, on_mount: {XeniaWeb.Auth, :require_user}"
      assert File.read!(layout) =~ "<aside>{@persistent}</aside>"
      assert File.read!(persistent) =~ "defmodule XeniaWeb.App.TeamPersistentLive do"
      assert File.read!(persistent) =~ "use Xenia.Persistent"
      assert File.read!(persistent) =~ "def handle_navigation(uri, socket)"

      assert compile(layout) == []
      assert compile(persistent) == []
    end

    test "the root layout wraps pages in the app's Layouts.app" do
      Mix.Tasks.Xenia.Gen.Layout.run(["."])
      path = Path.join(@app, "layout.ex")

      assert File.read!(path) =~ "defmodule XeniaWeb.App.RootLayout do"
      assert File.read!(path) =~ "<XeniaWeb.Layouts.app flash={@flash}>"
      refute File.read!(path) =~ "@persistent"
      assert compile(path) == []
      assert output() =~ "pages shouldn't call it themselves"
    end

    test "with an existing layout, --persistent adds only the persistent part" do
      touch("(crew)/layout.ex", "XeniaWeb.App.Mine")
      Mix.Tasks.Xenia.Gen.Layout.run(["(crew)", "--persistent"])

      assert File.read!(Path.join(@app, "(crew)/layout.ex")) =~ "XeniaWeb.App.Mine"
      assert File.exists?(Path.join(@app, "(crew)/persistent.ex"))
      assert output() =~ "already exists, so it was kept. Place the persistent part in its frame"
    end

    test "an existing layout without --persistent is refused" do
      touch("(crew)/layout.ex", "XeniaWeb.App.Mine")

      assert_raise Mix.Error, ~r/already exists/, fn ->
        Mix.Tasks.Xenia.Gen.Layout.run(["(crew)"])
      end
    end

    test "on_mount below a live.ex is refused, as xenia_routes would" do
      touch("settings/live.ex", "XeniaWeb.App.SettingsLive")

      assert_raise Mix.Error, ~r/can't be used below settings\/live.ex/, fn ->
        Mix.Tasks.Xenia.Gen.Layout.run(["settings/admin", "--on-mount", "XeniaWeb.Admin"])
      end

      # In the live.ex's own folder it's fine.
      Mix.Tasks.Xenia.Gen.Layout.run(["settings", "--on-mount", "XeniaWeb.Admin"])
      assert File.read!(Path.join(@app, "settings/layout.ex")) =~ "on_mount: XeniaWeb.Admin"
    end

    test "--on-mount must be Module or Module:argument" do
      for hook <- ["auth", "XeniaWeb.Auth:", "XeniaWeb.Auth:Bad", "Xenia Web"] do
        assert_raise Mix.Error, ~r/--on-mount expects Module or Module:argument/, fn ->
          Mix.Tasks.Xenia.Gen.Layout.run(["(x)", "--on-mount", hook])
        end
      end
    end

    # The generated files are what xenia_routes reads: the layout chain and
    # the persistent part are found from the folders.
    test "generated layouts and pages are what xenia_routes finds" do
      Mix.Tasks.Xenia.Gen.Layout.run(["."])
      Mix.Tasks.Xenia.Gen.Layout.run(["(staff)", "--persistent"])
      Mix.Tasks.Xenia.Gen.Page.run(["(staff)/rota"])

      assert [route] = Xenia.Routes.routes(@app)
      assert route.page.path == "/rota"
      assert route.module == XeniaWeb.App.Staff.RotaPage
      assert route.layouts == [XeniaWeb.App.RootLayout, XeniaWeb.App.StaffLayout]
      assert route.persistent == %{XeniaWeb.App.StaffLayout => XeniaWeb.App.StaffPersistentLive}
    end
  end

  # --- mix xenia.gen.component ------------------------------------------------

  describe "xenia.gen.component" do
    test "writes the adapter and the tag, and prints the app.js line" do
      Mix.Tasks.Xenia.Gen.Component.run(~w(heat_map points:list title:string --events select))

      js = File.read!("assets/js/heat_map_adapter.js")
      ex = "lib/xenia_web/components/heat_map.ex"

      assert js =~ "export const heatMap = {"
      assert js =~ "points(instance, value) {"
      assert js =~ "select: {},"
      assert_valid_js(js)

      assert File.read!(ex) =~ "defmodule XeniaWeb.Components.HeatMap do"

      assert File.read!(ex) =~
               ~s|component :heat_map, adapter: "HeatMap" do\n    prop :points, :list\n    prop :title, :string\n    event :select\n  end|

      assert compile(ex) == []

      printed = output()
      assert printed =~ ~s|import { heatMap } from "./heat_map_adapter"|
      assert printed =~ "...createHooks({ HeatMap: heatMap })"
      assert printed =~ "import XeniaWeb.Components.HeatMap"

      assert printed =~
               ~s|<.heat_map id="heat-map" points={@points} title={@title} on_select="heat_map_select" />|
    end

    test "the generated tag renders the adapter's container" do
      Mix.Tasks.Xenia.Gen.Component.run(~w(meter level:integer --module XeniaWeb.GenMeter))
      [] = compile("lib/xenia_web/components/meter.ex")

      # Defined only now, by compiling the generated file.
      meter = Function.capture(Module.concat(["XeniaWeb.GenMeter"]), :meter, 1)
      html = Phoenix.LiveViewTest.render_component(meter, id: "m", level: 3)

      assert html =~ ~s(phx-hook="Meter")
      assert html =~ ~s(data-xenia-props="{&quot;level&quot;:3}")
    end

    test "without props or events, the adapter has neither section" do
      Mix.Tasks.Xenia.Gen.Component.run(~w(badge))
      js = File.read!("assets/js/badge_adapter.js")

      refute js =~ "\n  props: {"
      refute js =~ "\n  events: {"
      assert_valid_js(js)
    end

    test "--colocated writes nothing and prints the page version" do
      Mix.Tasks.Xenia.Gen.Component.run(~w(gauge value:integer --events click --colocated))

      refute File.exists?("assets")
      refute File.exists?("lib")

      printed = output()
      assert printed =~ ~s|component :gauge, adapter: ".Gauge" do|
      assert printed =~ ~s|<script :type={Phoenix.LiveView.ColocatedHook} name=".Gauge">|
      assert printed =~ "app.js doesn't change"

      [_, script] = Regex.run(~r/name="\.Gauge">\n(.*?)\n\s*<\/script>/s, printed)
      assert script =~ "export default adapterHook({"
      assert_valid_js(script)
    end

    test "bad arguments are refused before anything is written" do
      for {args, message} <- [
            {~w(Chart), ~r/must be lowercase/},
            {~w(chart data), ~r/expected props as name:type/},
            {~w(chart data:date), ~r/unknown type date/},
            {~w(chart id:string), ~r/id is every component's own attribute/},
            {~w(chart data:map data:list), ~r/prop data is given twice/},
            {~w(chart on_click:string --events click), ~r/collides with the attribute/},
            {~w(chart --events Click), ~r/an event name must be lowercase/},
            {[], ~r/expected a name/}
          ] do
        assert_raise Mix.Error, message, fn -> Mix.Tasks.Xenia.Gen.Component.run(args) end
      end

      refute File.exists?("assets")
    end
  end
end
