defmodule XeniaExamplesWeb.Snippets do
  @moduledoc """
  `<.snippet>`: a short piece of code on an example page, showing how the
  example is made.

  The code is a string, not template content, so HEEx tags (`<.monaco>`)
  and braces in it show as they are. Write it with `~S` so nothing in it is
  interpolated:

      <.snippet title="The tag" code={tag_snippet()} />

      defp tag_snippet, do: ~S|<.monaco id="editor" value={@code} />|
  """
  use Phoenix.Component

  attr :title, :string, required: true, doc: "what the code is, e.g. \"The tag, in page.ex\""
  attr :code, :string, required: true

  def snippet(assigns) do
    ~H"""
    <figure class="space-y-1">
      <figcaption class="text-sm font-medium opacity-70">{@title}</figcaption>
      <pre class="overflow-x-auto rounded-box border border-base-300 bg-base-100 p-4 text-sm"><code>{String.trim_trailing(@code)}</code></pre>
    </figure>
    """
  end
end
