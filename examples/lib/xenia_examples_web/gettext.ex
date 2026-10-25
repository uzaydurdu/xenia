defmodule XeniaExamplesWeb.Gettext do
  @moduledoc """
  The app's translations, from `priv/gettext`. Use it with
  `use Gettext, backend: XeniaExamplesWeb.Gettext` (the web module does),
  then `gettext("Save")` in templates and code.

  To add or update translations:

      mix gettext.extract --merge

  then fill in `priv/gettext/<locale>/LC_MESSAGES/default.po`.
  """
  use Gettext.Backend, otp_app: :xenia_examples
end
