defmodule Xenia.PageTest do
  @moduledoc """
  Tests the M9 runtime without a browser: frames drawn around a page from
  the router's records, change tracking through frames, layouts' on_mount
  hooks, `Xenia.Live.page/1`, and the persistent part's navigation events.
  The browser side (sticky persistence, phx:navigate) is tested in
  `xenia_demo/assets/e2e/app_layouts.test.mjs`.
  """

  use ExUnit.Case, async: true

  import Phoenix.LiveViewTest, only: [rendered_to_string: 1]
  import Phoenix.Component, only: [sigil_H: 2]

  alias Phoenix.LiveView.Socket

  # --- Layouts and hooks ------------------------------------------------------

  defmodule Hooks do
    import Phoenix.Component, only: [assign: 3]

    def on_mount(:outer, _params, _session, socket),
      do: {:cont, assign(socket, :trail, [:outer | socket.assigns[:trail] || []])}

    def on_mount(:inner, _params, _session, socket),
      do: {:cont, assign(socket, :trail, [:inner | socket.assigns.trail])}

    def on_mount(:stop, _params, _session, socket), do: {:halt, socket}
    def on_mount(:broken, _params, _session, _socket), do: :nope
  end

  defmodule Outer do
    use Xenia.Layout, on_mount: {Xenia.PageTest.Hooks, :outer}
    def frame(assigns), do: ~H"<outer data-user={@user}>{@inner_content}</outer>"
  end

  defmodule Inner do
    use Xenia.Layout, on_mount: [{Xenia.PageTest.Hooks, :inner}]
    def frame(assigns), do: ~H"<inner>{@inner_content}</inner>"
  end

  defmodule Halting do
    use Xenia.Layout, on_mount: {Xenia.PageTest.Hooks, :stop}
    def frame(assigns), do: ~H"<halting>{@inner_content}</halting>"
  end

  defmodule Broken do
    use Xenia.Layout, on_mount: {Xenia.PageTest.Hooks, :broken}
    def frame(assigns), do: ~H"<broken>{@inner_content}</broken>"
  end

  defmodule Bare do
    use Xenia.Layout

    def frame(assigns),
      do: ~H"<bare data-persistent={inspect(@persistent)}>{@inner_content}</bare>"
  end

  # Stands in for a router compiled with xenia_routes (Xenia.RoutesTest
  # tests the real one).
  defmodule Router do
    def __xenia_page__(Xenia.PageTest.StandalonePage), do: %{layouts: [Outer, Inner]}
    def __xenia_page__(Xenia.PageTest.SharedPage), do: %{layouts: [Outer]}
    def __xenia_page__(Xenia.PageTest.HaltingPage), do: %{layouts: [Halting, Inner]}
    def __xenia_page__(Xenia.PageTest.BrokenPage), do: %{layouts: [Broken]}

    def __xenia_page__(Xenia.PageTest.BarePage),
      do: %{layouts: [Bare], persistent: %{Xenia.PageTest.Outer => Xenia.PageTest.ShellLive}}

    def __xenia_page__(_other), do: nil
  end

  defp socket(view, assigns \\ %{}) do
    %Socket{router: Router, view: view, assigns: Map.merge(%{__changed__: %{}}, assigns)}
  end

  defp page_html(assigns), do: ~H"<p>page {@user}</p>"

  defp render(socket, extra \\ %{}) do
    assigns = socket.assigns |> Map.merge(extra) |> Map.merge(%{socket: socket, user: "ann"})
    assigns |> Xenia.Page.__render__(page_html(assigns)) |> rendered_to_string()
  end

  # --- Frames -----------------------------------------------------------------

  describe "frames" do
    test "a page is drawn inside its layouts, outermost first" do
      html = render(socket(Xenia.PageTest.StandalonePage))
      assert html =~ ~r{<outer data-user="ann"><inner><p>page ann</p></inner></outer>}
    end

    test "a shared LiveView's layouts come from the current page, its live action" do
      html =
        render(socket(Xenia.PageTest.SettingsLive, %{live_action: Xenia.PageTest.SharedPage}))

      assert html =~ ~r{<outer data-user="ann"><p>page ann</p></outer>}
      refute html =~ "<inner>"
    end

    # Persistent parts come from the router's record (each layout's
    # persistent.ex); rendering one needs a live socket, see the demo's
    # browser tests.
    test "a layout without a persistent.ex of its own gets @persistent nil" do
      assert render(socket(Xenia.PageTest.BarePage)) =~ ~s(<bare data-persistent="nil">)
    end

    test "a page without a generated route gets no frames" do
      assert render(socket(Xenia.PageTest.HandWritten)) == "<p>page ann</p>"
    end

    test "without a router, the page renders alone" do
      assert render(%{socket(Xenia.PageTest.StandalonePage) | router: nil}) == "<p>page ann</p>"
    end

    test "a shared LiveView asks for the bare page with __xenia_bare__" do
      assigns = %{
        __xenia_bare__: true,
        socket: socket(Xenia.PageTest.StandalonePage),
        user: "ann"
      }

      assert assigns |> Xenia.Page.__render__(page_html(assigns)) |> rendered_to_string() =~
               "<p>page ann</p>"
    end

    # The regression the demo found: with __changed__ from the page's
    # assigns, a frame skipped @inner_content, and kept showing the old page.
    test "the frame redraws the page even when change tracking is on" do
      tracked = socket(Xenia.PageTest.StandalonePage, %{__changed__: %{user: true}})
      assert render(tracked) =~ "<p>page ann</p>"
    end
  end

  # --- on_mount ---------------------------------------------------------------

  describe "layouts' on_mount" do
    test "hooks run outermost first" do
      assert {:cont, socket} =
               Xenia.Page.on_mount(:layouts, %{}, %{}, socket(Xenia.PageTest.StandalonePage))

      assert socket.assigns.trail == [:inner, :outer]
    end

    test "a halting hook stops the chain" do
      assert {:halt, socket} =
               Xenia.Page.on_mount(:layouts, %{}, %{}, socket(Xenia.PageTest.HaltingPage))

      refute Map.has_key?(socket.assigns, :trail)
    end

    test "a page without layouts mounts untouched" do
      socket = socket(Xenia.PageTest.HandWritten)
      assert {:cont, ^socket} = Xenia.Page.on_mount(:layouts, %{}, %{}, socket)
    end

    test "a hook returning something else is a clear error" do
      assert_raise ArgumentError, ~r/must return \{:cont, socket\} or \{:halt, socket\}/, fn ->
        Xenia.Page.on_mount(:layouts, %{}, %{}, socket(Xenia.PageTest.BrokenPage))
      end
    end
  end

  # --- Xenia.Live -------------------------------------------------------------

  defmodule ProfilePage do
    use Phoenix.Component
    def render(assigns), do: ~H"<h2>{@name}, bare: {inspect(@__xenia_bare__)}</h2>"
  end

  test "Xenia.Live.page/1 renders the live action's page, bare" do
    html = rendered_to_string(Xenia.Live.page(%{live_action: ProfilePage, name: "Ann"}))
    assert html == "<h2>Ann, bare: true</h2>"
  end

  test "Xenia.Live.page/1 explains a missing live action" do
    assert_raise ArgumentError, ~r/live action to be a page module, got: nil/, fn ->
      Xenia.Live.page(%{live_action: nil})
    end
  end

  # --- Xenia.Persistent -------------------------------------------------------

  defmodule ShellLive do
    use Phoenix.LiveView
    use Xenia.Persistent

    def handle_navigation(uri, socket), do: {:noreply, assign(socket, :path, URI.parse(uri).path)}
    def render(assigns), do: ~H"<nav>{@path}</nav>"
  end

  defmodule SilentLive do
    use Phoenix.LiveView
    use Xenia.Persistent

    def render(assigns), do: ~H"<nav></nav>"
  end

  describe "Xenia.Persistent" do
    test "navigation events reach handle_navigation, and stop there" do
      socket = %Socket{view: ShellLive, assigns: %{__changed__: %{}}}

      assert {:halt, socket} =
               Xenia.Persistent.__navigation__(
                 "xenia:navigate",
                 %{"href" => "http://x/app/a?b=1"},
                 socket
               )

      assert socket.assigns.path == "/app/a"
    end

    test "without handle_navigation, navigation events are dropped" do
      socket = %Socket{view: SilentLive, assigns: %{__changed__: %{}}}

      assert {:halt, ^socket} =
               Xenia.Persistent.__navigation__("xenia:navigate", %{"href" => "/"}, socket)
    end

    test "other events continue to the LiveView" do
      socket = %Socket{view: ShellLive}
      assert {:cont, ^socket} = Xenia.Persistent.__navigation__("click", %{}, socket)
    end

    test "its render adds the hidden element the navigation hook runs on" do
      assigns = %{socket: %Socket{id: "xenia-persistent-shell"}, __changed__: nil}

      html =
        assigns
        |> Xenia.Persistent.__render__(ShellLive.render(Map.put(assigns, :path, "/x")))
        |> rendered_to_string()

      assert html =~
               ~s(<div id="xenia-persistent-shell-xenia-navigation" hidden phx-hook="XeniaNavigation"></div>)

      assert html =~ "<nav>/x</nav>"
    end
  end

  # --- Compile-time checks ----------------------------------------------------

  describe "use checks" do
    test "use Xenia.Page must come after use Phoenix.LiveView" do
      assert_raise ArgumentError, ~r/use Xenia.Page after `use Phoenix.LiveView`/, fn ->
        compile("use Xenia.Page\nuse Phoenix.LiveView\ndef render(assigns), do: ~H\"\"")
      end
    end

    test "a page needs render/1" do
      assert_raise ArgumentError, ~r/uses Xenia.Page but defines no render\/1/, fn ->
        compile("use Phoenix.LiveView\nuse Xenia.Page")
      end
    end

    test "a persistent part needs render/1" do
      assert_raise ArgumentError, ~r/uses Xenia.Persistent but defines no render\/1/, fn ->
        compile("use Phoenix.LiveView\nuse Xenia.Persistent")
      end
    end

    test "Xenia.Live without render/1 renders the current page" do
      module = compile("use Phoenix.LiveView\nuse Xenia.Live")
      assert function_exported?(module, :render, 1)
    end
  end

  defp compile(body) do
    name = "Xenia.PageTest.Compiled#{System.unique_integer([:positive])}"
    [{module, _}] = Code.compile_string("defmodule #{name} do\n#{body}\nend")
    module
  end
end
