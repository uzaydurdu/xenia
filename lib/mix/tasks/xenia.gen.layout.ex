defmodule Mix.Tasks.Xenia.Gen.Layout do
  @shortdoc "Generates a layout.ex, and optionally its persistent.ex, in the Xenia app folder"

  @moduledoc """
  Generates a `layout.ex` in the app folder: a frame around every page in
  its folder and below.

      $ mix xenia.gen.layout "(auth)" --persistent --on-mount MyAppWeb.Auth:require_user
      * creating lib/my_app_web/app/(auth)/layout.ex
      * creating lib/my_app_web/app/(auth)/persistent.ex

  Pass `.` for the root layout, which frames every page. It wraps them in
  your app's `<Layouts.app>`, the place for it once pages come from the
  folder.

  ## Options

    * `--persistent` - also generate the layout's `persistent.ex`: a
      LiveView (`use Xenia.Persistent`) that stays alive while the user
      moves between the layout's pages. The frame places it with
      `{@persistent}`. With an existing `layout.ex`, only `persistent.ex` is
      created; add `{@persistent}` to that frame yourself.
    * `--on-mount` - an `on_mount` hook for every page under the layout,
      such as an authentication check: `MyAppWeb.Auth` or
      `MyAppWeb.Auth:require_user`. Refused below a `live.ex`, where
      switching pages mounts nothing.
    * `--module` and `--persistent-module` - the module names. By default
      they mirror the folders: `MyAppWeb.App.AuthLayout` and
      `MyAppWeb.App.AuthPersistentLive`.
    * `--root` - the app folder, `lib/my_app_web/app` by default
    * `--web-module` and `--web-path` - `MyAppWeb` and `lib/my_app_web` by
      default
    * `--force` - overwrite existing files
  """

  use Mix.Task

  alias Mix.Xenia.Gen

  @switches [
    persistent: :boolean,
    on_mount: :string,
    module: :string,
    persistent_module: :string,
    root: :string,
    web_module: :string,
    web_path: :string,
    force: :boolean
  ]

  @impl true
  def run(args) do
    {opts, argv} = OptionParser.parse!(args, strict: @switches)

    path =
      case argv do
        [path] ->
          path

        _ ->
          Mix.raise(
            ~s|expected one folder, like: mix xenia.gen.layout "(auth)", or . for the root|
          )
      end

    web = Gen.web(opts)
    root = Gen.app_root(opts, web)
    segments = Gen.segments!(path)
    force = opts[:force] || false
    persistent? = opts[:persistent] || false

    if Enum.any?(segments, &String.starts_with?(&1, "_")) do
      Mix.raise(
        "#{path} is in a private folder (its name starts with _), whose pages are never routed"
      )
    end

    Gen.validate_folders!(segments)
    on_mount = on_mount!(opts[:on_mount])
    if on_mount, do: check_owner!(root, segments)

    folder = Path.join(segments ++ ["."]) |> Path.dirname()
    layout_file = Path.join(segments ++ ["layout.ex"])
    persistent_file = Path.join(segments ++ ["persistent.ex"])
    layout_path = Path.join(root, layout_file)

    # With --persistent, an existing layout is kept: only its part is added.
    keep_layout? = persistent? and File.exists?(layout_path) and not force

    Gen.check_app!(root, [layout_file | if(persistent?, do: [persistent_file], else: [])])

    layout = opts[:module] || Gen.module_name(web, segments, "Layout", "Root")

    unless keep_layout? do
      content = layout(layout, web, segments, folder, on_mount, persistent?)
      Gen.create!(layout_path, Gen.format(content), force)
    end

    if persistent? do
      module =
        opts[:persistent_module] || Gen.module_name(web, segments, "PersistentLive", "Root")

      content = persistent(module, web, layout_file)
      Gen.create!(Path.join(root, persistent_file), Gen.format(content), force)
    end

    Gen.info([
      if(keep_layout?,
        do:
          "\n#{layout_file} already exists, so it was kept. Place the persistent part in its frame with {@persistent}."
      ),
      if(segments == [],
        do:
          "\nThe root layout wraps every page in <#{web.module}.Layouts.app>, so pages shouldn't call it themselves."
      )
    ])
  end

  defp layout(module, web, segments, folder, on_mount, persistent?) do
    use_line =
      case on_mount do
        nil -> "use Xenia.Layout"
        hook -> "use Xenia.Layout, on_mount: #{hook}"
      end

    part =
      if persistent?,
        do: "\n  Its persistent part is `persistent.ex`, in the same folder.",
        else: ""

    where = if segments == [], do: "every page", else: "every page in `#{folder}` and below"

    ~s'''
    defmodule #{module} do
      @moduledoc """
      The layout of #{where}.#{part}
      """
      use #{web.module}, :html
      #{use_line}

      @impl true
      def frame(assigns) do
        ~H"""
    #{frame_body(web, segments, persistent?)}
        """
      end
    end
    '''
  end

  defp frame_body(web, segments, persistent?) do
    inner =
      if persistent? do
        """
        <div class="flex gap-6">
          <aside>{@persistent}</aside>
          <main class="flex-1">{@inner_content}</main>
        </div>
        """
      else
        """
        <div>
          {@inner_content}
        </div>
        """
      end

    body =
      if segments == [] do
        "<#{web.module}.Layouts.app flash={@flash}>\n" <>
          indent(inner, 2) <> "</#{web.module}.Layouts.app>\n"
      else
        inner
      end

    body |> indent(4) |> String.trim_trailing()
  end

  defp persistent(module, web, layout_file) do
    ~s'''
    defmodule #{module} do
      @moduledoc """
      The persistent part of `#{layout_file}`: it stays alive, with its state
      and its JavaScript components, while the user moves between the pages
      under that layout. The layout's frame places it with `{@persistent}`.
      """
      use #{web.module}, :live_view
      use Xenia.Persistent

      @impl true
      def mount(_params, _session, socket), do: {:ok, assign(socket, path: nil)}

      # Called once it is connected, then after every navigation and patch.
      # A persistent part can't use handle_params/3.
      @impl true
      def handle_navigation(uri, socket), do: {:noreply, assign(socket, path: URI.parse(uri).path)}

      @impl true
      def render(assigns) do
        ~H"""
        <nav>
          <p>Current page: {@path}</p>
        </nav>
        """
      end
    end
    '''
  end

  # "MyAppWeb.Auth" → "MyAppWeb.Auth"; "MyAppWeb.Auth:require_user" →
  # "{MyAppWeb.Auth, :require_user}".
  defp on_mount!(nil), do: nil

  defp on_mount!(hook) do
    case String.split(hook, ":", parts: 2) do
      [module] ->
        module!(module, hook)

      [module, arg] ->
        unless Regex.match?(~r/\A[a-z_][a-zA-Z0-9_]*[?!]?\z/, arg) do
          Mix.raise("--on-mount expects Module or Module:argument, got: #{hook}")
        end

        "{#{module!(module, hook)}, :#{arg}}"
    end
  end

  defp module!(module, hook) do
    unless Regex.match?(~r/\A[A-Z][A-Za-z0-9_]*(\.[A-Z][A-Za-z0-9_]*)*\z/, module) do
      Mix.raise("--on-mount expects Module or Module:argument, got: #{hook}")
    end

    module
  end

  # Same rule as xenia_routes: below a live.ex, pages switch by patch, which
  # runs no on_mount, so the hook would be skipped.
  defp check_owner!(root, segments) do
    for file <- Gen.app_files(root), Path.basename(file) == "live.ex" do
      owner = file |> Path.dirname() |> Path.split() |> Enum.reject(&(&1 == "."))

      if length(segments) > length(owner) and List.starts_with?(segments, owner) do
        Mix.raise(
          "--on-mount can't be used below #{file}: its pages switch by patch, which runs " <>
            "no on_mount, so the check would be skipped. Generate the layout in " <>
            "#{Path.dirname(file)} or above."
        )
      end
    end

    :ok
  end

  defp indent(text, spaces) do
    pad = String.duplicate(" ", spaces)

    text
    |> String.split("\n")
    |> Enum.map_join("\n", fn
      "" -> ""
      line -> pad <> line
    end)
  end
end
