defmodule XeniaExamplesWeb.App.LoadingPage do
  @moduledoc """
  `/loading`: what an island shows while it loads, and when it breaks.

  Both islands use the `slow` adapter (`assets/js/islands/slow.js`), which
  pretends to be a big library. Neither the adapter nor this page has any
  loading or error code: the `<:loading>` and `<:error>` slots do it.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Loading and errors",
       # New on every visit, so the broken island fails again (see slow.js).
       key: System.unique_integer([:positive]),
       crash: nil
     )}
  end

  # on_crash: the island tells the server it broke.
  @impl true
  def handle_event("crashed", %{"id" => id, "phase" => phase, "message" => message}, socket),
    do: {:noreply, assign(socket, crash: "#{id} crashed in #{phase}: #{message}")}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Loading and errors</h1>
    <p>
      Big libraries take a moment to load, and downloads fail. Each island can show something
      while it loads, and something else if it breaks. Neither needs any adapter code.
    </p>

    <h2 class="text-lg font-semibold">While it loads: <code>&lt;:loading&gt;</code></h2>
    <p>This island takes 1.5 seconds to load. Reload the page to see it again.</p>

    <.xenia id="slow" adapter="Slow" props={%{delay: 1500}} style="height: 140px">
      <:loading>
        <div class="grid h-full place-items-center rounded-box bg-base-200 text-sm opacity-70">
          Loading…
        </div>
      </:loading>
    </.xenia>

    <h2 class="text-lg font-semibold">When it breaks: <code>&lt;:error&gt;</code></h2>
    <p>
      This one fails the first time, like a dropped download. The error slot shows instead,
      the server hears about it through <code>on_crash</code>, and "Try again" loads it again.
    </p>

    <.xenia
      id="broken"
      adapter="Slow"
      props={%{delay: 600, fail_first: true, key: @key}}
      on_crash="crashed"
      style="height: 140px"
    >
      <:loading>
        <div class="grid h-full place-items-center rounded-box bg-base-200 text-sm opacity-70">
          Loading…
        </div>
      </:loading>
      <:error>
        <div class="grid h-full place-items-center rounded-box border border-error/40 text-sm">
          <div class="text-center">
            <p>This island couldn't start.</p>
            <button type="button" class="btn btn-sm mt-2" data-xenia-retry>Try again</button>
          </div>
        </div>
      </:error>
    </.xenia>

    <p id="crash-report">{@crash || "No crash reported yet."}</p>
    """
  end
end
