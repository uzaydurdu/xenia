defmodule XeniaExamplesWeb.App.Routing.Posts.SlugPage do
  @moduledoc """
  `/routing/posts/:slug`: a URL with a parameter. The folder `[slug]`
  matches any one part of the URL, and the page gets it as
  `params["slug"]`.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  import XeniaExamplesWeb.App.Routing.RouteInfo

  @posts %{
    "hello-xenia" => %{
      title: "Hello, Xenia",
      body:
        "This post's URL is /routing/posts/hello-xenia, so params[\"slug\"] is \"hello-xenia\"."
    },
    "folders-are-urls" => %{
      title: "Folders are URLs",
      body: "Same file, another slug. One page.ex answers every post."
    }
  }

  @impl true
  def mount(%{"slug" => slug} = params, _session, socket) do
    post = Map.get(@posts, slug)

    {:ok, assign(socket, params: params, slug: slug, post: post)}
  end

  # The title and description come from the post, so they're computed after
  # mount loaded it. The layout's template adds " · File-based routing".
  def metadata(%{post: nil}), do: %{title: "No such post", robots: "noindex"}

  def metadata(%{post: post}),
    do: %{title: post.title, description: post.body, open_graph: %{type: "article"}}

  # A page with a parameter is in the sitemap only with these values.
  def sitemap, do: for(slug <- Map.keys(@posts), do: %{slug: slug})

  @impl true
  def render(assigns) do
    ~H"""
    <h1 id="post-title" class="text-2xl font-semibold">
      {if @post, do: @post.title, else: "No post called \"#{@slug}\""}
    </h1>

    <.route_info route="/routing/posts/:slug" file="routing/posts/[slug]/page.ex" params={@params} />

    <p :if={@post} id="post">{@post.body}</p>

    <p :if={!@post} id="post">
      The route still matched: <code>[slug]</code> takes any value. Deciding what a
      value means, here "no such post", is the page's job.
    </p>

    <p>
      Try your own: change the end of the URL in the address bar, for example to <.link
        navigate={~p"/routing/posts/anything"}
        class="link"
      >/routing/posts/anything</.link>.
    </p>
    """
  end
end
