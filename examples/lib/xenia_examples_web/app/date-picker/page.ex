defmodule XeniaExamplesWeb.App.DatePickerPage do
  @moduledoc """
  `/date-picker`: a flatpickr date picker inside a normal Phoenix form.

  `<.date_picker field={@form[:due]}>` makes it a form field: its value is
  sent with the form, it runs the form's `phx-change`, and its errors show
  like the errors of `<.input>`. The island is
  `assets/js/islands/date_picker.js`.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "Date picker", form: task_form(%{}), saved: nil)}
  end

  @impl true
  def handle_event("validate", %{"task" => params}, socket) do
    {:noreply, assign(socket, form: task_form(params, :validate))}
  end

  def handle_event("save", %{"task" => params}, socket) do
    case errors(params) do
      [] -> {:noreply, assign(socket, saved: params, form: task_form(%{}))}
      _errors -> {:noreply, assign(socket, form: task_form(params, :validate))}
    end
  end

  # The server changes the field. The picker shows the new date.
  def handle_event("pick_tomorrow", _params, socket) do
    tomorrow = Date.utc_today() |> Date.add(1) |> Date.to_iso8601()
    params = Map.put(socket.assigns.form.params, "due", tomorrow)
    {:noreply, assign(socket, form: task_form(params))}
  end

  # A command: the server asks the picker to open its calendar.
  def handle_event("open_calendar", _params, socket) do
    {:noreply, Xenia.push_to(socket, socket.assigns.form[:due].id, "open")}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">Date picker</h1>
    <p>A JavaScript date picker that is a field of a Phoenix form.</p>

    <.form for={@form} id="task-form" phx-change="validate" phx-submit="save" class="max-w-sm">
      <.input field={@form[:title]} label="Task" />

      <div class="fieldset mb-2">
        <span class="label mb-1">Due date</span>
        <.date_picker field={@form[:due]} min={Date.to_iso8601(Date.utc_today())} />
        <div :if={used_input?(@form[:due])} id="due-errors">
          <p :for={{message, _} <- @form[:due].errors} class="text-error text-sm mt-1">{message}</p>
        </div>
      </div>

      <button class="btn btn-primary btn-sm">Save</button>
    </.form>

    <div class="flex flex-wrap gap-2">
      <button id="pick-tomorrow" phx-click="pick_tomorrow" class="btn btn-sm">Pick tomorrow</button>
      <button id="open-calendar" phx-click="open_calendar" class="btn btn-sm">
        Open the calendar
      </button>
    </div>

    <p :if={@saved} id="saved">Saved: "{@saved["title"]}" is due on {@saved["due"]}.</p>
    """
  end

  defp task_form(params, action \\ nil) do
    params = Map.merge(%{"title" => "", "due" => ""}, params)
    errors = if action, do: errors(params), else: []
    to_form(params, as: :task, errors: errors, action: action)
  end

  defp errors(params) do
    Enum.flat_map([title: "Give the task a name", due: "Pick a date"], fn {field, message} ->
      if params[to_string(field)] in [nil, ""], do: [{field, {message, []}}], else: []
    end)
  end
end
