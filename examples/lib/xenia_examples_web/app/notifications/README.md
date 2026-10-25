# Notifications

Success, error and information messages, with Phoenix's own
`put_flash/3`. Open it at `/notifications`.

**Try it:** click each button. Click a message to dismiss it. Then try the
two ways to the Icons page.

## Use them

```elixir
put_flash(socket, :success, gettext("Document saved successfully"))
put_flash(socket, :error, gettext("Could not save document"))
put_flash(socket, :info, gettext("Your changes are saved automatically."))
```

- **Three kinds.** Phoenix's generated `<.flash>` shows `:info` and
  `:error`. This app's adds `:success`, and an icon for each: see
  [`core_components.ex`](../../components/core_components.ex) (`flash/1`)
  and [`layouts.ex`](../../components/layouts.ex) (`flash_group/1`).
- **Dismissing:** a click on the message clears it, as in Phoenix.
- **Stacked:** messages form one column at the top right, newest first,
  so they never cover each other.
- **Closing by themselves:** success and info messages close after a few
  seconds; a line around the border shows how long is left, and hovering
  pauses it. Errors stay. Pick the shape (rounded, sharp, pill) and the
  time on the page; in your app, set them on `<.flash_group>` in
  `layouts.ex`. The countdown is CSS, and a small colocated hook in
  `core_components.ex` closes the message when it ends.
- **Navigation:** `put_flash`, then `push_navigate`: the message shows on
  the next page. A plain link starts the next page without it.
- **Escaped:** messages are text. HTML in them shows as text, so a name a
  user typed can't inject anything.
- **Failures:** log the details, show a plain message. The "Simulate a
  failure" button raises an error with a database address in it; the log
  gets it, the user sees "Could not save document".
- **Translated:** messages go through Gettext like any text. Switch the
  language on the [Languages](../languages) page, then come back.

There is no toast library and no Xenia API: `put_flash/3` is Phoenix's,
and `<.flash>` is your app's own component (Phoenix generates it into
`core_components.ex`). This example only improves that component.
