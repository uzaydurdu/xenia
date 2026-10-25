defmodule Xenia.ComponentsTest.Charts do
  # Fixture: components declared with the DSL, the way an app declares them.
  use Xenia.Components

  component :chart, adapter: "Chart", doc: "Renders a chart." do
    prop :type, :string, required: true
    prop :data, :map, default: %{}
    prop :title, :string
    event :click
    event :hover
  end

  # A component with no props or events at all.
  component :blank, adapter: "Blank" do
  end
end

defmodule Xenia.ComponentsTest.Forms do
  # Fixture: a form-enabled component. `form_value: :value` makes the
  # `value` prop the form field's value.
  use Xenia.Components

  component :rating, adapter: "Rating", form_value: :value do
    prop :value, :integer, default: 0
    prop :max, :integer, default: 5
    event :change
  end
end

defmodule Xenia.ComponentsTest do
  @moduledoc """
  Tests for the `Xenia.Components` declaration DSL (M4).

  A declaration has to do three things, and these tests check each:

    * generate a function component that renders the right container:
      declared props in `data-xenia-props`, bound `on_*` events in
      `data-xenia-events`, global attributes passed through;
    * carry real Phoenix `attr` declarations, so HEEx warns at compile time
      about a missing required prop or a misspelled attribute (the M4
      acceptance criterion);
    * reject declarations that can't work, at compile time, with an error
      that names the problem.

  Components declared with `form_value:` are also form fields (M5.5): they
  accept `field={@form[:name]}`, take their id and value from it, and render
  an invisible input that is submitted with the form.

  Rendering goes through `~H`, as a LiveView calls the component.
  """

  use ExUnit.Case, async: true

  import ExUnit.CaptureIO, only: [capture_io: 2]
  import Phoenix.Component, only: [sigil_H: 2, to_form: 2]
  import Phoenix.LiveViewTest, only: [rendered_to_string: 1, render_component: 2]

  alias Xenia.ComponentsTest.Charts
  alias Xenia.ComponentsTest.Forms

  defp find(html, id) do
    html |> LazyHTML.from_fragment() |> LazyHTML.query("##{id}")
  end

  defp attr(element, name) do
    case LazyHTML.attribute(element, name) do
      [value] -> value
      [] -> nil
    end
  end

  defp json_attr(element, name), do: element |> attr(name) |> Jason.decode!()

  # The form input inside a container. Server-side the container holds
  # nothing else (the adapter's DOM exists in the browser only). LazyHTML
  # doesn't support :scope, so this is a plain descendant query.
  defp form_input(element), do: LazyHTML.query(element, "input[data-xenia-field]")

  defp rating_form(rating), do: to_form(%{"rating" => rating}, as: :snippet)

  # Compiles `body` inside a fresh module that uses the DSL. Each call gets a
  # unique module name, so tests can't redefine each other's modules.
  defp compile!(body, preamble \\ "use Xenia.Components") do
    name = "Xenia.ComponentsTest.Generated#{System.unique_integer([:positive])}"

    Code.compile_string("""
    defmodule #{name} do
      #{preamble}

      #{body}
    end
    """)

    Module.concat([name])
  end

  describe "the generated component" do
    # One declaration is the only step to get a tag (M4 acceptance). The
    # tag renders the same container as <.xenia>, with the declared adapter.
    test "renders the container with the declared adapter" do
      assigns = %{}

      element =
        rendered_to_string(~H"""
        <Charts.chart id="sales" type="line" />
        """)
        |> find("sales")

      assert attr(element, "id") == "sales"
      assert attr(element, "phx-hook") == "Chart"
      assert attr(element, "phx-update") == "ignore"
      assert attr(element, "data-xenia-adapter") == "Chart"
    end

    # Declared props go to the adapter. A default counts as given; an
    # optional prop without a default that the page didn't pass is left out,
    # so the adapter sees "absent" rather than null.
    test "passes declared props, includes defaults, omits absent optional props" do
      assigns = %{}

      element =
        rendered_to_string(~H"""
        <Charts.chart id="sales" type="line" />
        """)
        |> find("sales")

      assert json_attr(element, "data-xenia-props") == %{"type" => "line", "data" => %{}}
    end

    test "passes every declared prop the page gives" do
      assigns = %{sales: %{"jan" => 3, "feb" => 5}}

      element =
        rendered_to_string(~H"""
        <Charts.chart id="sales" type="bar" data={@sales} title="Sales" />
        """)
        |> find("sales")

      assert json_attr(element, "data-xenia-props") == %{
               "type" => "bar",
               "data" => %{"jan" => 3, "feb" => 5},
               "title" => "Sales"
             }
    end

    # Global attributes are not props: they stay on the container and never
    # reach the adapter.
    test "global attributes go to the container, not into props" do
      assigns = %{}

      element =
        rendered_to_string(~H"""
        <Charts.chart id="sales" type="line" class="h-64" style="width: 100%" aria-label="Sales chart" />
        """)
        |> find("sales")

      assert attr(element, "class") == "h-64"
      assert attr(element, "style") == "width: 100%"
      assert attr(element, "aria-label") == "Sales chart"
      assert json_attr(element, "data-xenia-props") == %{"type" => "line", "data" => %{}}
    end

    # The reserved-attribute rule of <.xenia> still applies through the
    # generated component.
    test "reserved attributes still raise through the generated component" do
      assigns = %{}

      assert_raise ArgumentError, ~r/cannot override Xenia-managed attributes: phx-update/, fn ->
        rendered_to_string(~H"""
        <Charts.chart id="sales" type="line" phx-update="replace" />
        """)
      end
    end

    test "a component with no props or events renders empty objects" do
      assigns = %{}

      element =
        rendered_to_string(~H"""
        <Charts.blank id="b" />
        """)
        |> find("b")

      assert attr(element, "phx-hook") == "Blank"
      assert attr(element, "data-xenia-props") == "{}"
      assert attr(element, "data-xenia-events") == "{}"
    end
  end

  describe "events" do
    # The convention from CLAUDE.md §4: `event :click` becomes `on_click`,
    # and the page names the LiveView event.
    test "on_<event> maps the adapter event to the page's LiveView event" do
      assigns = %{}

      element =
        rendered_to_string(~H"""
        <Charts.chart id="sales" type="line" on_click="point_clicked" on_hover="point_hovered" />
        """)
        |> find("sales")

      assert json_attr(element, "data-xenia-events") == %{
               "click" => "point_clicked",
               "hover" => "point_hovered"
             }
    end

    # Unbound events are left out; the core drops events the page didn't
    # bind, so the two agree.
    test "unbound events are omitted" do
      assigns = %{}

      element =
        rendered_to_string(~H"""
        <Charts.chart id="sales" type="line" on_click="point_clicked" />
        """)
        |> find("sales")

      assert json_attr(element, "data-xenia-events") == %{"click" => "point_clicked"}
    end

    # Event bindings are not props: the adapter never sees `on_click`.
    test "on_* attributes never leak into props" do
      assigns = %{}

      element =
        rendered_to_string(~H"""
        <Charts.chart id="sales" type="line" on_click="point_clicked" />
        """)
        |> find("sales")

      refute Map.has_key?(json_attr(element, "data-xenia-props"), "on_click")
    end
  end

  describe "HEEx compile-time checking" do
    # The generated function carries real Phoenix attr declarations.
    test "the generated function declares id, each prop, each on_* and rest" do
      %{chart: %{attrs: attrs}} = Charts.__components__()
      by_name = Map.new(attrs, &{&1.name, &1})

      assert Enum.map(attrs, & &1.name) |> Enum.sort() ==
               Enum.sort([
                 :id,
                 :type,
                 :data,
                 :title,
                 :on_click,
                 :on_hover,
                 :shortcuts,
                 :on_crash,
                 :rest
               ])

      assert by_name.id.required
      assert by_name.type.required
      refute by_name.data.required
      assert by_name.data.opts[:default] == %{}
      assert by_name.on_click.type == :string
      assert by_name.rest.type == :global
    end

    # The M4 acceptance criterion: a mistake in the tag is a compile-time
    # warning in the LiveView that uses it, not a silent bug in the browser.
    test "a missing required prop or a misspelled attribute warns at compile time" do
      warnings =
        capture_io(:stderr, fn ->
          compile!(
            """
            def render(assigns) do
              ~H\"""
              <Xenia.ComponentsTest.Charts.chart id="sales" tpye="line" />
              \"""
            end
            """,
            "use Phoenix.Component"
          )
        end)

      assert warnings =~ ~s(missing required attribute "type")
      assert warnings =~ ~s(undefined attribute "tpye")
    end

    # A real app declares components in a module that already uses
    # Phoenix.Component, next to its own function components.
    # `use Xenia.Components` must not set up Phoenix.Component a second time:
    # doing so defines Phoenix's verification callback twice, which warns,
    # and fails compilation under --warnings-as-errors.
    test "declarations work in a module that also uses Phoenix.Component, without warnings" do
      {module, warnings} =
        ExUnit.CaptureIO.with_io(:stderr, fn ->
          compile!(
            """
            use Xenia.Components

            attr :label, :string, required: true
            def badge(assigns), do: ~H"<span>{@label}</span>"

            component :gauge, adapter: "Gauge" do
              prop :value, :float, required: true
            end
            """,
            "use Phoenix.Component"
          )
        end)

      assert warnings == ""

      assert render_component(&module.badge/1, label: "ok") =~ "<span>ok</span>"

      gauge = render_component(&module.gauge/1, id: "g", value: 0.5) |> find("g")
      assert attr(gauge, "phx-hook") == "Gauge"
      assert json_attr(gauge, "data-xenia-props") == %{"value" => 0.5}
    end
  end

  describe "keyboard shortcuts" do
    test "every declared tag takes shortcuts and renders them normalized" do
      chart =
        render_component(&Xenia.ComponentsTest.Charts.chart/1,
          id: "c",
          type: "bar",
          shortcuts: %{"Mod + S" => "save"}
        )
        |> find("c")

      assert json_attr(chart, "data-xenia-shortcuts") == %{"mod+s" => "save"}
    end

    test "a prop can't be called shortcuts" do
      assert_raise ArgumentError, ~r/uses reserved attribute names: \[:shortcuts\]/, fn ->
        compile!(~s|component :c, adapter: "C" do\n  prop :shortcuts, :map\nend|)
      end
    end
  end

  describe "co-located adapters (M10)" do
    # The <script :type={ColocatedHook} name=".Chart"> in a module becomes the
    # hook "<Module>.Chart". The declaration resolves ".Chart" the same way,
    # at compile time, because the generated tag renders <.xenia> at runtime.
    test "adapter: \".Chart\" becomes the module-qualified hook name" do
      module = compile!(~s|component :chart, adapter: ".Chart" do\n  prop :data, :map\nend|)

      chart = render_component(&module.chart/1, id: "c", data: %{}) |> find("c")
      assert attr(chart, "phx-hook") == "#{inspect(module)}.Chart"
      assert attr(chart, "data-xenia-adapter") == "#{inspect(module)}.Chart"
    end

    test "an invalid co-located name raises at compile time" do
      assert_raise ArgumentError, ~r/a dot and a name without spaces/, fn ->
        compile!(~s|component :c, adapter: "." do\nend|)
      end

      assert_raise ArgumentError, ~r/a dot and a name without spaces/, fn ->
        compile!(~s|component :c, adapter: ".My Chart" do\nend|)
      end
    end
  end

  describe "invalid declarations raise at compile time" do
    test "the adapter option is required, non-empty and a literal string" do
      assert_raise ArgumentError, ~r/missing the required :adapter option/, fn ->
        compile!(~s|component :c, [] do\nend|)
      end

      assert_raise ArgumentError, ~r/adapter for Xenia component :c must not be empty/, fn ->
        compile!(~s|component :c, adapter: "  " do\nend|)
      end

      assert_raise ArgumentError, ~r/must be a literal string/, fn ->
        compile!(~s|component :c, adapter: String.upcase("x") do\nend|)
      end
    end

    test "unknown or repeated options are rejected" do
      assert_raise ArgumentError, ~r/unknown options for Xenia component :c: \[:hook\]/, fn ->
        compile!(~s|component :c, adapter: "C", hook: "C" do\nend|)
      end

      assert_raise ArgumentError,
                   ~r/duplicate options for Xenia component :c: \[:adapter\]/,
                   fn ->
                     compile!(~s|component :c, adapter: "C", adapter: "D" do\nend|)
                   end
    end

    # These names are generated by the DSL or used internally; declaring them
    # would silently replace Xenia's own attributes.
    test "reserved names can't be declared as props" do
      for name <- [:id, :rest, :adapter, :inner_block] do
        assert_raise ArgumentError, ~r/uses reserved attribute names: \[#{inspect(name)}\]/, fn ->
          compile!(~s|component :c, adapter: "C" do\n  prop #{inspect(name)}, :string\nend|)
        end
      end
    end

    test "the slot and crash names are Xenia's" do
      for name <- [:loading, :error, :on_crash] do
        assert_raise ArgumentError, ~r/uses reserved attribute names: \[#{inspect(name)}\]/, fn ->
          compile!(~s|component :c, adapter: "C" do\n  prop #{inspect(name)}, :string\nend|)
        end
      end

      # event :crash would generate on_crash.
      assert_raise ArgumentError, ~r/uses reserved attribute names: \[:on_crash\]/, fn ->
        compile!(~s|component :c, adapter: "C" do\n  event :crash\nend|)
      end
    end

    test "duplicate props, and a prop colliding with an event's on_* attribute, are rejected" do
      assert_raise ArgumentError, ~r/declares duplicate attributes: \[:data\]/, fn ->
        compile!(~s|component :c, adapter: "C" do\n  prop :data, :map\n  prop :data, :list\nend|)
      end

      assert_raise ArgumentError, ~r/declares duplicate attributes: \[:on_click\]/, fn ->
        compile!(
          ~s|component :c, adapter: "C" do\n  prop :on_click, :string\n  event :click\nend|
        )
      end
    end

    test "names must be lowercase identifiers" do
      assert_raise ArgumentError,
                   ~r/component name :Chart .* must be a lowercase identifier/,
                   fn ->
                     compile!(~s|component :Chart, adapter: "C" do\nend|)
                   end

      assert_raise ArgumentError,
                   ~r/prop name :"font-size" .* must be a lowercase identifier/,
                   fn ->
                     compile!(
                       ~s|component :c, adapter: "C" do\n  prop :"font-size", :integer\nend|
                     )
                   end

      assert_raise ArgumentError, ~r/event name :Click .* must be a lowercase identifier/, fn ->
        compile!(~s|component :c, adapter: "C" do\n  event :Click\nend|)
      end
    end

    # Only prop/2, prop/3 and event/1 belong in a declaration. Using
    # Phoenix's `attr` by habit must fail loudly, not be ignored.
    test "anything other than prop or event in the block is rejected" do
      assert_raise ArgumentError,
                   ~r/invalid declaration .* Expected prop\/2, prop\/3 or event\/1/,
                   fn ->
                     compile!(~s|component :c, adapter: "C" do\n  attr :x, :string\nend|)
                   end
    end

    test "a doc that isn't a string is rejected" do
      assert_raise ArgumentError, ~r/doc for Xenia component :c must be a string/, fn ->
        compile!(~s|component :c, adapter: "C", doc: :nope do\nend|)
      end
    end

    # form_value must name a declared prop. A typo fails when the module
    # compiles, not later at render time.
    test "form_value naming an undeclared prop is rejected" do
      assert_raise ArgumentError, ~r/unknown/, fn ->
        compile!(
          ~s|component :c, adapter: "C", form_value: :unknown do\n  prop :value, :integer\nend|
        )
      end
    end
  end

  describe "form fields" do
    # <.rating field={@form[:rating]}> needs no id: the field provides one.
    test "the id comes from the field" do
      assigns = %{form: rating_form(4)}

      element =
        rendered_to_string(~H"""
        <Forms.rating field={@form[:rating]} />
        """)
        |> find("snippet_rating")

      assert attr(element, "id") == "snippet_rating"
      assert attr(element, "phx-hook") == "Rating"
    end

    # The field's value replaces the configured form_value prop, so the
    # adapter starts with what the form will submit. Other props keep their
    # declared defaults.
    test "the field's value becomes the adapter's value prop" do
      assigns = %{form: rating_form(4)}

      element =
        rendered_to_string(~H"""
        <Forms.rating field={@form[:rating]} />
        """)
        |> find("snippet_rating")

      assert json_attr(element, "data-xenia-props") == %{"value" => 4, "max" => 5}
    end

    # The form input carries the field's name, so the value arrives as
    # params["snippet"]["rating"].
    test "a form input carries the field's name and value" do
      assigns = %{form: rating_form(4)}

      input =
        rendered_to_string(~H"""
        <Forms.rating field={@form[:rating]} />
        """)
        |> find("snippet_rating")
        |> form_input()

      assert LazyHTML.tag(input) == ["input"]
      assert attr(input, "name") == "snippet[rating]"
      assert attr(input, "value") == "4"
    end

    # Without a form the component works exactly as before: an explicit id,
    # an explicit value, and no form input.
    test "still works without a form" do
      assigns = %{}

      element =
        rendered_to_string(~H"""
        <Forms.rating id="rating" value={3} />
        """)
        |> find("rating")

      assert attr(element, "id") == "rating"
      assert json_attr(element, "data-xenia-props") == %{"value" => 3, "max" => 5}
      assert Enum.count(form_input(element)) == 0
    end

    # The field attribute only exists on form-enabled components: Charts
    # declares no form_value, so its generated attrs stay unchanged.
    test "only components with form_value accept a field" do
      %{rating: %{attrs: rating_attrs}} = Forms.__components__()
      %{chart: %{attrs: chart_attrs}} = Charts.__components__()

      assert :field in Enum.map(rating_attrs, & &1.name)
      refute :field in Enum.map(chart_attrs, & &1.name)
    end
  end

  describe "loading and error slots" do
    test "a declared component passes both slots and on_crash to the container" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Charts.chart id="sales" type="bar" on_crash="chart_crashed">
          <:loading>Loading the chart…</:loading>
          <:error>No chart. <button data-xenia-retry>Retry</button></:error>
        </Charts.chart>
        """)

      element = html |> LazyHTML.from_fragment() |> LazyHTML.query("#sales")

      assert LazyHTML.attribute(element, "data-xenia-crash") == ["chart_crashed"]

      assert LazyHTML.text(LazyHTML.query(element, "[data-xenia-loading]")) =~
               "Loading the chart…"

      assert html =~ ~r/<template data-xenia-error>No chart\./
    end

    test "a form field keeps its input next to the slots" do
      assigns = %{form: to_form(%{"value" => "3"}, as: :review)}

      doc =
        rendered_to_string(~H"""
        <Forms.rating field={@form[:value]}>
          <:loading>…</:loading>
        </Forms.rating>
        """)
        |> LazyHTML.from_fragment()

      assert Enum.count(LazyHTML.query(doc, "#review_value > input[data-xenia-field]")) == 1
      assert Enum.count(LazyHTML.query(doc, "#review_value > [data-xenia-loading]")) == 1
    end
  end
end
