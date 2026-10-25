defmodule XeniaExamplesWeb.App.Adapters.MultitrackPage do
  @moduledoc """
  `/adapters/multitrack`: several tracks, and recording from the microphone
  (`<.wavesurfer_multitrack>`). The recording stays in the browser until it
  is downloaded or uploaded; events only carry facts about it.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    tone = ~p"/audio/tone.wav"

    tracks = [
      %{id: "intro", url: tone, start_position: 0, draggable: true},
      %{id: "echo", url: tone, start_position: 1.5, draggable: true}
    ]

    {:ok,
     assign(socket,
       page_title: "Audio studio",
       tracks: tracks,
       ready: nil,
       recording: nil,
       recorded: nil,
       error: nil
     )}
  end

  @impl true
  def handle_event("ready", %{"track_ids" => ids}, socket),
    do: {:noreply, assign(socket, ready: Enum.join(ids, ", "))}

  def handle_event("recording", %{"state" => state}, socket),
    do: {:noreply, assign(socket, recording: state)}

  def handle_event("recorded", %{"seconds" => seconds, "bytes" => bytes}, socket),
    do: {:noreply, assign(socket, recorded: "#{Float.round(seconds * 1.0, 1)} s, #{bytes} bytes")}

  # Commands report problems (a denied microphone, say) as error events.
  def handle_event("failed", %{"source" => source, "message" => message}, socket),
    do: {:noreply, assign(socket, error: "#{source}: #{message}")}

  def handle_event("command", %{"name" => name}, socket)
      when name in ~w(play pause start_recording stop_recording),
      do: {:noreply, Xenia.push_to(socket, "studio", name)}

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Audio studio</h1>
    <p>Two tracks you can drag in time, and a recording from your microphone.</p>

    <.wavesurfer_multitrack
      id="studio"
      tracks={@tracks}
      on_ready="ready"
      on_recording="recording"
      on_recorded="recorded"
      on_error="failed"
    />

    <div class="flex flex-wrap gap-2">
      <button id="play" phx-click="command" phx-value-name="play" class="btn btn-sm">Play</button>
      <button id="pause" phx-click="command" phx-value-name="pause" class="btn btn-sm">Pause</button>
      <button id="record" phx-click="command" phx-value-name="start_recording" class="btn btn-sm">
        Record
      </button>
      <button id="stop" phx-click="command" phx-value-name="stop_recording" class="btn btn-sm">
        Stop recording
      </button>
    </div>

    <p id="ready">{if @ready, do: "Tracks ready: #{@ready}.", else: "Loading…"}</p>
    <p id="recording">{if @recording, do: "Recording: #{@recording}."}</p>
    <p id="recorded">{if @recorded, do: "Recorded #{@recorded}."}</p>
    <p :if={@error} id="error" class="text-error">{@error}</p>
    """
  end
end
