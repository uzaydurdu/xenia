defmodule XeniaExamplesWeb.App.Adapters.TiptapPage do
  @moduledoc "`/adapters/tiptap`: a rich-text editor with a toolbar (`<.tiptap>`)."
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Rich text",
       content: "<p>Hello from <strong>Xenia</strong>. Select some text and make it bold.</p>",
       editable: true,
       stats: nil,
       html: nil
     )}
  end

  # Every change, 300 ms after typing stops: the HTML and a few counts.
  @impl true
  def handle_event(
        "changed",
        %{"value" => html, "words" => words, "characters" => chars},
        socket
      ),
      do: {:noreply, assign(socket, html: html, stats: "#{words} words, #{chars} characters")}

  def handle_event("sign", _params, socket),
    do: {:noreply, Xenia.push_to(socket, "notes", "insert", %{content: " — sent with Xenia"})}

  def handle_event("draft", _params, socket) do
    draft = "<h2>A draft</h2><p>Loaded by the server, with a <em>command</em>.</p>"
    {:noreply, Xenia.push_to(socket, "notes", "set_content", %{value: draft})}
  end

  def handle_event("toggle_editable", _params, socket),
    do: {:noreply, update(socket, :editable, &(!&1))}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Rich text</h1>
    <p>Tiptap, with its toolbar. The server reads every change, and can insert or replace content.</p>

    <.tiptap
      id="notes"
      content={@content}
      editable={@editable}
      placeholder="Write something…"
      toolbar={true}
      on_change="changed"
    />

    <div class="flex flex-wrap gap-2">
      <button id="sign" phx-click="sign" class="btn btn-sm">Insert a signature</button>
      <button id="draft" phx-click="draft" class="btn btn-sm">Load a draft</button>
      <button id="toggle-editable" phx-click="toggle_editable" class="btn btn-sm">
        {if @editable, do: "Make it read-only", else: "Make it editable"}
      </button>
    </div>

    <p id="stats">{@stats || "Type in the editor."}</p>
    <pre :if={@html} id="html" class="overflow-x-auto rounded-md border border-base-300 p-3 text-xs">{@html}</pre>
    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet title="The tag and the server, in page.ex" code={page_snippet()} />
    <.snippet title="The setup, once, in assets/js" code={setup_snippet()} />
    """
  end

  # The code on the page: how this example is made.
  defp page_snippet,
    do: ~S"""
    <.tiptap
      id="notes"
      content={@content}
      editable={@editable}
      placeholder="Write something…"
      toolbar={true}
      on_change="changed"
    />

    Xenia.push_to(socket, "notes", "insert", %{content: " — sent with Xenia"})
    Xenia.push_to(socket, "notes", "set_content", %{value: "<p>A draft</p>"})
    """

  defp setup_snippet,
    do: ~S"""
    import { createTiptap } from "xenia/tiptap"

    export const tiptap = createTiptap({
      load: async () => {
        const [core, starterKit, extensions] = await Promise.all([
          import("@tiptap/core"),
          import("@tiptap/starter-kit"),
          import("@tiptap/extensions"),
        ])
        return {
          Editor: core.Editor,
          StarterKit: starterKit.default,
          CharacterCount: extensions.CharacterCount,
          Placeholder: extensions.Placeholder,
        }
      },
    })

    // app.js
    createHooks({ Tiptap: tiptap })
    """
end
