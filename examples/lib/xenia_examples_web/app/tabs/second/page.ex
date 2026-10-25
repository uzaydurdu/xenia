defmodule XeniaExamplesWeb.App.Tabs.SecondPage do
  @moduledoc """
  `/tabs/second`. It only renders: `tabs/live.ex` owns the state, and these
  are its assigns.
  """
  use XeniaExamplesWeb, :html

  def render(assigns) do
    ~H"""
    <p id="tab-content">Second tab. The count is still <span id="count">{@count}</span>.</p>
    """
  end
end
