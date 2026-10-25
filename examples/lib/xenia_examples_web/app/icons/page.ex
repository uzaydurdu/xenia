defmodule XeniaExamplesWeb.App.IconsPage do
  @moduledoc """
  `/icons`: icons from Iconify (Lucide and Material Design Icons) and
  Phoenix's Heroicons, through the app's `<.icon>`.

  Each icon is a CSS class, bundled into app.css at build time by the
  plugins in `assets/vendor/`. Only the icons named in templates are built,
  so names are written in full.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket), do: {:ok, assign(socket, page_title: "Icons")}

  @impl true
  def handle_event("save", _params, socket),
    do: {:noreply, put_flash(socket, :success, gettext("Document saved successfully"))}

  def handle_event("delete", _params, socket),
    do: {:noreply, put_flash(socket, :info, gettext("Document deleted"))}

  def handle_event("edit", _params, socket),
    do: {:noreply, put_flash(socket, :info, gettext("Editing is only a demo here"))}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Icons</h1>
    <p>
      Thousands of ready-made icons, as Tailwind classes: <code>&lt;.icon name="lucide-save" /&gt;</code>.
      They're built into your CSS, so nothing is fetched at runtime.
    </p>

    <h2 class="text-lg font-semibold">Navigation</h2>
    <nav id="icon-nav" class="flex flex-wrap gap-1" aria-label="Example navigation">
      <.link navigate={~p"/"} class="btn btn-ghost btn-sm">
        <.icon name="lucide-house" class="size-4" /> Home
      </.link>
      <.link navigate={~p"/notifications"} class="btn btn-ghost btn-sm">
        <.icon name="lucide-bell" class="size-4" /> Notifications
      </.link>
      <.link navigate={~p"/languages"} class="btn btn-ghost btn-sm">
        <.icon name="lucide-languages" class="size-4" /> Languages
      </.link>
      <.link navigate={~p"/settings"} class="btn btn-ghost btn-sm">
        <.icon name="lucide-settings" class="size-4" /> Settings
      </.link>
    </nav>

    <h2 class="text-lg font-semibold">Buttons</h2>
    <p>
      A button with text needs nothing more: the icon is decorative and hidden from screen
      readers. A button with only an icon gets an <code>aria-label</code>.
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <button id="save" type="button" phx-click="save" class="btn btn-primary btn-sm">
        <.icon name="lucide-save" class="size-4" /> Save
      </button>
      <button id="delete" type="button" phx-click="delete" class="btn btn-error btn-sm btn-outline">
        <.icon name="lucide-trash-2" class="size-4" /> Delete
      </button>
      <button id="edit" type="button" phx-click="edit" class="btn btn-square btn-sm" aria-label="Edit">
        <.icon name="lucide-pencil" class="size-4" />
      </button>
      <button
        id="delete-icon"
        type="button"
        phx-click="delete"
        class="btn btn-square btn-sm btn-error btn-outline"
        aria-label="Delete"
      >
        <.icon name="mdi-delete" class="size-4" />
      </button>
    </div>

    <h2 class="text-lg font-semibold">Status</h2>
    <p>
      An icon that means something on its own gets a <code>label</code>: screen readers announce it.
    </p>
    <ul class="space-y-2">
      <li class="flex items-center gap-2">
        <.icon name="mdi-check-circle" class="size-5 text-success" label="Saved" /> All changes saved
      </li>
      <li class="flex items-center gap-2">
        <.icon name="mdi-alert" class="size-5 text-warning" label="Warning" />
        Your trial ends in 3 days
      </li>
      <li class="flex items-center gap-2">
        <.icon name="mdi-close-circle" class="size-5 text-error" label="Error" />
        The last backup failed
      </li>
    </ul>

    <h2 class="text-lg font-semibold">Sizes and colors</h2>
    <p>Size with <code>size-*</code>, color with <code>text-*</code>, like text.</p>
    <div id="sizes" class="flex items-end gap-4">
      <.icon name="lucide-star" class="size-4" />
      <.icon name="lucide-star" class="size-6" />
      <.icon name="lucide-star" class="size-8" />
      <.icon name="lucide-star" class="size-12" />
    </div>
    <div class="flex items-center gap-4">
      <.icon name="lucide-heart" class="size-8 text-primary" />
      <.icon name="lucide-heart" class="size-8 text-accent" />
      <.icon name="lucide-heart" class="size-8 text-success" />
      <.icon name="lucide-heart" class="size-8 text-error" />
      <.icon name="lucide-heart" class="size-8 text-base-content/40" />
    </div>

    <h2 class="text-lg font-semibold">Light and dark</h2>
    <p>Icons take the text color, so they follow the theme. The same icons in both themes:</p>
    <div class="grid gap-3 sm:grid-cols-2">
      <div
        :for={theme <- ~w(light dark)}
        id={"theme-#{theme}"}
        data-theme={theme}
        class="flex items-center gap-3 rounded-box border border-base-300 bg-base-100 p-4 text-base-content"
      >
        <.icon name="lucide-sun" class="size-6" />
        <.icon name="lucide-moon" class="size-6" />
        <.icon name="lucide-save" class="size-6 text-primary" />
        <span class="text-sm">{theme}</span>
      </div>
    </div>

    <h2 class="text-lg font-semibold">Three icon sets</h2>
    <div class="overflow-x-auto">
      <table id="sets" class="table">
        <thead>
          <tr>
            <th></th>
            <th>Lucide</th>
            <th>Material Design Icons</th>
            <th>Heroicons (Phoenix)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Home</td>
            <td><.icon name="lucide-house" class="size-6" /></td>
            <td><.icon name="mdi-home" class="size-6" /></td>
            <td><.icon name="hero-home" class="size-6" /></td>
          </tr>
          <tr>
            <td>Settings</td>
            <td><.icon name="lucide-settings" class="size-6" /></td>
            <td><.icon name="mdi-cog" class="size-6" /></td>
            <td><.icon name="hero-cog-6-tooth" class="size-6" /></td>
          </tr>
          <tr>
            <td>Save</td>
            <td><.icon name="lucide-save" class="size-6" /></td>
            <td><.icon name="mdi-content-save" class="size-6" /></td>
            <td><.icon name="hero-arrow-down-tray" class="size-6" /></td>
          </tr>
          <tr>
            <td>Done</td>
            <td><.icon name="lucide-circle-check" class="size-6" /></td>
            <td><.icon name="mdi-check-circle" class="size-6" /></td>
            <td><.icon name="hero-check-circle" class="size-6" /></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-sm opacity-70">
      Browse every icon at
      <a href="https://icon-sets.iconify.design" class="link">icon-sets.iconify.design</a>
      (Lucide: ISC license, Material Design Icons: Apache 2.0) and <a
        href="https://heroicons.com"
        class="link"
      >heroicons.com</a>.
    </p>
    """
  end
end
