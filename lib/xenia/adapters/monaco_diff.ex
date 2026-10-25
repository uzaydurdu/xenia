defmodule Xenia.Adapters.MonacoDiff do
  @moduledoc """
  `<.monaco_diff>`: Monaco's diff editor, through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install monaco-editor --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createMonacoDiff } from "xenia/monaco-diff"

  const monacoDiff = createMonacoDiff({
      load: () => import("monaco-editor"),
  })

  hooks: { ...colocatedHooks, ...createHooks({ MonacoDiff: monacoDiff }) },
  ```

  Then `import Xenia.Adapters.MonacoDiff` in `html_helpers`, and render
  `<.monaco_diff id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  As a form field, `field={@form[:x]}` fills `modified` and submits the
  component with the form.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"MonacoDiff"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for Monaco's diff editor: an original and a modified text
    side by side (or inline), with the modified side editable.

    It follows the same conventions as monaco.js: the same value payload,
    `revision` to force the server's text, form-field support with echo
    handling, edits that bypass readOnly, and the editor mounted in a child
    element so Monaco's data-* attributes survive LiveView patches.

    Props:
      original   string, the left/old text. Always applied as given.
      modified   { value, version?, revision? } or a plain string; the
                 right/new text, as in monaco.js:
                   - with a `version` echoed from a change event, it is ignored
                     if the user has typed past it;
                   - without one it is authoritative;
                   - a changed `revision` forces it even over newer typing.
      language   Monaco language id, for both sides
      theme      theme name or theme definition (global, like monaco.js)
      options    diff editor options, e.g. %{renderSideBySide: false,
                 ignoreTrimWhitespace: false, readOnly: true,
                 originalEditable: false, wordWrap: "on"}

    Commands:
      focus
      next_diff, previous_diff          jump between changes
      reveal_line %{line, side?}        side "modified" (default) or "original"

    Events:
      change  %{value, version}   the user edited the modified side (300 ms)
      diff    %{changes, line_changes: [%{original_start, original_end,
               modified_start, modified_end}]}  the computed diff changed
      error   %{source, message, code}

    Form field: with field={@form[:code]}, the modified text is submitted with
    the form, exactly as in monaco.js.

    The app owns Monaco's worker setup (MonacoEnvironment), as for monaco.js.
  """
  use Xenia.Components

  component :monaco_diff, adapter: "MonacoDiff", form_value: :modified do
    prop :original, :string, default: ""
    prop :modified, :any
    prop :language, :string
    prop :theme, :any
    prop :options, :map
    event :change
    event :diff
    event :error
  end
end
