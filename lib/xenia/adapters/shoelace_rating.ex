defmodule Xenia.Adapters.ShoelaceRating do
  @moduledoc """
  `<.shoelace_rating>`: a star rating (Shoelace's <sl-rating>), through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install @shoelace-style/shoelace --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createShoelaceRating } from "xenia/shoelace-rating"

  const shoelaceRating = createShoelaceRating({
      load: () => import("@shoelace-style/shoelace/dist/components/rating/rating.js"),
  })

  hooks: { ...colocatedHooks, ...createHooks({ ShoelaceRating: shoelaceRating }) },
  ```

  And its CSS, in `assets/css/app.css`:

      @import "../node_modules/@shoelace-style/shoelace/dist/themes/light.css";

  Then `import Xenia.Adapters.ShoelaceRating` in `html_helpers`, and render
  `<.shoelace_rating id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  As a form field, `field={@form[:x]}` fills `value` and submits the
  component with the form.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"ShoelaceRating"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for Shoelace's <sl-rating> (shoelace_rating.js).

    mount() returns the element itself, so any prop without a handler is set
    as an element property by Xenia's default handler (`element[key] = value`).
    Only `value` has a handler, because it needs form echo handling.

    Props (all <sl-rating> properties):
      value      number   current rating (default 0)
      max        number   number of symbols (default 5)
      precision  number   step size, e.g. 0.5 for half stars (default 1)
      label      string   accessible label
      readonly   boolean  show a value that can't be changed
      disabled   boolean  greyed out, no input
      revision   number   bump to force `value` (see "Server corrections")
      Send every prop on every render (give them defaults in the component):
      a removed prop would be set to `undefined`, not back to its default.

    Commands:  focus, blur, set_value %{value}
    Events:    change %{value}, hover %{phase, value}, focus, blur, error

    Form field: inside <.form> with field={@form[:rating]}, the value is
    submitted with the form, and validate replies carrying an older value are
    ignored.

    Server corrections: props are only sent when they change. If the user
    picks 4 and the server refuses it (keeping value at 2), the `value` prop
    doesn't change. Bump `revision` or send `set_value` to put it back.

    Styling (on the container or any ancestor; they inherit):
      --xenia-rating-filled   --xenia-rating-empty
      --xenia-rating-size     --xenia-rating-spacing
    The adapter points the element's own --symbol-* variables at these, so
    stars render correctly even without Shoelace's theme CSS. The theme is
    still recommended (focus ring, disabled look):
      @import "../node_modules/@shoelace-style/shoelace/dist/themes/light.css";
  """
  use Xenia.Components

  component :shoelace_rating, adapter: "ShoelaceRating", form_value: :value do
    prop :value, :any, default: 0
    prop :max, :integer, default: 5
    prop :precision, :any, default: 1
    prop :label, :string, default: ""
    prop :readonly, :boolean, default: false
    prop :disabled, :boolean, default: false
    prop :revision, :integer
    event :change
    event :hover
    event :focus
    event :blur
    event :error
  end
end
