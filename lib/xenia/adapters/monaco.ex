defmodule Xenia.Adapters.Monaco do
  @moduledoc """
  Phoenix function component for Xenia's Monaco adapter.

  Wraps the editor value into the versioned payload expected by the
  JavaScript Monaco adapter.

  ## Examples

      import Xenia.Adapters.Monaco

      <.monaco
        id="editor"
        value={@code}
        version={@version}
        language="elixir"
        on_change="code_changed"
        style="height: 400px"
      />

  As a form field, the id, the input name and the initial value come from
  the field, and the editor's text is submitted with the form:

      <.form for={@form} phx-change="validate" phx-submit="save">
        <.monaco field={@form[:code]} language="elixir" />
      </.form>

  The Monaco JavaScript adapter must be registered with `createHooks()`
  under the name given in `adapter` (default `"Monaco"`). It comes from its
  own entry point, and your app passes the Monaco import:

      import { createMonaco } from "xenia/monaco"

      createHooks({ Monaco: createMonaco({ load: () => import("monaco-editor") }) })

  ## Setup

  Monaco is the heaviest library to set up, so here is all of it.

  **1. Install it:** `npm install monaco-editor@0.57.0 --save-exact --prefix assets`

  **2. Create the adapter** in `assets/js/monaco.js`. Monaco finds its web
  workers with `new URL(..., import.meta.url)`, which esbuild doesn't
  bundle, so tell it where they are. The `import("monaco-editor")` is
  written in your app, so esbuild finds it in your `assets/node_modules`:

      import { createMonaco } from "xenia/monaco"

      const WORKERS = {
        json: "json", css: "css", scss: "css", less: "css",
        html: "html", handlebars: "html", razor: "html",
        typescript: "ts", javascript: "ts",
      }

      self.MonacoEnvironment = {
        getWorker: (_id, label) => new Worker(`/assets/js/monaco/${WORKERS[label] ?? "editor"}.worker.js`),
      }

      export const monaco = createMonaco({ load: () => import("monaco-editor") })

  Register it next to your other adapters: `createHooks({ Monaco: monaco })`.
  To add completion providers or commands, pass
  `setup: (monaco, editor) => disposable` to `createMonaco`.

  **3. Build the workers** in `config/config.exs`: give `app.js` an entry
  name, add the five worker files, and a loader for Monaco's icon font:

      config :esbuild,
        my_app: [
          args: ~w(app=js/app.js
                   monaco/editor.worker=node_modules/monaco-editor/esm/vs/editor/editor.worker.js
                   monaco/json.worker=node_modules/monaco-editor/esm/vs/language/json/json.worker.js
                   monaco/css.worker=node_modules/monaco-editor/esm/vs/language/css/css.worker.js
                   monaco/html.worker=node_modules/monaco-editor/esm/vs/language/html/html.worker.js
                   monaco/ts.worker=node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js
                   --bundle --target=es2022 --outdir=../priv/static/assets/js
                   --external:/fonts/* --external:/images/* --alias:@=. --loader:.ttf=file),
          # cd and env as Phoenix generated them
        ]

  Restart `mix phx.server` after changing `config.exs`.

  **4. Load Monaco's CSS.** esbuild writes the CSS Monaco imports next to
  `app.js`. Add a second stylesheet to `root.html.heex`:

      <link phx-track-static rel="stylesheet" href={~p"/assets/js/app.css"} />

  **5. Use it,** with `import Xenia.Adapters.Monaco` in `html_helpers`, and
  echo the client's `version` back from your change handler. That's how the
  editor tells your echo of its own typing apart from a real update:

      def handle_event("code_changed", %{"value" => code, "version" => version}, socket) do
        {:noreply, assign(socket, code: code, version: version)}
      end

  Pass `version={nil}` for an authoritative update. Commands:
  `Xenia.push_to(socket, "editor", "focus")`, and `"insert"` with
  `%{text: "..."}`.

  ## Theme

  The editor follows the app's `theme` provider (light → `vs`, dark →
  `vs-dark`). `themes` replaces those defaults with your own, which can be
  theme maps. `theme` pins one theme and ignores the app's:

      <.monaco id="editor" themes={%{dark: %{name: "midnight", base: "vs-dark",
                                            colors: %{"editor.background" => "#0b1020"}}}} />
      <.monaco id="editor" theme="hc-black" />

  Monaco themes are global: the last theme applied wins for every editor on
  the page.

  ## Forcing the server's value

  Props are only sent to the client when they change. If the server rejects
  an edit and re-renders the same value it rendered before, nothing is sent
  and the editor keeps the user's text. Increment `revision` whenever the
  server's value must replace the editor's content, for example when a form
  is reset after Save.
  """

  use Phoenix.Component

  import Xenia.Component, only: [xenia: 1]

  # Settings with their own attrs; they must not also appear in `options`.
  @managed_options ~w(value language theme)

  attr(:id, :string,
    default: nil,
    doc: "stable DOM id; commands use it. Defaults to the field's id"
  )

  attr(:field, Phoenix.HTML.FormField,
    default: nil,
    doc: "Phoenix form field, for example @form[:code]; provides id and value"
  )

  attr(:adapter, :string,
    default: "Monaco",
    doc: "adapter name registered in createHooks()"
  )

  attr(:value, :string,
    default: nil,
    doc: "editor content when no field is given; nil is treated as \"\""
  )

  attr(:version, :integer,
    default: nil,
    doc: "version echoed from a change event; nil means the value is authoritative"
  )

  attr(:revision, :integer,
    default: 0,
    doc: "increment to force the server's value, even if it equals the last one rendered"
  )

  attr(:language, :string, default: nil, doc: "Monaco language id; omitted if nil")

  attr(:theme, :any,
    default: nil,
    doc:
      "explicit Monaco theme override (a name or a theme map); beats the app's theme. " <>
        "Omitted if nil. Monaco themes are global, so this affects every editor on the page"
  )

  attr(:themes, :map,
    default: nil,
    doc:
      "the Monaco theme for each app theme, e.g. %{light: \"vs\", dark: %{name: \"midnight\", " <>
        "base: \"vs-dark\", colors: %{...}}}. App themes it leaves out use the defaults " <>
        "(light → vs, dark → vs-dark). Omitted if nil"
  )

  attr(:options, :map,
    default: %{},
    doc: "additional Monaco editor options; must not contain value, language or theme"
  )

  attr(:on_change, :string,
    default: nil,
    doc: "LiveView event pushed when the content changes"
  )

  attr(:shortcuts, :map,
    default: %{},
    doc: ~s|Key combination => LiveView event, while the editor has focus (see Xenia.Shortcuts)|
  )

  attr(:on_crash, :string,
    default: nil,
    doc: "LiveView event sent if the editor throws (see Xenia.Component)"
  )

  attr(:rest, :global)

  slot(:loading, doc: "Shown until the editor has loaded, e.g. \"Loading the editor…\"")
  slot(:error, doc: "Shown if the editor fails; data-xenia-retry starts it again")

  @doc "Renders a Monaco editor through Xenia."
  def monaco(assigns) do
    validate_options!(assigns.options, display_id(assigns))

    props =
      %{
        value: %{
          value: editor_value(assigns),
          version: assigns.version,
          revision: assigns.revision
        },
        options: assigns.options
      }
      # Omit unset props; in particular, never change the global theme.
      |> maybe_put(:language, assigns.language)
      |> maybe_put(:theme, assigns.theme)
      |> maybe_put(:themes, assigns.themes)

    assigns =
      assign(assigns,
        xenia_props: props,
        xenia_events: maybe_put(%{}, :change, assigns.on_change)
      )

    ~H"""
    <.xenia
      id={@id}
      field={@field}
      adapter={@adapter}
      props={@xenia_props}
      events={@xenia_events}
      shortcuts={@shortcuts}
      on_crash={@on_crash}
      {@rest}
    >
      <:loading :for={slot <- @loading}>{render_slot(slot)}</:loading>
      <:error :for={slot <- @error}>{render_slot(slot)}</:error>
    </.xenia>
    """
  end

  # A field's value wins over `value`, so the editor always shows what the
  # form will submit.
  defp editor_value(%{field: %Phoenix.HTML.FormField{value: value}}), do: value || ""
  defp editor_value(%{value: value}), do: value || ""

  # The id used in error messages: explicit, or taken from the field.
  defp display_id(%{id: id}) when is_binary(id), do: id
  defp display_id(%{field: %Phoenix.HTML.FormField{id: id}}), do: id
  defp display_id(_assigns), do: nil

  # Rejects options that would conflict with a dedicated attr.
  defp validate_options!(options, id) when is_map(options) do
    conflicts = Enum.filter(Map.keys(options), &(to_string(&1) in @managed_options))

    if conflicts != [] do
      raise ArgumentError,
            "Monaco component #{inspect(id)}: pass #{inspect(conflicts)} as attributes, " <>
              "not inside :options"
    end
  end

  defp validate_options!(options, id) do
    raise ArgumentError,
          "Monaco component #{inspect(id)}: options must be a map, got: #{inspect(options)}"
  end

  # Skips nil and empty strings, so unset attrs never reach the client.
  defp maybe_put(map, _key, value) when value in [nil, ""], do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)
end
