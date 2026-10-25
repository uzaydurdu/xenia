defmodule XeniaTest do
  @moduledoc """
  Tests for the server side of Xenia commands.

  `Xenia.push_to/4` sends a command from a LiveView to one client-side
  component. It wraps `Phoenix.LiveView.push_event/3` and:

    * namespaces the event per component as `"xenia:command:<id>"`, so the
      JS hook for that element is the only one that receives it;
    * sends the payload `%{command: name, args: args}`, with `args`
      defaulting to `%{}`;
    * returns the updated socket, so it can be used in pipelines.

  Pushed events are read back with `Phoenix.LiveView.Utils.get_push_events/1`,
  which returns them as `[[event_name, payload], ...]`.
  """

  use ExUnit.Case, async: true

  alias Phoenix.LiveView.Socket
  alias Phoenix.LiveView.Utils

  describe "push_to/4" do
    # Without explicit arguments, the command is pushed to the component's
    # namespaced event with empty args.
    test "targets the correct component ID" do
      socket = %Socket{}

      result = Xenia.push_to(socket, "editor", "focus")

      assert Utils.get_push_events(result) == [
               ["xenia:command:editor", %{command: "focus", args: %{}}]
             ]
    end

    # Explicit arguments are passed through unchanged in `args`.
    test "includes command arguments" do
      result =
        %Socket{}
        |> Xenia.push_to("editor", "setValue", %{value: "Hello"})

      assert Utils.get_push_events(result) == [
               [
                 "xenia:command:editor",
                 %{command: "setValue", args: %{value: "Hello"}}
               ]
             ]
    end

    # The same command sent to two components produces two different event
    # names, so each client hook only hears its own commands.
    test "uses different event names for different component IDs" do
      first = Xenia.push_to(%Socket{}, "editor-a", "focus")
      second = Xenia.push_to(%Socket{}, "editor-b", "focus")

      assert [["xenia:command:editor-a", _]] = Utils.get_push_events(first)
      assert [["xenia:command:editor-b", _]] = Utils.get_push_events(second)
    end

    # push_to/4 returns a new socket (with the event queued) rather than
    # mutating or ignoring it, so it composes in `socket |> ...` pipelines.
    test "returns an updated socket" do
      socket = %Socket{}

      result = Xenia.push_to(socket, "editor", "focus")

      assert %Socket{} = result
      assert result != socket
    end

    # Arguments must be a map; anything else fails the function guard.
    test "rejects invalid argument types" do
      socket = %Socket{}

      # Called through apply/3: a direct call is rejected at compile time by
      # the type checker, which is the point of the guard, but this test
      # checks the runtime behaviour.
      assert_raise FunctionClauseError, fn ->
        apply(Xenia, :push_to, [socket, "editor", "focus", "invalid"])
      end
    end
  end
end
