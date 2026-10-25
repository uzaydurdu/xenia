defmodule XeniaExamplesWeb.App.Tabs.FirstPage do
  @moduledoc """
  `/tabs/first`. It only renders: `tabs/live.ex` owns the state, and these
  are its assigns.
  """
  use XeniaExamplesWeb, :html

  def render(assigns) do
    ~H"""
    <p id="tab-content">First tab. The count is <span id="count">{@count}</span>.</p>
    """
  end
end
