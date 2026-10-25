defmodule Mix.Tasks.Xenia.Routes do
  @shortdoc "Prints the routes generated from Xenia app folders, with their layouts"

  @moduledoc """
  Prints every route `xenia_routes` generated: its path, its page, the
  LiveView that serves it (a `live.ex` owner for shared pages), and its
  layouts, outermost first, with their persistent parts.

      $ mix xenia.routes
      $ mix xenia.routes MyAppWeb.Router

  The router defaults to `<App>Web.Router`. `mix phx.routes` lists the same
  routes among all others, without layouts.
  """

  use Mix.Task

  @impl true
  def run(args) do
    Mix.Task.run("compile", args)

    router =
      case args do
        [name | _] -> Module.concat([name])
        [] -> default_router()
      end

    Code.ensure_loaded(router)

    unless function_exported?(router, :__xenia_pages__, 0) do
      Mix.raise(
        "#{inspect(router)} has no xenia_routes; pass the router: mix xenia.routes MyAppWeb.Router"
      )
    end

    router |> table() |> Enum.each(fn line -> Mix.shell().info(line) end)
  end

  @doc false
  # The printed lines, for `router`.
  def table(router) do
    paths =
      for %{path: path, metadata: %{phoenix_live_view: {view, action, _, _}}} <-
            router.__routes__(),
          into: %{},
          do: {action || view, path}

    rows =
      for {page, %{owner: owner, layouts: layouts} = record} <- router.__xenia_pages__() do
        persistent = Map.get(record, :persistent, %{})

        [
          Map.get(paths, page, "?"),
          inspect(page),
          if(owner == page, do: "", else: "in #{inspect(owner)}"),
          Enum.map_join(layouts, " > ", &layout(&1, persistent))
        ]
      end

    widths =
      rows
      |> Enum.zip_with(& &1)
      |> Enum.map(fn column -> column |> Enum.map(&String.length/1) |> Enum.max(fn -> 0 end) end)

    for row <- rows do
      row
      |> Enum.zip(widths)
      |> Enum.map_join("  ", fn {cell, width} -> String.pad_trailing(cell, width) end)
      |> String.trim_trailing()
    end
  end

  # `RootLayout`, or `AuthLayout (+ ShellLive)` when it has a persistent part.
  defp layout(module, persistent) do
    case persistent do
      %{^module => live} -> "#{short(module)} (+ #{short(live)})"
      _ -> short(module)
    end
  end

  defp short(module), do: module |> Module.split() |> List.last()

  defp default_router do
    app = Mix.Project.config()[:app] |> to_string() |> Macro.camelize()
    Module.concat([app <> "Web", "Router"])
  end
end
