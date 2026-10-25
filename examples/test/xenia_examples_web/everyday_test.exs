defmodule XeniaExamplesWeb.EverydayTest do
  @moduledoc """
  The server side of the icons, notifications and languages examples. The
  browser side (icons drawn, the widget's labels, the cookie across pages)
  is in assets/e2e/everyday.test.mjs.
  """
  use XeniaExamplesWeb.ConnCase, async: true

  import ExUnit.CaptureLog
  import Phoenix.LiveViewTest

  describe "the language" do
    test "comes from the locale cookie on the first page load", %{conn: conn} do
      assert conn |> get(~p"/languages") |> html_response(200) =~ "Languages</h1>"

      german = conn |> put_req_cookie("locale", "de") |> get(~p"/languages") |> html_response(200)
      assert german =~ "Sprachen</h1>"
      assert german =~ "Speichern"
    end

    test "an unknown locale is English", %{conn: conn} do
      html = conn |> put_req_cookie("locale", "xx") |> get(~p"/languages") |> html_response(200)
      assert html =~ "Languages</h1>"
    end

    test "switching changes the page in place, and asks the browser to remember it", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/languages")
      render_click(view, "save")

      html = view |> element("#locale-de") |> render_click()

      assert html =~ "Sprachen</h1>"
      assert html =~ "Bisher gespeichert: 1", "the LiveView kept its state"
      assert_push_event(view, "locale", %{locale: "de"})
    end

    test "the widget's labels are props, translated", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/languages")
      view |> element("#locale-de") |> render_click()

      props =
        view
        |> element("#stepper")
        |> render()
        |> LazyHTML.from_fragment()
        |> LazyHTML.attribute("data-xenia-props")
        |> hd()
        |> Jason.decode!()

      assert props["labels"] == %{
               "decrease" => "Weniger",
               "increase" => "Mehr",
               "reset" => "Zurücksetzen",
               "total" => "Gesamt"
             }
    end
  end

  describe "notifications" do
    test "messages are escaped", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/notifications")
      html = render_click(view, "untrusted")

      assert html =~ "Hello, &lt;b&gt;Mallory&lt;/b&gt;&lt;script&gt;"
      refute html =~ "<script>window.hacked"
    end

    test "a failure shows a plain message; its details go to the log only", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/notifications")

      log = capture_log(fn -> send(self(), {:html, render_click(view, "fail")}) end)
      assert_received {:html, html}

      assert html =~ "Could not save document. Please try again."
      refute html =~ "postgres://"
      refute html =~ "s3cret"
      assert log =~ "connection refused: postgres://"
    end

    test "success and info get a countdown; errors don't", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/notifications")

      saved = render_click(view, "save")
      assert saved =~ "flash-countdown"
      assert saved =~ "--flash-duration: 5000ms"

      render_click(view, "lv:clear-flash", %{"key" => "success"})
      failed = render_click(view, "fail")
      assert failed =~ ~s(id="flash-error")
      refute failed =~ "flash-countdown"
    end

    test "are translated", %{conn: conn} do
      {:ok, view, _html} = conn |> put_req_cookie("locale", "de") |> live(~p"/settings")
      assert render_click(view, "save") =~ "Einstellungen erfolgreich gespeichert"
    end
  end
end
