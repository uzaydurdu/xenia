defmodule XeniaExamplesWeb.FormsTest do
  @moduledoc """
  The server side of `/forms`. The browser side (each island as a form
  field, errors once used, everything submitted) is in
  assets/e2e/adapters.test.mjs.
  """
  use XeniaExamplesWeb.ConnCase, async: true

  import Phoenix.LiveViewTest

  @filled %{
    "title" => "Hello Xenia",
    "code" => "IO.puts(:hello)",
    "body" => "<p>A post.</p>",
    "due" => "2026-11-10",
    "priority" => "4"
  }

  # The "Saved" list, as a reader sees it: "Tags: phoenix, elixir".
  defp saved(html) do
    html
    |> LazyHTML.from_document()
    |> LazyHTML.query("#saved li")
    |> Enum.map(&(&1 |> LazyHTML.text() |> String.split() |> Enum.join(" ")))
  end

  defp save(view, tags),
    do: render_submit(view, "save", %{"post" => Map.put(@filled, "tags", tags)})

  test "the tags, submitted as a list, are listed", %{conn: conn} do
    {:ok, view, _html} = live(conn, ~p"/forms")
    assert "Tags: phoenix, elixir" in saved(save(view, ["phoenix", "elixir"]))
  end

  test "no tags: the form sends [\"\"], which lists none", %{conn: conn} do
    {:ok, view, _html} = live(conn, ~p"/forms")
    assert "Tags:" in saved(save(view, [""]))
  end

  test "tags that aren't a list of strings are no tags, not a crash", %{conn: conn} do
    {:ok, view, _html} = live(conn, ~p"/forms")

    for tags <- ["not a list", ~s(["phoenix"]), %{"a" => "1"}] do
      items = saved(save(view, tags))
      assert "Title: Hello Xenia" in items, "the page answered for tags=#{inspect(tags)}"
      assert "Tags:" in items
    end
  end

  test "no tags render one empty input; the adapter gets the list without it",
       %{conn: conn} do
    {:ok, view, html} = live(conn, ~p"/forms")

    inputs =
      html
      |> LazyHTML.from_document()
      |> LazyHTML.query("#post_tags > input[data-xenia-field]")
      |> Enum.map(&{LazyHTML.attribute(&1, "name"), LazyHTML.attribute(&1, "value")})

    assert inputs == [{["post[tags][]"], [""]}]
    assert Xenia.Test.xenia_props(view, "post_tags")["value"] == []

    render_change(view, "validate", %{"post" => %{"tags" => [""]}})
    assert Xenia.Test.xenia_props(view, "post_tags")["value"] == []

    render_change(view, "validate", %{"post" => %{"tags" => ["phoenix", "elixir"]}})
    assert Xenia.Test.xenia_props(view, "post_tags")["value"] == ["phoenix", "elixir"]
  end
end
