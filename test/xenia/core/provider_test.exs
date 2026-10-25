defmodule Xenia.ProviderTest do
  @moduledoc """
  Tests the HTML rendered by `Xenia.Provider.provider/1`: the hook binding,
  the data attributes the XeniaProvider hook reads, JSON encoding of the
  value, and validation of the provider name.
  """

  use ExUnit.Case, async: true
  use Phoenix.Component

  import Phoenix.LiveViewTest, only: [rendered_to_string: 1]
  import Xenia.Provider, only: [provider: 1]

  # ---------------------------------------------------------------------------
  # HTML
  # ---------------------------------------------------------------------------

  test "renders a theme provider with the correct HTML" do
    assigns = %{theme: "dark"}

    provider =
      ~H"""
      <.provider name="theme" value={@theme} />
      """
      |> rendered_to_string()
      |> provider_node()

    assert LazyHTML.attribute(provider, "id") == ["xenia-provider-theme"]
    assert LazyHTML.attribute(provider, "phx-hook") == ["XeniaProvider"]
    assert LazyHTML.attribute(provider, "data-xenia-provider") == ["theme"]
    assert LazyHTML.attribute(provider, "data-xenia-value") == [~s("dark")]

    # A boolean attribute renders with an empty value.
    assert LazyHTML.attribute(provider, "hidden") == [""]
  end

  test "uses a custom id when given" do
    assigns = %{}

    provider =
      ~H"""
      <.provider id="layout-theme" name="theme" value="light" />
      """
      |> rendered_to_string()
      |> provider_node("layout-theme")

    assert LazyHTML.attribute(provider, "data-xenia-provider") == ["theme"]
  end

  # Two providers on one page must not share an id.
  test "two providers with different ids render side by side" do
    assigns = %{}

    html =
      rendered_to_string(~H"""
      <.provider name="theme" value="dark" />
      <.provider id="other-theme" name="theme" value="light" />
      """)

    assert decoded_value(provider_node(html)) == "dark"
    assert decoded_value(provider_node(html, "other-theme")) == "light"
  end

  # ---------------------------------------------------------------------------
  # JSON VALUES
  # ---------------------------------------------------------------------------

  test "encodes a map value as JSON" do
    assigns = %{theme: %{"mode" => "dark"}}

    provider =
      ~H"""
      <.provider name="theme" value={@theme} />
      """
      |> rendered_to_string()
      |> provider_node()

    assert decoded_value(provider) == %{"mode" => "dark"}
  end

  test "allows other provider names and JSON values" do
    assigns = %{locale: %{"language" => "de", "region" => "DE"}}

    provider =
      ~H"""
      <.provider name="locale" value={@locale} />
      """
      |> rendered_to_string()
      |> provider_node("xenia-provider-locale")

    assert LazyHTML.attribute(provider, "data-xenia-provider") == ["locale"]
    assert decoded_value(provider) == %{"language" => "de", "region" => "DE"}
  end

  # nil is published as JSON null, not as a missing value.
  test "encodes nil as null" do
    assigns = %{theme: nil}

    provider =
      ~H"""
      <.provider name="theme" value={@theme} />
      """
      |> rendered_to_string()
      |> provider_node()

    assert LazyHTML.attribute(provider, "data-xenia-value") == ["null"]
  end

  # Quotes and angle brackets survive HTML attribute escaping.
  test "values with special characters round-trip" do
    value = ~s(<b>"dark" & 'light'</b>)
    assigns = %{theme: value}

    provider =
      ~H"""
      <.provider name="theme" value={@theme} />
      """
      |> rendered_to_string()
      |> provider_node()

    assert decoded_value(provider) == value
  end

  # ---------------------------------------------------------------------------
  # NAME VALIDATION
  # ---------------------------------------------------------------------------

  test "accepts lowercase letters, digits and underscores" do
    assigns = %{}

    provider =
      ~H"""
      <.provider name="feature_flags2" value={true} />
      """
      |> rendered_to_string()
      |> provider_node("xenia-provider-feature_flags2")

    assert decoded_value(provider) == true
  end

  # Names are passed as assigns so validation runs at render time.
  # "theme\n" is only rejected by the \A...\z anchors.
  for name <- ["Theme", "2theme", "theme-mode", "theme mode", "", "theme\n"] do
    test "rejects the provider name #{inspect(name)}" do
      assigns = %{name: unquote(name)}

      assert_raise ArgumentError, ~r/provider name/, fn ->
        rendered_to_string(~H"""
        <.provider name={@name} value="dark" />
        """)
      end
    end
  end

  test "rejects a provider name that isn't a string" do
    assigns = %{name: :theme}

    assert_raise ArgumentError, ~r/must be a string/, fn ->
      rendered_to_string(~H"""
      <.provider name={@name} value="dark" />
      """)
    end
  end

  # ---------------------------------------------------------------------------
  # HELPERS
  # ---------------------------------------------------------------------------

  # Shared parsing; fails clearly when the element isn't found exactly once.
  defp provider_node(html, id \\ "xenia-provider-theme") do
    node =
      html
      |> LazyHTML.from_fragment()
      |> LazyHTML.query("##{id}")

    assert Enum.count(node) == 1, "expected exactly one ##{id} in:\n#{html}"

    node
  end

  # Decodes the JSON in data-xenia-value, as the XeniaProvider hook does.
  defp decoded_value(provider) do
    [json] = LazyHTML.attribute(provider, "data-xenia-value")
    Phoenix.json_library().decode!(json)
  end
end
