defmodule XeniaExamplesWeb.App.Sidebar do
  @moduledoc """
  The sidebar: the persistent part of the root layout (`layout.ex`).

  It is a LiveView that stays alive while you move between pages, so it
  keeps its state. The counter below the links shows it: it counts every
  page you open, and only starts again if you reload the browser.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Persistent

  alias XeniaExamplesWeb.App.Examples

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, path: nil, pages_seen: 0, groups: Examples.groups())}
  end

  # Xenia calls this when the sidebar connects, and after every page change.
  # (A persistent part can't use handle_params/3.)
  @impl true
  def handle_navigation(uri, socket) do
    socket = assign(socket, path: URI.parse(uri).path)
    {:noreply, update(socket, :pages_seen, &(&1 + 1))}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <nav id="sidebar" class="flex flex-col gap-1 text-sm">
      <.link
        navigate="/"
        data-active={to_string(@path == "/")}
        class={["rounded-md px-2 py-1 hover:bg-base-200", @path == "/" && "bg-base-200 font-medium"]}
      >
        Home
      </.link>
      <div :for={{title, _intro, examples} <- @groups} class="mt-4 flex flex-col gap-1">
        <p class="px-2 pb-1 text-xs font-medium uppercase tracking-wide opacity-60">{title}</p>
        <.link
          :for={example <- examples}
          navigate={example.path}
          data-active={to_string(current?(example, @path))}
          class={[
            "rounded-md px-2 py-1 hover:bg-base-200",
            current?(example, @path) && "bg-base-200 font-medium"
          ]}
        >
          {example.title}
        </.link>
      </div>
      <p class="mt-6 px-2 text-xs opacity-60">
        This sidebar stays alive across pages. Pages opened:
        <span id="pages-seen">{@pages_seen}</span>
      </p>
    </nav>
    """
  end

  defp current?(example, path) do
    path == example.path or
      (Map.has_key?(example, :match) and String.starts_with?(path || "", example.match))
  end
end
