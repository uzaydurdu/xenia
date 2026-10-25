defmodule XeniaExamplesWeb.App.Routing.Company.TeamPage do
  @moduledoc """
  `/routing/team`. The file is `routing/(company)/team/page.ex`: the group
  folder `(company)` isn't in the URL.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  import XeniaExamplesWeb.App.Routing.RouteInfo

  @impl true
  def mount(params, _session, socket) do
    {:ok, assign(socket, params: params)}
  end

  def metadata(_assigns), do: %{title: "Team"}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Team</h1>
    <.route_info route="/routing/team" file="routing/(company)/team/page.ex" params={@params} />
    <p>
      Three layouts frame this page, outermost first: the app's (header and sidebar),
      <code>routing/layout.ex</code>
      (the links), and <code>(company)/layout.ex</code>
      (this box).
    </p>
    """
  end
end
