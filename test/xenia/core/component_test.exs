defmodule Xenia.ComponentTest do
  @moduledoc """
  Tests for `Xenia.Component.xenia/1`, the container a LiveView renders for a
  Xenia adapter.

  LiveViewTest never runs JavaScript, so these tests check what the server
  renders: the attributes the JS core reads (`data-xenia-props`,
  `data-xenia-events`), the LiveView bindings that attach the hook, and the
  ownership rules from CLAUDE.md §4 (which attributes pass through, which are
  reserved).

  The component is rendered through `~H`, exactly as a LiveView calls it, so
  `attr` defaults and the `:global` attribute collection behave as in an app.
  The rendered HTML is parsed with LazyHTML rather than matched as a string.
  """

  use ExUnit.Case, async: true

  import Phoenix.Component, only: [sigil_H: 2]
  import Phoenix.LiveViewTest, only: [rendered_to_string: 1]
  import Xenia.Component

  # Returns the element with `id` from rendered HTML.
  defp find(html, id \\ "editor") do
    html |> LazyHTML.from_fragment() |> LazyHTML.query("##{id}")
  end

  # Returns one attribute's value, or nil when the attribute is absent.
  defp attr(element, name) do
    case LazyHTML.attribute(element, name) do
      [value] -> value
      [] -> nil
    end
  end

  describe "the container" do
    # The JS core finds the container by its hook and owns everything inside
    # it, so the server renders exactly one empty element.
    test "is one empty div with the id, the hook and phx-update=ignore" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <.xenia id="editor" adapter="Monaco" />
        """)

      element = find(html)

      assert Enum.count(element) == 1
      assert attr(element, "id") == "editor"
      assert attr(element, "phx-hook") == "Monaco"
      assert attr(element, "phx-update") == "ignore"

      # The JS core checks this name against createHooks() and reports an
      # adapter that was never registered (M4 todo 5).
      assert attr(element, "data-xenia-adapter") == "Monaco"

      # The core appends its own mount element; nothing server-rendered may
      # sit next to it.
      # (child_nodes, not query("*"): LazyHTML's query matches the element itself.)
      assert element
             |> LazyHTML.child_nodes()
             |> LazyHTML.tag()
             |> Enum.empty?()
    end

    # The core always reads both attributes. Rendering "{}" rather than
    # omitting them keeps the markup predictable.
    test "props and events default to empty JSON objects" do
      assigns = %{}

      element =
        rendered_to_string(~H"""
        <.xenia id="editor" adapter="Monaco" />
        """)
        |> find()

      assert attr(element, "data-xenia-props") == "{}"
      assert attr(element, "data-xenia-events") == "{}"
    end

    # Props travel as one JSON object (CLAUDE.md §6). Nested maps, lists and
    # nil must survive, and so must characters that HTML attributes escape:
    # the core JSON.parses the attribute value exactly as the browser decodes it.
    test "props are JSON-encoded, including nested values and escaped characters" do
      assigns = %{
        props: %{
          value: %{value: ~s(say "hi" <b>bold</b> & 'quote'\nnext line), version: nil},
          language: "elixir",
          options: %{minimap: %{enabled: false}, fontSize: 14},
          tags: ["a", 1, true]
        }
      }

      element =
        rendered_to_string(~H"""
        <.xenia id="editor" adapter="Monaco" props={@props} />
        """)
        |> find()

      assert Jason.decode!(attr(element, "data-xenia-props")) == %{
               "value" => %{
                 "value" => ~s(say "hi" <b>bold</b> & 'quote'\nnext line),
                 "version" => nil
               },
               "language" => "elixir",
               "options" => %{"minimap" => %{"enabled" => false}, "fontSize" => 14},
               "tags" => ["a", 1, true]
             }
    end

    # The page, not the adapter, names the LiveView events (CLAUDE.md §4 Events).
    test "events map adapter event names to LiveView event names" do
      assigns = %{}

      element =
        rendered_to_string(~H"""
        <.xenia id="editor" adapter="Monaco" events={%{change: "code_changed", save: "saved"}} />
        """)
        |> find()

      assert Jason.decode!(attr(element, "data-xenia-events")) == %{
               "change" => "code_changed",
               "save" => "saved"
             }
    end

    # The Tier 1 test (CLAUDE.md §10): the component contains no
    # adapter-specific code, so a library Xenia has never heard of renders the
    # same way as Monaco.
    test "works the same for an adapter Xenia has never heard of" do
      assigns = %{}

      element =
        rendered_to_string(~H"""
        <.xenia id="progress" adapter="ProgressBar" props={%{value: 0.5, color: "red"}} />
        """)
        |> find("progress")

      assert attr(element, "phx-hook") == "ProgressBar"

      assert Jason.decode!(attr(element, "data-xenia-props")) == %{
               "value" => 0.5,
               "color" => "red"
             }
    end
  end

  describe "attribute passthrough" do
    # CLAUDE.md §4: global attributes and LiveView bindings go on the container.
    test "class, style, role, aria-*, other data-* and phx-click reach the container" do
      assigns = %{}

      element =
        rendered_to_string(~H"""
        <.xenia
          id="editor"
          adapter="Monaco"
          class="h-96 rounded"
          style="height: 400px"
          role="region"
          aria-label="Code editor"
          data-testid="code-editor"
          phx-click="editor_clicked"
        />
        """)
        |> find()

      assert attr(element, "class") == "h-96 rounded"
      assert attr(element, "style") == "height: 400px"
      assert attr(element, "role") == "region"
      assert attr(element, "aria-label") == "Code editor"
      assert attr(element, "data-testid") == "code-editor"
      assert attr(element, "phx-click") == "editor_clicked"
    end
  end

  describe "reserved attributes" do
    # Overriding any of these silently breaks the component: a different
    # phx-update lets LiveView patch the library's DOM, and data-xenia-*
    # collides with what the core reads. Raising tells the developer at once.
    test "phx-hook and phx-update can't be overridden" do
      assigns = %{}

      assert_raise ArgumentError,
                   ~r/"editor" cannot override Xenia-managed attributes: phx-hook/,
                   fn ->
                     rendered_to_string(~H"""
                     <.xenia id="editor" adapter="Monaco" phx-hook="Other" />
                     """)
                   end

      assert_raise ArgumentError, ~r/cannot override Xenia-managed attributes: phx-update/, fn ->
        rendered_to_string(~H"""
        <.xenia id="editor" adapter="Monaco" phx-update="replace" />
        """)
      end
    end

    test "the whole data-xenia-* namespace is reserved" do
      assigns = %{}

      assert_raise ArgumentError,
                   ~r/cannot override Xenia-managed attributes: data-xenia-props/,
                   fn ->
                     rendered_to_string(~H"""
                     <.xenia id="editor" adapter="Monaco" data-xenia-props="{}" />
                     """)
                   end

      assert_raise ArgumentError,
                   ~r/cannot override Xenia-managed attributes: data-xenia-events/,
                   fn ->
                     rendered_to_string(~H"""
                     <.xenia id="editor" adapter="Monaco" data-xenia-events="{}" />
                     """)
                   end

      # Not only today's two names: future data-xenia-* attributes are covered.
      assert_raise ArgumentError,
                   ~r/cannot override Xenia-managed attributes: data-xenia-anything/,
                   fn ->
                     rendered_to_string(~H"""
                     <.xenia id="editor" adapter="Monaco" data-xenia-anything="x" />
                     """)
                   end
    end
  end

  describe "invalid input" do
    # The id names the command channel ("xenia:command:<id>") and keys global
    # resources such as Monaco models, so it must be a usable HTML id.
    test "an empty id or one with whitespace raises" do
      assigns = %{}

      assert_raise ArgumentError, ~r/id must be a non-empty string without whitespace/, fn ->
        rendered_to_string(~H"""
        <.xenia id="" adapter="Monaco" />
        """)
      end

      assert_raise ArgumentError, ~r/id must be a non-empty string without whitespace/, fn ->
        rendered_to_string(~H"""
        <.xenia id="my editor" adapter="Monaco" />
        """)
      end
    end

    # The adapter name must match a key in createHooks(); a blank one never can.
    test "a blank adapter name raises" do
      assigns = %{}

      assert_raise ArgumentError,
                   ~r/adapter for component "editor" must be a non-empty string/,
                   fn ->
                     rendered_to_string(~H"""
                     <.xenia id="editor" adapter="  " />
                     """)
                   end
    end

    # The core expects both attributes to decode to JSON objects. The values
    # come from assigns so the compiler can't catch them; the component must.
    test "props or events that aren't maps raise" do
      assigns = %{props: [1, 2], events: "change"}

      assert_raise ArgumentError, ~r/props for component "editor" must be a map/, fn ->
        rendered_to_string(~H"""
        <.xenia id="editor" adapter="Monaco" props={@props} />
        """)
      end

      assert_raise ArgumentError, ~r/events for component "editor" must be a map/, fn ->
        rendered_to_string(~H"""
        <.xenia id="editor" adapter="Monaco" events={@events} />
        """)
      end
    end

    # Functions, pids and tuples can't travel to the browser. The error names
    # the attribute and the component, so it can be found in a large LiveView.
    test "props that can't be JSON-encoded raise, naming the component" do
      assigns = %{props: %{owner: self()}}

      assert_raise ArgumentError,
                   ~r/props for component "editor" could not be JSON-encoded/,
                   fn ->
                     rendered_to_string(~H"""
                     <.xenia id="editor" adapter="Monaco" props={@props} />
                     """)
                   end
    end
  end

  describe "keyboard shortcuts" do
    test "are rendered as data-xenia-shortcuts, normalized" do
      assigns = %{}

      element =
        ~H"""
        <.xenia id="editor" adapter="Monaco" shortcuts={%{"Shift+Mod+S" => "save", "esc" => "close"}} />
        """
        |> rendered_to_string()
        |> find()

      assert Jason.decode!(attr(element, "data-xenia-shortcuts")) ==
               %{"mod+shift+s" => "save", "escape" => "close"}
    end

    test "without shortcuts, there is no attribute" do
      assigns = %{}
      element = ~H|<.xenia id="editor" adapter="Monaco" />| |> rendered_to_string() |> find()
      assert attr(element, "data-xenia-shortcuts") == nil
    end

    test "a browser shortcut raises" do
      assigns = %{}

      assert_raise ArgumentError, ~r/"mod\+=" on component "editor" is a browser shortcut/, fn ->
        rendered_to_string(
          ~H|<.xenia id="editor" adapter="Monaco" shortcuts={%{"mod+=" => "zoom"}} />|
        )
      end
    end

    test "data-xenia-shortcuts is Xenia's: passing it raises" do
      assigns = %{}

      assert_raise ArgumentError, ~r/data-xenia-shortcuts/, fn ->
        rendered_to_string(~H|<.xenia id="editor" adapter="Monaco" data-xenia-shortcuts="{}" />|)
      end
    end
  end

  describe "co-located adapters (M10)" do
    # Expanded here, in this module, like a page's template would.
    test "colocated/1 resolves to the hook name LiveView gives this module's script" do
      assert colocated(".Chart") == "Xenia.ComponentTest.Chart"
    end

    test "<.xenia> renders the resolved name as the hook" do
      assigns = %{}

      element =
        ~H"""
        <.xenia id="editor" adapter={colocated(".Chart")} />
        """
        |> rendered_to_string()
        |> find()

      assert attr(element, "phx-hook") == "Xenia.ComponentTest.Chart"
      assert attr(element, "data-xenia-adapter") == "Xenia.ComponentTest.Chart"
    end

    # <.xenia> runs at render time and can't know the calling module, so a
    # bare ".Chart" would render a hook name that never matches.
    test "a bare \".Chart\" raises, pointing at colocated/1" do
      assigns = %{}

      assert_raise ArgumentError,
                   ~r/is a co-located name.*adapter=\{colocated\("\.Chart"\)\}/s,
                   fn ->
                     rendered_to_string(~H"""
                     <.xenia id="editor" adapter=".Chart" />
                     """)
                   end
    end

    test "colocated/1 checks its argument at compile time" do
      compile = fn code ->
        Code.compile_string("""
        defmodule Xenia.ComponentTest.Colocated#{System.unique_integer([:positive])} do
          import Xenia.Component
          def name, do: #{code}
        end
        """)
      end

      assert_raise ArgumentError, ~r/starts with a dot.*write adapter="Chart" instead/s, fn ->
        compile.(~s|colocated("Chart")|)
      end

      assert_raise ArgumentError, ~r/expects a literal string/, fn ->
        compile.(~s|colocated(Enum.join([".", "Chart"]))|)
      end

      assert_raise ArgumentError, ~r/without spaces or more dots/, fn ->
        compile.(~s|colocated(".Charts.Bar")|)
      end
    end
  end

  describe "the call element" do
    # ctx.call pushes from a hidden XeniaCall hook inside the container, so
    # LiveView locks it instead of the container (CLAUDE.md §6, M5 findings).
    test "is rendered when the page binds an event" do
      assigns = %{}

      doc =
        rendered_to_string(~H"""
        <.xenia id="picker" adapter="TomSelect" events={%{search: "search_countries"}} />
        """)
        |> LazyHTML.from_fragment()

      span = LazyHTML.query(doc, "#picker > span[data-xenia-call]")
      assert LazyHTML.attribute(span, "id") == ["picker-xenia-call"]
      assert LazyHTML.attribute(span, "phx-hook") == ["XeniaCall"]
      assert LazyHTML.attribute(span, "hidden") == [""]
    end

    test "is left out when nothing is bound, since a call needs a binding" do
      assigns = %{}

      doc =
        rendered_to_string(~H"""
        <.xenia id="picker" adapter="TomSelect" />
        """)
        |> LazyHTML.from_fragment()

      assert Enum.count(LazyHTML.query(doc, "[data-xenia-call]")) == 0
    end
  end

  describe "loading and error slots" do
    test "<:loading> renders inside the container, <:error> as an inert template" do
      assigns = %{}

      doc =
        rendered_to_string(~H"""
        <.xenia id="editor" adapter="Monaco" style="height: 300px">
          <:loading><p class="skeleton">Loading the editor…</p></:loading>
          <:error>It broke. <button data-xenia-retry>Try again</button></:error>
        </.xenia>
        """)
        |> LazyHTML.from_fragment()

      loading = LazyHTML.query(doc, "#editor > [data-xenia-loading]")
      assert LazyHTML.text(loading) =~ "Loading the editor…"
      assert Enum.count(LazyHTML.query(loading, "p.skeleton")) == 1

      template = LazyHTML.query(doc, "#editor > template[data-xenia-error]")
      assert Enum.count(template) == 1
      assert LazyHTML.to_html(template) =~ "data-xenia-retry"
    end

    test "on_crash names the LiveView event; absent unless given" do
      assigns = %{}

      with_event =
        rendered_to_string(~H"""
        <.xenia id="editor" adapter="Monaco" on_crash="editor_crashed" />
        """)
        |> find()

      without =
        rendered_to_string(~H"""
        <.xenia id="editor" adapter="Monaco" />
        """)
        |> find()

      assert attr(with_event, "data-xenia-crash") == "editor_crashed"
      assert attr(without, "data-xenia-crash") == nil
    end

    test "a blank on_crash raises" do
      assigns = %{}

      assert_raise ArgumentError,
                   ~r/on_crash for component "editor" must be a LiveView event/,
                   fn ->
                     rendered_to_string(~H"""
                     <.xenia id="editor" adapter="Monaco" on_crash=" " />
                     """)
                   end
    end

    test "data-xenia-crash is Xenia's, so it can't be passed through" do
      assigns = %{}

      assert_raise ArgumentError,
                   ~r/cannot override Xenia-managed attributes: data-xenia-crash/,
                   fn ->
                     rendered_to_string(~H"""
                     <.xenia id="editor" adapter="Monaco" data-xenia-crash="x" />
                     """)
                   end
    end
  end
end

defmodule Xenia.ComponentBindingPrefixTest do
  @moduledoc """
  Tests for the configurable binding prefix (CLAUDE.md §11: never hardcode
  `phx-`). Popcorn's Local LiveView uses `pop-` (§7).

  These change application config, which is global, so they don't run async.
  """

  use ExUnit.Case, async: false

  import Phoenix.Component, only: [sigil_H: 2]
  import Phoenix.LiveViewTest, only: [rendered_to_string: 1]
  import Xenia.Component

  setup do
    previous = Application.fetch_env(:xenia, :binding_prefix)

    on_exit(fn ->
      case previous do
        {:ok, value} -> Application.put_env(:xenia, :binding_prefix, value)
        :error -> Application.delete_env(:xenia, :binding_prefix)
      end
    end)
  end

  defp render_editor do
    assigns = %{}

    rendered_to_string(~H"""
    <.xenia id="editor" adapter="Monaco" props={%{language: "elixir"}} />
    """)
    |> LazyHTML.from_fragment()
    |> LazyHTML.query("#editor")
  end

  defp attr(element, name) do
    case LazyHTML.attribute(element, name) do
      [value] -> value
      [] -> nil
    end
  end

  test "without config, the prefix is phx-" do
    Application.delete_env(:xenia, :binding_prefix)

    element = render_editor()

    assert attr(element, "phx-hook") == "Monaco"
    assert attr(element, "phx-update") == "ignore"
  end

  # The M3 acceptance criterion: changing the configured prefix changes the
  # rendered attributes. Only LiveView's bindings are prefixed; data-xenia-*
  # belongs to Xenia and stays the same.
  test "a configured prefix changes the rendered bindings, not data-xenia-*" do
    Application.put_env(:xenia, :binding_prefix, "pop-")

    element = render_editor()

    assert attr(element, "pop-hook") == "Monaco"
    assert attr(element, "pop-update") == "ignore"
    # data-xenia-* belongs to Xenia, so the adapter name isn't prefixed either.
    assert attr(element, "data-xenia-adapter") == "Monaco"
    assert attr(element, "phx-hook") == nil
    assert attr(element, "phx-update") == nil
    assert Jason.decode!(attr(element, "data-xenia-props")) == %{"language" => "elixir"}
    assert attr(element, "data-xenia-events") == "{}"
  end

  test "the call element's hook uses the configured prefix too" do
    Application.put_env(:xenia, :binding_prefix, "pop-")
    assigns = %{}

    span =
      rendered_to_string(~H"""
      <.xenia id="picker" adapter="TomSelect" events={%{search: "search"}} />
      """)
      |> LazyHTML.from_fragment()
      |> LazyHTML.query("#picker > [data-xenia-call]")

    assert LazyHTML.attribute(span, "pop-hook") == ["XeniaCall"]
    assert LazyHTML.attribute(span, "phx-hook") == []
  end

  # phx-update stays reserved under another prefix: passing it would still be
  # a mistake, even though LiveView wouldn't read it.
  test "phx-update stays reserved with a custom prefix" do
    Application.put_env(:xenia, :binding_prefix, "pop-")
    assigns = %{}

    assert_raise ArgumentError, ~r/cannot override Xenia-managed attributes: phx-update/, fn ->
      rendered_to_string(~H"""
      <.xenia id="editor" adapter="Monaco" phx-update="replace" />
      """)
    end
  end

  # A misconfigured prefix fails loudly at render time instead of producing
  # attributes LiveView silently ignores.
  test "an empty or non-string prefix raises" do
    for invalid <- ["", :pop, nil] do
      Application.put_env(:xenia, :binding_prefix, invalid)

      assert_raise ArgumentError, ~r/:binding_prefix must be a non-empty string/, fn ->
        render_editor()
      end
    end
  end

  # A text input with the `hidden` attribute, not type="hidden": LiveView
  # never reports a hidden-only field as unused, so `used_input?/1` would be
  # true at once and errors would show before the user touched the field
  # (CLAUDE.md §6, M5.5 findings). `data-xenia-field` is what the JS core
  # looks for.
  test "renders an invisible text input when a form field is provided" do
    assigns = %{
      form:
        Phoenix.Component.to_form(
          %{"code" => "IO.puts(:hello)"},
          as: :snippet
        )
    }

    html =
      rendered_to_string(~H"""
      <.xenia field={@form[:code]} adapter="Monaco" />
      """)

    element = LazyHTML.query_by_id(LazyHTML.from_fragment(html), "snippet_code")
    input = LazyHTML.query(element, "input[data-xenia-field]")

    assert LazyHTML.tag(input) == ["input"]
    assert LazyHTML.attribute(input, "type") == ["text"]
    assert LazyHTML.attribute(input, "hidden") == [""]
    assert LazyHTML.attribute(input, "autocomplete") == ["off"]
    assert LazyHTML.attribute(input, "name") == ["snippet[code]"]
    assert LazyHTML.attribute(input, "value") == ["IO.puts(:hello)"]
    assert Enum.count(LazyHTML.query(element, "input[type=hidden]")) == 0
  end
end
