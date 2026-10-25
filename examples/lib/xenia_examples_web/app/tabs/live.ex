defmodule XeniaExamplesWeb.App.TabsLive do
  @moduledoc """
  `tabs/live.ex`: one LiveView for every page in `tabs/`.

  The pages `tabs/first` and `tabs/second` only render. This module holds
  the state and handles the events. Switching tabs with `<.link patch>`
  keeps this process, so the counter keeps its value.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Live

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "Tabs", count: 0)}
  end

  # Runs on every tab switch. The state stays; only the URL changes.
  @impl true
  def handle_params(_params, _uri, socket), do: {:noreply, socket}

  @impl true
  def handle_event("add", _params, socket), do: {:noreply, update(socket, :count, &(&1 + 1))}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Tabs</h1>

    <div role="tablist" class="tabs tabs-border">
      <.link
        id="tab-first"
        patch={~p"/tabs/first"}
        role="tab"
        class={["tab", tab_active(@live_action, :first)]}
      >
        First
      </.link>
      <.link
        id="tab-second"
        patch={~p"/tabs/second"}
        role="tab"
        class={["tab", tab_active(@live_action, :second)]}
      >
        Second
      </.link>
    </div>

    {Xenia.Live.page(assigns)}

    <button id="add" phx-click="add" class="btn btn-sm">Add one</button>
    """
  end

  # The current page is the route's live action: the page module.
  defp tab_active(XeniaExamplesWeb.App.Tabs.FirstPage, :first), do: "tab-active"
  defp tab_active(XeniaExamplesWeb.App.Tabs.SecondPage, :second), do: "tab-active"
  defp tab_active(_page, _tab), do: nil
end
