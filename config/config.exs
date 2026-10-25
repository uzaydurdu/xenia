import Config

# esbuild is a dev-only dependency: it builds priv/static, which is committed.
#
# One bundle per package.json export:
#   priv/static/xenia.esm.js          "xenia"          the core
#   priv/static/xenia-monaco.esm.js   "xenia/monaco"   the Monaco adapter
#   priv/static/xenia-chartjs.esm.js  "xenia/chartjs"  the Chart.js adapter
#   priv/static/xenia-<name>.esm.js   "xenia/<name>"   each other official adapter
# None imports a library: apps pass it with `load` to the adapter's factory.
if config_env() == :dev do
  config :esbuild,
    version: "0.25.0",
    xenia: [
      args: ~w(
        xenia=assets/index.js
        xenia-monaco=assets/monaco.js
        xenia-chartjs=assets/chartjs.js
        xenia-flatpickr=assets/flatpickr.js
        xenia-shoelace-rating=assets/shoelace-rating.js
        xenia-sortablejs=assets/sortablejs.js
        xenia-tom-select=assets/tom-select.js
        xenia-leaflet=assets/leaflet.js
        xenia-tabulator=assets/tabulator.js
        xenia-fullcalendar=assets/fullcalendar.js
        xenia-xterm=assets/xterm.js
        xenia-monaco-diff=assets/monaco-diff.js
        xenia-tiptap=assets/tiptap.js
        xenia-uppy=assets/uppy.js
        xenia-wavesurfer=assets/wavesurfer.js
        xenia-wavesurfer-multitrack=assets/wavesurfer-multitrack.js
        xenia-d3=assets/d3.js
        --bundle
        --format=esm
        --target=es2022
        --outdir=priv/static
        --out-extension:.js=.esm.js
      ),
      cd: Path.expand("..", __DIR__)
    ]
end
