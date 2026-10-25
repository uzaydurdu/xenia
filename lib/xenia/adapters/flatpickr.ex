defmodule Xenia.Adapters.Flatpickr do
  @moduledoc """
  `<.flatpickr>`: a date and time picker (flatpickr), through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install flatpickr --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createFlatpickr } from "xenia/flatpickr"

  const flatpickr = createFlatpickr({
      load: () => import("flatpickr"),
  })

  hooks: { ...colocatedHooks, ...createHooks({ Flatpickr: flatpickr }) },
  ```

  And its CSS, in `assets/css/app.css`:

      @import "../node_modules/flatpickr/dist/flatpickr.min.css";

  Then `import Xenia.Adapters.Flatpickr` in `html_helpers`, and render
  `<.flatpickr id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  As a form field, `field={@form[:x]}` fills `value` and submits the
  component with the form.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"Flatpickr"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for flatpickr (v4): date, time, date-time, range and
    multiple-date pickers, usable as a form field.

    Values are strings in `date_format` (default "Y-m-d", "Y-m-d H:i" with
    time, "H:i" for time only), so they arrive on the server ready for
    Date.from_iso8601/1 or NaiveDateTime parsing ("Y-m-d\\TH:i:S" for ISO
    date-times).

    Props:
      value        a date string; for mode "multiple" or "range" a list of them
      revision     bump to force `value` over the user's newer choice
      mode         "single" (default) | "multiple" | "range". Changing it remounts.
      enable_time  true adds a time picker
      no_calendar  true for a time-only picker. Changing it remounts.
      time_24hr    true for a 24-hour clock
      date_format  flatpickr format of the value, e.g. "Y-m-d", "d.m.Y H:i"
      alt_format   friendly format shown to the user (default "F j, Y", with
                   time "F j, Y H:i"); alt_input: false shows `date_format`
      min_date, max_date   date strings, or "today"
      disable      dates (or %{from, to} ranges) the user can't pick
      inline       true shows the calendar permanently. Changing it remounts.
      placeholder  text shown while empty
      locale       a locale object, or the name of one registered with
                   flatpickr.localize / imported from "flatpickr/dist/l10n"
      options      any other flatpickr option, snake_case or camelCase
                   (week_numbers, show_months, minute_increment, ...)

    Commands:
      open, close, toggle
      clear                         clears the value (reported as a change)
      set_value %{value}            sets it without a change event
      jump_to_date %{date}          shows that month

    Events:
      change  %{value}   a string, or a list for "multiple"/"range"
                         (a range sends its list once both ends are chosen)
      open %{}, close %{}
      error   %{source, message, code}

    Form field: with field={@form[:starts_on]} the value is submitted with the
    form; "multiple"/"range" submit a JSON list string.

    Import flatpickr's CSS once, e.g. in app.css:
      @import "../node_modules/flatpickr/dist/flatpickr.min.css";
    (flatpickr/dist/themes/dark.css is a dark theme.)
  """
  use Xenia.Components

  component :flatpickr, adapter: "Flatpickr", form_value: :value do
    prop :value, :any
    prop :revision, :integer
    prop :mode, :string
    prop :enable_time, :boolean
    prop :no_calendar, :boolean
    prop :time_24hr, :boolean
    prop :date_format, :string
    prop :alt_format, :string
    prop :min_date, :string
    prop :max_date, :string
    prop :disable, :list
    prop :inline, :boolean
    prop :placeholder, :string
    prop :locale, :any
    prop :options, :map
    event :change
    event :open
    event :close
    event :error
  end
end
