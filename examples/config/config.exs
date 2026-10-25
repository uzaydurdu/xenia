# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :xenia_examples,
  generators: [timestamp_type: :utc_datetime]

# Configure the endpoint
config :xenia_examples, XeniaExamplesWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: XeniaExamplesWeb.ErrorHTML, json: XeniaExamplesWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: XeniaExamples.PubSub,
  live_view: [signing_salt: "+5KdDufN"]

# Configure LiveView
config :phoenix_live_view,
  # the attribute set on all root tags. Used for Phoenix.LiveView.ColocatedCSS.
  root_tag_attribute: "phx-r"

# Configure esbuild (the version is required)
config :esbuild,
  version: "0.25.4",
  xenia_examples: [
    args: ~w(app=js/app.js
             monaco/editor.worker=node_modules/monaco-editor/esm/vs/editor/editor.worker.js
             monaco/json.worker=node_modules/monaco-editor/esm/vs/language/json/json.worker.js
             monaco/css.worker=node_modules/monaco-editor/esm/vs/language/css/css.worker.js
             monaco/html.worker=node_modules/monaco-editor/esm/vs/language/html/html.worker.js
             monaco/ts.worker=node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js
             --bundle --target=es2022 --outdir=../priv/static/assets/js
             --external:/fonts/* --external:/images/* --alias:@=. --loader:.ttf=file),
    cd: Path.expand("../assets", __DIR__),
    env: %{"NODE_PATH" => [Path.expand("../deps", __DIR__), Mix.Project.build_path()]}
  ]

# Translations: priv/gettext/<locale>/LC_MESSAGES/default.po.
config :xenia_examples, XeniaExamplesWeb.Gettext, default_locale: "en", locales: ~w(en de)

# Configure tailwind (the version is required)
config :tailwind,
  version: "4.3.0",
  xenia_examples: [
    args: ~w(
      --input=assets/css/app.css
      --output=priv/static/assets/css/app.css
    ),
    cd: Path.expand("..", __DIR__),
    env: %{"NODE_PATH" => [Path.expand("../deps", __DIR__), Mix.Project.build_path()]}
  ]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
