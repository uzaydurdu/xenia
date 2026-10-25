defmodule Xenia.Component do
  @moduledoc """
  Renders the LiveView-owned container for a Xenia adapter.

  The JavaScript controller creates an adapter-owned child element
  inside this container.

  The component manages:

    * The LiveView hook binding, using the registered adapter name.
    * The LiveView update binding, set to "ignore".
    * `data-xenia-props`, containing JSON-encoded adapter props.
    * `data-xenia-events`, mapping adapter events to LiveView events.
    * `data-xenia-shortcuts`, mapping key combinations to LiveView events.
    * For form fields, an invisible input that carries the field's value.
      The adapter keeps it up to date with `ctx.setFormValue/2`.

  Additional HTML attributes such as class, style, aria-*,
  data-*, and phx-click can be passed through.

  ## Binding prefix

  Xenia defaults to the LiveView binding prefix "phx-".

  To use a custom prefix, configure:

      config :xenia, binding_prefix: "pop-"

  This must match the `bindingPrefix` option passed to LiveSocket
  on the JavaScript side.

  ## Examples

      import Xenia.Component

      <.xenia
        id="editor"
        adapter="Monaco"
        props={%{language: "elixir", value: %{value: @code, version: @version}}}
        events={%{change: "code_changed"}}
        class="editor"
        style="height: 400px"
      />

  As a form field, the id and the initial value come from the field:

      <.form for={@form} phx-change="validate" phx-submit="save">
        <.xenia field={@form[:code]} adapter="Monaco" props={...} />
      </.form>

  Keyboard shortcuts, while focus is inside the component, send LiveView
  events (see `Xenia.Shortcuts`):

      <.xenia id="editor" adapter="Monaco" shortcuts={%{"mod+s" => "save"}} />

  A co-located adapter, defined in the same module, is named with
  `colocated/1` (see its docs):

      <.xenia id="sales" adapter={colocated(".Chart")} props={...} />

  ## Loading and errors

  `<:loading>` is shown until the island's first mount finishes, for
  example while a large library downloads. The server renders it, so it is
  there from the first paint, before any JavaScript runs. Give the
  component a height (`style` or `class`), and the placeholder fills it.

  `<:error>` is shown instead of the island if its adapter throws: in
  `mount`, a prop handler, a command or a remount. An element inside it
  with `data-xenia-retry` starts the island again. `on_crash` names a
  LiveView event that receives `%{"id" => id, "phase" => phase,
  "message" => message}`, where phase is `"mount"`, `"update"`,
  `"command"` or `"remount"`.

      <.xenia id="editor" adapter="Monaco" props={...} on_crash="editor_crashed" style="height: 400px">
        <:loading>Loading the editor…</:loading>
        <:error>
          The editor couldn't start. <button type="button" data-xenia-retry>Try again</button>
        </:error>
      </.xenia>

  Neither needs any adapter code.
  """

  use Phoenix.Component

  @default_binding_prefix "phx-"

  attr(:adapter, :string,
    required: true,
    doc: ~s|Adapter name registered in JavaScript createHooks(), or colocated(".Name")|
  )

  attr(:id, :string,
    default: nil,
    doc: "Stable DOM id used for commands and adapter instances; defaults to the field's id"
  )

  attr(:field, Phoenix.HTML.FormField,
    default: nil,
    doc: "Phoenix form field, for example @form[:code]"
  )

  attr(:props, :map,
    default: %{},
    doc: "JSON-encodable properties passed to the adapter"
  )

  attr(:events, :map,
    default: %{},
    doc: "Adapter event name => LiveView event name"
  )

  attr(:shortcuts, :map,
    default: %{},
    doc: ~s|Key combination => LiveView event, while focus is inside, e.g. %{"mod+s" => "save"}|
  )

  attr(:on_crash, :string,
    default: nil,
    doc: "LiveView event sent when the adapter throws, with id, phase and message"
  )

  attr(:rest, :global, doc: "Additional HTML attributes not managed by Xenia")

  slot(:loading, doc: "Shown until the island's first mount finishes")

  slot(:error,
    doc: ~s|Shown if the adapter throws; an element with data-xenia-retry starts it again|
  )

  @doc """
  Renders a container for a registered Xenia adapter.

  The container remains owned by LiveView. The JavaScript
  controller manages the child element and adapter lifecycle.

  Raises ArgumentError for invalid attributes or values
  that cannot be JSON-encoded.
  """
  def xenia(assigns) do
    # An explicit id wins; otherwise the form field provides one.
    id = assigns.id || (assigns.field && assigns.field.id)

    validate_id!(id)
    validate_adapter!(assigns.adapter, id)
    validate_map!(assigns.props, "props", id)
    validate_map!(assigns.events, "events", id)
    validate_event_name!(assigns.on_crash, "on_crash", id)
    shortcuts = Xenia.Shortcuts.normalize!(assigns.shortcuts, id)

    # Must match the bindingPrefix configured on LiveSocket.
    prefix = binding_prefix()

    # Only data is serialized; JavaScript functions belong in adapter code.
    assigns =
      assign(assigns,
        id: id,
        bindings: %{"#{prefix}hook" => assigns.adapter, "#{prefix}update" => "ignore"},
        props_json: encode!(assigns.props, "props", id),
        events_json: encode!(assigns.events, "events", id),
        shortcuts_json: if(shortcuts != %{}, do: encode!(shortcuts, "shortcuts", id)),
        # Where ctx.call pushes from, when the page binds any event (see below).
        call_hook: if(assigns.events != %{}, do: %{"#{prefix}hook" => "XeniaCall"}),
        form_value: form_value(assigns.field, id),
        rest: reject_reserved!(assigns.rest, prefix, id)
      )

    ~H"""
    <div
      id={@id}
      {@bindings}
      data-xenia-adapter={@adapter}
      data-xenia-props={@props_json}
      data-xenia-events={@events_json}
      data-xenia-shortcuts={@shortcuts_json}
      data-xenia-crash={@on_crash}
      {@rest}
    >
      <input
        :if={@field}
        type="text"
        hidden
        autocomplete="off"
        data-xenia-field
        name={@field.name}
        value={@form_value}
      />
      <div :if={@loading != []} data-xenia-loading style="height: 100%">
        {render_slot(@loading)}
      </div>
      <template :if={@error != []} data-xenia-error>{render_slot(@error)}</template>
      <span :if={@call_hook} id={"#{@id}-xenia-call"} hidden data-xenia-call {@call_hook}></span>
    </div>
    """
  end

  # Reads the server-side binding prefix.
  # It must match LiveSocket's client-side bindingPrefix.
  def binding_prefix do
    case Application.get_env(:xenia, :binding_prefix, @default_binding_prefix) do
      prefix when is_binary(prefix) and prefix != "" ->
        prefix

      other ->
        raise ArgumentError,
              "[Xenia] :binding_prefix must be a non-empty string, " <>
                "got: #{inspect(other)}"
    end
  end

  @doc """
  The adapter name of a co-located adapter: one defined in this module, in
  a `<script :type={Phoenix.LiveView.ColocatedHook} name=".Chart">` that
  exports `adapterHook({...})` from `"xenia"`.

      <.xenia id="sales" adapter={colocated(".Chart")} props={%{data: @data}} />

      <script :type={Phoenix.LiveView.ColocatedHook} name=".Chart">
        import Chart from "chart.js/auto"
        import { adapterHook } from "xenia"

        export default adapterHook({
          mount(el, props) {
            const canvas = document.createElement("canvas")
            el.appendChild(canvas)
            return new Chart(canvas, { type: "bar", data: props.data })
          },
          destroy(chart) {
            chart.destroy()
          },
        })
      </script>

  It expands at compile time to the module-qualified name LiveView gives
  that hook, `"MyAppWeb.SalesPage.Chart"`, so two modules can each define
  `.Chart`. `<.xenia>` can't resolve `".Chart"` itself: it runs at render
  time and never learns which module called it. So `colocated/1` and the
  `<script>` must be in the same module.

  The app needs no change per adapter. It calls `createHooks` once, and
  passes the hooks LiveView extracts (`import { hooks } from
  "phoenix-colocated/my_app"`) to its LiveSocket, as Phoenix's generated
  `app.js` does.
  """
  defmacro colocated(name) do
    colocated_name!(name, __CALLER__.module)
  end

  @doc false
  # ".Chart" in `module` → "Module.Chart", ColocatedHook's naming. Shared
  # with `component ..., adapter: ".Chart"` (Xenia.Components).
  def colocated_name!("." <> local = name, module) do
    cond do
      local == "" or String.match?(local, ~r/[\s.]/u) ->
        raise ArgumentError,
              "a co-located adapter name is a dot and a name without spaces or " <>
                "more dots, like \".Chart\", got: #{inspect(name)}"

      is_nil(module) ->
        raise ArgumentError,
              "a co-located adapter name resolves to the module it is written in, " <>
                "so #{inspect(name)} must be used inside a module"

      true ->
        "#{inspect(module)}.#{local}"
    end
  end

  def colocated_name!(name, _module) when is_binary(name) do
    raise ArgumentError,
          "a co-located adapter name starts with a dot, like \".#{name}\", " <>
            "got: #{inspect(name)}. A name without a dot is a createHooks() " <>
            "registration: write adapter=#{inspect(name)} instead."
  end

  def colocated_name!(other, _module) do
    raise ArgumentError,
          "colocated/1 expects a literal string like \".Chart\", got: " <>
            Macro.to_string(other)
  end

  # The call element: an empty, hidden hook (XeniaCall, built into
  # createHooks) that `ctx.call` pushes from, so the server's reply comes
  # back. LiveView locks the element an event is pushed from until the reply.
  # Locking the container itself can restore a stale copy of it on unlock,
  # reverting data-xenia-props (CLAUDE.md §6, M5 findings). This element is
  # inside the ignored container, so LiveView never patches it, and locking
  # it is harmless. Rendered only when the page binds an event, because a
  # call needs a binding.

  # The form input is `type="text"` with the `hidden` attribute, not
  # `type="hidden"`. LiveView never reports a field made only of hidden
  # inputs as unused, so `used_input?/1` would be true from the start and the
  # field's errors would show before the user touched it (CLAUDE.md §6, M5.5
  # findings). A text input is tracked like any other: unused until the
  # adapter's first `ctx.setFormValue` dispatches `input`.
  #
  #   * `hidden` keeps it out of sight, the tab order and the accessibility
  #     tree;
  #   * `autocomplete="off"` stops browsers from restoring or autofilling a
  #     stale value;
  #   * `data-xenia-field` marks it as the one input the JavaScript core
  #     writes to.

  # The id also identifies the command channel "xenia:command:<id>",
  # and HTML ids must not contain whitespace.
  defp validate_id!(nil) do
    raise ArgumentError,
          "[Xenia] pass an id, or a field such as @form[:code] that provides one"
  end

  defp validate_id!(id) do
    unless is_binary(id) and id != "" and not String.match?(id, ~r/\s/u) do
      raise ArgumentError,
            "[Xenia] id must be a non-empty string without whitespace, " <>
              "got: #{inspect(id)}"
    end
  end

  # The adapter name must match a key in createHooks(), or a co-located
  # hook's module-qualified name (colocated/1).
  defp validate_adapter!("." <> _ = adapter, id) do
    raise ArgumentError,
          "[Xenia] adapter #{inspect(adapter)} for component #{inspect(id)} is a " <>
            "co-located name, which <.xenia> can't resolve at render time. Write " <>
            "adapter={colocated(#{inspect(adapter)})} in the module that defines " <>
            "<script :type={Phoenix.LiveView.ColocatedHook} name=#{inspect(adapter)}>."
  end

  defp validate_adapter!(adapter, id) do
    unless is_binary(adapter) and String.trim(adapter) != "" do
      raise ArgumentError,
            "[Xenia] adapter for component #{inspect(id)} " <>
              "must be a non-empty string, got: #{inspect(adapter)}"
    end
  end

  defp validate_event_name!(nil, _attribute, _id), do: :ok

  defp validate_event_name!(name, attribute, id) do
    unless is_binary(name) and String.trim(name) != "" do
      raise ArgumentError,
            "[Xenia] #{attribute} for component #{inspect(id)} must be a " <>
              "LiveView event name, got: #{inspect(name)}"
    end
  end

  # Props and events must decode to JavaScript objects.
  # JSON arrays or primitive values are not valid top-level inputs.
  defp validate_map!(value, _attribute, _id) when is_map(value), do: :ok

  defp validate_map!(value, attribute, id) do
    raise ArgumentError,
          "[Xenia] #{attribute} for component #{inspect(id)} " <>
            "must be a map, got: #{inspect(value)}"
  end

  # Encodes a value as JSON, with the component id in errors.
  # This makes invalid values easier to locate in larger LiveViews.
  defp encode!(value, what, id) do
    Phoenix.json_library().encode!(value)
  rescue
    error ->
      reraise ArgumentError,
              "[Xenia] #{what} for component #{inspect(id)} " <>
                "could not be JSON-encoded: " <>
                Exception.message(error),
              __STACKTRACE__
  end

  # Xenia owns:
  #
  #   * id
  #   * phx-hook and phx-update
  #   * the configured hook/update bindings
  #   * the entire data-xenia-* namespace
  #
  # Other global HTML attributes are passed through unchanged.
  defp reject_reserved!(rest, prefix, id) do
    reserved = ["id", "phx-hook", "phx-update", "#{prefix}hook", "#{prefix}update"]

    conflicting =
      rest
      |> Map.keys()
      |> Enum.map(&to_string/1)
      |> Enum.filter(&(&1 in reserved or String.starts_with?(&1, "data-xenia-")))

    if conflicting != [] do
      raise ArgumentError,
            "[Xenia] component #{inspect(id)} cannot override " <>
              "Xenia-managed attributes: #{Enum.join(conflicting, ", ")}"
    end

    rest
  end

  # The form input's value: the field's value as the string an HTML
  # input holds. Mirrors formValueToString() in controller.js, so the
  # server-rendered value and values written by the adapter compare equal.
  defp form_value(nil, _id), do: nil
  defp form_value(%Phoenix.HTML.FormField{value: value}, id), do: to_form_string(value, id)

  defp to_form_string(nil, _id), do: ""
  defp to_form_string(value, _id) when is_binary(value), do: value

  # Numbers, booleans and atoms (e.g. Ecto.Enum values) as plain text.
  defp to_form_string(value, _id) when is_number(value) or is_atom(value),
    do: to_string(value)

  defp to_form_string(value, id), do: encode!(value, "field value", id)
end
