defmodule XeniaExamplesWeb.App.HomePage do
  @moduledoc "The home page, `/`: what Xenia is, and the list of examples."
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  alias XeniaExamplesWeb.App.Examples

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "Xenia examples", groups: Examples.groups())}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Xenia examples</h1>

    <p>
      Most of a Phoenix app runs on the server. Some parts need JavaScript in
      the browser: a chart, a code editor, a date picker. These parts are <strong>JS islands</strong>. Xenia connects them to your LiveView, so you
      only write how the JavaScript library starts, updates and stops.
    </p>

    <p>Each example below is one page. Its code and a short README are in its own folder.</p>

    <section :for={{title, intro, examples} <- @groups} class="space-y-3">
      <h2 class="text-lg font-semibold">{title}</h2>
      <p class="opacity-80">{intro}</p>
      <ul class="examples grid gap-3 sm:grid-cols-2">
        <li :for={example <- examples}>
          <.link
            navigate={example.path}
            class="block h-full rounded-box border border-base-300 bg-base-100 p-4 transition-colors hover:border-primary"
          >
            <span class="font-medium">{example.title}</span>
            <span class="mt-1 block text-sm opacity-75">{example.summary}</span>
          </.link>
        </li>
      </ul>
    </section>
    """
  end
end
