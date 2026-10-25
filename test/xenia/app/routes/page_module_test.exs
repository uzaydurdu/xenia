defmodule Xenia.Routes.PageModuleTest do
  @moduledoc """
  Tests reading a page's module name from its source without evaluating it.
  """

  use ExUnit.Case, async: true

  alias Xenia.Routes.PageModule

  doctest PageModule

  test "reads the module of a typical page" do
    source = """
    defmodule MyAppWeb.RunbookDetailsPage do
      use Xenia.Page

      def render(assigns) do
        ~H\"""
        <h1>Runbook {@id}</h1>
        \"""
      end
    end
    """

    assert PageModule.from_source!(source) == MyAppWeb.RunbookDetailsPage
  end

  test "modules nested inside the page module are fine" do
    source = """
    defmodule MyAppWeb.HomePage do
      defmodule Form do
      end
    end
    """

    assert PageModule.from_source!(source) == MyAppWeb.HomePage
  end

  test "code around the module is allowed" do
    source = """
    alias MyAppWeb.Helpers
    defmodule MyAppWeb.HomePage do
    end
    """

    assert PageModule.from_source!(source) == MyAppWeb.HomePage
  end

  test "the file is not evaluated" do
    source = """
    send(self(), :evaluated)
    defmodule MyAppWeb.HomePage do
      send(self(), :evaluated)
    end
    """

    assert PageModule.from_source!(source) == MyAppWeb.HomePage
    refute_received :evaluated
  end

  test "a file without a module is rejected" do
    assert_raise ArgumentError, ~r/page.ex: a page file must define a module/, fn ->
      PageModule.from_source!("def oops, do: :ok", "page.ex")
    end
  end

  test "two top-level modules are rejected, naming both" do
    source = """
    defmodule MyAppWeb.A do end
    defmodule MyAppWeb.B do end
    """

    assert_raise ArgumentError,
                 ~r/exactly one top-level module, found: MyAppWeb.A, MyAppWeb.B/,
                 fn ->
                   PageModule.from_source!(source)
                 end
  end

  test "a name that isn't a literal alias is rejected" do
    assert_raise ArgumentError, ~r/literal name.*got: __MODULE__.Page/, fn ->
      PageModule.from_source!("defmodule __MODULE__.Page do end")
    end
  end

  test "syntax errors name the file" do
    assert_raise TokenMissingError, ~r/broken\/page.ex/, fn ->
      PageModule.from_source!("defmodule MyAppWeb.HomePage do", "broken/page.ex")
    end
  end

  @tag :tmp_dir
  test "resolve!/1 reads the file", %{tmp_dir: dir} do
    file = Path.join(dir, "page.ex")
    File.write!(file, "defmodule MyAppWeb.HomePage do end")

    assert PageModule.resolve!(file) == MyAppWeb.HomePage
  end
end
