defmodule XeniaExamplesWeb.App.RoutingPage do
  @moduledoc """
  `/routing`: how folders become URLs. This file is `routing/page.ex`.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  import XeniaExamplesWeb.App.Routing.RouteInfo

  @impl true
  def mount(params, _session, socket) do
    {:ok, assign(socket, params: params)}
  end

  # The page's <title> and description (Xenia.Metadata).
  def metadata(_assigns),
    do: %{title: "Overview", description: "How folders become URLs in a Xenia app."}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">File-based routing</h1>
    <p>
      In this app, nobody writes routes by hand. Each <code>page.ex</code> file is a page, and
      the folders it sits in are its URL. The links above open every page of this example.
    </p>

    <.route_info route="/routing" file="routing/page.ex" params={@params} />

    <h2 class="text-lg font-semibold">The folder</h2>
    <pre
      id="tree"
      class="overflow-x-auto rounded-box border border-base-300 bg-base-100 p-4 text-sm"
    >app/routing/
      layout.ex                    the links at the top of every page below
      page.ex                      /routing                 (this page)
      posts/[slug]/page.ex         /routing/posts/:slug     a parameter
      docs/[...path]/page.ex       /routing/docs/*path      a catch-all
      (company)/layout.ex          a frame for team and contact only
      (company)/team/page.ex       /routing/team            no "company" in the URL
      (company)/contact/page.ex    /routing/contact
      _parts/route_info.ex         never a route: shared code</pre>

    <h2 class="text-lg font-semibold">The rules</h2>
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>In the folder</th>
            <th>In the URL</th>
            <th>In the page</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>posts/</code></td>
            <td><code>/posts</code></td>
            <td>a fixed part of the URL</td>
          </tr>
          <tr>
            <td><code>[slug]/</code></td>
            <td><code>/:slug</code></td>
            <td>
              <code>params["slug"]</code>, a string
            </td>
          </tr>
          <tr>
            <td><code>[...path]/</code></td>
            <td><code>/*path</code></td>
            <td>
              <code>params["path"]</code>, a list of the rest of the URL (empty
              for <code>/routing/docs</code>)
            </td>
          </tr>
          <tr>
            <td><code>(company)/</code></td>
            <td>nothing</td>
            <td>groups pages, for example under one layout</td>
          </tr>
          <tr>
            <td><code>_parts/</code></td>
            <td>never a page</td>
            <td>for code your pages share</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2 class="text-lg font-semibold">The router</h2>
    <p>One line makes a route for every page in the folder:</p>
    <pre class="overflow-x-auto rounded-box border border-base-300 bg-base-100 p-4 text-sm">live_session :app do
      xenia_routes "lib/xenia_examples_web/app"
    end</pre>
    <p>
      The routes are plain Phoenix routes. <code>mix phx.routes</code>
      lists them, <code>~p"/routing/posts/hello-xenia"</code>
      checks a link at compile time, and <code>mix xenia.routes</code>
      also shows each page's layouts.
    </p>
    """
  end
end
