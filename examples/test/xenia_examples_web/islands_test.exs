defmodule XeniaExamplesWeb.IslandsTest do
  @moduledoc """
  Testing pages with JavaScript islands, with `Xenia.Test`.

  These tests run on the server only (LiveViewTest never runs JavaScript),
  and still talk about the islands in their own terms: an island's props,
  the events its adapter would send, the commands the server sends it, and
  the replies to its calls. The browser side is in assets/e2e/.
  """
  use XeniaExamplesWeb.ConnCase, async: true

  import Phoenix.LiveViewTest
  import Xenia.Test

  describe "the chart (/chart)" do
    test "its props come from the page's assigns", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/chart")
      assert xenia_props(view, "sales")["type"] == "bar"

      view |> element("#switch-type") |> render_click()
      assert xenia_props(view, "sales")["type"] == "line"
    end

    test "a click on a bar reaches the page, as the chart's ctx.emit would send it", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/chart")
      [label | _] = xenia_props(view, "sales")["data"]["labels"]

      html = render_xenia_event(view, "sales", :click, %{"label" => label})
      assert html =~ "You clicked #{label}."
    end

    test "the highlight command goes to the chart", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/chart")
      render_hook(view, "highlight_march", %{})
      assert_xenia_command(view, "sales", "highlight", %{index: 2})
    end
  end

  describe "large data (/large-data)" do
    test "a new point: the whole series as a prop, one point as a command", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/large-data")
      assert length(xenia_props(view, "by-prop")["data"]["labels"]) == 100
      assert xenia_props(view, "by-command")["data"]["labels"] == []

      view |> element("#add-point") |> render_click()

      assert length(xenia_props(view, "by-prop")["data"]["labels"]) == 101
      assert_xenia_command(view, "by-command", "append_points", %{labels: [101], values: [_]})
    end

    test "when the command chart is ready, it gets the whole series", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/large-data")

      render_xenia_event(view, "by-command", :ready, %{})

      assert_xenia_command(view, "by-command", "replace_points", %{labels: labels, values: values})

      assert length(labels) == 100 and length(values) == 100
    end

    test "a longer series: props for one chart, one replace_points for the other", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/large-data")

      view |> element("#size-10000") |> render_click()

      assert length(xenia_props(view, "by-prop")["data"]["labels"]) == 10_000
      assert_xenia_command(view, "by-command", "replace_points", %{labels: labels})
      assert length(labels) == 10_000
    end
  end

  describe "the typed island (/typed)" do
    # The names here are the ones budget.ts declares in its Props, Events
    # and Commands types.
    test "its props are spent and left", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/typed")
      assert xenia_props(view, "budget") == %{"spent" => 30, "left" => 70}

      view |> element("#spend") |> render_click()
      assert xenia_props(view, "budget") == %{"spent" => 40, "left" => 60}
    end

    test "a segment_click reaches the page", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/typed")

      html =
        render_xenia_event(view, "budget", :segment_click, %{"segment" => "left", "amount" => 70})

      assert html =~ "You clicked left: 70."
    end

    test "the highlight command names a segment", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/typed")
      view |> element("#highlight-left") |> render_click()
      assert_xenia_command(view, "budget", "highlight", %{segment: "left"})
    end
  end

  describe "the island that listens to the whole page (/listeners)" do
    # Its adapter is co-located: LiveView names the hook after the page.
    test "it renders the co-located adapter's island, with no props", %{conn: conn} do
      {:ok, view, html} = live(conn, ~p"/listeners")

      assert html =~ ~s(phx-hook="XeniaExamplesWeb.App.ListenersPage.KeyLog")
      assert xenia_props(view, "keys") == %{}
    end
  end

  describe "the editor that waits for the connection (/connection)" do
    # The connection isn't a server prop: Xenia sets it in the browser, so
    # the page renders nothing for it and the island's own value is used.
    test "it uses the extended adapter and gets no connection prop", %{conn: conn} do
      {:ok, view, html} = live(conn, ~p"/connection")

      assert html =~ ~s(phx-hook="OfflineMonaco")
      refute Map.has_key?(xenia_props(view, "notes"), "connection")
    end

    test "a change reaches the page, as the editor's ctx.emit would send it", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/connection")

      html =
        render_xenia_event(view, "notes", :change, %{"value" => "# Notes\nhi\n", "version" => 1})

      assert html =~ "The server has 11 characters."
    end
  end

  describe "the country search (/adapters/tom-select)" do
    test "a search is a call: the island gets the matches back", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/adapters/tom-select")

      %{options: options} = xenia_call(view, "countries", :search, %{"query" => "and"})
      assert options != []
      assert Enum.all?(options, &(&1.text =~ ~r/and/i))

      # The page counts searches, and tells the island through a prop.
      assert xenia_props(view, "countries")["placeholder"] =~ "1 searches so far"
    end
  end
end
