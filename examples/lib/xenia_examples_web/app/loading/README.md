# Loading and errors

What an island shows while it loads, and when it breaks. Open it at
`/loading`.

Big JavaScript libraries take a moment to download, and downloads
sometimes fail. Without help, the user sees an empty box in both cases.
Here, each island says what is happening, and neither the adapter nor the
page has any loading or error code.

**Try it:** reload the page. The first island shows "Loading…" for 1.5
seconds. The second one fails on purpose, shows its error, and tells the
server. Click "Try again" and it loads.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The two islands, their slots, and the `on_crash` event. |
| [`assets/js/islands/slow.js`](../../../../assets/js/islands/slow.js) | A stand-in for a big library: it waits, and can fail the first time. |

## How it works

```heex
<.xenia id="broken" adapter="Slow" props={...} on_crash="crashed" style="height: 140px">
  <:loading>Loading…</:loading>
  <:error>
    This island couldn't start.
    <button type="button" data-xenia-retry>Try again</button>
  </:error>
</.xenia>
```

- **`<:loading>`** is rendered by the server, so it shows from the first
  paint, before any JavaScript runs. It stays until the island has loaded.
  Give the island a height, and the placeholder fills it.
- **`<:error>`** shows instead of the island if its adapter throws: while
  loading, or later, in a prop update or a command.
- **`data-xenia-retry`** on any element inside the error slot makes it a
  "Try again" button. The island starts from scratch, with the placeholder
  showing again while it loads.
- **`on_crash="crashed"`** sends a LiveView event when the island breaks,
  with `%{"id" => ..., "phase" => ..., "message" => ...}`. The page shows
  it below the island. Use it to log the error, or show a flash.

Every tag gets these: `<.xenia>`, your own declared tags, and every
official adapter's. The [code editor](../adapters/monaco) example uses
`<:loading>` for Monaco.
