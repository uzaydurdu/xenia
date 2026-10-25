defmodule Xenia.RoutesTest do
  @moduledoc """
  Tests `xenia_routes` against the real `Phoenix.Router`: each test writes an
  app folder, compiles a router around it, and reads the routes Phoenix
  built (`__routes__/0`).

  The page modules don't need to exist: the router only refers to them by
  name, which `Xenia.Routes.PageModule` reads from the files.
  """

  use ExUnit.Case, async: true

  @moduletag :tmp_dir

  # Writes `files` (relative path => module name) under `root`.
  defp write_app(root, files) do
    for {file, module} <- files do
      path = Path.join(root, file)
      File.mkdir_p!(Path.dirname(path))
      File.write!(path, "defmodule #{module} do\nend\n")
    end

    root
  end

  # Compiles a router whose body is `body`, with `@root` (inside a string
  # literal) replaced by the folder, and returns the module.
  #
  # Phoenix checks after compiling that each route's LiveView defines
  # `__live__/0`, and warns. These page modules deliberately don't exist, so
  # the warnings are collected without printing (`log: false`). Capturing
  # stderr instead would be global, and leak into other async tests.
  defp compile_router(root, body) do
    module = Module.concat(__MODULE__, "Router#{System.unique_integer([:positive])}")

    Code.with_diagnostics([log: false], fn ->
      Code.compile_string("""
      defmodule #{inspect(module)} do
        use Phoenix.Router
        import Phoenix.LiveView.Router, warn: false
        import Xenia.Routes

        #{String.replace(body, "@root", root)}
      end
      """)
    end)

    module
  end

  # {path, LiveView, action} for every route, in Phoenix's order.
  defp live_routes(router) do
    for %{path: path, metadata: %{phoenix_live_view: {view, action, _opts, _session}}} <-
          router.__routes__(),
        do: {path, view, action}
  end

  @app %{
    "page.ex" => "App.Home",
    "projects/page.ex" => "App.Projects",
    "projects/new/page.ex" => "App.NewProject",
    "projects/[id]/page.ex" => "App.Project",
    "settings/live.ex" => "App.SettingsLive",
    "settings/profile/page.ex" => "App.Profile",
    "settings/security/page.ex" => "App.Security",
    "(marketing)/about/page.ex" => "App.About",
    "_components/card/page.ex" => "App.NotARoute"
  }

  test "one live route per page, in the order Phoenix must match them", %{tmp_dir: tmp} do
    router = tmp |> write_app(@app) |> compile_router(~s(xenia_routes "@root"))

    assert live_routes(router) == [
             {"/", App.Home, nil},
             {"/about", App.About, nil},
             {"/projects", App.Projects, nil},
             {"/projects/new", App.NewProject, nil},
             {"/projects/:id", App.Project, nil},
             {"/settings/profile", App.SettingsLive, App.Profile},
             {"/settings/security", App.SettingsLive, App.Security}
           ]
  end

  test "a surrounding scope's path, alias and live_session apply; its alias doesn't", %{
    tmp_dir: tmp
  } do
    router =
      tmp
      |> write_app(%{"projects/page.ex" => "App.Projects"})
      |> compile_router("""
      scope "/app", MyAppWeb do
        live_session :app do
          xenia_routes "@root"
        end
      end
      """)

    assert [%{path: "/app/projects", metadata: metadata}] = router.__routes__()
    assert {App.Projects, nil, _opts, %{name: :app}} = metadata.phoenix_live_view
  end

  test "ordinary routes live next to generated ones", %{tmp_dir: tmp} do
    router =
      tmp
      |> write_app(%{"projects/page.ex" => "App.Projects"})
      |> compile_router("""
      live "/dashboard", App.DashboardLive
      xenia_routes "@root"
      """)

    assert live_routes(router) == [
             {"/dashboard", App.DashboardLive, nil},
             {"/projects", App.Projects, nil}
           ]
  end

  describe "recompiling when the folder changes" do
    test "__mix_recompile__? is false until a page is added", %{tmp_dir: tmp} do
      router =
        tmp
        |> write_app(%{"projects/page.ex" => "App.Projects"})
        |> compile_router(~s(xenia_routes "@root"))

      refute router.__mix_recompile__?()

      write_app(tmp, %{"reports/page.ex" => "App.Reports"})
      assert router.__mix_recompile__?()
    end

    test "removing or renaming a page makes the router stale", %{tmp_dir: tmp} do
      router =
        tmp
        |> write_app(%{"projects/page.ex" => "App.Projects", "reports/page.ex" => "App.Reports"})
        |> compile_router(~s(xenia_routes "@root"))

      File.rename!(Path.join(tmp, "reports"), Path.join(tmp, "analytics"))
      assert router.__mix_recompile__?()
    end

    test "editing a page's content doesn't", %{tmp_dir: tmp} do
      router =
        tmp
        |> write_app(%{"projects/page.ex" => "App.Projects"})
        |> compile_router(~s(xenia_routes "@root"))

      File.write!(
        Path.join(tmp, "projects/page.ex"),
        "defmodule App.Projects do\n  # edited\nend\n"
      )

      # Edits recompile the router through @external_resource instead.
      refute router.__mix_recompile__?()
    end

    test "with two folders, a change in either one counts", %{tmp_dir: tmp} do
      one = write_app(Path.join(tmp, "one"), %{"a/page.ex" => "One.A"})
      two = write_app(Path.join(tmp, "two"), %{"b/page.ex" => "Two.B"})

      router =
        compile_router(tmp, """
        scope "/one" do
          xenia_routes #{inspect(one)}
        end

        scope "/two" do
          xenia_routes #{inspect(two)}
        end
        """)

      assert Enum.map(live_routes(router), &elem(&1, 0)) == ["/one/a", "/two/b"]
      refute router.__mix_recompile__?()

      write_app(two, %{"c/page.ex" => "Two.C"})
      assert router.__mix_recompile__?()
    end

    test "adding a persistent.ex makes the router stale", %{tmp_dir: tmp} do
      router =
        tmp
        |> write_app(%{"layout.ex" => "App.Layout", "page.ex" => "App.Home"})
        |> compile_router(~s(xenia_routes "@root"))

      refute router.__mix_recompile__?()

      write_app(tmp, %{"persistent.ex" => "App.ShellLive"})
      assert router.__mix_recompile__?()
    end

    test "every page, layout, persistent and live file is an external resource", %{tmp_dir: tmp} do
      tmp
      |> write_app(%{"layout.ex" => "App.Layout", "settings/live.ex" => "App.SettingsLive"})
      |> write_app(%{"persistent.ex" => "App.ShellLive"})
      |> write_app(%{"settings/profile/page.ex" => "App.Profile"})

      router = compile_router(tmp, ~s(xenia_routes "@root"))

      # Each @external_resource is its own entry in the attributes.
      resources =
        router.__info__(:attributes) |> Keyword.get_values(:external_resource) |> List.flatten()

      for file <- ["layout.ex", "persistent.ex", "settings/live.ex", "settings/profile/page.ex"] do
        assert Path.join(tmp, file) in resources
      end
    end
  end

  describe "what pages read at runtime" do
    test "each page's layouts, outermost first, their persistent parts, and its owner", %{
      tmp_dir: tmp
    } do
      router =
        tmp
        |> write_app(%{
          "layout.ex" => "App.RootLayout",
          "(auth)/layout.ex" => "App.AuthLayout",
          "(auth)/persistent.ex" => "App.ShellLive",
          "(auth)/runbooks/layout.ex" => "App.RunbooksLayout",
          "(auth)/runbooks/persistent.ex" => "App.PanelLive",
          "(auth)/runbooks/[id]/page.ex" => "App.Runbook",
          "settings/live.ex" => "App.SettingsLive",
          "settings/profile/page.ex" => "App.Profile",
          "page.ex" => "App.Home"
        })
        |> compile_router(~s(xenia_routes "@root"))

      assert router.__xenia_page__(App.Runbook) == %{
               layouts: [App.RootLayout, App.AuthLayout, App.RunbooksLayout],
               persistent: %{App.AuthLayout => App.ShellLive, App.RunbooksLayout => App.PanelLive},
               owner: App.Runbook,
               file: "(auth)/runbooks/[id]/page.ex"
             }

      assert %{layouts: [App.RootLayout], persistent: %{}, owner: App.SettingsLive} =
               router.__xenia_page__(App.Profile)

      assert router.__xenia_page__(App.NotAPage) == nil

      assert Enum.map(router.__xenia_pages__(), &elem(&1, 0)) == [
               App.Home,
               App.Runbook,
               App.Profile
             ]
    end
  end

  test "mix xenia.routes prints each route with its owner and layouts", %{tmp_dir: tmp} do
    router =
      tmp
      |> write_app(%{
        "layout.ex" => "App.RootLayout",
        "projects/layout.ex" => "App.ProjectsLayout",
        "projects/persistent.ex" => "App.ProjectsPanelLive",
        "projects/page.ex" => "App.Projects",
        "settings/live.ex" => "App.SettingsLive",
        "settings/profile/page.ex" => "App.Profile"
      })
      |> compile_router(~s(xenia_routes "@root"))

    assert Mix.Tasks.Xenia.Routes.table(router) == [
             "/projects          App.Projects                       RootLayout > ProjectsLayout (+ ProjectsPanelLive)",
             "/settings/profile  App.Profile   in App.SettingsLive  RootLayout"
           ]
  end

  describe "on_mount under a live.ex" do
    defp write_layout(root, file, module, opts) do
      path = Path.join(root, file)
      File.mkdir_p!(Path.dirname(path))
      File.write!(path, "defmodule #{module} do\n  use Xenia.Layout#{opts}\nend\n")
    end

    setup %{tmp_dir: tmp} do
      write_app(tmp, %{
        "settings/live.ex" => "App.SettingsLive",
        "settings/profile/page.ex" => "App.Profile",
        "settings/admin/page.ex" => "App.Admin"
      })

      :ok
    end

    # Its pages switch by patch, which mounts nothing: a hook declared below
    # the live.ex would only run for some pages, and be skipped on a patch.
    test "a layout below the live.ex can't declare on_mount", %{tmp_dir: tmp} do
      write_layout(
        tmp,
        "settings/admin/layout.ex",
        "App.AdminLayout",
        ", on_mount: App.RequireAdmin"
      )

      assert_raise ArgumentError,
                   ~r/settings\/admin\/layout.ex declares on_mount, but it is below settings\/live.ex/,
                   fn -> compile_router(tmp, ~s(xenia_routes "@root")) end
    end

    test "in the live.ex's own folder or above, it can", %{tmp_dir: tmp} do
      write_layout(tmp, "settings/layout.ex", "App.SettingsLayout", ", on_mount: App.RequireUser")
      write_layout(tmp, "layout.ex", "App.RootLayout", ", on_mount: App.Track")

      router = compile_router(tmp, ~s(xenia_routes "@root"))
      assert %{layouts: [App.RootLayout, App.SettingsLayout]} = router.__xenia_page__(App.Admin)
    end

    test "a layout below the live.ex without on_mount is fine, with a persistent part", %{
      tmp_dir: tmp
    } do
      write_layout(tmp, "settings/admin/layout.ex", "App.AdminLayout", "")
      write_app(tmp, %{"settings/admin/persistent.ex" => "App.PanelLive"})

      router = compile_router(tmp, ~s(xenia_routes "@root"))

      assert %{layouts: [App.AdminLayout], persistent: %{App.AdminLayout => App.PanelLive}} =
               router.__xenia_page__(App.Admin)
    end
  end

  describe "errors" do
    test "two files defining the same module", %{tmp_dir: tmp} do
      tmp |> write_app(%{"a/page.ex" => "App.Same", "b/page.ex" => "App.Same"})

      assert_raise ArgumentError,
                   ~r/App.Same is defined by more than one file: a\/page.ex, b\/page.ex/,
                   fn ->
                     compile_router(tmp, ~s(xenia_routes "@root"))
                   end
    end

    test "a persistent.ex defining a page's module", %{tmp_dir: tmp} do
      tmp
      |> write_app(%{
        "layout.ex" => "App.Layout",
        "persistent.ex" => "App.Same",
        "page.ex" => "App.Same"
      })

      assert_raise ArgumentError,
                   ~r/App.Same is defined by more than one file: page.ex, persistent.ex/,
                   fn -> compile_router(tmp, ~s(xenia_routes "@root")) end
    end

    test "a persistent.ex without a layout.ex next to it", %{tmp_dir: tmp} do
      tmp |> write_app(%{"shell/persistent.ex" => "App.ShellLive", "shell/page.ex" => "App.X"})

      assert_raise ArgumentError, ~r/shell\/persistent.ex has no layout.ex next to it/, fn ->
        compile_router(tmp, ~s(xenia_routes "@root"))
      end
    end

    test "two pages with the same path", %{tmp_dir: tmp} do
      tmp |> write_app(%{"(a)/x/page.ex" => "App.X1", "(b)/x/page.ex" => "App.X2"})

      assert_raise ArgumentError, ~r/resolve to the same path/, fn ->
        compile_router(tmp, ~s(xenia_routes "@root"))
      end
    end

    test "a folder that isn't a literal string", %{tmp_dir: tmp} do
      assert_raise ArgumentError, ~r/expects the app folder as a literal string/, fn ->
        compile_router(tmp, ~s{xenia_routes Path.join("lib", "app")})
      end
    end

    test "a missing folder", %{tmp_dir: tmp} do
      assert_raise ArgumentError, ~r/Xenia app folder not found/, fn ->
        compile_router(tmp, ~s(xenia_routes "@root/missing"))
      end
    end
  end
end
