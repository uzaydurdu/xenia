# Date picker

A flatpickr date picker as a field of a normal Phoenix form. Open it at
`/date-picker`.

You use it like `<.input>`:

```heex
<.date_picker field={@form[:due]} />
```

and it behaves like one:

- its value is sent when the form is submitted
- changing it runs the form's `phx-change`
- its errors appear only after you used it, like the errors of `<.input>`

**Try it:** click "Save" with an empty form to see the errors. Click "Pick
tomorrow": the server sets the date, and the picker shows it. Click "Open
the calendar": the server sends a command that opens it.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: the form, validation, and saving. |
| [`assets/js/islands/date_picker.js`](../../../../assets/js/islands/date_picker.js) | The adapter for flatpickr. |
| [`components/islands.ex`](../../components/islands.ex) | Declares `<.date_picker>`. `form_value: :value` makes it a form field. |

## How it works

The adapter keeps the form's value equal to what the picker shows, in two
cases:

- **You pick a date.** The adapter calls `ctx.setFormValue(value)`. This
  writes the value into the form and runs `phx-change`.
- **The server changes the date.** The adapter calls
  `ctx.setFormValue(value, { notify: false })`. This writes the value
  quietly, because the server already knows it.

Outside a form, `ctx.setFormValue` does nothing. So the same adapter also
works on its own.
