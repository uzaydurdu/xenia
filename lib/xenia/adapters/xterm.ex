defmodule Xenia.Adapters.Xterm do
  @moduledoc """
  `<.xterm>`: a terminal (xterm.js), through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install @xterm/xterm @xterm/addon-fit @xterm/addon-search @xterm/addon-web-links --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createXterm } from "xenia/xterm"

  const xterm = createXterm({
      load: async () => ({
        ...(await import("@xterm/xterm")),
        ...(await import("@xterm/addon-fit")),
        ...(await import("@xterm/addon-search")),
        ...(await import("@xterm/addon-web-links")),
      }),
  })

  hooks: { ...colocatedHooks, ...createHooks({ Xterm: xterm }) },
  ```

  And its CSS, in `assets/css/app.css`:

      @import "../node_modules/@xterm/xterm/css/xterm.css";

  Then `import Xenia.Adapters.Xterm` in `html_helpers`, and render
  `<.xterm id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"Xterm"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for xterm.js (v6).

    A terminal is a stream, not a value: its screen never travels as a prop.
    Server output arrives as commands, user input leaves as events.

    Props (all optional, applied in place):
      font_size, font_family, font_weight, line_height, letter_spacing,
      cursor_blink, cursor_style ("block" | "underline" | "bar"),
      scrollback, read_only, theme (xterm ITheme object)
      options   any other xterm option, camelCase or snake_case, merged
      links     true (default) makes URLs clickable; false turns it off
      A removed prop restores xterm's default for that option.

    Commands (Xenia.push_to/4):
      write %{text}, writeln %{text}, paste %{text}
      clear, reset, focus, blur
      scroll_to_bottom, scroll_to_top, scroll_lines %{amount}
      select_all, clear_selection
      search_next %{query, case_sensitive?, regex?, whole_word?}
      search_previous %{...same}, clear_search
      `paste` acts as if the user typed the text, so it also emits `data`.

    Events (bind with on_<event>):
      data       %{data}            every input chunk, never debounced
      resize     %{cols, rows}      after a refit, debounced 100 ms
      ready      %{cols, rows}      once per mount, after the first real fit;
                                    replay server-side output here
      title      %{title}           a program set the window title
      bell       %{}                a program rang the bell
      selection  %{text}            the selection changed, debounced 200 ms
      search     %{query, found}    result of a search command
      error      %{source, message, code}

    Notes:
      - The server must echo input: xterm doesn't print what the user types.
      - The container needs a height (e.g. style="height: 320px"). While it is
        hidden or has no size, the terminal isn't fitted and `ready` waits.
      - Import xterm's CSS once, e.g. in app.css:
          @import "../node_modules/@xterm/xterm/css/xterm.css";
  """
  use Xenia.Components

  component :xterm, adapter: "Xterm" do
    prop :font_size, :integer
    prop :font_family, :string
    prop :font_weight, :any
    prop :line_height, :any
    prop :letter_spacing, :any
    prop :cursor_blink, :boolean
    prop :cursor_style, :string
    prop :scrollback, :integer
    prop :read_only, :boolean
    prop :theme, :any
    prop :options, :map
    prop :links, :boolean
    event :data
    event :resize
    event :ready
    event :title
    event :bell
    event :selection
    event :search
    event :error
  end
end
