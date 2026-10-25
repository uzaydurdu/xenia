defmodule Xenia.Live do
  @moduledoc """
  The shared LiveView of a `live.ex`: one LiveView owns every page in its
  folder and below.

  Switching between those pages is a `<.link patch>`: the same process keeps
  its state, and `handle_params/3` runs with the new URL. The route's live
  action is the page module, so by default this LiveView renders the current
  page's `render/1` with its own assigns, inside the page's layouts.

  ```elixir
  # app/settings/live.ex  →  owns /settings/profile and /settings/security
  defmodule MyAppWeb.SettingsLive do
    use MyAppWeb, :live_view
    use Xenia.Live

    def mount(_params, _session, socket), do: {:ok, assign(socket, user: load_user())}

    def handle_params(_params, _uri, socket), do: {:noreply, socket}
  end

  # app/settings/profile/page.ex
  defmodule MyAppWeb.ProfilePage do
    use MyAppWeb, :html

    def render(assigns), do: ~H"<h1>{@user.name}</h1>"
  end
  ```

  Define `render/1` yourself to put shared markup around the page; render
  the page with `Xenia.Live.page/1`:

      def render(assigns) do
        ~H\"""
        <nav>...tabs...</nav>
        {Xenia.Live.page(assigns)}
        \"""
      end

  The owner handles every event and message; a page's own LiveView callbacks
  don't run under it. Layouts' `on_mount` hooks run once, when the owner
  mounts, so a `layout.ex` below the `live.ex` can't declare `on_mount`:
  patching to its pages wouldn't run them. `xenia_routes` rejects that at
  compile time.
  """

  defmacro __using__(_opts) do
    Xenia.Page.__check_live_view__!(__CALLER__, "Xenia.Live")

    quote do
      on_mount({Xenia.Page, :layouts})
      on_mount({Xenia.Page, :metadata})
      @before_compile Xenia.Live
    end
  end

  @doc false
  defmacro __before_compile__(env) do
    render =
      if Module.defines?(env.module, {:render, 1}) do
        quote do
          defoverridable render: 1

          def render(var!(assigns)) do
            Xenia.Page.__render__(var!(assigns), super(var!(assigns)))
          end
        end
      else
        quote do
          def render(var!(assigns)) do
            Xenia.Page.__render__(var!(assigns), Xenia.Live.page(var!(assigns)))
          end
        end
      end

    # The current page's metadata, after the owner's handle_params loads
    # its data (see Xenia.Page).
    quote do
      unquote(render)
      unquote(Xenia.Page.__metadata_after_handle_params__(env))
    end
  end

  @doc """
  Renders the current page, the route's live action, with the owner's
  assigns, without layouts (the owner adds them once around its whole
  render).
  """
  @spec page(map()) :: Phoenix.LiveView.Rendered.t()
  def page(%{live_action: page} = assigns) when is_atom(page) and not is_nil(page) do
    page.render(Map.put(assigns, :__xenia_bare__, true))
  end

  def page(assigns) do
    raise ArgumentError,
          "Xenia.Live.page/1 needs the route's live action to be a page module, " <>
            "got: #{inspect(assigns[:live_action])}. Is this LiveView served by xenia_routes?"
  end
end
