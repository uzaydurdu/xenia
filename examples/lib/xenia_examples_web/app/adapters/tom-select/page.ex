defmodule XeniaExamplesWeb.App.Adapters.TomSelectPage do
  @moduledoc "`/adapters/tom-select`: a searchable multi-select that creates tags (`<.tom_select>`)."
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @options [
    %{value: "elixir", text: "Elixir"},
    %{value: "erlang", text: "Erlang"},
    %{value: "gleam", text: "Gleam"},
    %{value: "javascript", text: "JavaScript"},
    %{value: "typescript", text: "TypeScript"}
  ]

  # The server-side search's data. A real app would query its database.
  @countries ~w(Argentina Australia Austria Belgium Brazil Canada Chile China Denmark Egypt
                Finland France Germany Greece India Ireland Italy Japan Kenya Mexico
                Netherlands Norway Poland Portugal Spain Sweden Switzerland Turkey)

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Tag picker",
       options: @options,
       value: ["elixir"],
       country: nil,
       searches: 0
     )}
  end

  # A call from the island: what the user typed. The reply is that query's
  # results, so they can't land in a newer query's list.
  @impl true
  def handle_event("search_countries", %{"query" => query}, socket) do
    # A slow search, so you can see Tom Select's loading state.
    Process.sleep(200)

    matches =
      for name <- @countries,
          String.contains?(String.downcase(name), String.downcase(query)),
          do: %{value: String.downcase(name), text: name}

    {:reply, %{options: matches}, update(socket, :searches, &(&1 + 1))}
  end

  def handle_event("country_picked", %{"value" => value}, socket),
    do: {:noreply, assign(socket, country: value)}

  def handle_event("changed", %{"value" => value}, socket),
    do: {:noreply, assign(socket, value: value)}

  # A tag the user typed: keep it among the options.
  def handle_event("created", %{"value" => value, "text" => text}, socket),
    do: {:noreply, update(socket, :options, &(&1 ++ [%{value: value, text: text}]))}

  def handle_event("clear", _params, socket),
    do: {:noreply, Xenia.push_to(socket, "langs", "clear")}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Tag picker</h1>
    <p>Tom Select: search, pick several, or type a new tag and press Enter.</p>

    <div class="max-w-md">
      <.tom_select
        id="langs"
        options={@options}
        value={@value}
        multiple
        create
        placeholder="Pick languages"
        on_change="changed"
        on_created="created"
      />
    </div>

    <button id="clear" phx-click="clear" class="btn btn-sm">Clear</button>

    <p id="value">The server has: {Enum.join(@value, ", ")}</p>

    <h2 class="text-lg font-semibold">Searching on the server</h2>
    <p>
      Type a few letters of a country. Each search is a call: the server's <code>handle_event</code>
      replies with the matches, and Tom Select shows them.
    </p>

    <div class="max-w-md">
      <.tom_select
        id="countries"
        remote
        options={[]}
        value={@country}
        placeholder={"Search countries (#{@searches} searches so far)"}
        on_search="search_countries"
        on_change="country_picked"
      />
    </div>

    <p id="country">{if @country, do: "You picked #{@country}.", else: "No country yet."}</p>
    """
  end
end
