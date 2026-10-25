defmodule Xenia.ChartjsTest do
  @moduledoc """
  Tests `<.chartjs>`, the tag for Xenia's official Chart.js adapter: what
  it renders for the JavaScript side (the hook, the props as JSON, the
  bound events). The adapter itself is tested in test/js/chartjs.test.js,
  and with the real Chart.js in the examples app.
  """

  use ExUnit.Case, async: true

  import Phoenix.LiveViewTest, only: [render_component: 2]

  @sales %{labels: ["Jan", "Feb"], datasets: [%{label: "Sales", data: [3, 5]}]}

  defp render_chart(attrs) do
    render_component(&Xenia.Adapters.Chartjs.chartjs/1, Keyword.put_new(attrs, :id, "sales"))
    |> LazyHTML.from_fragment()
    |> LazyHTML.query("#sales")
  end

  defp attr(element, name) do
    case LazyHTML.attribute(element, name) do
      [value] -> value
      [] -> nil
    end
  end

  test "renders the ChartJS adapter's container with type and data" do
    chart = render_chart(data: @sales)

    assert attr(chart, "phx-hook") == "ChartJS"
    assert attr(chart, "phx-update") == "ignore"

    assert Jason.decode!(attr(chart, "data-xenia-props")) == %{
             "type" => "bar",
             "data" => Jason.decode!(Jason.encode!(@sales))
           }
  end

  # Left out, the theme comes from the app (consumes: ["theme"]); set, it wins.
  test "theme is sent only when given, including false" do
    refute Map.has_key?(
             Jason.decode!(attr(render_chart(data: @sales), "data-xenia-props")),
             "theme"
           )

    for theme <- ["light", false] do
      props =
        render_chart(data: @sales, theme: theme) |> attr("data-xenia-props") |> Jason.decode!()

      assert props["theme"] == theme
    end
  end

  test "bound events, options, shortcuts and global attributes" do
    chart =
      render_chart(
        data: @sales,
        type: "line",
        options: %{plugins: %{legend: %{display: false}}},
        on_point_click: "clicked",
        on_error: "chart_failed",
        shortcuts: %{"mod+e" => "export"},
        style: "height: 300px"
      )

    assert Jason.decode!(attr(chart, "data-xenia-events")) == %{
             "point_click" => "clicked",
             "error" => "chart_failed"
           }

    assert %{"type" => "line", "options" => %{"plugins" => %{"legend" => %{"display" => false}}}} =
             Jason.decode!(attr(chart, "data-xenia-props"))

    assert Jason.decode!(attr(chart, "data-xenia-shortcuts")) == %{"mod+e" => "export"}
    assert attr(chart, "style") == "height: 300px"
  end
end
