# A form with editors

Five JavaScript components as fields of one Phoenix form: a code editor
(Monaco), a rich-text editor (Tiptap), a date picker (flatpickr), tags (Tom
Select) and a rating (Shoelace). Open it at `/forms`.

**Try it:** click "Save" with the form empty to see the errors. Then fill
it in and save again.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The form, its validation, and what "Save" shows. |
| [`assets/js/islands/official.js`](../../../../assets/js/islands/official.js) | The official adapters, configured once for the whole app. |

## How it works

- **`field={@form[:code]}`** works like it does on `<.input>`: it gives the
  component its id, name and value. Each component is submitted with the
  form, and runs the form's `phx-change`.
- **Errors appear once a field is used,** like `<.input>`'s, through Phoenix's
  `used_input?/1`. After a submit, every error shows.
- **The server validates everything**, as in any Phoenix form. There is no
  JavaScript validation.
- **The editors keep up with fast typing.** The form's validation replies can
  arrive while you type; the adapters tell them apart from your newer text.
- Learn more in Xenia's README, under "Components in forms".
