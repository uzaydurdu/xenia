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
    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet title="tabs/live.ex: one LiveView for both tabs" code={live_snippet()} />
    <.snippet
      title="tabs/first/page.ex: a page that only renders, with the LiveView's assigns"
      code={page_snippet()}
    />
    """
  end

  # The current page is the route's live action: the page module.
  defp tab_active(XeniaExamplesWeb.App.Tabs.FirstPage, :first), do: "tab-active"
  defp tab_active(XeniaExamplesWeb.App.Tabs.SecondPage, :second), do: "tab-active"
  defp tab_active(_page, _tab), do: nil

  # The code on the page: how this example is made.
  defp live_snippet,
    do: ~S'''
    defmodule MyAppWeb.App.TabsLive do
      use MyAppWeb, :live_view
      use Xenia.Live

      def mount(_params, _session, socket), do: {:ok, assign(socket, count: 0)}
      def handle_params(_params, _uri, socket), do: {:noreply, socket}
      def handle_event("add", _params, socket), do: {:noreply, update(socket, :count, &(&1 + 1))}

      def render(assigns) do
        ~H"""
        <.link patch={~p"/tabs/first"}>First</.link>
        <.link patch={~p"/tabs/second"}>Second</.link>
        {Xenia.Live.page(assigns)}
        <button phx-click="add">Add one</button>
        """
      end
    end
    '''

  defp page_snippet,
    do: ~S'''
    defmodule MyAppWeb.App.Tabs.FirstPage do
      use MyAppWeb, :html

      def render(assigns) do
        ~H"""
        <p>First tab. The count is {@count}.</p>
        """
      end
    end
    '''
end
