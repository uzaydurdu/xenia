# Languages

English and German, from Gettext: in the page, in its messages, and in a
JavaScript widget. Open it at `/languages`.

**Try it:** change the widget's number with + and −, then switch to
Deutsch. The words change, the number stays: the widget isn't rebuilt.

## How it works

- **Gettext is the only translation store.** `gettext("Save")` in Elixir;
  the German is in `priv/gettext/de/LC_MESSAGES/default.po`.
- **The widget gets its words as props**, translated on the server:

  ```heex
  <.xenia id="stepper" adapter="Stepper" props={%{labels: @t.widget, price: 12.5}} />
  ```

  A new language changes the props, so Xenia calls the widget's prop
  handlers. It formats the price with the `locale` provider
  (`consumes: ["locale"]`), which `app/layout.ex` publishes.
- **The page's words are in an assign (`@t`).** LiveView only re-renders
  what depends on assigns, so `{gettext("Save")}` written straight into
  the template wouldn't change when you switch. The page computes `@t`
  again after a switch. Text with a value in it takes `@locale` too.
- **Switching** (`XeniaExamplesWeb.Locale.put/2`) sets Gettext's locale in
  this LiveView's process, and the browser stores a `locale` cookie, so
  the next page and the next visit speak German too.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page, its words, and the switch. |
| [`locale.ex`](../../locale.ex) | The locale on the first load (a plug), in each LiveView (`on_mount`), and when switching. |
| [`assets/js/islands/stepper.js`](../../../../assets/js/islands/stepper.js) | The widget: labels from props, price for the locale. |
| [`priv/gettext/de/LC_MESSAGES/default.po`](../../../../priv/gettext/de/LC_MESSAGES/default.po) | The German. |

Add a language: add it to `locales` in `config/config.exs` and to
`XeniaExamplesWeb.Locale`, run `mix gettext.merge priv/gettext --locale fr`,
and translate the new `.po` file.
