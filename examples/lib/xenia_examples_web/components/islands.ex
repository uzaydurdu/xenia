defmodule XeniaExamplesWeb.Islands do
  @moduledoc """
  The tags for this app's JS islands.

  Each `component` makes an ordinary function component, like `<.chart>`.
  HEEx checks its attributes when it compiles: a missing required prop or a
  misspelled one is a warning. Each `event` becomes an `on_<event>`
  attribute that names the LiveView event to send.

  The `adapter` is the name the island has in `createHooks` in
  `assets/js/app.js`.
  """
  use Xenia.Components

  component :chart, adapter: "Chart" do
    prop :type, :string, default: "bar"
    prop :data, :map, required: true
    # Leave it out to follow the app's theme; set it to pin one.
    prop :theme, :string
    event :click
  end

  component :date_picker, adapter: "DatePicker", form_value: :value do
    prop :value, :string
    prop :min, :string
    event :change
  end

  component :rating, adapter: "Rating" do
    prop :value, :integer, default: 0
    prop :max, :integer, default: 5
    event :change
  end
end
