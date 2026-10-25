defmodule Xenia.MixProject do
  use Mix.Project

  @version "0.1.0"
  @source_url "https://github.com/uzaydurdu/xenia"

  def project do
    [
      app: :xenia,
      version: @version,
      elixir: "~> 1.15",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      aliases: aliases(),
      package: package(),
      name: "Xenia",
      source_url: @source_url,
      docs: docs()
    ]
  end

  # Run "mix help compile.app" to learn about applications.
  def application do
    [
      extra_applications: [:logger]
    ]
  end

  # Run "mix help deps" to learn about dependencies.
  defp deps do
    [
      # {:dep_from_hexpm, "~> 0.3.0"},
      # {:dep_from_git, git: "https://github.com/elixir-lang/my_dep.git", tag: "0.1.0"}
      {:lazy_html, ">= 0.1.0", only: :test},
      {:esbuild, "~> 0.10", only: :dev, runtime: false},
      {:ex_doc, "~> 0.38", only: :dev, runtime: false},
      {:phoenix, "~> 1.8"},
      {:phoenix_live_view, "~> 1.1"},
      # Xenia.Component encodes props as JSON at render time. Phoenix and
      # LiveView only list Jason as optional, so Xenia depends on it directly.
      {:jason, "~> 1.4"}
    ]
  end

  defp aliases do
    [
      setup: [
        "local.hex --if-missing --force",
        "deps.get",
        "esbuild.install --if-missing",
        "assets.build",
        "cmd npm ci"
      ],
      "assets.build": ["esbuild xenia --minify"],
      check: [
        "format --check-formatted",
        "compile --warnings-as-errors --force",
        "assets.build",
        &check_bundle/1,
        "cmd mix test",
        "cmd mix hex.build --unpack --output _build/hex_package",
        &check_package/1,
        # HexDocs: the guides and module docs build, and every link resolves.
        "docs --warnings-as-errors",
        "cmd npm test"
      ]
    ]
  end

  @bundles [
             "priv/static/xenia.esm.js",
             "priv/static/xenia-monaco.esm.js",
             "priv/static/xenia-chartjs.esm.js"
           ] ++
             Enum.map(
               ~w(flatpickr shoelace-rating sortablejs tom-select leaflet tabulator fullcalendar
                  xterm monaco-diff tiptap uppy wavesurfer wavesurfer-multitrack d3),
               &"priv/static/xenia-#{&1}.esm.js"
             )

  # No bundle may import a library (monaco-editor, chart.js, anything). The
  # app passes the import to createMonaco/createChartjs, so it resolves from
  # the app's own node_modules, and apps that don't use a library never have
  # to resolve it. M7 dry run: one import inside the core bundle made every
  # app's build fail.
  #
  # Checked the way an app meets it: esbuild bundles each file on its own,
  # with none of those libraries installed (they aren't in Xenia's
  # node_modules). A text search can't tell an import from the error
  # messages that show `load: () => import("monaco-editor")` to the user.
  defp check_bundle(_) do
    out = Path.join(System.tmp_dir!(), "xenia_check_bundle.js")

    for bundle <- @bundles do
      {output, status} =
        System.cmd(
          apply(Esbuild, :bin_path, []),
          [bundle, "--bundle", "--format=esm", "--log-level=error", "--outfile=#{out}"],
          stderr_to_stdout: true
        )

      if status != 0 do
        Mix.raise("#{bundle} doesn't bundle on its own, as an app's esbuild would:\n#{output}")
      end
    end

    File.rm(out)
    Mix.shell().info("bundles ok: each bundles on its own, with no adapter library installed")
  end

  # Without these the package publishes fine and ships no JavaScript.
  defp check_package(_) do
    for path <- @bundles ++ ["package.json"],
        not File.exists?(Path.join("_build/hex_package", path)) do
      Mix.raise("Hex package is missing #{path}")
    end

    # Apps write `import { createHooks } from "xenia"` and
    # `import { createMonaco } from "xenia/monaco"`, which esbuild resolves
    # through package.json's "exports" inside deps/xenia.
    %{"exports" => exports} =
      "_build/hex_package/package.json" |> File.read!() |> Jason.decode!()

    for {name, entry} <- exports,
        not File.exists?(Path.join("_build/hex_package", entry)) do
      Mix.raise(~s(package.json export "#{name}" points at #{entry}, which isn't in the package))
    end

    # hex.build writes the tarball even with --unpack.
    Enum.each(Path.wildcard("xenia-*.tar"), &File.rm!/1)

    Mix.shell().info(
      "package ok: every bundle and package.json included, " <>
        "exports #{exports |> Map.keys() |> Enum.join(", ")} resolve"
    )
  end

  defp package do
    [
      files:
        ~w(lib priv guides package.json .formatter.exs mix.exs README.md CHANGELOG.md LICENSE),
      licenses: ["MIT"],
      links: %{
        "GitHub" => @source_url,
        "Changelog" => "https://hexdocs.pm/xenia/changelog.html",
        "Author" => "https://www.uzaydurdu.com/"
      },
      description:
        "Any JavaScript library in a Phoenix LiveView page: a small adapter per library, and " <>
          "Xenia handles props, events, commands, cleanup on navigation, form fields and " <>
          "app-wide values like the theme. Plus routes, layouts and persistent parts from folders."
    ]
  end

  # HexDocs: the README is the landing page; the guides are the user-facing
  # contract (CLAUDE.md is internal and not in the package).
  defp docs do
    [
      main: "readme",
      source_ref: "v#{@version}",
      # The README's banner, at the same relative path as on GitHub.
      assets: %{"guides/images" => "guides/images"},
      logo: "guides/images/xenia-mark.png",
      before_closing_body_tag: &before_closing_body_tag/1,
      extras: [
        "README.md",
        "guides/wrapping-a-library.md",
        "guides/ownership-boundary.md",
        "guides/app-folder.md",
        "guides/icons-notifications-languages.md",
        "CHANGELOG.md": [title: "Changelog"]
      ],
      groups_for_extras: [Guides: ~r{guides/}],
      # The same three groups as lib/xenia/: core/, app/ and adapters/.
      groups_for_modules: [
        "Core: JS islands": [
          Xenia,
          Xenia.Component,
          Xenia.Components,
          Xenia.Provider,
          Xenia.Shortcuts
        ],
        "App folder: pages from folders": [
          Xenia.Routes,
          Xenia.Page,
          Xenia.Layout,
          Xenia.Live,
          Xenia.Persistent,
          Xenia.Metadata,
          Xenia.Sitemap
        ],
        "Official adapters": [
          Xenia.Adapters.Monaco,
          Xenia.Adapters.MonacoDiff,
          Xenia.Adapters.Chartjs,
          Xenia.Adapters.D3,
          Xenia.Adapters.Tiptap,
          Xenia.Adapters.Flatpickr,
          Xenia.Adapters.TomSelect,
          Xenia.Adapters.ShoelaceRating,
          Xenia.Adapters.SortableJS,
          Xenia.Adapters.Tabulator,
          Xenia.Adapters.FullCalendar,
          Xenia.Adapters.Leaflet,
          Xenia.Adapters.Xterm,
          Xenia.Adapters.Uppy,
          Xenia.Adapters.WaveSurfer,
          Xenia.Adapters.WaveSurferMultitrack
        ],
        "App folder internals": [
          Xenia.Routes.Discovery,
          Xenia.Routes.Page,
          Xenia.Routes.PageModule,
          Xenia.Routes.Route
        ]
      ]
    ]
  end

  # HexDocs has its own light/dark switch (it puts a "dark" class on <body>),
  # which can differ from the computer's setting that the README's <picture>
  # follows. This shows the banner that matches HexDocs: the dark one (white
  # name) on a dark page, the light one on a light page. GitHub ignores it.
  defp before_closing_body_tag(:html) do
    """
    <script>
      (() => {
        const banner = document.querySelector('img[src*="xenia-banner-"]')
        if (!banner) return
        banner.closest("picture")?.querySelectorAll("source").forEach((source) => source.remove())
        const sync = () => {
          const theme = document.body.classList.contains("dark") ? "dark" : "light"
          banner.src = banner.src.replace(/xenia-banner-(light|dark)/, `xenia-banner-${theme}`)
        }
        sync()
        new MutationObserver(sync).observe(document.body, {attributes: true, attributeFilter: ["class"]})
      })()
    </script>
    """
  end

  defp before_closing_body_tag(_format), do: ""
end
