defmodule Xenia.LayoutTest do
  @moduledoc """
  Tests `use Xenia.Layout`: the compile-time option checks, and the
  layout?/1, on_mount/1 and persistent_id/1 helpers. Parent layouts and
  persistent parts come from folders, see Xenia.Routes.DiscoveryTest.
  """

  use ExUnit.Case, async: true

  defmodule NotALayout do
  end

  defmodule PlainLayout do
    use Xenia.Layout

    def frame(assigns), do: ~H"<main>{@inner_content}</main>"
  end

  test "a layout without options has no on_mount hooks" do
    assert Xenia.Layout.layout?(PlainLayout)
    assert Xenia.Layout.on_mount(PlainLayout) == []
  end

  test "layout?/1 is false for other values" do
    refute Xenia.Layout.layout?(NotALayout)
    refute Xenia.Layout.layout?(NotAModule)
    refute Xenia.Layout.layout?("PlainLayout")
  end

  test "on_mount/1 raises for a module that isn't a layout" do
    assert_raise ArgumentError, ~r/is not a Xenia layout/, fn ->
      Xenia.Layout.on_mount(NotALayout)
    end
  end

  # A layout module that already uses Phoenix.Component (as `use MyAppWeb,
  # :html` does) and calls another component must compile without warnings:
  # using it twice warns, which fails --warnings-as-errors.
  test "a module that already uses Phoenix.Component compiles without warnings" do
    warnings =
      warnings(fn ->
        compile("""
        use Phoenix.Component
        use Xenia.Layout

        def frame(assigns), do: ~H"<.box>{@inner_content}</.box>"

        slot :inner_block
        def box(assigns), do: ~H"<div>{render_slot(@inner_block)}</div>"
        """)
      end)

    assert warnings == []
  end

  test "a layout without frame/1 warns at compile time" do
    assert [warning] = warnings(fn -> compile("use Xenia.Layout") end)
    assert warning =~ "required by behaviour Xenia.Layout"
    assert warning =~ "frame/1"
  end

  # The compiler's warnings for `fun`, collected without printing. Capturing
  # stderr instead would be global, and pick up other async tests' output.
  defp warnings(fun) do
    {_result, diagnostics} = Code.with_diagnostics([log: false], fun)
    for %{severity: :warning, message: message} <- diagnostics, do: message
  end

  test "parent: explains that layouts nest by folder" do
    assert_raise ArgumentError, ~r/no :parent option: layouts nest by folder/, fn ->
      compile("use Xenia.Layout, parent: Root")
    end
  end

  test "unknown options are rejected" do
    assert_raise ArgumentError, ~r/unknown keys \[:on_mout\]/, fn ->
      compile("use Xenia.Layout, on_mout: Guard")
    end
  end

  test "on_mount: hooks must be modules" do
    assert_raise ArgumentError, ~r/option :on_mount must be a module, got: "Guard"/, fn ->
      compile(~s(use Xenia.Layout, on_mount: "Guard"))
    end
  end

  defmodule Guard do
  end

  test "on_mount: takes a module, {module, arg} or a list, normalized like live_session's" do
    assert Xenia.Layout.on_mount(PlainLayout) == []

    {:module, one, _, _} =
      defmodule OneHook do
        use Xenia.Layout, on_mount: Xenia.LayoutTest.Guard
        def frame(assigns), do: ~H"{@inner_content}"
      end

    {:module, many, _, _} =
      defmodule ManyHooks do
        alias Xenia.LayoutTest.Guard
        use Xenia.Layout, on_mount: [Guard, {Guard, :admin}]
        def frame(assigns), do: ~H"{@inner_content}"
      end

    assert Xenia.Layout.on_mount(one) == [{Guard, :default}]
    assert Xenia.Layout.on_mount(many) == [{Guard, :default}, {Guard, :admin}]
  end

  test "persistent_id/1 is stable per layout and a valid DOM id" do
    assert Xenia.Layout.persistent_id(MyAppWeb.AuthLayout) ==
             "xenia-persistent-myappweb-authlayout"

    assert Xenia.Layout.persistent_id(PlainLayout) == Xenia.Layout.persistent_id(PlainLayout)
  end

  # The persistent part is the persistent.ex next to the layout.ex, found by
  # xenia_routes, like the layout itself.
  test "there is no persistent: option; the error points at persistent.ex" do
    assert_raise ArgumentError,
                 ~r/no :persistent option.*persistent\.ex next to this layout\.ex/s,
                 fn ->
                   compile("use Xenia.Layout, persistent: Xenia.LayoutTest.NotALayout")
                 end
  end

  defp compile(body) do
    name = "Xenia.LayoutTest.Compiled#{System.unique_integer([:positive])}"
    Code.compile_string("defmodule #{name} do\n#{body}\nend")
  end
end
