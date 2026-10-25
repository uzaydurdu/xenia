defmodule XeniaExamplesWeb.Router do
  use XeniaExamplesWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {XeniaExamplesWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    # Gettext's locale for the first page load, from the "locale" cookie
    plug XeniaExamplesWeb.Locale
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  # Every page comes from the app folder: each page.ex is a route. One
  # live_session, so the sidebar (app/persistent.ex) stays alive across pages.
  import Xenia.Routes

  # Every page of the app folder, for search engines (Xenia.Sitemap).
  get "/sitemap.xml", Xenia.Sitemap, []

  scope "/" do
    pipe_through :browser

    live_session :examples, on_mount: [{XeniaExamplesWeb.Locale, :default}] do
      xenia_routes "lib/xenia_examples_web/app"
    end
  end

  # Other scopes may use custom stacks.
  # scope "/api", XeniaExamplesWeb do
  #   pipe_through :api
  # end
end
