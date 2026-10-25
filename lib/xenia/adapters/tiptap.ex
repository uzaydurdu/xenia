defmodule Xenia.Adapters.Tiptap do
  @moduledoc """
  `<.tiptap>`: a rich-text editor (Tiptap), through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install @tiptap/core @tiptap/starter-kit @tiptap/extensions --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createTiptap } from "xenia/tiptap"

  const tiptap = createTiptap({
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

  hooks: { ...colocatedHooks, ...createHooks({ Tiptap: tiptap }) },
  ```

  Then `import Xenia.Adapters.Tiptap` in `html_helpers`, and render
  `<.tiptap id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  As a form field, `field={@form[:x]}` fills `content` and submits the
  component with the form.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"Tiptap"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for Tiptap (v3): a rich-text editor that also works as a
    form field.

    Props:
      content      HTML string, or %{value, format: "html" | "json", revision}.
                   As in monaco.js, a changed `revision` forces the server's
                   content even over newer typing; otherwise, in a form, the
                   editor's own earlier content coming back from validate is
                   ignored.
      format       "html" (default) or "json": what change events and the form
                   field carry
      editable     true (default) / false
      placeholder  text shown while the editor is empty
      limit        maximum number of characters (0 or nil = no limit)
      toolbar      true for the default toolbar, a list of item names, or
                   false. Items: bold, italic, underline, strike, code,
                   heading1, heading2, heading3, paragraph, bullet_list,
                   ordered_list, blockquote, code_block, horizontal_rule, link,
                   undo, redo, separator
      starter_kit  StarterKit configuration, e.g. %{heading: %{levels: [1, 2]},
                   link: %{open_on_click: false}}. Changing it remounts.

    Commands:
      focus %{position?: "start" | "end" | "all"}, blur
      set_content %{value, format?}     replace the content (not reported back)
      clear
      insert %{content}                 HTML or text at the cursor
      run %{command, args?}             any Tiptap command on a focused chain,
                                        e.g. %{command: "toggleBold"} or
                                        %{command: "setLink", args: [%{href: "..."}]}

    Events:
      change  %{value, text, empty, characters, words}   debounced 300 ms
      focus   %{}, blur %{}
      error   %{source, message, code}

    Form field: with field={@form[:body]}, the HTML (or JSON with
    format="json") is submitted with the form.

    Tiptap is unstyled. The adapter adds minimal styles for the toolbar,
    placeholder and focus outline; style the content with your own CSS (for
    example Tailwind's `prose` class on the container).
  """
  use Xenia.Components

  component :tiptap, adapter: "Tiptap", form_value: :content do
    prop :content, :any
    prop :format, :string
    prop :editable, :boolean
    prop :placeholder, :string
    prop :limit, :integer
    prop :toolbar, :any
    prop :starter_kit, :map
    event :change
    event :focus
    event :blur
    event :error
  end
end
