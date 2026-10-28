defmodule XeniaExamplesWeb.App.FormsPage do
  @moduledoc """
  `/forms`: JavaScript components as fields of one Phoenix form.

  Each component takes `field={@form[:name]}`, like `<.input>`: it is
  submitted with the form, runs `phx-change`, and shows its errors only
  after the user used it. The server validates everything as usual.
  """
  use XeniaExamplesWeb, :live_view
  use Xenia.Page

  @tags [
    %{value: "elixir", text: "Elixir"},
    %{value: "phoenix", text: "Phoenix"},
    %{value: "javascript", text: "JavaScript"}
  ]

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "A form with editors",
       form: post_form(%{}),
       tags: @tags,
       saved: nil
     )}
  end

  @impl true
  def handle_event("validate", %{"post" => params}, socket),
    do: {:noreply, assign(socket, form: post_form(params, :validate))}

  def handle_event("save", %{"post" => params}, socket) do
    case errors(params) do
      [] -> {:noreply, assign(socket, saved: summary(params), form: post_form(params))}
      _ -> {:noreply, assign(socket, form: post_form(params, :validate))}
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <h1 class="text-2xl font-semibold">A form with editors</h1>
    <p>
      A code editor, a rich-text editor, a date picker, tags and a rating, each a field of one Phoenix
      form. Click "Save" with an empty form to see the errors.
    </p>

    <.form
      for={@form}
      id="post-form"
      phx-change="validate"
      phx-submit="save"
      class="max-w-2xl space-y-4"
    >
      <.input field={@form[:title]} label="Title" />

      <.field_box form={@form} name={:code} label="Code">
        <.monaco field={@form[:code]} language="elixir" style="height: 160px" />
      </.field_box>

      <.field_box form={@form} name={:body} label="Body">
        <.tiptap field={@form[:body]} toolbar={true} placeholder="Write the post…" />
      </.field_box>

      <div class="grid gap-4 sm:grid-cols-2">
        <.field_box form={@form} name={:due} label="Publish on">
          <.flatpickr field={@form[:due]} min_date="today" placeholder="Pick a date" />
        </.field_box>

        <.field_box form={@form} name={:tags} label="Tags">
          <.tom_select field={@form[:tags]} options={@tags} multiple create placeholder="Add tags" />
        </.field_box>
      </div>

      <.field_box form={@form} name={:priority} label="Priority">
        <.shoelace_rating field={@form[:priority]} label="Priority" />
      </.field_box>

      <button class="btn btn-primary">Save</button>
    </.form>

    <section :if={@saved} id="saved" class="rounded-lg border border-base-300 p-4">
      <h2 class="font-semibold">Saved</h2>
      <ul class="mt-2 space-y-1 text-sm">
        <li :for={{label, value} <- @saved}><span class="opacity-70">{label}:</span> {value}</li>
      </ul>
    </section>
    """
  end

  attr :form, :any, required: true
  attr :name, :atom, required: true
  attr :label, :string, required: true
  slot :inner_block, required: true

  # A label, the component, and the field's errors once it was used.
  defp field_box(assigns) do
    ~H"""
    <div class="fieldset" id={"#{@name}-box"}>
      <span class="label mb-1">{@label}</span>
      {render_slot(@inner_block)}
      <div :if={used_input?(@form[@name])} id={"#{@name}-errors"}>
        <p :for={{message, _} <- @form[@name].errors} class="mt-1 text-sm text-error">{message}</p>
      </div>
    </div>
    """
  end

  defp post_form(params, action \\ nil) do
    params =
      Map.merge(
        %{
          "title" => "",
          "code" => "",
          "body" => "",
          "due" => "",
          "tags" => "[]",
          "priority" => "0"
        },
        params
      )

    errors = if action, do: errors(params), else: []
    to_form(params, as: :post, errors: errors, action: action)
  end

  defp errors(params) do
    [
      {:title, "Give the post a title", blank?(params["title"])},
      {:code, "Add some code", blank?(params["code"])},
      {:body, "Write the body", blank?(strip_tags(params["body"]))},
      {:due, "Pick a date", blank?(params["due"])}
    ]
    |> Enum.filter(fn {_field, _message, failed} -> failed end)
    |> Enum.map(fn {field, message, _} -> {field, {message, []}} end)
  end

  defp summary(params) do
    [
      {"Title", params["title"]},
      {"Code", "#{length(String.split(String.trim(params["code"]), "\n"))} lines"},
      {"Body", strip_tags(params["body"])},
      {"Publish on", params["due"]},
      {"Tags", params["tags"] |> tags() |> Enum.join(", ")},
      {"Priority", "#{params["priority"]} of 5"}
    ]
  end

  # Tom Select's `multiple` submits its list as one JSON string. The browser
  # can send anything, so a value that isn't a JSON list of strings counts
  # as no tags rather than crashing the page.
  defp tags(json) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, list} when is_list(list) -> Enum.filter(list, &is_binary/1)
      _ -> []
    end
  end

  defp tags(_), do: []

  defp blank?(value), do: String.trim(value || "") == ""

  defp strip_tags(html),
    do: (html || "") |> String.replace(~r/<[^>]*>/, " ") |> String.split() |> Enum.join(" ")
end
