defmodule Mix.Tasks.Xenia.Gen.Component do
  @shortdoc "Generates a Xenia component: a JavaScript adapter and its HEEx tag"

  @moduledoc """
  Generates a component for a JavaScript library: the adapter that drives
  the library, and a typed HEEx tag for it.

      $ mix xenia.gen.component chart data:map title:string --events click
      * creating assets/js/chart_adapter.js
      * creating lib/my_app_web/components/chart.ex

  Then it prints the one line to add to `app.js`. The adapter is a working
  placeholder that shows the props it receives; replace its body with your
  library (see the "Wrapping a library" guide).

  Props are `name:type` pairs, with the types of Phoenix's `attr`: `string`,
  `integer`, `float`, `boolean`, `atom`, `list`, `map` or `any`. Each
  `--events` name becomes an `on_<name>` attribute.

  ## Co-located

      $ mix xenia.gen.component chart data:map --colocated

  writes nothing, and prints the declaration and the
  `<script :type={Phoenix.LiveView.ColocatedHook}>` to paste into the one
  module that uses the component, usually a page. The adapter then lives in
  that module, and `app.js` doesn't change. Generators don't edit your
  modules, so it is printed rather than inserted.

  ## Options

    * `--events` - comma-separated event names, like `click,change`
    * `--colocated` - print a co-located version instead of writing files
    * `--module` - the tag's module, `MyAppWeb.Components.Chart` by default
    * `--web-module` and `--web-path` - `MyAppWeb` and `lib/my_app_web` by
      default
    * `--force` - overwrite existing files
  """

  use Mix.Task

  alias Mix.Xenia.Gen

  @switches [
    events: :string,
    colocated: :boolean,
    module: :string,
    web_module: :string,
    web_path: :string,
    force: :boolean
  ]

  @types ~w(string integer float boolean atom list map any)
  @identifier ~r/\A[a-z][a-z0-9_]*\z/

  @impl true
  def run(args) do
    {opts, argv} = OptionParser.parse!(args, strict: @switches)

    {name, specs} =
      case argv do
        [name | specs] -> {name, specs}
        [] -> Mix.raise("expected a name, like: mix xenia.gen.component chart data:map")
      end

    unless Regex.match?(@identifier, name) do
      Mix.raise("the component name must be lowercase, like chart or date_picker, got: #{name}")
    end

    component = %{
      name: name,
      adapter: Macro.camelize(name),
      js: js_name(name),
      props: Enum.map(specs, &prop!/1),
      events: events!(opts[:events])
    }

    check_names!(component)
    web = Gen.web(opts)

    if opts[:colocated] do
      Gen.info(colocated(component))
    else
      module = opts[:module] || "#{web.module}.Components.#{component.adapter}"
      write(component, module, web, opts[:force] || false)
    end
  end

  defp write(component, module, web, force) do
    js_path = Path.join(["assets", "js", "#{component.name}_adapter.js"])
    ex_path = Path.join([web.path, "components", "#{component.name}.ex"])

    Gen.create!(js_path, adapter_file(component, ex_path), force)
    Gen.create!(ex_path, Gen.format(declaration_module(component, module, js_path)), force)

    Gen.info("""

    Register the adapter in assets/js/app.js:

        import { #{component.js} } from "./#{component.name}_adapter"

        hooks: { ...colocatedHooks, ...createHooks({ #{component.adapter}: #{component.js} }) },

    Import the tag where you use it, or in html_helpers in #{web.path}.ex:

        import #{module}

    Then render it:

        #{usage(component)}
    """)
  end

  # --- Generated code ---------------------------------------------------------

  defp declaration_module(component, module, js_path) do
    ~s'''
    defmodule #{module} do
      @moduledoc """
      `<.#{component.name}>`, a Xenia component.

      Its adapter is `#{component.adapter}`, in `#{js_path}`, registered with
      `createHooks` in `app.js`.
      """
      use Xenia.Components

      #{declaration(component, inspect(component.adapter))}
    end
    '''
  end

  defp declaration(component, adapter) do
    lines =
      Enum.map(component.props, fn {prop, type} -> "  prop :#{prop}, :#{type}" end) ++
        Enum.map(component.events, &"  event :#{&1}")

    Enum.join(["component :#{component.name}, adapter: #{adapter} do" | lines] ++ ["end"], "\n")
  end

  defp adapter_file(component, ex_path) do
    """
    // The adapter behind <.#{component.name}> (#{ex_path}).
    //
    // It says how the library is created, updated and destroyed. Xenia's core
    // does the rest: props diffing, events, commands and cleanup.
    // Guide: https://hexdocs.pm/xenia/wrapping-a-library.html

    export const #{component.js} = #{adapter_object(component)}

    #{show_function()}
    """
  end

  defp adapter_object(component) do
    sections =
      [
        """
          // Create the library inside `el`, an element Xenia made for it, and
          // return the instance. `props` holds every prop the server sent.
          mount(el, props, ctx) {
            // A placeholder that shows the props: replace it with your library.
            const pre = el.appendChild(document.createElement("pre"))
            const instance = { pre, props: { ...props } }
            show(instance)
            return instance
          },
        """,
        """
          // Undo everything mount did. Called once, synchronously.
          destroy(instance) {
            instance.pre.remove()
          },
        """,
        props_section(component.props),
        events_section(component.events)
      ]
      |> Enum.reject(&is_nil/1)

    "{\n" <> Enum.join(sections, "\n") <> "}"
  end

  defp props_section([]), do: nil

  defp props_section(props) do
    handlers =
      Enum.map_join(props, "\n", fn {prop, _type} ->
        """
            #{prop}(instance, value) {
              instance.props.#{prop} = value
              show(instance)
            },
        """
      end)

    """
      // One handler per prop that can change after mount. A prop without a
      // handler is assigned to the instance (instance.#{elem(hd(props), 0)} = value).
      props: {
    #{String.trim_trailing(handlers)}
      },
    """
  end

  defp events_section([]), do: nil

  defp events_section(events) do
    entries = Enum.map_join(events, "\n", &"    #{&1}: {},")
    first = hd(events)

    """
      // Events the page binds with on_#{first}="...". Report one from the
      // library with ctx.emit("#{first}", payload), and add { debounce: 300 }
      // to an event that fires on every keystroke.
      events: {
    #{entries}
      },
    """
  end

  defp show_function do
    """
    // Part of the placeholder: shows the props as they arrive.
    function show(instance) {
      instance.pre.textContent = JSON.stringify(instance.props, null, 2)
    }\
    """
  end

  defp colocated(component) do
    script =
      """
      <script :type={Phoenix.LiveView.ColocatedHook} name=".#{component.adapter}">
        import { adapterHook } from "xenia"

      #{indent(show_function(), 2)}

        export default adapterHook(#{indent(adapter_object(component), 2) |> String.trim_leading()})
      </script>
      """

    """

    Paste this into the one module that renders <.#{component.name}>, usually a page.
    The declaration and the <script> must be in the same module: ".#{component.adapter}"
    resolves to that module's hook. app.js doesn't change.

    In the module (add `use Xenia.Components` if it isn't there yet):

    #{indent(declaration(component, inspect("." <> component.adapter)), 4)}

    In its template:

        #{usage(component)}

    #{indent(script, 4)}
    """
  end

  defp usage(component) do
    attrs =
      Enum.map(component.props, fn {prop, _type} -> "#{prop}={@#{prop}}" end) ++
        Enum.map(component.events, &~s(on_#{&1}="#{component.name}_#{&1}"))

    Enum.join(
      [~s(<.#{component.name} id="#{String.replace(component.name, "_", "-")}") | attrs],
      " "
    ) <>
      " />"
  end

  # --- Arguments --------------------------------------------------------------

  defp prop!(spec) do
    case String.split(spec, ":") do
      [prop, type] ->
        unless Regex.match?(@identifier, prop) do
          Mix.raise("a prop name must be lowercase, like data or start_date, got: #{prop}")
        end

        unless type in @types do
          Mix.raise(
            "unknown type #{type} for prop #{prop}; use one of: #{Enum.join(@types, ", ")}"
          )
        end

        {prop, type}

      _ ->
        Mix.raise("expected props as name:type, like data:map, got: #{spec}")
    end
  end

  defp events!(nil), do: []

  defp events!(events) do
    for event <- String.split(events, ",", trim: true) do
      unless Regex.match?(@identifier, event) do
        Mix.raise("an event name must be lowercase, like click or change, got: #{event}")
      end

      event
    end
  end

  # The DSL would reject these at compile time; say so now.
  defp check_names!(component) do
    names = Enum.map(component.props, &elem(&1, 0))

    case names -- Enum.uniq(names) do
      [] -> :ok
      [dup | _] -> Mix.raise("prop #{dup} is given twice")
    end

    if "id" in names, do: Mix.raise("id is every component's own attribute; it can't be a prop")

    for event <- component.events, "on_#{event}" in names do
      Mix.raise("prop on_#{event} collides with the attribute for event #{event}")
    end

    :ok
  end

  # date_picker → datePicker, the adapter's name in JavaScript.
  defp js_name(name) do
    [first | rest] = String.split(name, "_")
    Enum.join([first | Enum.map(rest, &String.capitalize/1)])
  end

  defp indent(text, spaces) do
    pad = String.duplicate(" ", spaces)

    text
    |> String.split("\n")
    |> Enum.map_join("\n", fn
      "" -> ""
      line -> pad <> line
    end)
  end
end
