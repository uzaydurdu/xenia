defmodule XeniaExamplesWeb.App.Routing.Company.ContactPage do
  @moduledoc """
  `/routing/contact`, in the same `(company)` group as Team, so it gets the
  same layout.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  import XeniaExamplesWeb.App.Routing.RouteInfo

  @impl true
  def mount(params, _session, socket) do
    {:ok, assign(socket, params: params)}
  end

  def metadata(_assigns), do: %{title: "Contact"}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Contact</h1>
    <.route_info route="/routing/contact" file="routing/(company)/contact/page.ex" params={@params} />
    <p>
      The box around this page comes from the group's layout, like on the Team page. The
      other routing pages aren't in the group, so they don't get it.
    </p>
    """
  end
end
