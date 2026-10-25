defmodule Xenia.Routes.Page do
  @moduledoc """
  A page found in the app directory. Paths are relative to the app root.

    * `file`    - the page file, e.g. `"(auth)/runbooks/[id]/page.ex"`
    * `path`    - the Phoenix route path, e.g. `"/runbooks/:id"`
    * `params`  - names of the dynamic segments, in URL order
    * `groups`  - route groups the page sits in, outermost first
    * `layouts` - layout files that apply to the page, outermost first
    * `persistent` - each of those layouts' `persistent.ex`, by layout file;
                  layouts without one are left out
    * `live`    - the nearest `live.ex` in the page's folder or above it: the
                  LiveView the page shares with its siblings. `nil` when the
                  page is its own LiveView.
  """

  @type t :: %__MODULE__{
          file: String.t(),
          path: String.t(),
          params: [String.t()],
          groups: [String.t()],
          layouts: [String.t()],
          persistent: %{String.t() => String.t()},
          live: String.t() | nil
        }

  defstruct [:file, :path, :live, params: [], groups: [], layouts: [], persistent: %{}]
end
