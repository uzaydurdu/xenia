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

  test "the tags, submitted as one JSON list, are listed", %{conn: conn} do
    {:ok, view, _html} = live(conn, ~p"/forms")
    assert "Tags: phoenix, elixir" in saved(save(view, ~s(["phoenix","elixir"])))
  end

  test "tags that aren't a JSON list of strings are no tags, not a crash", %{conn: conn} do
    {:ok, view, _html} = live(conn, ~p"/forms")

    for tags <- ["not json", "5", ~s({"a":1})] do
      items = saved(save(view, tags))
      assert "Title: Hello Xenia" in items, "the page answered for tags=#{tags}"
      assert "Tags:" in items
    end

    assert "Tags: phoenix" in saved(save(view, ~s([1,"phoenix"])))
  end
end
