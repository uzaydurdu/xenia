defmodule Xenia.Routes.Route do
  @moduledoc """
  A discovered page with its modules resolved, ready to become a `live` route.

    * `page`   - the `Xenia.Routes.Page` from discovery
    * `module` - the module its `page.ex` defines
    * `owner`  - the LiveView that serves the route: the `live.ex` module for
                 a shared page, the page module itself for a standalone one
    * `mode`   - `:shared` or `:standalone`
    * `layouts` - the modules of the page's `layout.ex` files, outermost first
    * `persistent` - each layout's persistent LiveView (its `persistent.ex`
                 module), by layout module; layouts without one are left out

  Two routes with the same owner switch with a patch, which keeps the
  LiveView process and its state. Different owners mean live navigation and
  a new process.
  """

  @type t :: %__MODULE__{
          page: Xenia.Routes.Page.t(),
          module: module(),
          owner: module(),
          mode: :shared | :standalone,
          layouts: [module()],
          persistent: %{module() => module()}
        }

  @enforce_keys [:page, :module, :owner, :mode]
  defstruct @enforce_keys ++ [layouts: [], persistent: %{}]
end
