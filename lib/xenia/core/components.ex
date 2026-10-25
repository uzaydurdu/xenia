defmodule Xenia.Components do
  @moduledoc """
  Defines typed Phoenix function components for Xenia adapters.

  ## Example

      defmodule MyAppWeb.Components do
        use Xenia.Components

        component :chart,
          adapter: "Chart",
          doc: "Renders an interactive chart." do

          prop :type, :string, required: true
          prop :data, :map, default: %{}
          event :click
        end
      end

  The generated component can be used in HEEx:

      <.chart
        id="sales"
        type="bar"
        data={@sales}
        on_click="bar_clicked"
      />

  Each declaration generates a normal Phoenix function component:

    * `prop name, type, opts` becomes a Phoenix `attr` and is
      passed to the JavaScript adapter as a prop.

    * Optional props that are absent are omitted. Explicit
      defaults are included.

    * `event name` becomes `attr :on_<name>, :string`.
      Events without a binding are omitted.

    * Components normally require `id`. Declarations with `form_value: :prop`
      also accept `field={@form[:name]}`, using the field's id by default.

    * Every component supports global HTML attributes, `shortcuts`,
      `on_crash`, and the `<:loading>` and `<:error>` slots (see
      `Xenia.Component`).

  Rendering is delegated to `Xenia.Component.xenia/1`.

  The adapter must be registered separately in JavaScript
  using `createHooks()`.
  """

  # Attributes owned by the generated component.
  @reserved [
    :id,
    :adapter,
    :field,
    :rest,
    :inner_block,
    :xenia_adapter,
    :xenia_props,
    :xenia_events,
    :shortcuts,
    :on_crash,
    :loading,
    :error
  ]

  @component_options [:adapter, :form_value, :doc]

  @identifier_pattern ~r/^[a-z][a-z0-9_]*$/

  @doc """
  Enables the Xenia component declaration DSL.
  """
  defmacro __using__(_opts) do
    # Provides Phoenix attr/3, assign/3 and ~H support, unless the module
    # already has it. Apps often declare components in a module that already
    # does `use Phoenix.Component` (or `use MyAppWeb, :html`), and using it
    # twice defines its verification callback twice: a compile warning, and
    # an error under --warnings-as-errors.
    #
    # The check: has `use Phoenix.Component` already replaced `def` with
    # Phoenix's? Imports are lexical, so this is known at expansion time
    # (module attributes set by an earlier `use` are not). It is also exactly
    # what the generated function relies on (see `function_ast` below).
    already_phoenix_component? =
      {:macro, Phoenix.Component.Declarative} in Macro.Env.lookup_import(__CALLER__, {:def, 2})

    phoenix_component =
      unless already_phoenix_component? do
        quote do: use(Phoenix.Component)
      end

    quote do
      unquote(phoenix_component)

      # Exposes component declarations to the calling module.
      import Xenia.Components, only: [component: 3]
    end
  end

  @doc """
  Generates a typed Phoenix function component.

  ## Options

    * `:adapter` - required JavaScript adapter registration name, or a
      co-located adapter's `".Name"`, defined in this module (see
      `Xenia.Component.colocated/1`).
    * `:form_value` - optional declared prop name used as a Phoenix form value.
    * `:doc` - optional documentation string.

  ## Supported declarations

      prop :name, :string
      prop :data, :map, default: %{}
      prop :type, :string, required: true
      event :change

  Invalid declarations raise ArgumentError during compilation.
  """
  defmacro component(name, opts, do: block) do
    # Validate the component name and declaration options.
    validate_component!(name, opts)

    # Read the JavaScript adapter name; ".Chart" is co-located in this module.
    adapter = fetch_adapter!(name, opts, __CALLER__.module)

    # Extract prop and event declarations from the block AST.
    {props, events} = parse_declarations!(name, block)

    # Ensure declarations cannot generate conflicting attributes.
    validate_names!(name, props, events)

    # A form-enabled component must point to an actual declared prop.
    form_value_key = validate_form_value!(name, Keyword.fetch(opts, :form_value), props)

    # Preserve declared prop order.
    prop_names = Enum.map(props, &elem(&1, 0))

    # Map event :click to the generated attribute :on_click.
    event_bindings =
      Enum.map(events, fn event ->
        {event, event_attr(event)}
      end)

    # Generate component documentation, if supplied.
    doc_ast =
      case Keyword.get(opts, :doc) do
        nil ->
          nil

        doc ->
          quote do
            @doc unquote(doc)
          end
      end

    # Generate a Phoenix attr declaration for each adapter prop.
    prop_attrs =
      for {prop_name, type, options} <- props do
        # A form-enabled prop may be supplied by `field` instead of directly.
        # Phoenix cannot express "required either prop OR field" in attr/3.
        # We enforce that conditional requirement in the function below.
        attr_options =
          if prop_name == form_value_key do
            Keyword.delete(options, :required)
          else
            options
          end

        quote do
          attr(unquote(prop_name), unquote(type), unquote(attr_options))
        end
      end

    form_value_required? =
      Enum.any?(props, fn {prop_name, _type, options} ->
        prop_name == form_value_key and Keyword.get(options, :required, false)
      end)

    # Generate the field attribute only for components that opt in.
    id_and_field_attrs =
      if form_value_key do
        quote do
          attr(:id, :string,
            default: nil,
            doc: "Stable DOM id; defaults to field.id"
          )

          attr(:field, Phoenix.HTML.FormField,
            default: nil,
            doc: "Phoenix form field for this component"
          )
        end
      else
        quote do
          attr(:id, :string,
            required: true,
            doc: "Stable DOM id used for adapter commands"
          )
        end
      end

    # Generate a Phoenix attr for each declared adapter event.
    event_attrs =
      for {event, attr_name} <- event_bindings do
        event_doc =
          "LiveView event triggered when the adapter emits #{inspect(event)}."

        quote do
          attr(unquote(attr_name), :string,
            default: nil,
            doc: unquote(event_doc)
          )
        end
      end

    # Generate only the HEEx markup appropriate for this declaration.
    # Referencing @field in non-form components would produce an undeclared
    # attribute warning, so those components keep their original markup.
    template_ast =
      if form_value_key do
        quote do
          ~H"""
          <Xenia.Component.xenia
            id={@id}
            field={@field}
            adapter={@xenia_adapter}
            props={@xenia_props}
            events={@xenia_events}
            shortcuts={@shortcuts}
            on_crash={@on_crash}
            {@rest}
          >
            <:loading :for={slot <- @loading}>{render_slot(slot)}</:loading>
            <:error :for={slot <- @error}>{render_slot(slot)}</:error>
          </Xenia.Component.xenia>
          """
        end
      else
        quote do
          ~H"""
          <Xenia.Component.xenia
            id={@id}
            adapter={@xenia_adapter}
            props={@xenia_props}
            events={@xenia_events}
            shortcuts={@shortcuts}
            on_crash={@on_crash}
            {@rest}
          >
            <:loading :for={slot <- @loading}>{render_slot(slot)}</:loading>
            <:error :for={slot <- @error}>{render_slot(slot)}</:error>
          </Xenia.Component.xenia>
          """
        end
      end

    # Generate the actual Phoenix function component.
    #
    # var!(assigns) avoids macro hygiene conflicts with ~H,
    # which expects a variable named `assigns`.
    #
    # `use Phoenix.Component` replaces `def` with its own macro, which marks
    # the function as a component so the `attr`s above attach to it. Inside
    # this quote, macro hygiene would bind `def` to Kernel.def at this
    # module's definition site, and Phoenix would reject the attrs as
    # misplaced. Dropping the import metadata makes `def` resolve in the
    # calling module instead, where `use Phoenix.Component` put Phoenix's.
    function_ast =
      quote do
        def unquote(name)(var!(assigns)) do
          # A required form-value prop may be supplied through `field`.
          if unquote(form_value_required?) and
               is_nil(Map.get(var!(assigns), :field)) and
               not Map.has_key?(var!(assigns), unquote(form_value_key)) do
            raise ArgumentError,
                  "Xenia component #{unquote(name)} requires " <>
                    "#{unquote(form_value_key)} or field"
          end

          # Copy only props declared by this component.
          #
          # Map.take/2 preserves Phoenix defaults while allowing
          # optional props without defaults to remain absent.
          props =
            var!(assigns)
            |> Map.take(unquote(Macro.escape(prop_names)))
            |> Xenia.Components.__form_props__(
              Map.get(var!(assigns), :field),
              unquote(form_value_key)
            )

          # Convert on_click="bar_clicked" into
          # %{click: "bar_clicked"}, omitting unbound events.
          events =
            Xenia.Components.__bound_events__(
              var!(assigns),
              unquote(Macro.escape(event_bindings))
            )

          # Prepare assigns for the underlying M3 component.
          var!(assigns) =
            var!(assigns)
            |> Phoenix.Component.assign(:xenia_adapter, unquote(adapter))
            |> Phoenix.Component.assign(:xenia_props, props)
            |> Phoenix.Component.assign(:xenia_events, events)

          # Delegate DOM rendering to the existing M3 component.
          unquote(template_ast)
        end
      end
      |> Macro.update_meta(&Keyword.drop(&1, [:imports, :context]))

    quote do
      # Non-form components still require an id; form components accept field.
      unquote(id_and_field_attrs)

      # Add all declared adapter props.
      unquote_splicing(prop_attrs)

      # Add all declared on_* event bindings.
      unquote_splicing(event_attrs)

      attr(:shortcuts, :map,
        default: %{},
        doc: ~s|Key combination => LiveView event, while focus is inside (see Xenia.Shortcuts)|
      )

      attr(:on_crash, :string,
        default: nil,
        doc: "LiveView event sent if the adapter throws (see Xenia.Component)"
      )

      # Allow class, style, aria-*, data-* and other global attrs.
      attr(:rest, :global)

      slot(:loading, doc: "Shown until the island's first mount finishes")
      slot(:error, doc: "Shown if the adapter throws; data-xenia-retry starts it again")

      # Documentation belongs immediately before the function.
      unquote(doc_ast)

      unquote(function_ast)
    end
  end

  @doc false
  def __bound_events__(assigns, bindings) do
    # Only configured events are passed to the controller.
    #
    # For example:
    #   %{on_click: "clicked"} + [click: :on_click]
    # becomes:
    #   %{click: "clicked"}
    #
    # Missing and nil bindings are omitted.
    for {event, attr_name} <- bindings,
        binding = Map.get(assigns, attr_name),
        not is_nil(binding),
        into: %{} do
      {event, binding}
    end
  end

  @doc false
  def __form_props__(
        props,
        %Phoenix.HTML.FormField{value: value},
        key
      )
      when is_atom(key) and not is_nil(key) do
    Map.put(props, key, value)
  end

  def __form_props__(props, _field, _key), do: props

  # `form_value: :value` must refer to a declared adapter prop.
  defp validate_form_value!(_component, :error, _props), do: nil

  defp validate_form_value!(component, {:ok, key}, props) do
    declared? = Enum.any?(props, fn {prop_name, _, _} -> prop_name == key end)

    unless is_atom(key) and not is_nil(key) and declared? do
      raise ArgumentError,
            "form_value for Xenia component #{inspect(component)} " <>
              "must name a declared prop, got: #{inspect(key)}"
    end

    key
  end

  # ------------------------------------------------------------
  # Compile-time validation
  # ------------------------------------------------------------

  # Validate the function name and component-level options.
  defp validate_component!(name, opts) do
    validate_identifier!(name, "component name", name)

    unless Keyword.keyword?(opts) do
      raise ArgumentError,
            "options for Xenia component #{inspect(name)} " <>
              "must be a keyword list"
    end

    # Reject unknown component options. (Not `keys -- allowed`: list
    # subtraction removes one occurrence only, so a repeated :adapter would
    # be reported as unknown instead of as a duplicate.)
    unknown =
      opts
      |> Keyword.keys()
      |> Enum.reject(&(&1 in @component_options))
      |> Enum.uniq()

    if unknown != [] do
      raise ArgumentError,
            "unknown options for Xenia component #{inspect(name)}: " <>
              "#{inspect(unknown)}. Allowed: #{inspect(@component_options)}"
    end

    # Reject duplicate options, including repeated :adapter.
    duplicates = duplicate_names(Keyword.keys(opts))

    if duplicates != [] do
      raise ArgumentError,
            "duplicate options for Xenia component #{inspect(name)}: " <>
              inspect(duplicates)
    end

    # Validate optional documentation.
    case Keyword.fetch(opts, :doc) do
      :error ->
        :ok

      {:ok, doc} when is_binary(doc) ->
        :ok

      {:ok, other} ->
        raise ArgumentError,
              "doc for Xenia component #{inspect(name)} " <>
                "must be a string, got: #{inspect(other)}"
    end
  end

  # Require a literal adapter name. A co-located one (".Chart") is resolved
  # here, at compile time, to the name LiveView's ColocatedHook gives it in
  # this module: the generated component renders <.xenia> at runtime, which
  # can't know the module.
  defp fetch_adapter!(name, opts, module) do
    case Keyword.fetch(opts, :adapter) do
      {:ok, "." <> _ = adapter} ->
        Xenia.Component.colocated_name!(adapter, module)

      {:ok, adapter} when is_binary(adapter) ->
        if String.trim(adapter) == "" do
          raise ArgumentError,
                "adapter for Xenia component #{inspect(name)} " <>
                  "must not be empty"
        end

        adapter

      {:ok, other} ->
        raise ArgumentError,
              "adapter for Xenia component #{inspect(name)} " <>
                "must be a literal string, got: " <>
                Macro.to_string(other)

      :error ->
        raise ArgumentError,
              "Xenia component #{inspect(name)} " <>
                "is missing the required :adapter option"
    end
  end

  # Read declarations from the macro's do block.
  defp parse_declarations!(name, block) do
    {props, events} =
      block
      |> block_expressions()
      |> Enum.reduce({[], []}, fn
        # prop :type, :string
        {:prop, _, [prop_name, type]}, {props, events} ->
          validate_prop!(name, prop_name, type, [])

          {[{prop_name, type, []} | props], events}

        # prop :data, :map, default: %{}
        {:prop, _, [prop_name, type, options]}, {props, events} ->
          validate_prop!(name, prop_name, type, options)

          {[{prop_name, type, options} | props], events}

        # event :click
        {:event, _, [event_name]}, {props, events} ->
          validate_identifier!(event_name, "event name", name)

          {props, [event_name | events]}

        # Reject expressions outside the supported DSL.
        other, _acc ->
          raise ArgumentError,
                "invalid declaration in Xenia component #{inspect(name)}: " <>
                  "#{Macro.to_string(other)}. " <>
                  "Expected prop/2, prop/3 or event/1."
      end)

    # Restore the original declaration order.
    {Enum.reverse(props), Enum.reverse(events)}
  end

  defp block_expressions(nil), do: []

  defp block_expressions({:__block__, _, expressions}),
    do: expressions

  defp block_expressions(expression), do: [expression]

  # Validate each property declaration.
  defp validate_prop!(component, name, type, options) do
    validate_identifier!(name, "prop name", component)

    # Phoenix accepts built-in attr types such as :string,
    # :map, :integer, :boolean, :list and :any.
    #
    # The actual type compatibility is also checked by
    # Phoenix.Component.attr/3 when code is generated.
    unless is_atom(type) do
      raise ArgumentError,
            "type for prop #{inspect(name)} in Xenia component " <>
              "#{inspect(component)} must be a literal atom"
    end

    unless Keyword.keyword?(options) do
      raise ArgumentError,
            "options for prop #{inspect(name)} in Xenia component " <>
              "#{inspect(component)} must be a keyword list"
    end
  end

  # Validate duplicate, reserved and colliding attributes.
  defp validate_names!(component, props, events) do
    prop_names = Enum.map(props, &elem(&1, 0))
    event_attrs = Enum.map(events, &event_attr/1)

    # The generated attributes share one namespace.
    attr_names = prop_names ++ event_attrs

    # Reject repeated declarations and prop/event collisions.
    duplicates = duplicate_names(attr_names)

    if duplicates != [] do
      raise ArgumentError,
            "Xenia component #{inspect(component)} " <>
              "declares duplicate attributes: #{inspect(duplicates)}"
    end

    # Reject reserved framework and internal attribute names.
    reserved = Enum.filter(attr_names, &(&1 in @reserved))

    if reserved != [] do
      raise ArgumentError,
            "Xenia component #{inspect(component)} " <>
              "uses reserved attribute names: #{inspect(reserved)}. " <>
              "Reserved: #{inspect(@reserved)}"
    end

    # Prevent a prop from conflicting with a declared event.
    #
    # Example:
    #   prop :on_click, :string
    #   event :click
    #
    # Both would generate an :on_click attribute.
    :ok
  end

  # Count attribute/option occurrences and return duplicates.
  defp duplicate_names(names) do
    names
    |> Enum.frequencies()
    |> Enum.filter(fn {_name, count} -> count > 1 end)
    |> Enum.map(fn {name, _count} -> name end)
  end

  # Only support ordinary lowercase identifiers.
  #
  # Examples:
  #   :chart
  #   :font_size
  #   :on_change
  #
  # Invalid:
  #   :"click event"
  #   :"Chart"
  #   :"some-name"
  defp validate_identifier!(value, role, component) do
    unless is_atom(value) and
             String.match?(
               Atom.to_string(value),
               @identifier_pattern
             ) do
      raise ArgumentError,
            "#{role} #{inspect(value)} in Xenia component " <>
              "#{inspect(component)} must be a lowercase identifier"
    end
  end

  # Generate Phoenix-style on_* attribute names.
  defp event_attr(event), do: :"on_#{event}"
end
