defmodule XeniaExamplesWeb.App.ThemePage do
  @moduledoc """
  `/theme`: islands that follow the app's light and dark mode.

  `assets/js/app.js` publishes the theme once, with `setProvider("theme", ...)`.
  The chart island asks for it with `consumes: ["theme"]` and gets it as an
  ordinary prop. A `theme` attribute on the tag wins, so the second chart
  stays light.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    data = %{
      labels: ~w(Mon Tue Wed Thu Fri),
      datasets: [%{label: "Visits", data: [12, 19, 8, 15, 22]}]
    }

    {:ok, assign(socket, page_title: "Theme", data: data)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Theme</h1>
    <p>Switch the theme at the top right. The first chart follows it. The second stays light.</p>

    <div class="grid gap-6 lg:grid-cols-2">
      <div>
        <h2 class="font-semibold mb-2">Follows the theme</h2>
        <.chart id="follows" data={@data} style="height: 220px" />
      </div>
      <div>
        <h2 class="font-semibold mb-2">Always light: <code>theme="light"</code></h2>
        <.chart id="pinned" data={@data} theme="light" style="height: 220px" class="rounded bg-white" />
      </div>
    </div>
    """
  end
end
