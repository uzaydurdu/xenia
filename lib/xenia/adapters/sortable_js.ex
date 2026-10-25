defmodule Xenia.Adapters.SortableJS do
  @moduledoc """
  `<.sortable_list>`: drag-and-drop lists (SortableJS), through Xenia's official adapter.

  ## Setup

  Install the library in your app:

      npm install sortablejs --prefix assets

  Pass it to the adapter, and register it, in `assets/js/app.js`:

  ```js
  import { createSortablejs } from "xenia/sortablejs"

  const sortablejs = createSortablejs({
      load: () => import("sortablejs"),
  })

  hooks: { ...colocatedHooks, ...createHooks({ SortableJS: sortablejs }) },
  ```

  Then `import Xenia.Adapters.SortableJS` in `html_helpers`, and render
  `<.sortable_list id="...">` with the props below. Every event becomes an
  `on_<event>` attribute; commands go through `Xenia.push_to/4`.

  The factory returns a plain adapter object: spread it to add or change
  props, commands and events, without copying the adapter.

  The tag uses the adapter name `"SortableJS"`. To register it under
  another name, render `<.xenia adapter="...">` or declare your own tag.

  ## Reference

    Xenia's official adapter for SortableJS: a drag-and-drop list, optionally sharing
    items with other lists (kanban boards) and working as a form field.

    Inside Xenia's container the server can't render children, so the
    adapter renders the items itself from the `items` prop. Labels are set as
    text, never as HTML.

    Props:
      items     [%{id, label, disabled?, class?}]   the list, in order
      group     a group name: lists with the same name exchange items. Or
                %{name, pull: true | false | "clone", put: true | false}
      handle    true shows a drag handle; only the handle starts a drag
      disabled  true turns dragging off
      list_class, item_class   extra CSS classes for the <ul> and each <li>
      options   any other SortableJS option, snake_case or camelCase:
                animation, ghost_class, delay, swap_threshold, sort, ...

    Commands:
      reset                 re-render from the last `items` prop, e.g. after
                            the server refused a move without changing `items`

    Events:
      sort    %{ids, item_id, old_index, new_index}    reordered within this list
      add     %{ids, item_id, new_index, from}         received from another list
      remove  %{ids, item_id, old_index, to}           moved to another list
      error   %{source, message, code}
      `ids` is this list's order after the change; `from`/`to` are the other
      list's component id. A move between lists sends `remove` from one and
      `add` from the other: update both lists' items on the server.

    Form field: with field={@form[:order]}, the ids are submitted as a JSON
    array string, e.g. "[\"a\",\"c\",\"b\"]" (decode it with Jason).
  """
  use Xenia.Components

  component :sortable_list, adapter: "SortableJS" do
    prop :items, :list, required: true
    prop :group, :any
    prop :handle, :boolean
    prop :disabled, :boolean
    prop :list_class, :string
    prop :item_class, :string
    prop :options, :map
    event :sort
    event :add
    event :remove
    event :error
  end
end
