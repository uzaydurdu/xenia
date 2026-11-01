defmodule XeniaExamplesWeb.App.Adapters.TerminalPage do
  @moduledoc """
  `/adapters/terminal`: a terminal the server answers (`<.xterm>`).

  A terminal is a stream: what the user types arrives as `data` events,
  and the server writes back with the `write` command. xterm.js doesn't
  print what the user types, so the server echoes it.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @prompt "\e[35mxenia\e[0m $ "

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "Terminal", line: "", commands: 0)}
  end

  # Once the terminal has its size: a welcome line and the prompt.
  @impl true
  def handle_event("ready", _params, socket) do
    {:noreply, write(socket, "Welcome to Xenia. Type \e[1mhelp\e[0m.\n" <> @prompt)}
  end

  def handle_event("typed", %{"data" => data}, socket) do
    {line, output, commands} =
      data
      |> String.graphemes()
      |> Enum.reduce({socket.assigns.line, "", socket.assigns.commands}, &key/2)

    {:noreply, socket |> assign(line: line, commands: commands) |> write(output)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Terminal</h1>
    <p>
      xterm.js. The server answers <code>help</code>, <code>date</code>, <code>echo</code>
      and <code>clear</code>.
    </p>

    <.xterm id="terminal" on_ready="ready" on_data="typed" style="height: 280px" />

    <p id="commands">Commands run: {@commands}</p>
    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet title="The tag and the server, in page.ex" code={page_snippet()} />
    <.snippet title="The setup, once, in assets/js" code={setup_snippet()} />
    """
  end

  # Enter runs the line, Backspace deletes, anything else is echoed.
  defp key("\r", {line, out, n}),
    do: {"", out <> "\n" <> run(String.trim(line)) <> @prompt, n + 1}

  defp key("\u007f", {"", out, n}), do: {"", out, n}
  defp key("\u007f", {line, out, n}), do: {String.slice(line, 0..-2//1), out <> "\b \b", n}
  defp key(char, {line, out, n}), do: {line <> char, out <> char, n}

  defp run(""), do: ""
  defp run("help"), do: "help, date, echo <text>, clear\n"

  defp run("date"), do: "#{DateTime.truncate(DateTime.utc_now(), :second)}\n"

  defp run("clear"), do: "\e[2J\e[H"
  defp run("echo " <> text), do: text <> "\n"
  defp run(other), do: "#{other}: not found\n"

  defp write(socket, ""), do: socket
  defp write(socket, text), do: Xenia.push_to(socket, "terminal", "write", %{text: text})

  # The code on the page: how this example is made.
  defp page_snippet,
    do: ~S"""
    <.xterm id="terminal" on_ready="ready" on_data="typed" style="height: 280px" />

    # A terminal is a stream: output goes as `write` commands...
    def handle_event("ready", _params, socket),
      do: {:noreply, Xenia.push_to(socket, "terminal", "write", %{text: "Welcome.\n$ "})}

    # ...and what the user types arrives as `data` events. xterm doesn't echo:
    # the server writes back what it wants shown.
    def handle_event("typed", %{"data" => data}, socket),
      do: {:noreply, Xenia.push_to(socket, "terminal", "write", %{text: data})}
    """

  defp setup_snippet,
    do: ~S"""
    import { createXterm } from "xenia/xterm"

    export const xterm = createXterm({
      load: async () => ({
        ...(await import("@xterm/xterm")),
        ...(await import("@xterm/addon-fit")),
        ...(await import("@xterm/addon-search")),
        ...(await import("@xterm/addon-web-links")),
      }),
    })

    // app.js
    createHooks({ Xterm: xterm })
    """
end
