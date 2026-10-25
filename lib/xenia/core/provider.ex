defmodule Xenia.Provider do
  @moduledoc """
  Publishes application-wide values to Xenia adapters.

  A provider renders a hidden element and wraps nothing, so it can sit
  anywhere on the page, typically once in the layout. When its value changes,
  LiveView patches the element and every adapter that consumes the provider
  receives the new value.

  ## Example

      <Xenia.Provider.provider name="theme" value={@theme} />

  Adapters receive these values by declaring:

      consumes: ["theme"]

  The `XeniaProvider` hook must be registered, which `createHooks/1` does.
  """

  use Phoenix.Component

  @name_format ~r/\A[a-z][a-z0-9_]*\z/

  attr(:name, :string,
    required: true,
    doc: "Name of the shared provider, e.g. `theme` or `locale`."
  )

  attr(:value, :any,
    required: true,
    doc: "A JSON-serializable application-wide value."
  )

  attr(:id, :string,
    default: nil,
    doc: ~s(DOM id. Defaults to `"xenia-provider-<name>"`.)
  )

  @doc "Renders a hidden element that publishes `value` under `name`."
  def provider(assigns) do
    validate_name!(assigns.name)

    # Xenia's LiveView binding prefix, usually "phx-".
    prefix = Xenia.Component.binding_prefix()

    assigns =
      assign(assigns,
        id: assigns.id || "xenia-provider-#{assigns.name}",
        hook_attrs: %{"#{prefix}hook" => "XeniaProvider"},
        value_json: Phoenix.json_library().encode!(assigns.value)
      )

    ~H"""
    <div
      id={@id}
      hidden
      data-xenia-provider={@name}
      data-xenia-value={@value_json}
      {@hook_attrs}
    ></div>
    """
  end

  defp validate_name!(name) when is_binary(name) do
    unless Regex.match?(@name_format, name) do
      raise ArgumentError,
            "Xenia provider name must start with a lowercase letter and contain only " <>
              "lowercase letters, digits and underscores, got: #{inspect(name)}"
    end
  end

  defp validate_name!(name) do
    raise ArgumentError, "Xenia provider name must be a string, got: #{inspect(name)}"
  end
end
