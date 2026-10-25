# Icons, notifications and languages

Three everyday things, done with Phoenix's own tools: Tailwind for icons,
`put_flash/3` for messages, and Gettext for languages. Xenia adds no API
for any of them. What Xenia brings is the last step: getting the same
language into your JavaScript islands.

The examples app shows each one, with a page and a browser test:
`/icons`, `/notifications`, `/languages`, and `/settings` with all three
together.

## Icons

An icon is a CSS class: `<.icon name="lucide-save" class="size-5" />`.
Tailwind builds it into your `app.css` from the icon's SVG, so nothing is
fetched at runtime, and only the icons your templates name end up in the
file.

### Heroicons, already in Phoenix

A new Phoenix app ships [Heroicons](https://heroicons.com): `hero-x-mark`,
`hero-check-circle-solid`, `hero-arrow-path-mini`. The plugin is
`assets/vendor/heroicons.js`, and `<.icon>` is in `core_components.ex`.

### More icon sets, from Iconify

[Iconify](https://icon-sets.iconify.design) publishes over 200 icon sets as
npm packages of JSON. Lucide and Material Design Icons, for example:

**1. Install the sets you want:**

```bash
npm install --save-exact @iconify-json/lucide @iconify-json/mdi --prefix assets
```

**2. Add the plugin.** Copy `assets/vendor/iconify.js` from the examples
app into your `assets/vendor/`. It has about 40 lines of code and works like Phoenix's
`heroicons.js`: each `<set>-<icon>` class becomes a CSS mask with the
icon's SVG, filled with `currentColor`.

**3. List the sets in `assets/css/app.css`,** next to the heroicons plugin:

```css
@plugin "../vendor/iconify" {
  sets: lucide, mdi;
}
```

**4. Let `<.icon>` take any icon.** Phoenix's generated `icon/1` only
accepts `hero-` names. Replace it with one clause:

```elixir
attr :name, :string, required: true
attr :class, :any, default: "size-4"
attr :label, :string, default: nil

def icon(assigns) do
  ~H"""
  <span
    class={[@name, @class]}
    role={@label && "img"}
    aria-label={@label}
    aria-hidden={is_nil(@label) && "true"}
  />
  """
end
```

Why not Iconify's own `@iconify/tailwind4` plugin? It's an ES module, and
the standalone Tailwind binary Phoenix uses can't load it (it reports
"Cannot find module"). The JSON packages load fine.

### Names

The class is the set's prefix and the icon's name: `lucide-save`,
`lucide-trash-2`, `mdi-check-circle`, `hero-x-mark`. Find names on
[icon-sets.iconify.design](https://icon-sets.iconify.design) (shown there
as `lucide:save`) and heroicons.com.

Size and color work like text: `size-4`, `size-8`, `text-success`,
`text-base-content/60`. Because icons are filled with the text color, they
follow light and dark themes on their own.

### The asset build

Tailwind finds icons by reading your templates for class names, exactly as
it does for every other class. So:

- **Write names in full:** `name="lucide-save"`. A name built at runtime,
  `name={"lucide-" <> @kind}`, isn't in any file Tailwind reads, so it
  isn't in the CSS. Map such values to full names in code:
  `name={if @ok, do: "lucide-circle-check", else: "lucide-circle-alert"}`.
- **Check a production build** once you've set it up:
  `MIX_ENV=prod mix assets.deploy`, then look for `.lucide-save{` in
  `priv/static/assets/css/app.css`.

### Accessibility

- **Icons are decorative by default:** `aria-hidden="true"`. The button or
  text next to the icon says what it means.
- **A button with only an icon needs a name:**
  `<button aria-label="Delete"><.icon name="lucide-trash-2" /></button>`.
- **An icon that means something on its own gets `label`:**
  `<.icon name="mdi-check-circle" label="Saved" />` becomes
  `role="img"` with that name, for a status shown without text.

The icons keep their own licenses: Lucide is ISC, Material Design Icons is
Apache 2.0, Heroicons is MIT.

## Notifications

Use Phoenix's flash. It already does what a notification needs: a
message from the server, shown on the page, dismissed with a click.

```elixir
def handle_event("save", _params, socket) do
  case Documents.save(socket.assigns.document) do
    {:ok, _document} ->
      {:noreply, put_flash(socket, :success, gettext("Document saved successfully"))}

    {:error, _changeset} ->
      {:noreply, put_flash(socket, :error, gettext("Could not save document"))}
  end
end
```

### Success, error and info

Phoenix's generated `<.flash>` renders `:info` and `:error`. A `:success`
message needs two small changes in your app:

- in `core_components.ex`, add `:success` to `flash/1`'s `kind` values, with
  `alert-success` and an icon (`lucide-circle-check`);
- in `layouts.ex`, render `<.flash kind={:success} flash={@flash} />` in
  `flash_group/1`.

`put_flash` itself accepts any key; it's only the renderer that has to know
it. The examples app also gives errors `role="alert"` and the others
`role="status"`, so screen readers interrupt only for errors.

### Stacked, newest first

`flash_group/1` is one column at the top right, so several messages never
cover each other: a new one appears on top and pushes the older ones down.
Phoenix keeps one message per kind, so there are at most three (info,
success, error); a new message of a kind already shown replaces it, moves
it to the top, and restarts its countdown.

### Closing by themselves, with a countdown

`mix xenia.install` gives a new app this flash: the success kind, the
stacking and the countdown. Phoenix's flash stays until it's clicked; this
one can also close by itself: a line around the message's border runs out,
then the message closes. Hovering the message, or focus inside it, pauses
the countdown. Errors never close by themselves: the user may need time to
read them.

```heex
<%!-- layouts.ex: info and success close after 5 s, rounded corners --%>
<.flash_group flash={@flash} />
<.flash_group flash={@flash} shape="sharp" duration={8000} />
<.flash_group flash={@flash} shape="pill" duration={nil} />  <%!-- no countdown --%>
```

How it's built, all in your app:

- **`flash/1`** takes `duration` (milliseconds, or `nil`) and `shape`
  (`rounded`, the theme's radius; `sharp`; `pill`). With a duration, it
  draws an SVG `<rect>` over the message's border.
- **The countdown is CSS** (in `app.css`): the rect's stroke runs out over
  `--flash-duration`, so pausing on hover is one rule
  (`animation-play-state: paused`). With `prefers-reduced-motion`, the
  line isn't drawn, but the message still closes on time.
- **A small colocated hook** in `core_components.ex`
  (`<script :type={Phoenix.LiveView.ColocatedHook}>`) does the rest. When
  the animation ends, it runs the message's own `phx-click`, which clears
  the flash on the server and hides it. When a message appears or gets new
  text, it moves it to the top of the stack. Nothing to add to `app.js`.

Copy `flash/1`, `flash_group/1` and the "flash countdown" block of
`app.css` from the examples app.

### Failures

Show a plain message, and log the details. An exception's message can hold
a database address, a file path or a token:

```elixir
{:error, reason} ->
  Logger.error("Saving the document failed: #{inspect(reason)}")
  {:noreply, put_flash(socket, :error, gettext("Could not save document"))}
```

Flash messages are text: HEEx escapes them, so a message containing what a
user typed can't inject HTML.

### Translated messages

`gettext("...")` runs when you call `put_flash`, in the LiveView's process,
so the message is in the user's language (see Languages, below).

### During navigation

- `put_flash`, then `push_navigate`: the message shows on the next page.
- A plain link to another page starts that page without the old message.
- A click on a message clears it (`lv:clear-flash`).

Xenia doesn't turn JavaScript errors into notifications. For an island that
breaks, use its `<:error>` slot and `on_crash` event instead.

## Languages

Gettext is the only translation store. Phoenix translates, and passes the
words to JavaScript islands as props.

### Set up Gettext

A Phoenix app made without `--no-gettext` has all of this already.

```elixir
# mix.exs
{:gettext, "~> 1.0"}

# lib/my_app_web/gettext.ex
defmodule MyAppWeb.Gettext do
  use Gettext.Backend, otp_app: :my_app
end

# lib/my_app_web.ex, in html_helpers
use Gettext, backend: MyAppWeb.Gettext

# config/config.exs
config :my_app, MyAppWeb.Gettext, default_locale: "en", locales: ~w(en de)
```

### Add a language

```bash
mix gettext.extract                         # finds every gettext(...) call
mix gettext.merge priv/gettext --locale de  # creates de/LC_MESSAGES/default.po
```

Translate each `msgstr` in `priv/gettext/de/LC_MESSAGES/default.po`. Later,
`mix gettext.extract --merge` adds new messages to every language.

### Translations in HEEx, and switching without a reload

`{gettext("Save")}` in a template works, with one catch when users switch
language on a live page: **LiveView only re-renders what depends on
assigns.** An expression without assigns is rendered once, so it stays in
the old language until the page reloads.

Keep the words a page shows in an assign, and compute it again after a
switch:

```elixir
def mount(_params, _session, socket), do: {:ok, assign_texts(socket)}

defp assign_texts(socket) do
  assign(socket, t: %{heading: gettext("Languages"), save: gettext("Save")})
end

def handle_event("set_locale", %{"locale" => locale}, socket),
  do: {:noreply, socket |> MyAppWeb.Locale.put(locale) |> assign_texts()}
```

```heex
<h1>{@t.heading}</h1>
<button>{@t.save}</button>
```

Text with a value in it can take `@locale` as an argument, so it re-renders
on a switch too: `{saves_text(@saves, @locale)}`.

If your users pick a language once (in their profile, say), and a page
reload is fine, `gettext` straight in templates is all you need.

### Passing translated text into a Xenia island

Translate on the server, and pass the words as props:

```heex
<.xenia
  id="stepper"
  adapter="Stepper"
  props={%{labels: %{reset: gettext("Reset"), total: gettext("Total")}}}
/>
```

When the language changes, the props change, and Xenia calls the adapter's
prop handlers, as for any prop. The island isn't rebuilt, so its own state
(a count, a selection, an open editor) stays. In the adapter, put the words
in with `textContent`, not `innerHTML`: translations are data.

For numbers and dates, publish the locale once, in your layout, and let
islands format for it:

```heex
<Xenia.Provider.provider name="locale" value={@locale} />
```

```js
export const stepper = {
  consumes: ["locale"],
  props: {
    locale(instance, locale) { instance.money = new Intl.NumberFormat(locale, ...) },
  },
}
```

### Switching language in an app

Gettext keeps the locale per process, and a LiveView app has several:

- **The first page load** is an HTTP request: a plug reads a `locale`
  cookie, calls `Gettext.put_locale/2`, and puts the locale in the session.
- **Each LiveView** sets it again in `on_mount`, from its connect params,
  or from the session on the first render.
- **A switch** calls `Gettext.put_locale/2` in the LiveView's process,
  assigns `@locale`, and sends a `push_event` so the browser stores the
  cookie.
- **The browser** sends the cookie's value in the LiveSocket's connect
  params. LiveSocket calls a `params` function on every LiveView join, so
  live navigation to the next page uses the new language too:

  ```js
  const locale = () => document.cookie.match(/(?:^|; )locale=(\w+)/)?.[1]
  window.addEventListener("phx:locale", ({detail}) => {
    document.cookie = `locale=${detail.locale}; path=/; max-age=31536000; SameSite=Lax`
  })
  new LiveSocket("/live", Socket, {params: () => ({_csrf_token: csrfToken, locale: locale()})})
  ```

The examples app's `XeniaExamplesWeb.Locale` does all four in about 70
lines: the plug, `on_mount`, `put/2` and a language selector.

### What Xenia doesn't do

Xenia doesn't extract or translate strings written in JavaScript. Words an
island shows come from Phoenix, as props. That keeps one translation store,
in the `.po` files your team already edits.
