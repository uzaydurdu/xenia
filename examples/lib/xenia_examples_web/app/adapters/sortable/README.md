# Sortable lists

SortableJS: two lists of cards you reorder by dragging, or drag from one list to the other. Open it at `/adapters/sortable`.

**Try it:** drag a card within a list, or from "To do" to "Done". The server's order is shown below.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createSortablejs({load: () => import("sortablejs")})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({SortableJS: official.sortablejs})`. |

## How it works

- **The tag** is `<.sortable_list>`, from `Xenia.Adapters.SortableJS` (its docs list every prop, event and command).
- **Events:** `on_sort`, `on_add` and `on_remove` send the list's item ids in their new order.
- **`group="board"`** on both lists lets cards move between them.
- **The server keeps the order:** each event updates its list, so a re-render shows what the user sees.
