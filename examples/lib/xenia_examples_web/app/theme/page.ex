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
    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet title="The tags, in page.ex" code={tag_snippet()} />
    <.snippet
      title="The adapter asks for the theme, in assets/js/islands/chart.js"
      code={adapter_snippet()}
    />
    <.snippet title="The app publishes it once, in assets/js/app.js" code={app_snippet()} />
    """
  end

  # The code on the page: how this example is made.
  defp tag_snippet,
    do: ~S"""
    <.chart id="follows" data={@data} />
    <.chart id="pinned" data={@data} theme="light" />
    """

  defp adapter_snippet,
    do: ~S"""
    export const chart = {
      consumes: ["theme"], // arrives as a `theme` prop, like any other
      props: {
        theme(chart, theme, ctx) {
          chart.options = options(theme, ctx) // light or dark colors
          chart.update()
        },
      },
      // ...
    }
    """

  defp app_snippet,
    do: ~S"""
    import { setProvider } from "xenia"

    // Phoenix's theme toggle keeps <html data-theme> current.
    const publishTheme = () =>
      setProvider("theme", document.documentElement.dataset.theme ?? "light")

    publishTheme()
    new MutationObserver(publishTheme)
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    """
end
