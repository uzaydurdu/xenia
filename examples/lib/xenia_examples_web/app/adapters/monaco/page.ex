defmodule XeniaExamplesWeb.App.Adapters.MonacoPage do
  @moduledoc """
  `/adapters/monaco`: Xenia's built-in Monaco editor, customized.

    * our own dark theme, with the `themes` attribute
    * our own Elixir snippets, with `setup` (`assets/js/islands/monaco.js`)
    * the server reads every change, and can insert text or reset the code
    * keyboard shortcuts, handled here: save, and a bigger or smaller font
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @start """
  defmodule Hello do
    def world, do: IO.puts("Hello from a JS island")
  end
  """

  # A Monaco theme for dark mode. The light theme stays Monaco's "vs".
  @night %{
    name: "xenia-night",
    base: "vs-dark",
    colors: %{"editor.background" => "#0f0a1f", "editorLineNumber.foreground" => "#7c3aed"}
  }

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Code editor",
       code: @start,
       version: 0,
       revision: 0,
       font_size: 14,
       saved: nil
     )}
  end

  # The editor sends every change. Sending `version` back tells the editor
  # this is the echo of its own typing, not a new value.
  @impl true
  def handle_event("code_changed", %{"value" => code, "version" => version}, socket) do
    {:noreply, assign(socket, code: code, version: version)}
  end

  # A command: insert text where the cursor is.
  def handle_event("insert", _params, socket) do
    {:noreply, Xenia.push_to(socket, "editor", "insert", %{text: "IO.inspect(value)\n"})}
  end

  # Keyboard shortcuts: these events come from `shortcuts` on the tag, only
  # while the editor has focus. The last change always arrives first, so
  # @code is what was typed.
  def handle_event("save", %{"shortcut" => _}, socket) do
    lines = length(String.split(socket.assigns.code, "\n"))
    {:noreply, assign(socket, saved: "Saved #{lines} lines.")}
  end

  def handle_event("bigger", _params, socket),
    do: {:noreply, update(socket, :font_size, &min(&1 + 2, 32))}

  def handle_event("smaller", _params, socket),
    do: {:noreply, update(socket, :font_size, &max(&1 - 2, 10))}

  # A new `revision` makes the editor take the server's value.
  def handle_event("reset", _params, socket) do
    {:noreply, socket |> assign(code: @start, version: nil) |> update(:revision, &(&1 + 1))}
  end

  @impl true
  def render(assigns) do
    assigns = assign(assigns, :night, @night)

    ~H"""
    <h1 class="text-2xl font-semibold">Code editor</h1>
    <p>
      Type <code>def</code>
      or <code>IO</code>
      to see our snippets. Switch the theme to see our dark theme.
    </p>

    <.monaco
      id="editor"
      value={@code}
      version={@version}
      revision={@revision}
      language="elixir"
      themes={%{dark: @night}}
      options={%{fontSize: @font_size}}
      shortcuts={%{"mod+s" => "save", "mod+shift+." => "bigger", "mod+shift+," => "smaller"}}
      on_change="code_changed"
      style="height: 240px"
    >
      <:loading>
        <div class="grid h-full place-items-center rounded-box bg-base-200 text-sm opacity-70">
          Loading the editor…
        </div>
      </:loading>
    </.monaco>

    <div class="flex flex-wrap gap-2">
      <button id="insert" phx-click="insert" class="btn btn-sm">Insert IO.inspect</button>
      <button id="reset" phx-click="reset" class="btn btn-sm">Reset the code</button>
    </div>

    <p id="lines">The server has {length(String.split(@code, "\n"))} lines.</p>

    <p>
      With the editor focused, try <kbd class="kbd kbd-sm">⌘/Ctrl S</kbd>
      to save, and <kbd class="kbd kbd-sm">⌘/Ctrl ⇧ .</kbd>
      or <kbd class="kbd kbd-sm">⌘/Ctrl ⇧ ,</kbd>
      for a bigger or smaller font.
    </p>
    <p id="shortcut-result">
      Font size: <span id="font-size">{@font_size}</span>. <span id="saved">{@saved}</span>
    </p>
    """
  end
end
