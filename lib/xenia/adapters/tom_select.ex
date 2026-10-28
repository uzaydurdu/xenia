defmodule Xenia.Adapters.TomSelect do
  @moduledoc """
  `<.tom_select>`: a searchable select and tag picker (Tom Select), through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install tom-select --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createTomSelect } from "xenia/tom-select"

  const tomSelect = createTomSelect({
      load: () => import("tom-select"),
  })

  hooks: { ...colocatedHooks, ...createHooks({ TomSelect: tomSelect }) },
  ```

  And its CSS, in `assets/css/app.css`:

      @import "../node_modules/tom-select/dist/css/tom-select.css";

  Then `import Xenia.Adapters.TomSelect` in `html_helpers`, and render
  `<.tom_select id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  As a form field, `field={@form[:x]}` fills `value` and submits the
  component with the form.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"TomSelect"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for Tom Select (v2): a searchable select or multi-select,
    with tagging, server-side search, and form-field support.

    Props:
      options      [%{value, text, disabled?, optgroup?}]   the choices
      optgroups    [%{value, label}]                        optional groups
      value        the selected value (a string), or a list for `multiple`
      multiple     true for a multi-select. Changing it remounts.
      placeholder  text shown while nothing is selected
      create       true lets the user add values that aren't in `options`
      max_items    maximum selections (multi-select)
      remote       true sends what the user types to the server as a `search`
                   call. Reply from handle_event with
                   {:reply, %{options: [...]}, socket}, and those options
                   are the results for that query. (Updating `options` works
                   too.)
      disabled     true / false
      settings     any other Tom Select setting, snake_case or camelCase:
                   max_options, close_after_select, hide_selected,
                   allow_empty_option, plugins (e.g. ["remove_button"]), ...
                   Changing them remounts.

    Commands:
      focus, blur, open, close
      clear                          remove the selection (reported as change)
      set_value %{value}             select programmatically (not reported)
      add_option %{value, text}

    Events:
      change   %{value}          a string, or a list for `multiple`
      search   %{query}          with `remote`; a call: reply %{options: [...]}
      created  %{value, text}    the user created a new option
      focus %{}, blur %{}
      error    %{source, message, code}

    Form field: with field={@form[:tag]} the value is submitted with the form.
    A multi-select submits a JSON array string, e.g. "[\"a\",\"b\"]", because
    the form value is one hidden input. An Ecto {:array, _} field can't cast
    that string: decode it first with Jason.decode/1 (not decode!, since the
    browser can send any string), and treat anything that isn't a list as
    empty.

    Import Tom Select's CSS once, e.g. in app.css:
      @import "../node_modules/tom-select/dist/css/tom-select.css";
  """
  use Xenia.Components

  component :tom_select, adapter: "TomSelect", form_value: :value do
    prop :options, :list, required: true
    prop :value, :any
    prop :optgroups, :list
    prop :multiple, :boolean
    prop :placeholder, :string
    prop :create, :boolean
    prop :max_items, :integer
    prop :remote, :boolean
    prop :disabled, :boolean
    prop :settings, :map
    event :change
    event :search
    event :created
    event :focus
    event :blur
    event :error
  end
end
