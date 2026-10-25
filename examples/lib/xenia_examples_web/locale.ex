defmodule XeniaExamplesWeb.Locale do
  @moduledoc """
  Which language the app speaks: English or German, from Gettext.

  Gettext keeps the locale per process, so every process that renders text
  sets it:

    * **The first page load** (an HTTP request): the plug reads the
      `locale` cookie and puts it in the session.
    * **Each LiveView** (`on_mount`): reads the locale from the connect
      params, which app.js fills from the same cookie on every join (also
      on live navigation), or from the session on the first render.
    * **A language switch** (`put/2`): sets the locale in the LiveView's
      process, assigns `@locale`, and asks the browser to store the cookie,
      so the next page and the next visit use it too. The LiveView doesn't
      restart, so its state, and every JavaScript island on the page, stay.

  LiveView only re-renders what depends on assigns. Text a page shows
  should change when the language does, so a page keeps it in an assign it
  computes again after `put/2` (see the Languages example).
  """

  use Phoenix.Component
  use Gettext, backend: XeniaExamplesWeb.Gettext

  import Plug.Conn, only: [put_session: 3]

  @locales ~w(en de)

  @doc "The locales the app has translations for."
  def locales, do: @locales

  # --- The first page load -------------------------------------------------

  def init(opts), do: opts

  def call(conn, _opts) do
    locale = valid(conn.cookies["locale"])
    Gettext.put_locale(XeniaExamplesWeb.Gettext, locale)
    put_session(conn, "locale", locale)
  end

  # --- Every LiveView ------------------------------------------------------

  def on_mount(:default, _params, session, socket) do
    from_browser =
      Phoenix.LiveView.connected?(socket) && Phoenix.LiveView.get_connect_params(socket)["locale"]

    locale = valid(from_browser || session["locale"])
    Gettext.put_locale(XeniaExamplesWeb.Gettext, locale)

    {:cont, assign(socket, :locale, locale)}
  end

  # --- Switching -----------------------------------------------------------

  @doc """
  Switches the LiveView to `locale` (an unknown one becomes English), and
  asks the browser to remember it (app.js stores the `locale` cookie).
  """
  def put(socket, locale) do
    locale = valid(locale)
    Gettext.put_locale(XeniaExamplesWeb.Gettext, locale)

    socket
    |> assign(:locale, locale)
    |> Phoenix.LiveView.push_event("locale", %{locale: locale})
  end

  defp valid(locale) when locale in @locales, do: locale
  defp valid(_other), do: "en"

  # --- The selector --------------------------------------------------------

  @doc """
  English/German buttons. A click sends the `set_locale` event to the page,
  which calls `put/2`.
  """
  attr :locale, :string, required: true

  def locale_switcher(assigns) do
    ~H"""
    <div class="join" role="group" aria-label={gettext("Language")}>
      <button
        :for={{code, name} <- [{"en", "English"}, {"de", "Deutsch"}]}
        type="button"
        id={"locale-#{code}"}
        phx-click="set_locale"
        phx-value-locale={code}
        aria-pressed={to_string(@locale == code)}
        class={["btn btn-sm join-item", @locale == code && "btn-primary"]}
      >
        {name}
      </button>
    </div>
    """
  end
end
