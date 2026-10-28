# An editor that stays open

A Monaco editor that stays alive while you move between pages. Open it at
`/scratchpad`, write something, then open the second page.

```
scratchpad/
  layout.ex         the links, the page, and the scratchpad beside it
  persistent.ex     the scratchpad: a LiveView with a Monaco editor
  page.ex           /scratchpad
  second/page.ex    /scratchpad/second
```

| What | How |
|---|---|
| **The editor keeps your text, cursor and undo history across the two pages.** | It sits in `persistent.ex`, the persistent part of `layout.ex`. Xenia renders it as a sticky LiveView, so neither the LiveView nor its island is replaced when the page changes. |
| **The pages are ordinary pages.** The second page's counter starts again each time you open it. | `page.ex` and `second/page.ex` are LiveViews with `use Xenia.Page`. They draw inside `layout.ex`. |
| **The scratchpad has its own state on the server.** Its line count and "pages seen" come from the scratchpad's LiveView. | The editor's `on_change` goes to `ScratchpadLive`, not to the page. `handle_navigation/2` tells it about each page change (a persistent part can't use `handle_params/3`). |
| **It's beside the sidebar, not inside it.** | The root layout's sidebar is a persistent part too. Xenia renders persistent parts side by side, because one sticky LiveView inside another doesn't survive navigation. |

Leave the scratchpad's pages and the scratchpad goes away. Come back and a
fresh one starts. To keep something across the whole app, put its
`persistent.ex` next to the root `layout.ex`, as the sidebar is.

The browser test ([`assets/e2e/lifecycle.test.mjs`](../../../../assets/e2e/lifecycle.test.mjs))
checks that it's the same server process and the same editor instance, with
the same text, after each page change, and that leaving starts a fresh one.
