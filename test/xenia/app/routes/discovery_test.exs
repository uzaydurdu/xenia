defmodule Xenia.Routes.DiscoveryTest do
  @moduledoc """
  Tests how app-directory paths become pages: URL paths, params, route
  groups, layout chains and their persistent parts, ordering, and the
  errors for invalid folder names, conflicting pages and misplaced files.
  """

  use ExUnit.Case, async: true

  alias Xenia.Routes.{Discovery, Page}

  doctest Discovery

  # ---------------------------------------------------------------------------
  # PAGE/2
  # ---------------------------------------------------------------------------

  test "a dynamic page inside a group gets its URL, params, group and every layout above it" do
    layouts = ["layout.ex", "(auth)/layout.ex", "(auth)/runbooks/layout.ex"]

    assert %Page{
             path: "/runbooks/:id",
             params: ["id"],
             groups: ["auth"],
             layouts: ^layouts
           } = Discovery.page("(auth)/runbooks/[id]/page.ex", layouts)
  end

  test "page.ex at the root is / with only layout.ex" do
    layouts = ["layout.ex", "(auth)/layout.ex", "docs/layout.ex"]

    assert %Page{path: "/", params: [], groups: [], layouts: ["layout.ex"]} =
             Discovery.page("page.ex", layouts)
  end

  test "a folder without a layout.ex adds none, but its parent's still applies" do
    page = Discovery.page("docs/guides/intro/page.ex", ["layout.ex", "docs/layout.ex"])

    assert page.path == "/docs/guides/intro"
    assert page.layouts == ["layout.ex", "docs/layout.ex"]
  end

  test "a layout in the page's own folder applies to it" do
    page = Discovery.page("runbooks/page.ex", ["runbooks/layout.ex"])

    assert page.layouts == ["runbooks/layout.ex"]
  end

  test "layouts outside the page's folders don't apply" do
    page = Discovery.page("runbooks/page.ex", ["docs/layout.ex", "runbooks/[id]/layout.ex"])

    assert page.layouts == []
  end

  test "two params" do
    page = Discovery.page("[org]/projects/[id]/page.ex", [])

    assert page.path == "/:org/projects/:id"
    assert page.params == ["org", "id"]
  end

  test "a page directly inside a group is at /" do
    page = Discovery.page("(auth)/page.ex", ["layout.ex", "(auth)/layout.ex"])

    assert page.path == "/"
    assert page.groups == ["auth"]
    assert page.layouts == ["layout.ex", "(auth)/layout.ex"]
  end

  test "nested groups are listed outermost first" do
    page = Discovery.page("(app)/(admin)/settings/page.ex", [])

    assert page.path == "/settings"
    assert page.groups == ["app", "admin"]
  end

  test "a catch-all segment becomes *name" do
    page = Discovery.page("docs/[...path]/page.ex", [])

    assert page.path == "/docs/*path"
    assert page.params == ["path"]
  end

  test "static folder names may use dots, dashes and underscores" do
    assert Discovery.page("v1.2/release-notes/my_page/page.ex", []).path ==
             "/v1.2/release-notes/my_page"
  end

  test "leading ./ is ignored" do
    page = Discovery.page("./runbooks/page.ex", ["./layout.ex"])

    assert page.file == "runbooks/page.ex"
    assert page.layouts == ["layout.ex"]
  end

  test "only page.ex files are pages" do
    assert_raise ArgumentError, ~r/expected a page.ex file/, fn ->
      Discovery.page("runbooks/layout.ex", [])
    end
  end

  # ---------------------------------------------------------------------------
  # LIVE.EX OWNERSHIP
  # ---------------------------------------------------------------------------

  test "a page without an ancestor live.ex is standalone" do
    assert Discovery.page("projects/[id]/page.ex", ["layout.ex", "settings/live.ex"]).live == nil
  end

  test "sibling pages under one live.ex share it" do
    files = ["settings/live.ex"]

    assert Discovery.page("settings/profile/page.ex", files).live == "settings/live.ex"
    assert Discovery.page("settings/security/page.ex", files).live == "settings/live.ex"
  end

  test "a live.ex owns a page in its own folder" do
    assert Discovery.page("settings/page.ex", ["settings/live.ex"]).live == "settings/live.ex"
  end

  test "a nested live.ex starts a new owner" do
    files = ["settings/live.ex", "settings/billing/live.ex"]

    assert Discovery.page("settings/profile/page.ex", files).live == "settings/live.ex"
    assert Discovery.page("settings/billing/page.ex", files).live == "settings/billing/live.ex"

    assert Discovery.page("settings/billing/invoices/page.ex", files).live ==
             "settings/billing/live.ex"
  end

  test "a live.ex inside a route group owns the group's pages" do
    page = Discovery.page("(admin)/users/page.ex", ["(admin)/live.ex"])

    assert page.path == "/users"
    assert page.live == "(admin)/live.ex"
  end

  test "live.ex files are not layouts" do
    page = Discovery.page("settings/profile/page.ex", ["settings/live.ex", "settings/layout.ex"])

    assert page.layouts == ["settings/layout.ex"]
  end

  test "pages/1 reports the owner of every page" do
    files = [
      "settings/live.ex",
      "settings/profile/page.ex",
      "settings/security/page.ex",
      "projects/page.ex"
    ]

    assert for(page <- Discovery.pages(files), do: {page.path, page.live}) == [
             {"/projects", nil},
             {"/settings/profile", "settings/live.ex"},
             {"/settings/security", "settings/live.ex"}
           ]
  end

  test "a live.ex that owns no pages is an error" do
    assert_raise ArgumentError, ~r/docs\/live.ex owns no pages/, fn ->
      Discovery.pages(["page.ex", "docs/live.ex"])
    end
  end

  test "a live.ex whose pages all belong to a nested live.ex owns nothing" do
    assert_raise ArgumentError, ~r/^settings\/live.ex owns no pages/, fn ->
      Discovery.pages([
        "settings/live.ex",
        "settings/billing/live.ex",
        "settings/billing/page.ex"
      ])
    end
  end

  test "a live.ex in a private folder is ignored" do
    assert [%Page{live: nil}] = Discovery.pages(["page.ex", "_drafts/live.ex"])
  end

  # ---------------------------------------------------------------------------
  # PERSISTENT.EX
  # ---------------------------------------------------------------------------

  test "a persistent.ex belongs to the layout.ex in its folder" do
    files = [
      "layout.ex",
      "(auth)/layout.ex",
      "(auth)/persistent.ex",
      "(auth)/runbooks/layout.ex",
      "(auth)/runbooks/persistent.ex"
    ]

    page = Discovery.page("(auth)/runbooks/[id]/page.ex", files)

    assert page.layouts == ["layout.ex", "(auth)/layout.ex", "(auth)/runbooks/layout.ex"]

    assert page.persistent == %{
             "(auth)/layout.ex" => "(auth)/persistent.ex",
             "(auth)/runbooks/layout.ex" => "(auth)/runbooks/persistent.ex"
           }
  end

  test "a persistent.ex applies only to pages under its layout" do
    files = ["(auth)/layout.ex", "(auth)/persistent.ex", "login/layout.ex"]

    assert Discovery.page("login/page.ex", files).persistent == %{}

    assert Discovery.page("(auth)/dashboard/page.ex", files).persistent |> Map.keys() == [
             "(auth)/layout.ex"
           ]
  end

  test "a persistent.ex at the root belongs to the root layout" do
    page = Discovery.page("page.ex", ["layout.ex", "persistent.ex"])
    assert page.persistent == %{"layout.ex" => "persistent.ex"}
  end

  test "persistent.ex files are neither pages nor layouts" do
    assert [%Page{file: "page.ex", layouts: ["layout.ex"]}] =
             Discovery.pages(["page.ex", "layout.ex", "persistent.ex"])
  end

  test "a persistent.ex without a layout.ex next to it is an error" do
    assert_raise ArgumentError,
                 ~r/^\(auth\)\/persistent.ex has no layout.ex next to it.*add \(auth\)\/layout.ex/,
                 fn ->
                   Discovery.pages(["layout.ex", "(auth)/persistent.ex", "(auth)/x/page.ex"])
                 end
  end

  test "a layout.ex in a parent folder doesn't count as next to it" do
    assert_raise ArgumentError, ~r/runbooks\/persistent.ex has no layout.ex next to it/, fn ->
      Discovery.pages(["layout.ex", "runbooks/persistent.ex", "runbooks/page.ex"])
    end
  end

  test "a persistent.ex in a private folder is ignored" do
    assert [%Page{persistent: %{}}] = Discovery.pages(["page.ex", "_parts/persistent.ex"])
  end

  # ---------------------------------------------------------------------------
  # INVALID FOLDERS
  # ---------------------------------------------------------------------------

  for dir <- [
        "[]",
        "[id",
        "[Id]",
        "[user-id]",
        "[[...path]]",
        "()",
        "(x",
        "(Auth)",
        "my page",
        "a:b"
      ] do
    test "rejects the folder name #{inspect(dir)}" do
      assert_raise ArgumentError,
                   ~r/invalid folder name #{Regex.escape(inspect(unquote(dir)))}/,
                   fn ->
                     Discovery.page(unquote(dir) <> "/page.ex", [])
                   end
    end
  end

  test "a catch-all must be the last folder" do
    assert_raise ArgumentError, ~r/catch-all segment must be the last folder/, fn ->
      Discovery.page("docs/[...path]/edit/page.ex", [])
    end
  end

  test "an optional catch-all points to the plain one, which already matches no parts" do
    assert_raise ArgumentError, ~r/write it as \[\.\.\.path\]: a catch-all already matches/, fn ->
      Discovery.page("docs/[[...path]]/page.ex", [])
    end

    assert_raise ArgumentError, ~r/put a page.ex in the folder above/, fn ->
      Discovery.page("posts/[[id]]/page.ex", [])
    end
  end

  test "a parameter name can't repeat" do
    assert_raise ArgumentError, ~r/"id" is used twice/, fn ->
      Discovery.page("[id]/children/[id]/page.ex", [])
    end
  end

  # ---------------------------------------------------------------------------
  # PAGES/1
  # ---------------------------------------------------------------------------

  test "pages/1 finds pages and their layouts in a file list" do
    files = ["layout.ex", "page.ex", "(auth)/layout.ex", "(auth)/runbooks/[id]/page.ex"]

    assert [%Page{path: "/"}, %Page{path: "/runbooks/:id", layouts: layouts}] =
             Discovery.pages(files)

    assert layouts == ["layout.ex", "(auth)/layout.ex"]
  end

  test "two pages resolving to the same path raise an error naming both files" do
    assert_raise ArgumentError,
                 "these pages resolve to the same path: (admin)/settings/page.ex, (auth)/settings/page.ex",
                 fn ->
                   Discovery.pages(["(auth)/settings/page.ex", "(admin)/settings/page.ex"])
                 end
  end

  test "dynamic segments with different names still conflict" do
    assert_raise ArgumentError,
                 ~r/same path: runbooks\/\[id\]\/page.ex, runbooks\/\[slug\]\/page.ex/,
                 fn ->
                   Discovery.pages(["runbooks/[id]/page.ex", "runbooks/[slug]/page.ex"])
                 end
  end

  test "static segments come before dynamic ones, catch-alls last" do
    files = [
      "runbooks/[...rest]/page.ex",
      "runbooks/[id]/page.ex",
      "runbooks/new/page.ex",
      "[slug]/page.ex",
      "runbooks/page.ex",
      "page.ex"
    ]

    assert Enum.map(Discovery.pages(files), & &1.path) ==
             ["/", "/runbooks", "/runbooks/new", "/runbooks/:id", "/runbooks/*rest", "/:slug"]
  end

  test "private folders and other files are ignored" do
    files = ["page.ex", "_components/page.ex", "docs/_drafts/page.ex", "docs/form.ex"]

    assert Enum.map(Discovery.pages(files), & &1.file) == ["page.ex"]
  end

  # ---------------------------------------------------------------------------
  # SCAN/1
  # ---------------------------------------------------------------------------

  @tag :tmp_dir
  test "scan/1 on a temporary folder finds the real files", %{tmp_dir: root} do
    touch(root, [
      "layout.ex",
      "page.ex",
      "(auth)/layout.ex",
      "(auth)/persistent.ex",
      "(auth)/runbooks/layout.ex",
      "(auth)/runbooks/page.ex",
      "(auth)/runbooks/[id]/page.ex",
      "(auth)/runbooks/[id]/runbook_form.ex",
      "settings/live.ex",
      "settings/profile/page.ex",
      "_components/page.ex",
      ".hidden/page.ex"
    ])

    assert Discovery.scan(root) == [
             %Page{file: "page.ex", path: "/", layouts: ["layout.ex"]},
             %Page{
               file: "(auth)/runbooks/page.ex",
               path: "/runbooks",
               groups: ["auth"],
               layouts: ["layout.ex", "(auth)/layout.ex", "(auth)/runbooks/layout.ex"],
               persistent: %{"(auth)/layout.ex" => "(auth)/persistent.ex"}
             },
             %Page{
               file: "(auth)/runbooks/[id]/page.ex",
               path: "/runbooks/:id",
               params: ["id"],
               groups: ["auth"],
               layouts: ["layout.ex", "(auth)/layout.ex", "(auth)/runbooks/layout.ex"],
               persistent: %{"(auth)/layout.ex" => "(auth)/persistent.ex"}
             },
             %Page{
               file: "settings/profile/page.ex",
               path: "/settings/profile",
               layouts: ["layout.ex"],
               live: "settings/live.ex"
             }
           ]
  end

  test "scan/1 raises for a missing folder" do
    assert_raise ArgumentError, ~r/app folder not found/, fn ->
      Discovery.scan("does/not/exist")
    end
  end

  defp touch(root, files) do
    for file <- files do
      path = Path.join(root, file)
      File.mkdir_p!(Path.dirname(path))
      File.write!(path, "")
    end
  end
end
