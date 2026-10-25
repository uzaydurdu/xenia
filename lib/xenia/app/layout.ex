defmodule Xenia.Layout do
  @moduledoc """
  A layout in a Xenia app folder: a frame around every page in its folder
  and below.

  Layouts nest by folder, not by declaration. A `layout.ex` applies to every
  page in its folder and below, inside the layouts of its ancestor folders.
  See `Xenia.Routes.Discovery` for the folder conventions, and `Xenia.Page`
  for how a page is rendered inside its layouts.

      # app/(auth)/layout.ex
      defmodule MyAppWeb.AuthLayout do
        use MyAppWeb, :html
        use Xenia.Layout, on_mount: {MyAppWeb.Auth, :require_user}

        def frame(assigns) do
          ~H\"""
          <div class="flex">
            <aside>{@persistent}</aside>
            <main>{@inner_content}</main>
          </div>
          \"""
        end
      end

  ## The frame

  `frame/1` is re-rendered on every navigation. It receives the page's
  assigns, plus:

    * `@inner_content` - the page, already inside the layouts below this one
    * `@persistent` - this layout's persistent part, or `nil`; place it where
      it belongs

  ## The persistent part

  A `persistent.ex` next to the `layout.ex` is the layout's persistent part:
  a LiveView (`use Xenia.Persistent`) that stays mounted, with its state and
  its JavaScript, while the user moves between pages under this layout. The
  frame places it with `{@persistent}`. Persistent parts are rendered side
  by side, never one inside another, and survive only within one
  `live_session` (CLAUDE.md §9, experiment S1).

  ## Options

    * `:on_mount` - `on_mount` hooks run when any page under this layout
      mounts, outermost layout first, like `live_session`'s. This is where a
      route group gets its authentication: a folder name grants nothing.
      Takes a module, `{module, argument}`, or a list of them.
    * `:sitemap` - `false` leaves every page under this layout out of
      `Xenia.Sitemap`, for example pages behind a sign-in. Default `true`.

  ## Metadata

  A layout can define `metadata/1`: the title, description and social tags
  for the pages under it, which they can override (see `Xenia.Metadata`).

      def metadata(_assigns), do: %{title: "Acme", title_template: "%s · Acme"}
  """

  @doc """
  Renders the layout's frame around `@inner_content`, the page. `@persistent`
  is this layout's persistent part, or `nil`.
  """
  @callback frame(assigns :: map()) :: Phoenix.LiveView.Rendered.t()

  @doc "Metadata for the pages under this layout (see `Xenia.Metadata`)."
  @callback metadata(assigns :: map()) :: map()

  @optional_callbacks metadata: 1

  defmacro __using__(opts) do
    if Keyword.has_key?(opts, :parent) do
      raise ArgumentError,
            "Xenia.Layout has no :parent option: layouts nest by folder. " <>
              "Move this layout's file into its parent layout's folder."
    end

    if Keyword.has_key?(opts, :persistent) do
      raise ArgumentError,
            "Xenia.Layout has no :persistent option: a layout's persistent part is " <>
              "the persistent.ex in its folder. Move that LiveView's module into a " <>
              "persistent.ex next to this layout.ex."
    end

    opts = Keyword.validate!(opts, on_mount: [], sitemap: true)

    unless is_boolean(opts[:sitemap]) do
      raise ArgumentError,
            "Xenia layout option :sitemap must be true or false, got: #{Macro.to_string(opts[:sitemap])}"
    end

    # Expanded inside a function context, so the modules are runtime
    # dependencies and editing them doesn't recompile the layout.
    env = %{__CALLER__ | function: {:__xenia_layout__, 0}}
    on_mount = opts[:on_mount] |> List.wrap() |> Enum.map(&expand_hook!(&1, env))

    # Layouts often live in modules that already `use MyAppWeb, :html`.
    # Using Phoenix.Component twice defines its verification callback twice,
    # a warning that fails --warnings-as-errors (CLAUDE.md §6, M4), so skip
    # it when `def` is already Phoenix's. Same check as Xenia.Components.
    already_phoenix_component? =
      {:macro, Phoenix.Component.Declarative} in Macro.Env.lookup_import(__CALLER__, {:def, 2})

    phoenix_component =
      unless already_phoenix_component? do
        quote do: use(Phoenix.Component)
      end

    quote do
      unquote(phoenix_component)

      # A missing frame/1 is a compile-time warning.
      @behaviour Xenia.Layout

      @doc false
      def __xenia_layout__ do
        %{on_mount: unquote(Macro.escape(on_mount)), sitemap: unquote(opts[:sitemap])}
      end
    end
  end

  defp expand_module!(ast, env, key) do
    case Macro.expand(ast, env) do
      module when is_atom(module) ->
        module

      other ->
        raise ArgumentError,
              "Xenia layout option #{inspect(key)} must be a module, " <>
                "got: #{Macro.to_string(other)}"
    end
  end

  # `Mod` or `{Mod, arg}`, normalized to `{Mod, arg}` like live_session's.
  defp expand_hook!({module, arg}, env), do: {expand_module!(module, env, :on_mount), arg}
  defp expand_hook!(module, env), do: {expand_module!(module, env, :on_mount), :default}

  @doc "Returns true if `module` is a Xenia layout."
  @spec layout?(term()) :: boolean()
  def layout?(module) when is_atom(module) do
    Code.ensure_loaded?(module) and function_exported?(module, :__xenia_layout__, 0)
  end

  def layout?(_other), do: false

  @doc """
  Returns the `on_mount` hooks a layout declares, as `{module, argument}`.

  Raises `ArgumentError` if `module` is not a Xenia layout.
  """
  @spec on_mount(module()) :: [{module(), term()}]
  def on_mount(module), do: config!(module).on_mount

  @doc """
  Whether pages under the layout belong in the sitemap (its `:sitemap`
  option). Raises `ArgumentError` if `module` is not a Xenia layout.
  """
  @spec sitemap?(module()) :: boolean()
  def sitemap?(module), do: Map.get(config!(module), :sitemap, true)

  @doc """
  The DOM id of a layout's persistent part. Stable per layout, so every page
  under the layout renders "the same" sticky LiveView, and LiveView keeps it
  across navigation.
  """
  @spec persistent_id(module()) :: String.t()
  def persistent_id(module) do
    "xenia-persistent-" <>
      (module |> inspect() |> String.replace(~r/[^A-Za-z0-9]+/, "-") |> String.downcase())
  end

  defp config!(module) do
    unless layout?(module) do
      raise ArgumentError,
            "#{inspect(module)} is not a Xenia layout. Add `use Xenia.Layout` to it."
    end

    module.__xenia_layout__()
  end
end
