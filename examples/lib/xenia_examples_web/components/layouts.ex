defmodule XeniaExamplesWeb.Layouts do
  @moduledoc """
  This module holds layouts and related functionality
  used by your application.
  """
  use XeniaExamplesWeb, :html

  # Embed all files in layouts/* within this module.
  # The default root.html.heex file contains the HTML
  # skeleton of your application, namely HTML headers
  # and other static content.
  embed_templates "layouts/*"

  @doc """
  Renders your app layout.

  This function is typically invoked from every template,
  and it often contains your application menu, sidebar,
  or similar.

  ## Examples

      <Layouts.app flash={@flash}>
        <h1>Content</h1>
      </Layouts.app>

  """
  attr :flash, :map, required: true, doc: "the map of flash messages"
  attr :flash_shape, :string, default: "rounded", doc: "the messages' corners (see flash_group/1)"
  attr :flash_duration, :any, default: 5000, doc: "see flash_group/1"

  attr :current_scope, :map,
    default: nil,
    doc: "the current [scope](https://phoenix.hexdocs.pm/scopes.html)"

  slot :inner_block, required: true

  def app(assigns) do
    ~H"""
    <div class="relative isolate min-h-screen">
      <%!-- The faint grid from Xenia's theme (mix xenia.install adds the same) --%>
      <div class="xenia-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem]"></div>

      <header class="sticky top-0 z-30 border-b border-base-300 bg-base-100/80 backdrop-blur">
        <div class="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <a href="/" class="flex items-center gap-2 font-semibold tracking-tight">
            <img src={~p"/images/xenia-mark.png"} alt="" width="22" height="22" />
            <span>Xenia examples</span>
          </a>
          <nav class="ml-auto flex items-center gap-1 text-sm">
            <a href="https://hexdocs.pm/xenia" class="btn btn-ghost btn-sm">Docs</a>
            <.theme_toggle />
          </nav>
        </div>
      </header>

      <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {render_slot(@inner_block)}
      </main>

      <.flash_group flash={@flash} shape={@flash_shape} duration={@flash_duration} />
    </div>
    """
  end

  @doc """
  Shows the flash group with standard titles and content.

  Info and success messages close by themselves after `duration`
  milliseconds, with a countdown around their border; hovering pauses it.
  Errors stay until they're clicked: the user may need time to read them.

  ## Examples

      <.flash_group flash={@flash} />
      <.flash_group flash={@flash} shape="sharp" duration={8000} />
      <.flash_group flash={@flash} duration={nil} />
  """
  attr :flash, :map, required: true, doc: "the map of flash messages"
  attr :id, :string, default: "flash-group", doc: "the optional id of flash container"
  attr :shape, :string, default: "rounded", doc: "rounded, sharp or pill"

  attr :duration, :any,
    default: 5000,
    doc: "ms until info and success close by themselves; nil to keep them"

  def flash_group(assigns) do
    ~H"""
    <%!-- One column of messages at the top right: they stack, newest first. --%>
    <div id={@id} aria-live="polite" class="toast toast-top toast-end z-50 pointer-events-none">
      <.flash kind={:info} flash={@flash} shape={@shape} duration={@duration} />
      <.flash kind={:success} flash={@flash} shape={@shape} duration={@duration} />
      <.flash kind={:error} flash={@flash} shape={@shape} />

      <.flash
        id="client-error"
        kind={:error}
        title={gettext("We can't find the internet")}
        phx-disconnected={
          show(".phx-client-error #client-error")
          |> JS.remove_attribute("hidden", to: ".phx-client-error #client-error")
        }
        phx-connected={hide("#client-error") |> JS.set_attribute({"hidden", ""})}
        hidden
      >
        {gettext("Attempting to reconnect")}
        <.icon name="hero-arrow-path" class="ml-1 size-3 motion-safe:animate-spin" />
      </.flash>

      <.flash
        id="server-error"
        kind={:error}
        title={gettext("Something went wrong!")}
        phx-disconnected={
          show(".phx-server-error #server-error")
          |> JS.remove_attribute("hidden", to: ".phx-server-error #server-error")
        }
        phx-connected={hide("#server-error") |> JS.set_attribute({"hidden", ""})}
        hidden
      >
        {gettext("Attempting to reconnect")}
        <.icon name="hero-arrow-path" class="ml-1 size-3 motion-safe:animate-spin" />
      </.flash>
    </div>
    """
  end

  @doc """
  Provides dark vs light theme toggle based on themes defined in app.css.

  See <head> in root.html.heex which applies the theme before page load.
  """
  def theme_toggle(assigns) do
    ~H"""
    <div class="card relative flex flex-row items-center border-2 border-base-300 bg-base-300 rounded-full">
      <div class="absolute w-1/3 h-full rounded-full border-1 border-base-200 bg-base-100 brightness-200 left-0 [[data-theme=light]_&]:left-1/3 [[data-theme=dark]_&]:left-2/3 [[data-theme-source=system]_&]:!left-0 transition-[left]" />

      <button
        class="flex p-2 cursor-pointer w-1/3"
        phx-click={JS.dispatch("phx:set-theme")}
        data-phx-theme="system"
      >
        <.icon name="hero-computer-desktop-micro" class="size-4 opacity-75 hover:opacity-100" />
      </button>

      <button
        class="flex p-2 cursor-pointer w-1/3"
        phx-click={JS.dispatch("phx:set-theme")}
        data-phx-theme="light"
      >
        <.icon name="hero-sun-micro" class="size-4 opacity-75 hover:opacity-100" />
      </button>

      <button
        class="flex p-2 cursor-pointer w-1/3"
        phx-click={JS.dispatch("phx:set-theme")}
        data-phx-theme="dark"
      >
        <.icon name="hero-moon-micro" class="size-4 opacity-75 hover:opacity-100" />
      </button>
    </div>
    """
  end
end
