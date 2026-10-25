defmodule XeniaExamplesWeb.App.NotificationsPage do
  @moduledoc """
  `/notifications`: success, error and information messages, with
  Phoenix's own `put_flash/3`.

  The app's `<.flash>` (core_components.ex) renders `:info`, `:success` and
  `:error`, each with an icon. Messages are translated with Gettext, and
  HEEx escapes them, so text from users can't inject HTML.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  require Logger

  # flash_shape and flash_duration go to the layout's <.flash_group> (see
  # app/layout.ex). In your app, set them once in Layouts.app instead.
  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket, page_title: "Notifications", flash_shape: "rounded", flash_duration: 5000)}
  end

  @impl true
  def handle_event("shape", %{"shape" => shape}, socket) when shape in ~w(rounded sharp pill),
    do: {:noreply, assign(socket, flash_shape: shape)}

  def handle_event("duration", %{"ms" => ms}, socket) do
    duration = if ms == "never", do: nil, else: String.to_integer(ms)
    {:noreply, assign(socket, flash_duration: duration)}
  end

  def handle_event("save", _params, socket), do: {:noreply, save(socket, %{fail: false})}

  # A failure: the details go to the log, the user gets a plain message.
  def handle_event("fail", _params, socket), do: {:noreply, save(socket, %{fail: true})}

  def handle_event("info", _params, socket),
    do: {:noreply, put_flash(socket, :info, gettext("Your changes are saved automatically."))}

  # Text from users is escaped by HEEx: it shows as text, never as HTML.
  def handle_event("untrusted", _params, socket) do
    name = ~s(<b>Mallory</b><script>window.hacked = true</script>)
    {:noreply, put_flash(socket, :info, gettext("Hello, %{name}!", name: name))}
  end

  # The message travels with the navigation, to the next page.
  def handle_event("save_and_go", _params, socket) do
    {:noreply,
     socket
     |> put_flash(:success, gettext("Saved. You're on the Icons page now."))
     |> push_navigate(to: ~p"/icons")}
  end

  defp save(socket, document) do
    case save_document(document) do
      :ok ->
        put_flash(socket, :success, gettext("Document saved successfully"))

      {:error, _reason} ->
        put_flash(socket, :error, gettext("Could not save document. Please try again."))
    end
  end

  # A stand-in for a database call. With fail: true it raises, with details
  # a user must never see: they go to the log.
  defp save_document(%{fail: true}) do
    raise "connection refused: postgres://admin:s3cret@db.internal:5432/app (simulated)"
  rescue
    error ->
      Logger.error("Saving the document failed: " <> Exception.message(error))
      {:error, :unavailable}
  end

  defp save_document(_document), do: :ok

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Notifications</h1>
    <p>
      Phoenix's own <code>put_flash/3</code>. This app's message component adds a success kind,
      an icon for each kind, and a countdown. Click a message, or its close button, to dismiss it.
    </p>

    <div class="flex flex-wrap gap-2">
      <button id="save" type="button" phx-click="save" class="btn btn-sm btn-success">
        <.icon name="lucide-save" class="size-4" /> Save successfully
      </button>
      <button id="fail" type="button" phx-click="fail" class="btn btn-sm btn-error">
        <.icon name="lucide-circle-x" class="size-4" /> Simulate a failure
      </button>
      <button id="info" type="button" phx-click="info" class="btn btn-sm btn-info">
        <.icon name="lucide-info" class="size-4" /> Show information
      </button>
      <button id="untrusted" type="button" phx-click="untrusted" class="btn btn-sm">
        A message with HTML in it
      </button>
    </div>

    <h2 class="text-lg font-semibold">Closing by themselves</h2>
    <p>
      Success and info messages close after a few seconds. The line around the border shows how
      long is left; hover the message to pause it. Errors stay until you dismiss them.
    </p>
    <div class="flex flex-wrap items-center gap-4">
      <div class="join" role="group" aria-label="Shape">
        <button
          :for={shape <- ~w(rounded sharp pill)}
          id={"shape-#{shape}"}
          type="button"
          phx-click="shape"
          phx-value-shape={shape}
          aria-pressed={to_string(@flash_shape == shape)}
          class={["btn btn-sm join-item", @flash_shape == shape && "btn-primary"]}
        >
          {String.capitalize(shape)}
        </button>
      </div>
      <div class="join" role="group" aria-label="Closes after">
        <button
          :for={
            {label, ms} <- [{"3 s", "3000"}, {"5 s", "5000"}, {"10 s", "10000"}, {"Never", "never"}]
          }
          id={"duration-#{ms}"}
          type="button"
          phx-click="duration"
          phx-value-ms={ms}
          aria-pressed={to_string(to_string(@flash_duration || "never") == ms)}
          class={[
            "btn btn-sm join-item",
            to_string(@flash_duration || "never") == ms && "btn-primary"
          ]}
        >
          {label}
        </button>
      </div>
    </div>

    <h2 class="text-lg font-semibold">During navigation</h2>
    <div class="flex flex-wrap gap-2">
      <button id="save-and-go" type="button" phx-click="save_and_go" class="btn btn-sm">
        <.icon name="lucide-arrow-right" class="size-4" /> Save, then open the Icons page
      </button>
      <.link id="go" navigate={~p"/icons"} class="btn btn-sm btn-ghost">
        Open the Icons page
      </.link>
    </div>
    <ul class="list-disc space-y-1 pl-5 text-sm">
      <li>
        <code>put_flash</code>, then <code>push_navigate</code>: the message shows on the next page.
      </li>
      <li>
        A plain link to another page: the next page starts without the old message.
      </li>
    </ul>

    <h2 class="text-lg font-semibold">The code</h2>
    <pre
      phx-no-curly-interpolation
      class="overflow-x-auto rounded-box border border-base-300 bg-base-100 p-4 text-sm"
    >def handle_event("save", _params, socket) do
      case Documents.save(socket.assigns.document) do
        {:ok, _} -> {:noreply, put_flash(socket, :success, gettext("Document saved successfully"))}
        {:error, _} -> {:noreply, put_flash(socket, :error, gettext("Could not save document"))}
      end
    end</pre>
    """
  end
end
