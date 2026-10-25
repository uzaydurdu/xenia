defmodule Xenia.OfficialTagsTest do
  @moduledoc """
  Every official adapter's tag renders the container its adapter expects:
  the adapter name the JavaScript side registers, the props as JSON, and
  the bound events. Form-field tags take `field`.

  The adapters themselves are tested in test/js (official_adapters.test.js,
  chartjs.test.js) and with the real libraries in the examples app.
  """

  use ExUnit.Case, async: true

  import Phoenix.LiveViewTest, only: [render_component: 2]
  import Phoenix.Component, only: [to_form: 2]

  # {module, function, adapter name, required props}
  @tags [
    {Xenia.Adapters.Chartjs, :chartjs, "ChartJS", [data: %{labels: [], datasets: []}]},
    {Xenia.Adapters.Flatpickr, :flatpickr, "Flatpickr", []},
    {Xenia.Adapters.ShoelaceRating, :shoelace_rating, "ShoelaceRating", []},
    {Xenia.Adapters.SortableJS, :sortable_list, "SortableJS", [items: []]},
    {Xenia.Adapters.TomSelect, :tom_select, "TomSelect", [options: []]},
    {Xenia.Adapters.Leaflet, :leaflet_map, "Leaflet", []},
    {Xenia.Adapters.Tabulator, :tabulator, "Tabulator", [data: [], columns: []]},
    {Xenia.Adapters.FullCalendar, :full_calendar, "FullCalendar", []},
    {Xenia.Adapters.Xterm, :xterm, "Xterm", []},
    {Xenia.Adapters.MonacoDiff, :monaco_diff, "MonacoDiff", []},
    {Xenia.Adapters.Tiptap, :tiptap, "Tiptap", []},
    {Xenia.Adapters.Uppy, :uppy, "Uppy", []},
    {Xenia.Adapters.WaveSurfer, :wavesurfer, "WaveSurfer", []},
    {Xenia.Adapters.WaveSurferMultitrack, :wavesurfer_multitrack, "WaveSurferMultitrack", []},
    {Xenia.Adapters.D3, :d3_chart, "D3", [data: []]}
  ]

  defp container(html, id) do
    html |> LazyHTML.from_fragment() |> LazyHTML.query("##{id}")
  end

  defp attr(element, name) do
    case LazyHTML.attribute(element, name) do
      [value] -> value
      [] -> nil
    end
  end

  for {module, fun, adapter, required} <- @tags do
    test "<.#{fun}> renders the #{adapter} adapter's container" do
      html =
        render_component(
          Function.capture(unquote(module), unquote(fun), 1),
          [id: "c", on_error: "failed"] ++ unquote(Macro.escape(required))
        )

      element = container(html, "c")
      assert attr(element, "phx-hook") == unquote(adapter)
      assert attr(element, "phx-update") == "ignore"
      assert Jason.decode!(attr(element, "data-xenia-events")) == %{"error" => "failed"}

      for {key, value} <- unquote(Macro.escape(required)) do
        assert Jason.decode!(attr(element, "data-xenia-props"))[to_string(key)] ==
                 Jason.decode!(Jason.encode!(value))
      end
    end
  end

  # These tags take `field`: its value fills the named prop.
  # {module, function, prop, value, other required props}
  @form_tags [
    {Xenia.Adapters.Flatpickr, :flatpickr, "value", "2026-11-01", []},
    {Xenia.Adapters.ShoelaceRating, :shoelace_rating, "value", "4", []},
    {Xenia.Adapters.TomSelect, :tom_select, "value", "elixir", [options: []]},
    {Xenia.Adapters.MonacoDiff, :monaco_diff, "modified", "IO.puts(:new)", []},
    {Xenia.Adapters.Tiptap, :tiptap, "content", "<p>Hello</p>", []}
  ]

  for {module, fun, prop, value, required} <- @form_tags do
    test "<.#{fun} field={...}> is a form field filling #{prop}" do
      form = to_form(%{"x" => unquote(value)}, as: :post)
      attrs = [field: form[:x]] ++ unquote(Macro.escape(required))

      html = render_component(Function.capture(unquote(module), unquote(fun), 1), attrs)
      element = container(html, "post_x")

      assert Jason.decode!(attr(element, "data-xenia-props"))[unquote(prop)] == unquote(value)

      assert element |> LazyHTML.query("input[data-xenia-field]") |> LazyHTML.attribute("name") ==
               ["post[x]"]
    end
  end
end
