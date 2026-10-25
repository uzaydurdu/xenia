defmodule Xenia.Persistent do
  @moduledoc """
  A layout's persistent part: a LiveView that stays mounted, with its state
  and its JavaScript components, while the user moves between the pages
  under its layout. It lives in a `persistent.ex` next to the `layout.ex`;
  the module name is yours.

  ```elixir
  # app/(auth)/persistent.ex, next to app/(auth)/layout.ex
  defmodule MyAppWeb.ShellLive do
    use MyAppWeb, :live_view
    use Xenia.Persistent

    def mount(_params, _session, socket), do: {:ok, assign(socket, path: nil)}

    def handle_navigation(uri, socket) do
      {:noreply, assign(socket, path: URI.parse(uri).path)}
    end

    def render(assigns) do
      ~H\"""
      <nav>
        <.link navigate="/dashboard" class={@path == "/dashboard" && "active"}>Dashboard</.link>
      </nav>
      \"""
    end
  end
  ```

  Xenia renders it as a sticky LiveView, from the page, at the place its
  layout's frame puts `@persistent` (CLAUDE.md §9, experiment S1). What that
  means for you:

    * **It knows the current page through `handle_navigation/2`.** A sticky
      LiveView can't define `handle_params/3`: LiveView raises. Xenia calls
      `handle_navigation(uri, socket)` once it is connected, and after every
      navigation and patch, from LiveView's `phx:navigate` browser event.
    * **It is configured once.** It mounts when the first page under its
      layout renders, and keeps its state until a page outside the layout is
      shown. Pages can't pass it new parameters; send it a message instead.
    * **It only persists within one `live_session`.** Leaving it is a full
      page load.
  """

  use Phoenix.Component

  @doc """
  Called with the page's full URL once the persistent part is connected,
  and after every navigation and patch. Optional.
  """
  @callback handle_navigation(uri :: String.t(), socket :: Phoenix.LiveView.Socket.t()) ::
              {:noreply, Phoenix.LiveView.Socket.t()}

  @optional_callbacks handle_navigation: 2

  defmacro __using__(_opts) do
    Xenia.Page.__check_live_view__!(__CALLER__, "Xenia.Persistent")

    quote do
      @behaviour Xenia.Persistent
      on_mount({Xenia.Persistent, :navigation})
      @before_compile Xenia.Persistent
    end
  end

  @doc false
  defmacro __before_compile__(env) do
    unless Module.defines?(env.module, {:render, 1}) do
      raise ArgumentError,
            "#{inspect(env.module)} uses Xenia.Persistent but defines no render/1 " <>
              "(and has no colocated template)"
    end

    quote do
      defoverridable render: 1

      def render(var!(assigns)) do
        Xenia.Persistent.__render__(var!(assigns), super(var!(assigns)))
      end
    end
  end

  @doc false
  # The LiveView's own render, plus the hidden element whose hook reports
  # navigation (`XeniaNavigation` in createHooks).
  def __render__(%{socket: socket}, inner) do
    navigation(%{
      inner: inner,
      nav_id: "#{socket.id}-xenia-navigation",
      hook: %{"#{Xenia.Component.binding_prefix()}hook" => "XeniaNavigation"}
    })
  end

  defp navigation(assigns) do
    ~H"""
    <div id={@nav_id} hidden {@hook}></div>
    {@inner}
    """
  end

  @doc false
  def on_mount(:navigation, _params, _session, socket) do
    {:cont,
     Phoenix.LiveView.attach_hook(socket, :xenia_navigation, :handle_event, &__navigation__/3)}
  end

  @doc false
  # The handle_event hook: "xenia:navigate" goes to handle_navigation/2 and
  # stops there; every other event continues to the LiveView.
  def __navigation__("xenia:navigate", %{"href" => href}, socket) when is_binary(href) do
    view = socket.view

    if function_exported?(view, :handle_navigation, 2) do
      case view.handle_navigation(href, socket) do
        {:noreply, %Phoenix.LiveView.Socket{} = socket} ->
          {:halt, socket}

        other ->
          raise ArgumentError,
                "#{inspect(view)}.handle_navigation/2 must return {:noreply, socket}, " <>
                  "got: #{inspect(other)}"
      end
    else
      {:halt, socket}
    end
  end

  def __navigation__(_event, _params, socket), do: {:cont, socket}
end
