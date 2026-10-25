defmodule XeniaExamplesWeb.App.Routing.CompanyLayout do
  @moduledoc """
  The layout of the pages in `routing/(company)`: Team and Contact.

  `(company)` is a group. Its name stays out of the URL (`/routing/team`,
  not `/routing/company/team`), and this layout frames only the pages
  inside it. Use a group to give some pages a layout, or an `on_mount`
  check such as sign-in, without changing their URLs.
  """
  use XeniaExamplesWeb, :html
  # sitemap: false leaves Team and Contact out of /sitemap.xml, as you
  # would for pages behind a sign-in.
  use Xenia.Layout, sitemap: false

  @impl true
  def frame(assigns) do
    ~H"""
    <section id="company" class="space-y-4 rounded-box border border-base-300 p-5">
      <p class="text-xs font-medium uppercase tracking-wide opacity-60">
        Company · from <code class="normal-case">routing/(company)/layout.ex</code>
      </p>
      {@inner_content}
    </section>
    """
  end
end
