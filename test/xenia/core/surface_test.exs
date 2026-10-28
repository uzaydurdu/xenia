defmodule Xenia.SurfaceTest do
  @moduledoc """
  Islands in a Surface UI app: `<.xenia>`, a declared tag and the slots,
  called from Surface's `~F` templates, and `colocated/1` refused in a
  Surface module (LiveView's ColocatedHook runs only in HEEx). Surface is a
  test-only dependency.
  """

  use ExUnit.Case, async: true
  use Surface.LiveViewTest

  defmodule Islands do
    use Xenia.Components

    component :gauge, adapter: "Gauge" do
      prop :value, :integer, required: true
      event :change
    end
  end

  defmodule Card do
    use Surface.Component
    import Xenia.Component
    import Islands

    prop count, :integer, default: 0

    def render(assigns) do
      ~F"""
      <section>
        <.xenia id="counter" adapter="Counter" props={%{count: @count}} events={%{click: "clicked"}}>
          <:loading><span class="wait">Loading…</span></:loading>
          <:error>It broke. <button type="button" data-xenia-retry>Retry</button></:error>
        </.xenia>
        <.gauge id="gauge" value={@count} on_change="gauge_changed" />
        <.xenia id="clock" adapter="Xenia.SurfaceTest.Card#default" props={%{label: "one"}} />
      </section>
      """
    end
  end

  defp container(html, id) do
    html |> LazyHTML.from_fragment() |> LazyHTML.query("##{id}")
  end

  defp attribute(node, name), do: node |> LazyHTML.attribute(name) |> List.first()

  test "<.xenia> in ~F renders the island's container, props, events and slot" do
    html =
      render_surface do
        ~F"""
        <Card count={3} />
        """
      end

    counter = container(html, "counter")
    assert attribute(counter, "phx-hook") == "Counter"
    assert attribute(counter, "phx-update") == "ignore"
    assert Jason.decode!(attribute(counter, "data-xenia-props")) == %{"count" => 3}
    assert Jason.decode!(attribute(counter, "data-xenia-events")) == %{"click" => "clicked"}
    assert counter |> LazyHTML.query("[data-xenia-loading] .wait") |> Enum.count() == 1
    assert html =~ ~r/<template data-xenia-error[^>]*>.*It broke\./s
  end

  test "a declared tag in ~F takes its props and on_* events" do
    html =
      render_surface do
        ~F"""
        <Card count={5} />
        """
      end

    gauge = container(html, "gauge")
    assert attribute(gauge, "phx-hook") == "Gauge"
    assert Jason.decode!(attribute(gauge, "data-xenia-props")) == %{"value" => 5}
    assert Jason.decode!(attribute(gauge, "data-xenia-events")) == %{"change" => "gauge_changed"}
  end

  test "an adapter from a Surface .hooks.js file is named Module#export" do
    html =
      render_surface do
        ~F"""
        <Card />
        """
      end

    assert attribute(container(html, "clock"), "phx-hook") == "Xenia.SurfaceTest.Card#default"
  end

  test "colocated/1 in a Surface module explains the Surface way" do
    source = """
    defmodule Xenia.SurfaceTest.Colocated do
      use Surface.Component
      import Xenia.Component

      def render(assigns) do
        ~F\"\"\"
        <.xenia id="chart" adapter={colocated(".Chart")} />
        \"\"\"
      end
    end
    """

    error = assert_raise ArgumentError, fn -> Code.compile_string(source) end
    assert error.message =~ "a Surface module"
    assert error.message =~ ~s|adapter="Xenia.SurfaceTest.Colocated#default"|
    assert error.message =~ ".hooks.js"
  end

  test "colocated/1 still resolves in a HEEx module that imports Surface" do
    # `mix surface.init` adds `import Surface` to an app's :html modules.
    # (Unused here, so its warning is collected rather than printed.)
    {[{module, _}], _diagnostics} =
      Code.with_diagnostics([log: false], fn ->
        Code.compile_string("""
        defmodule Xenia.SurfaceTest.Heex do
          use Phoenix.Component
          import Surface
          import Xenia.Component

          def name, do: colocated(".Chart")
        end
        """)
      end)

    assert module.name() == "Xenia.SurfaceTest.Heex.Chart"
  end
end
