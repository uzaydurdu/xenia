defmodule XeniaExamplesWeb.App.Adapters.WavesurferPage do
  @moduledoc "`/adapters/wavesurfer`: an audio waveform with regions (`<.wavesurfer>`)."
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Audio waveform",
       regions: [],
       duration: nil,
       state: "paused",
       clicked: nil
     )}
  end

  @impl true
  def handle_event("ready", %{"duration" => duration}, socket),
    do: {:noreply, assign(socket, duration: Float.round(duration * 1.0, 1))}

  def handle_event("playback", %{"state" => state}, socket),
    do: {:noreply, assign(socket, state: state)}

  def handle_event("region_clicked", %{"region" => %{"content" => content}}, socket),
    do: {:noreply, assign(socket, clicked: content)}

  def handle_event("play_pause", _params, socket),
    do: {:noreply, Xenia.push_to(socket, "wave", "play_pause")}

  # The server owns the regions: add one, and the waveform shows it.
  def handle_event("mark", _params, socket) do
    region = %{
      id: "middle",
      start: 0.5,
      end: 1.5,
      color: "rgba(124, 58, 237, 0.25)",
      content: "Middle"
    }

    {:noreply, assign(socket, regions: [region])}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Audio waveform</h1>
    <p>WaveSurfer.js draws a sound file. Play it, or let the server mark a region.</p>

    <.wavesurfer
      id="wave"
      url={~p"/audio/tone.wav"}
      regions={@regions}
      timeline={true}
      options={%{height: 96, wave_color: "#a78bfa", progress_color: "#7c3aed"}}
      on_ready="ready"
      on_playback="playback"
      on_region_clicked="region_clicked"
    />

    <div class="flex flex-wrap gap-2">
      <button id="play-pause" phx-click="play_pause" class="btn btn-sm">
        {if @state == "playing", do: "Pause", else: "Play"}
      </button>
      <button id="mark" phx-click="mark" class="btn btn-sm">Mark the middle</button>
    </div>

    <p id="duration">{if @duration, do: "Loaded: #{@duration} seconds.", else: "Loading…"}</p>
    <p id="state">State: {@state}</p>
    <p id="clicked">{if @clicked, do: "You clicked the region #{@clicked}."}</p>
    <h2 class="text-lg font-semibold">How it's made</h2>
    <.snippet title="The tag and the server, in page.ex" code={page_snippet()} />
    <.snippet title="The setup, once, in assets/js" code={setup_snippet()} />
    """
  end

  # The code on the page: how this example is made.
  defp page_snippet,
    do: ~S"""
    <.wavesurfer
      id="wave"
      url={~p"/audio/tone.wav"}
      regions={@regions}
      timeline={true}
      on_ready="ready"
      on_region_clicked="region_clicked"
    />

    # The server owns the regions: assign one, and the waveform shows it
    assign(socket, regions: [%{id: "middle", start: 0.5, end: 1.5, content: "Middle"}])

    def handle_event("region_clicked", %{"region" => %{"content" => content}}, socket), do: ...

    Xenia.push_to(socket, "wave", "play_pause")
    """

  defp setup_snippet,
    do: ~S"""
    import { createWaveSurfer } from "xenia/wavesurfer"

    export const wavesurfer = createWaveSurfer({
      load: async () => {
        const [ws, regions, timeline] = await Promise.all([
          import("wavesurfer.js"),
          import("wavesurfer.js/dist/plugins/regions.esm.js"),
          import("wavesurfer.js/dist/plugins/timeline.esm.js"),
        ])
        return {
          WaveSurfer: ws.default,
          RegionsPlugin: regions.default,
          TimelinePlugin: timeline.default,
        }
      },
    })

    // app.js
    createHooks({ WaveSurfer: wavesurfer })
    """
end
