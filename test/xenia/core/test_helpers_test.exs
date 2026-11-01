defmodule Xenia.TestHelpersTest do
  @moduledoc """
  Tests for `Xenia.Test` (lib/xenia/core/test.ex), the helpers apps use in
  their own tests. They run a real LiveView through `live_isolated/3`, on a
  minimal endpoint defined here.
  """

  use ExUnit.Case, async: true

  # LiveView's debug logs, shown only for a failing test.
  @moduletag :capture_log

  import Phoenix.ConnTest, only: [build_conn: 0]
  import Phoenix.LiveViewTest
  import Xenia.Test

  defmodule Endpoint do
    use Phoenix.Endpoint, otp_app: :xenia
    socket("/live", Phoenix.LiveView.Socket)
  end

  Application.put_env(:xenia, Endpoint,
    secret_key_base: String.duplicate("x", 64),
    live_view: [signing_salt: "xenia-test-helpers"]
  )

  @endpoint Endpoint

  defmodule IslandLive do
    use Phoenix.LiveView
    import Xenia.Component

    def mount(_params, _session, socket), do: {:ok, assign(socket, count: 1)}

    def render(assigns) do
      ~H"""
      <.xenia
        id="counter"
        adapter="Counter"
        props={%{count: @count, label: "Clicks"}}
        events={%{click: "clicked", search: "searched"}}
      />
      <.xenia id="quiet" adapter="Counter" props={%{count: 0}} />
      <p id="not-an-island">Hello</p>
      """
    end

    def handle_event("clicked", %{"count" => count}, socket),
      do: {:noreply, assign(socket, count: count)}

    def handle_event("searched", %{"query" => query}, socket),
      do: {:reply, %{results: [query <> "!"]}, socket}

    def handle_event("highlight", _params, socket),
      do: {:noreply, Xenia.push_to(socket, "counter", "highlight", %{index: 2})}
  end

  setup_all do
    start_supervised!(Endpoint)
    :ok
  end

  setup do
    {:ok, view, html} = live_isolated(build_conn(), IslandLive)
    %{view: view, html: html}
  end

  describe "xenia_props/2" do
    test "decodes the island's props, from a view or from HTML", %{view: view, html: html} do
      assert xenia_props(view, "counter") == %{"count" => 1, "label" => "Clicks"}
      assert xenia_props(html, "counter") == %{"count" => 1, "label" => "Clicks"}
    end

    test "a missing element, or one that isn't an island, is a clear error", %{view: view} do
      assert_raise ArgumentError, ~r/no element with id "nope"/, fn ->
        xenia_props(view, "nope")
      end

      assert_raise ArgumentError,
                   ~r/"not-an-island" has no data-xenia-props: is it a Xenia island\?/,
                   fn ->
                     xenia_props(view, "not-an-island")
                   end
    end
  end

  describe "render_xenia_event/4" do
    test "sends the LiveView event the page bound, as ctx.emit would", %{view: view} do
      render_xenia_event(view, "counter", :click, %{"count" => 5})
      assert xenia_props(view, "counter")["count"] == 5

      # The event name can be a string too.
      render_xenia_event(view, "counter", "click", %{count: 6})
      assert xenia_props(view, "counter")["count"] == 6
    end

    test "an event the page didn't bind raises, naming the bound ones", %{view: view} do
      assert_raise ArgumentError,
                   ~r/"counter" has no "change" event bound.*Bound: \["click", "search"\]/s,
                   fn ->
                     render_xenia_event(view, "counter", :change, %{})
                   end

      assert_raise ArgumentError, ~r/"quiet" has no "click" event bound.*Bound: \[\]/s, fn ->
        render_xenia_event(view, "quiet", :click, %{})
      end
    end
  end

  describe "assert_xenia_command/5" do
    test "matches a command push_to sent to the island, with any or given args", %{view: view} do
      render_hook(view, "highlight", %{})
      assert_xenia_command(view, "counter", "highlight")

      render_hook(view, "highlight", %{})
      assert_xenia_command(view, "counter", "highlight", %{index: 2})

      render_hook(view, "highlight", %{})
      assert_xenia_command(view, "counter", "highlight", %{index: index})
      assert index == 2
    end

    test "doesn't match another island's command, another command or other args", %{view: view} do
      render_hook(view, "highlight", %{})

      # The island's id in a variable, as in a loop: if it went into the
      # receive pattern unpinned, it would match any island's command.
      other = "quiet"

      for check <- [
            fn -> assert_xenia_command(view, other, "highlight", _, 50) end,
            fn -> assert_xenia_command(view, "counter", "focus", _, 50) end,
            fn -> assert_xenia_command(view, "counter", "highlight", %{index: 3}, 50) end
          ] do
        assert_raise ExUnit.AssertionError, check
      end
    end
  end

  describe "xenia_call/5" do
    test "returns the LiveView's reply, as ctx.call would get it", %{view: view} do
      assert xenia_call(view, "counter", :search, %{"query" => "eli"}) == %{results: ["eli!"]}
    end

    test "an unbound event raises before anything is sent", %{view: view} do
      assert_raise ArgumentError, ~r/has no "lookup" event bound/, fn ->
        xenia_call(view, "counter", :lookup, %{})
      end
    end
  end
end
