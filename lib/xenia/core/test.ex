defmodule Xenia.Test do
  @moduledoc """
  Helpers for testing pages with JavaScript islands, on top of
  `Phoenix.LiveViewTest`.

  `LiveViewTest` never runs JavaScript, so a test checks what the server
  renders for an island and what it sends it. These helpers do that in the
  island's own terms, without Xenia's attribute and event names:

      import Phoenix.LiveViewTest
      import Xenia.Test

      test "a bar click filters the table", %{conn: conn} do
        {:ok, view, _html} = live(conn, ~p"/sales")

        assert xenia_props(view, "sales")["type"] == "bar"

        # What the adapter's ctx.emit("click", ...) would send.
        render_xenia_event(view, "sales", :click, %{"label" => "Tue"})
        assert xenia_props(view, "table")["filter"] == "Tue"

        # A command the server sent with Xenia.push_to/4.
        assert_xenia_command(view, "sales", "highlight", %{index: 1})

        # What the adapter's ctx.call("search", ...) would get back.
        assert xenia_call(view, "search", :search, %{"query" => "eli"}) ==
                 %{results: ["Eliza"]}
      end

  For an island inside a persistent part (`persistent.ex`), pass that part's
  own view, from `Phoenix.LiveViewTest.find_live_child/2`.

  It needs `lazy_html` in the app's test dependencies, as `LiveViewTest`
  does. Phoenix 1.8 apps have it.
  """

  # LazyHTML is what LiveViewTest parses HTML with. It's a test-only
  # dependency, so it's checked when a helper runs, not when Xenia compiles.
  @compile {:no_warn_undefined, LazyHTML}

  @doc """
  The island's props, as its adapter receives them: the decoded JSON, with
  string keys.

  `view_or_html` is a LiveView under test, or HTML that contains the island.
  """
  def xenia_props(view_or_html, id) do
    view_or_html |> attribute!(id, "data-xenia-props") |> Jason.decode!()
  end

  @doc """
  Sends the island's logical event, as its adapter's `ctx.emit(event,
  payload)` would: to the LiveView event the page bound it to (`on_<event>`,
  or `events={%{event => ...}}`). Returns the rendered view, like
  `Phoenix.LiveViewTest.render_hook/3`.

  Raises if the page didn't bind `event` on the island. In the browser,
  Xenia drops such an event, so a test that sends one is wrong.
  """
  def render_xenia_event(view, id, event, payload \\ %{}) do
    name = to_string(event)
    bound = bound_events(view, id)

    case Map.fetch(bound, name) do
      {:ok, server_event} ->
        Phoenix.LiveViewTest.render_hook(view, server_event, payload)

      :error ->
        raise ArgumentError,
              "the island #{inspect(id)} has no #{inspect(name)} event bound " <>
                "(on_#{name}=... or events={%{#{name}: ...}}). Bound: " <>
                inspect(bound |> Map.keys() |> Enum.sort())
    end
  end

  @doc """
  Asserts that the server sent the island `command`, with `Xenia.push_to/4`.

  `args` is a pattern, as in `Phoenix.LiveViewTest.assert_push_event/4`;
  leave it out to accept any arguments. Atom keys, as `push_to` sent them:

      assert_xenia_command(view, "editor", "focus")
      assert_xenia_command(view, "editor", "insert", %{text: "IO.puts"})
  """
  defmacro assert_xenia_command(
             view,
             id,
             command,
             args \\ quote(do: _),
             timeout \\ quote(do: Application.fetch_env!(:ex_unit, :assert_receive_timeout))
           ) do
    # assert_push_event puts its event into a receive pattern, where
    # "xenia:command:" <> id would match any island's command: so the name
    # is built first, and pinned.
    quote do
      require Phoenix.LiveViewTest
      event = "xenia:command:" <> unquote(id)
      command = unquote(command)

      Phoenix.LiveViewTest.assert_push_event(
        unquote(view),
        ^event,
        %{command: ^command, args: unquote(args)},
        unquote(timeout)
      )
    end
  end

  @doc """
  Sends the island's event as its adapter's `ctx.call(name, payload)` would,
  and returns the reply the LiveView gave with `{:reply, map, socket}`.
  """
  defmacro xenia_call(
             view,
             id,
             name,
             payload \\ Macro.escape(%{}),
             timeout \\ quote(do: Application.fetch_env!(:ex_unit, :assert_receive_timeout))
           ) do
    quote do
      require Phoenix.LiveViewTest
      view = unquote(view)
      Xenia.Test.render_xenia_event(view, unquote(id), unquote(name), unquote(payload))
      Phoenix.LiveViewTest.assert_reply(view, reply, unquote(timeout))
      reply
    end
  end

  # The island's events, %{"change" => "code_changed"}; none if it has no
  # data-xenia-events.
  defp bound_events(view, id) do
    case attribute(view, id, "data-xenia-events") do
      nil -> %{}
      json -> Jason.decode!(json)
    end
  end

  defp attribute!(view_or_html, id, name) do
    attribute(view_or_html, id, name) ||
      raise ArgumentError, "the element #{inspect(id)} has no #{name}: is it a Xenia island?"
  end

  defp attribute(view_or_html, id, name) do
    unless Code.ensure_loaded?(LazyHTML) do
      raise "Xenia.Test needs lazy_html in your test dependencies: " <>
              ~s|{:lazy_html, ">= 0.1.0", only: :test}|
    end

    case view_or_html
         |> html(id)
         |> LazyHTML.from_fragment()
         |> LazyHTML.query("##{id}")
         |> LazyHTML.attribute(name) do
      [value | _] -> value
      [] -> nil
    end
  end

  defp html(html, _id) when is_binary(html), do: html

  defp html(view, id) do
    unless Phoenix.LiveViewTest.has_element?(view, "##{id}") do
      raise ArgumentError, "no element with id #{inspect(id)} in the view"
    end

    view |> Phoenix.LiveViewTest.element("##{id}") |> Phoenix.LiveViewTest.render()
  end
end
