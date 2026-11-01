defmodule XeniaExamplesWeb.App.LanguagesPage do
  @moduledoc """
  `/languages`: English and German, from Gettext, in HEEx, in messages, and
  in a JavaScript widget.

  Gettext's translations (`priv/gettext`) are the only ones. The widget
  gets its words as props, translated here, and the `locale` provider for
  number formatting (app/layout.ex).

  Switching runs `XeniaExamplesWeb.Locale.put/2` in this LiveView. Nothing
  restarts: the page keeps its state, and the widget keeps its count.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  alias XeniaExamplesWeb.Locale

  @impl true
  def mount(_params, _session, socket) do
    {:ok, socket |> assign(saves: 0) |> assign_texts()}
  end

  # LiveView only re-renders what depends on assigns, so the page's words
  # live in @t, computed again when the language changes.
  defp assign_texts(socket) do
    assign(socket,
      page_title: gettext("Languages"),
      t: %{
        heading: gettext("Languages"),
        intro:
          gettext("This page, its messages and the widget below speak the language you pick."),
        save: gettext("Save"),
        cancel: gettext("Cancel"),
        widget_heading: gettext("A widget in JavaScript"),
        widget_intro:
          gettext(
            "Change its number, then switch the language: the words change, the number stays."
          ),
        widget: %{
          decrease: gettext("Fewer"),
          increase: gettext("More"),
          reset: gettext("Reset"),
          total: gettext("Total")
        }
      }
    )
  end

  @impl true
  def handle_event("set_locale", %{"locale" => locale}, socket),
    do: {:noreply, socket |> Locale.put(locale) |> assign_texts()}

  def handle_event("save", _params, socket) do
    {:noreply,
     socket
     |> update(:saves, &(&1 + 1))
     |> put_flash(:success, gettext("Saved"))}
  end

  def handle_event("cancel", _params, socket),
    do: {:noreply, put_flash(socket, :info, gettext("Changes discarded"))}

  # Text with a value in it: it takes @locale too, so LiveView renders it
  # again when the language changes, not only when the count does.
  defp saves_text(count, _locale), do: gettext("Saves so far: %{count}", count: count)

  @impl true
  def render(assigns) do
    ~H"""
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 id="heading" class="text-2xl font-semibold">{@t.heading}</h1>
      <.locale_switcher locale={@locale} />
    </div>
    <p id="intro">{@t.intro}</p>

    <div class="flex flex-wrap items-center gap-2">
      <button id="save" type="button" phx-click="save" class="btn btn-primary btn-sm">
        <.icon name="lucide-save" class="size-4" /> {@t.save}
      </button>
      <button id="cancel" type="button" phx-click="cancel" class="btn btn-sm">
        <.icon name="lucide-x" class="size-4" /> {@t.cancel}
      </button>
      <span id="saves" class="text-sm opacity-70">
        {saves_text(@saves, @locale)}
      </span>
    </div>

    <h2 class="text-lg font-semibold">{@t.widget_heading}</h2>
    <p>{@t.widget_intro}</p>

    <.xenia id="stepper" adapter="Stepper" props={%{labels: @t.widget, price: 12.5}} />

    <p class="text-sm opacity-70">
      Server locale: <code id="server-locale">{@locale}</code>
    </p>
    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet title="The words, translated on the server, in page.ex" code={page_snippet()} />
    <.snippet
      title="Numbers formatted in the browser, with the app's locale"
      code={adapter_snippet()}
    />
    """
  end

  # The code on the page: how this example is made.
  defp page_snippet,
    do: ~S"""
    <.locale_switcher locale={@locale} />
    <.xenia id="stepper" adapter="Stepper" props={%{labels: @t.widget, price: 12.5}} />

    # Words in an assign, so a new language re-renders them
    defp assign_texts(socket),
      do: assign(socket, t: %{widget: %{increase: gettext("More"), decrease: gettext("Fewer")}})

    def handle_event("set_locale", %{"locale" => locale}, socket),
      do: {:noreply, socket |> Locale.put(locale) |> assign_texts()}
    """

  defp adapter_snippet,
    do: ~S"""
    // The layout publishes it: <Xenia.Provider.provider name="locale" value={@locale} />

    export const stepper = {
      consumes: ["locale"], // arrives as a `locale` prop
      props: {
        labels(instance, labels) { /* new words, same widget */ },
        locale(instance, locale) {
          instance.money = new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-US", {
            style: "currency",
            currency: "EUR",
          })
        },
      },
      // ...
    }
    """
end
