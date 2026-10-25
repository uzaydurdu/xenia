defmodule XeniaExamplesWeb.App.RootLayout do
  @moduledoc """
  The layout around every page: the app's header, and a sidebar.

  The sidebar is `persistent.ex`, in this same folder. It stays alive while
  you move between pages.
  """
  use XeniaExamplesWeb, :html
  use Xenia.Layout

  # The defaults for every page's <head> (Xenia.Metadata). No title: the
  # pages set their own page_title, which then also becomes og:title.
  @impl true
  def metadata(_assigns) do
    %{
      description: "Xenia examples: JavaScript libraries in Phoenix LiveView, one page each.",
      open_graph: %{site_name: "Xenia examples", type: "website"}
    }
  end

  @impl true
  def frame(assigns) do
    ~H"""
    <%!-- The Notifications example lets you pick the messages' shape and
         countdown; every other page gets the defaults. --%>
    <Layouts.app
      flash={@flash}
      flash_shape={assigns[:flash_shape] || "rounded"}
      flash_duration={Map.get(assigns, :flash_duration, 5000)}
    >
      <%!-- The page's language, for islands that format numbers and dates
           (consumes: ["locale"]). Set by XeniaExamplesWeb.Locale. --%>
      <Xenia.Provider.provider name="locale" value={@locale} />
      <div class="grid gap-8 md:grid-cols-[13rem_1fr]">
        <aside>{@persistent}</aside>
        <article id="page" class="min-w-0 space-y-5">{@inner_content}</article>
      </div>
    </Layouts.app>
    """
  end
end
