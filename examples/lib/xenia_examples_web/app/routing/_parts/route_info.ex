defmodule XeniaExamplesWeb.App.Routing.RouteInfo do
  @moduledoc """
  Not a page. Its folder, `_parts`, starts with `_`, so `xenia_routes`
  never makes a route from it. Use such folders for code your pages share.

  `route_info/1` is the box at the top of every routing page: the route,
  the file that answers it, and the params the page got.
  """
  use Phoenix.Component

  attr :route, :string, required: true, doc: "the route, as `mix xenia.routes` prints it"
  attr :file, :string, required: true, doc: "the page's file, in the app folder"
  attr :params, :map, default: %{}

  def route_info(assigns) do
    ~H"""
    <dl
      id="route-info"
      class="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-1 rounded-box border border-base-300 bg-base-100 p-4 text-sm"
    >
      <dt class="opacity-60">Route</dt>
      <dd><code id="route">{@route}</code></dd>
      <dt class="opacity-60">File</dt>
      <dd><code id="file">app/{@file}</code></dd>
      <dt class="opacity-60">Params</dt>
      <dd><code id="params">{inspect(@params)}</code></dd>
    </dl>
    """
  end
end
