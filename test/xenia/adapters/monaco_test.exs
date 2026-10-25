defmodule Xenia.MonacoTest do
  @moduledoc """
  Tests for `Xenia.Adapters.Monaco.monaco/1`.

  The component is rendered to HTML with `render_component/2` and inspected
  with LazyHTML. Assertions check the rendered container rather than the
  internal assigns, since the container is what the JS controller reads:

    * hook attributes (`phx-hook`, `phx-update`) decide which adapter mounts;
    * `data-xenia-props` holds the props as JSON;
    * `data-xenia-events` maps adapter events to LiveView events as JSON.

  JSON attributes are decoded back into maps, so keys are strings in the
  assertions (`"value"`, not `:value`).

  Form field tests render through `~H` instead, exactly as a template calls
  `<.monaco field={@form[:code]} />`, because they need a real form field.
  """

  use ExUnit.Case, async: true

  import Phoenix.LiveViewTest
  import Phoenix.Component, only: [sigil_H: 2, to_form: 2]
  import Xenia.Adapters.Monaco, only: [monaco: 1]

  alias Xenia.Adapters.Monaco

  # Renders the component with `id: "editor"` unless another id is given,
  # and returns the container element. The query uses "#editor", so tests
  # that pass a different id need their own query.
  defp render_monaco(attrs \\ []) do
    # Add a default ID unless the test supplies one.
    attrs = Keyword.put_new(attrs, :id, "editor")

    # Render the Monaco component into HTML.
    html = render_component(&Monaco.monaco/1, attrs)

    # Parse the HTML and select the editor container.
    html
    |> LazyHTML.from_fragment()
    |> LazyHTML.query("#editor")
  end

  # Reads a JSON attribute from the element and decodes it into a map.
  # The single-element match also asserts that the attribute exists once.
  defp json_attribute(element, attribute) do
    [json] = LazyHTML.attribute(element, attribute)
    Phoenix.json_library().decode!(json)
  end

  defp props(element), do: json_attribute(element, "data-xenia-props")

  defp events(element), do: json_attribute(element, "data-xenia-events")

  # Renders <.monaco field={@form[:code]} ...> inside a ~H template, the way
  # an app calls it, and returns the container found by `id`. `id` and
  # `value` default to nil, which is the same as leaving them out.
  defp render_field(code, extra \\ %{}, id \\ "snippet_code") do
    assigns =
      Map.merge(
        %{form: to_form(%{"code" => code}, as: :snippet), id: nil, value: nil},
        extra
      )

    ~H"""
    <.monaco field={@form[:code]} id={@id} value={@value} language="elixir" />
    """
    |> rendered_to_string()
    |> LazyHTML.from_fragment()
    |> LazyHTML.query("##{id}")
  end

  # The form input inside the container. Server-side the container holds
  # nothing else (the adapter's DOM only exists in the browser), so any
  # input marked data-xenia-field is the one controller.js uses.
  defp form_input(element), do: LazyHTML.query(element, "input[data-xenia-field]")

  # ---------------------------------------------------------------------------
  # CONTAINER TEST CASES
  # The element LiveView owns: id, hook binding and pass-through attributes.
  # ---------------------------------------------------------------------------

  describe "container" do
    # The container carries the id, the default "Monaco" hook, and
    # phx-update="ignore" so LiveView never removes the editor's DOM.
    test "renders the Monaco hook by default" do
      element = render_monaco()

      assert LazyHTML.attribute(element, "id") == ["editor"]
      assert LazyHTML.attribute(element, "phx-hook") == ["Monaco"]
      assert LazyHTML.attribute(element, "phx-update") == ["ignore"]
    end

    # Apps that register the adapter under another name in createHooks()
    # can point the hook at it.
    test "supports a custom adapter registration name" do
      element = render_monaco(adapter: "CustomMonaco")

      assert LazyHTML.attribute(element, "phx-hook") == ["CustomMonaco"]
    end

    # Global attributes (class, style, aria-*, data-*) reach the container.
    test "passes through HTML attributes" do
      element =
        render_monaco(
          class: "editor",
          style: "height: 400px",
          "aria-label": "Code editor",
          "data-testid": "monaco-editor"
        )

      assert LazyHTML.attribute(element, "class") == ["editor"]
      assert LazyHTML.attribute(element, "style") == ["height: 400px"]
      assert LazyHTML.attribute(element, "aria-label") == ["Code editor"]
      assert LazyHTML.attribute(element, "data-testid") == ["monaco-editor"]
    end
  end

  # ---------------------------------------------------------------------------
  # VALUE AND VERSION TEST CASES
  # The editor content is sent as one versioned payload:
  # %{value, version, revision}.
  # ---------------------------------------------------------------------------

  describe "value and version" do
    # All three fields travel together, so the adapter can decide in one
    # step whether the value is an echo or must replace the content.
    test "wraps value, version and revision together" do
      element = render_monaco(value: "IO.puts(:hello)", version: 5, revision: 2)

      assert props(element)["value"] == %{
               "value" => "IO.puts(:hello)",
               "version" => 5,
               "revision" => 2
             }
    end

    # Without attrs: empty content, authoritative (nil version), revision 0.
    test "provides default values" do
      element = render_monaco()

      assert props(element)["value"] == %{
               "value" => "",
               "version" => nil,
               "revision" => 0
             }
    end

    # value={@code} with a nil assign must not send null to the adapter.
    test "normalizes nil value to an empty string" do
      element = render_monaco(value: nil)

      assert props(element)["value"]["value"] == ""
    end

    # Props are only dispatched when they change. Bumping revision must
    # change the payload even when value and version are identical, so the
    # server can force its value onto the editor.
    test "changing revision changes the serialized payload" do
      first = render_monaco(value: "server code", version: 5, revision: 0)
      second = render_monaco(value: "server code", version: 5, revision: 1)

      first_value = props(first)["value"]
      second_value = props(second)["value"]

      assert first_value["value"] == second_value["value"]
      assert first_value["version"] == second_value["version"]

      assert first_value["revision"] == 0
      assert second_value["revision"] == 1

      refute first_value == second_value
    end
  end

  # ---------------------------------------------------------------------------
  # MONACO PROPS TEST CASES
  # Language, theme and editor options, and which ones are omitted.
  # ---------------------------------------------------------------------------

  describe "Monaco props" do
    test "includes language and theme when provided" do
      element = render_monaco(language: "elixir", theme: "vs-dark")

      assert props(element)["language"] == "elixir"
      assert props(element)["theme"] == "vs-dark"
    end

    # Unset props are left out entirely rather than sent as null. For the
    # theme this matters most: Monaco themes are global, so sending one
    # would change every editor on the page.
    test "omits nil language and theme" do
      element = render_monaco(language: nil, theme: nil)

      refute Map.has_key?(props(element), "language")
      refute Map.has_key?(props(element), "theme")
    end

    # `theme` accepts any JSON value, e.g. a custom theme definition.
    test "supports a custom theme map" do
      theme = %{name: "custom-dark", base: "vs-dark"}

      element = render_monaco(theme: theme)

      assert props(element)["theme"] == %{
               "name" => "custom-dark",
               "base" => "vs-dark"
             }
    end

    # `themes` maps the app's theme (the "theme" provider) to Monaco themes,
    # so an app's own light and dark themes follow its theme toggle. Unlike
    # `theme`, it doesn't pin the editor.
    test "sends the themes map, with theme maps inside it" do
      themes = %{light: "vs", dark: %{name: "midnight", base: "vs-dark"}}

      element = render_monaco(themes: themes)

      assert props(element)["themes"] == %{
               "light" => "vs",
               "dark" => %{"name" => "midnight", "base" => "vs-dark"}
             }

      refute Map.has_key?(props(element), "theme"), "following the app, not pinned"
    end

    test "omits nil themes" do
      refute Map.has_key?(props(render_monaco(themes: nil)), "themes")
    end

    test "theme and themes can be given together" do
      element = render_monaco(theme: "hc-black", themes: %{dark: "vs-dark"})

      assert props(element)["theme"] == "hc-black"
      assert props(element)["themes"] == %{"dark" => "vs-dark"}
    end

    # Nested options are serialized unchanged, keeping Monaco's camelCase keys.
    test "passes editor options as JSON" do
      element =
        render_monaco(
          options: %{
            fontSize: 16,
            minimap: %{enabled: false},
            automaticLayout: true
          }
        )

      assert props(element)["options"] == %{
               "fontSize" => 16,
               "minimap" => %{"enabled" => false},
               "automaticLayout" => true
             }
    end

    test "uses an empty options map by default" do
      element = render_monaco()

      assert props(element)["options"] == %{}
    end

    # Settings with dedicated attrs can't also be set through `options`,
    # which would give the adapter two conflicting sources. Both key styles
    # are checked, since maps can be built either way.
    test "rejects managed options supplied as atom keys" do
      for key <- [:value, :language, :theme] do
        assert_raise ArgumentError, ~r/pass .* as attributes/, fn ->
          render_monaco(options: %{key => "invalid"})
        end
      end
    end

    test "rejects managed options supplied as string keys" do
      for key <- ["value", "language", "theme"] do
        assert_raise ArgumentError, ~r/pass .* as attributes/, fn ->
          render_monaco(options: %{key => "invalid"})
        end
      end
    end
  end

  # ---------------------------------------------------------------------------
  # EVENT TEST CASES
  # on_change binds the adapter's `change` event to a LiveView event.
  # ---------------------------------------------------------------------------

  describe "events" do
    test "binds on_change to the change event" do
      element = render_monaco(on_change: "code_changed")

      assert events(element) == %{"change" => "code_changed"}
    end

    # An unbound event is left out, so the adapter never pushes it.
    test "omits change event when on_change is nil" do
      element = render_monaco(on_change: nil)

      assert events(element) == %{}
    end

    test "has no events by default" do
      element = render_monaco()

      assert events(element) == %{}
    end
  end

  # ---------------------------------------------------------------------------
  # FORM FIELD TEST CASES
  # With field={@form[:code]}, the editor becomes a form field: the container
  # takes the field's id, a form input carries the field's name and value
  # (so the text is submitted with the form), and the editor starts with the
  # same value.
  # ---------------------------------------------------------------------------

  describe "form fields" do
    # id, name and value all come from the field, without passing an id.
    test "renders the field's id and a form input with its name and value" do
      element = render_field("IO.puts(:hello)")
      input = form_input(element)

      assert LazyHTML.attribute(element, "id") == ["snippet_code"]
      assert LazyHTML.tag(input) == ["input"]
      assert LazyHTML.attribute(input, "name") == ["snippet[code]"]
      assert LazyHTML.attribute(input, "value") == ["IO.puts(:hello)"]

      # The container is still a normal Xenia container.
      assert LazyHTML.attribute(element, "phx-hook") == ["Monaco"]
      assert LazyHTML.attribute(element, "phx-update") == ["ignore"]
    end

    # The editor and the form input must start in agreement, or the first
    # Save would submit something other than what the user sees.
    test "the editor starts with the field's value" do
      element = render_field("IO.puts(:hello)")

      assert props(element)["value"]["value"] == "IO.puts(:hello)"
      assert props(element)["language"] == "elixir"
    end

    # A field's value wins over `value`, so the editor always shows what the
    # form will submit.
    test "the field's value wins over the value attribute" do
      element = render_field("from field", %{value: "from attribute"})

      assert props(element)["value"]["value"] == "from field"
      assert LazyHTML.attribute(form_input(element), "value") == ["from field"]
    end

    # A new form has no value yet: both the editor and the input start empty.
    test "a nil field value renders as an empty string" do
      element = render_field(nil)

      assert props(element)["value"]["value"] == ""
      assert LazyHTML.attribute(form_input(element), "value") == [""]
    end

    # An explicit id still wins; the input keeps the field's name.
    test "an explicit id overrides the field's id" do
      element = render_field("code", %{id: "my-editor"}, "my-editor")

      assert LazyHTML.attribute(element, "id") == ["my-editor"]
      assert LazyHTML.attribute(form_input(element), "name") == ["snippet[code]"]
    end

    # Outside a form nothing extra is rendered: the JS core then finds no
    # input, and ctx.setFormValue returns false.
    test "without a field, no form input is rendered" do
      element = render_monaco(value: "plain editor")

      assert Enum.count(form_input(element)) == 0
    end
  end

  describe "loading and error slots" do
    test "<.monaco> passes both slots and on_crash to the container" do
      assigns = %{}

      element =
        rendered_to_string(~H"""
        <Monaco.monaco id="editor" value="x" on_crash="editor_crashed">
          <:loading>Loading the editor…</:loading>
          <:error>No editor.</:error>
        </Monaco.monaco>
        """)
        |> LazyHTML.from_fragment()
        |> LazyHTML.query("#editor")

      assert LazyHTML.attribute(element, "data-xenia-crash") == ["editor_crashed"]

      assert LazyHTML.text(LazyHTML.query(element, "[data-xenia-loading]")) =~
               "Loading the editor…"

      assert Enum.count(LazyHTML.query(element, "template[data-xenia-error]")) == 1
    end
  end
end
