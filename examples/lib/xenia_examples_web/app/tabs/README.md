# Tabs

Two pages that share one LiveView. Open it at `/tabs/first`.

Every other example page is its own LiveView. Here, a `live.ex` file makes
**one LiveView for all pages below it**. The pages only render. When you
switch tabs, LiveView keeps the same process, so the state stays.

**Try it:** click "Add one" a few times. Switch to the second tab. The
count is still there.

## The files

| File | What it does |
|---|---|
| [`live.ex`](live.ex) | The LiveView: the count, the "Add one" event, the tabs. |
| [`first/page.ex`](first/page.ex) | The first tab. It only renders. |
| [`second/page.ex`](second/page.ex) | The second tab. It only renders. |

## How it works

1. The folder makes two routes: `/tabs/first` and `/tabs/second`. Both are
   served by the LiveView in `live.ex`.
2. The tabs are `<.link patch={...}>`. A patch keeps the LiveView process,
   and calls `handle_params/3` with the new URL.
3. `live.ex` shows the current page with `{Xenia.Live.page(assigns)}`. The
   page gets the LiveView's assigns, like `@count`.

Use this for pages that share data, like the tabs of a settings screen.
