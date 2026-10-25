defmodule Xenia.SitemapTest do
  @moduledoc """
  Tests `Xenia.Sitemap` against real routers: each test writes an app
  folder with real page and layout modules, compiles them and a router with
  `xenia_routes`, and reads the sitemap.
  """

  use ExUnit.Case, async: true

  import Plug.Test, only: [conn: 2]

  @moduletag :tmp_dir

  # Writes the files and compiles them, so pages' sitemap/0 and layouts'
  # options exist at runtime.
  defp app(root, files) do
    for {file, source} <- files do
      path = Path.join(root, file)
      File.mkdir_p!(Path.dirname(path))
      File.write!(path, source)
    end

    Code.with_diagnostics([log: false], fn ->
      for {file, _source} <- files, do: Code.compile_file(Path.join(root, file))
    end)

    root
  end

  defp router(root, body \\ ~s(xenia_routes "@root")) do
    module = Module.concat(__MODULE__, "Router#{System.unique_integer([:positive])}")

    Code.with_diagnostics([log: false], fn ->
      Code.compile_string("""
      defmodule #{inspect(module)} do
        use Phoenix.Router
        import Phoenix.LiveView.Router, warn: false
        import Xenia.Routes

        #{String.replace(body, "@root", root)}
      end
      """)
    end)

    module
  end

  defp page(module, body \\ ""), do: "defmodule #{module} do\n#{body}\nend\n"

  defp layout(module, opts) do
    """
    defmodule #{module} do
      use Xenia.Layout#{opts}
      def frame(assigns), do: ~H"{@inner_content}"
    end
    """
  end

  defp files(prefix) do
    %{
      "page.ex" => page("#{prefix}.Home"),
      "pricing/page.ex" => page("#{prefix}.Pricing"),
      "about/page.ex" => page("#{prefix}.About", "def sitemap, do: []"),
      "posts/[slug]/page.ex" =>
        page("#{prefix}.Post", ~s|def sitemap, do: [%{slug: "hello world"}, %{"slug" => "b"}]|),
      "docs/[...path]/page.ex" =>
        page("#{prefix}.Docs", ~s|def sitemap, do: [%{path: ["guides", "install"]}, %{path: []}]|),
      "projects/[id]/page.ex" => page("#{prefix}.Project"),
      "(account)/layout.ex" => layout("#{prefix}.AccountLayout", ", sitemap: false"),
      "(account)/settings/page.ex" => page("#{prefix}.Settings")
    }
  end

  test "static pages, dynamic pages with sitemap/0, and nothing under sitemap: false",
       %{tmp_dir: tmp} do
    router = tmp |> app(files("S1")) |> router()

    assert Enum.sort(Xenia.Sitemap.paths(router)) == [
             "/",
             "/docs",
             "/docs/guides/install",
             "/posts/b",
             "/posts/hello%20world",
             "/pricing"
           ]
  end

  test "a surrounding scope's path is part of every entry", %{tmp_dir: tmp} do
    router = tmp |> app(files("S2")) |> router(~s|scope "/site" do\n xenia_routes "@root"\nend|)

    assert "/site/pricing" in Xenia.Sitemap.paths(router)
    assert "/site/posts/b" in Xenia.Sitemap.paths(router)
  end

  test "a router without xenia_routes has no entries", %{tmp_dir: tmp} do
    router = router(tmp, ~s|get "/x", Plug.Head, []|)
    assert Xenia.Sitemap.paths(router) == []
  end

  test "a sitemap/0 entry missing a parameter raises, naming the page", %{tmp_dir: tmp} do
    router =
      tmp
      |> app(%{"posts/[slug]/page.ex" => page("S3.Post", "def sitemap, do: [%{id: 1}]")})
      |> router()

    assert_raise ArgumentError,
                 ~r/S3.Post.sitemap\/0 returned %\{"id" => 1\}, without "slug"/,
                 fn ->
                   Xenia.Sitemap.paths(router)
                 end
  end

  test "xml/2 writes one escaped <url> per path after the base URL", %{tmp_dir: tmp} do
    router =
      tmp
      |> app(%{
        "page.ex" => page("S4.Home"),
        "q/[term]/page.ex" => page("S4.Term", ~s|def sitemap, do: [%{term: "a&b"}]|)
      })
      |> router()

    xml = Xenia.Sitemap.xml(router, "https://acme.test/")

    assert xml =~ ~s(<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">)
    assert xml =~ "<url><loc>https://acme.test/</loc></url>"
    # & is percent-encoded in the path; anything left would be XML-escaped.
    assert xml =~ "<url><loc>https://acme.test/q/a%26b</loc></url>"
  end

  test "as a plug, it answers with XML", %{tmp_dir: tmp} do
    router = tmp |> app(%{"page.ex" => page("S5.Home")}) |> router()

    conn =
      conn(:get, "/sitemap.xml")
      |> Plug.Conn.put_private(:phoenix_router, router)
      |> Xenia.Sitemap.call(Xenia.Sitemap.init(base_url: "https://acme.test"))

    assert conn.status == 200
    assert Plug.Conn.get_resp_header(conn, "content-type") == ["application/xml; charset=utf-8"]
    assert conn.resp_body =~ "<loc>https://acme.test/</loc>"
  end
end
