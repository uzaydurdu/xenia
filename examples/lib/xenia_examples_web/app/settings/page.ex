defmodule XeniaExamplesWeb.App.SettingsPage do
  @moduledoc """
  `/settings`: icons, notifications and languages together, in a settings
  panel.

  The Save button has an icon, saving shows a translated success message
  with its own icon, and the switches are a JavaScript island whose labels
  follow the language. The server owns the settings: the switches report
  changes as events.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  alias XeniaExamplesWeb.Locale

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(name: "Ada", settings: %{"email" => true, "summary" => false})
     |> assign_texts()}
  end

  defp assign_texts(socket) do
    assign(socket,
      page_title: gettext("Settings"),
      t: %{
        heading: gettext("Settings"),
        name: gettext("Display name"),
        notifications: gettext("Notifications"),
        save: gettext("Save changes")
      }
    )
  end

  # The switches' labels, translated, with the server's values.
  defp items(settings, _locale) do
    [
      %{key: "email", label: gettext("Email notifications"), checked: settings["email"]},
      %{key: "summary", label: gettext("Weekly summary"), checked: settings["summary"]}
    ]
  end

  @impl true
  def handle_event("set_locale", %{"locale" => locale}, socket),
    do: {:noreply, socket |> Locale.put(locale) |> assign_texts()}

  def handle_event("toggled", %{"key" => key, "checked" => checked}, socket)
      when key in ["email", "summary"],
      do: {:noreply, update(socket, :settings, &Map.put(&1, key, checked))}

  def handle_event("changed", %{"settings" => %{"name" => name}}, socket),
    do: {:noreply, assign(socket, name: name)}

  def handle_event("save", _params, socket),
    do: {:noreply, put_flash(socket, :success, gettext("Settings saved successfully"))}

  @impl true
  def render(assigns) do
    ~H"""
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 id="heading" class="text-2xl font-semibold">{@t.heading}</h1>
      <.locale_switcher locale={@locale} />
    </div>

    <form
      id="settings-form"
      phx-change="changed"
      phx-submit="save"
      class="max-w-md space-y-5 rounded-box border border-base-300 bg-base-100 p-5"
    >
      <label class="block space-y-1">
        <span id="name-label" class="text-sm font-medium">{@t.name}</span>
        <input name="settings[name]" value={@name} class="input w-full" />
      </label>

      <fieldset class="space-y-3">
        <legend id="notifications-label" class="text-sm font-medium">{@t.notifications}</legend>
        <.xenia
          id="toggles"
          adapter="Toggles"
          props={%{items: items(@settings, @locale)}}
          events={%{change: "toggled"}}
        />
      </fieldset>

      <button id="save" type="submit" class="btn btn-primary">
        <.icon name="lucide-save" class="size-4" /> {@t.save}
      </button>
    </form>

    <p id="server-settings" class="text-sm opacity-70">
      {@name} · email: {@settings["email"]} · summary: {@settings["summary"]}
    </p>
    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet title="The tag and the server, in page.ex" code={page_snippet()} />
    <.snippet title="The adapter, in assets/js/islands/toggles.js" code={adapter_snippet()} />
    """
  end

  # The code on the page: how this example is made.
  defp page_snippet,
    do: ~S"""
    <.xenia
      id="toggles"
      adapter="Toggles"
      props={%{items: items(@settings, @locale)}}
      events={%{change: "toggled"}}
    />

    # items: [%{key: "email", label: gettext("Email notifications"), checked: true}, ...]
    def handle_event("toggled", %{"key" => key, "checked" => checked}, socket),
      do: {:noreply, update(socket, :settings, &Map.put(&1, key, checked))}
    """

  defp adapter_snippet,
    do: ~S"""
    export const toggles = {
      mount(el, props, ctx) {
        const list = el.appendChild(document.createElement("div"))
        list.addEventListener("change", (event) =>
          ctx.emit("change", { key: event.target.dataset.key, checked: event.target.checked }),
        )
        const instance = { list }
        update(instance, props.items) // a checkbox per item
        return instance
      },
      destroy: (instance) => instance.list.remove(),
      // A new language only changes the labels: updated in place, not rebuilt
      props: { items: (instance, items) => update(instance, items) },
      events: { change: {} },
    }
    """
end
