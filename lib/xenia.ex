defmodule Xenia do
  @moduledoc """
  Any JavaScript library in a Phoenix LiveView page.

  Elixir side:

    * `Xenia.Components`: declare a typed tag for an adapter
      (`component :chart, adapter: "Chart" do ... end`).
    * `Xenia.Component`: `<.xenia>`, the container any adapter renders into.
    * `Xenia.Adapters.Monaco`: `<.monaco>`, for Xenia's Monaco adapter.
    * `Xenia.Provider`: publish an app-wide value, such as the locale.
    * `push_to/4`, below: send a command to one component.

  JavaScript side, imported by your `app.js`: `"xenia"` (`createHooks`,
  `setProvider`, `readProvider`, `subscribeProvider`) and `"xenia/monaco"`
  (`createMonaco`).

  Start with the README. [Wrapping any JavaScript library](wrapping-a-library.html)
  builds an adapter step by step, and
  [What Xenia owns, what your adapter owns](ownership-boundary.html) is the
  full contract.
  """

  @doc """
  Sends a command to the component with the DOM id `id`, and to no other.

  The adapter handles it in `commands`, with `args` as its second argument:

      commands: {
        highlight(chart, { index }) { ... },
      }

  Commands sent while the component is still mounting wait in a queue. A
  command the adapter doesn't declare is logged and dropped.

  ## Examples

      socket
      |> Xenia.push_to("editor", "focus")

      socket
      |> Xenia.push_to("sales", "highlight", %{index: 2})
  """
  @spec push_to(Phoenix.LiveView.Socket.t(), String.t(), String.t(), map()) ::
          Phoenix.LiveView.Socket.t()
  def push_to(socket, id, command, args \\ %{})
      when is_binary(id) and byte_size(id) > 0 and
             is_binary(command) and byte_size(command) > 0 and
             is_map(args) do
    Phoenix.LiveView.push_event(
      socket,
      "xenia:command:#{id}",
      %{command: command, args: args}
    )
  end
end
