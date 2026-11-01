# Listeners outside the island

An island that listens for keys on the whole page, and leaves nothing
behind when it goes. Open it at `/listeners`.

**Try it:** press any key on the page. The island shows it. Then go to
another example and come back.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page, and the island's adapter in a `<script>` (an adapter next to the page, as in `/colocated`). |

## How it works

```js
doc.addEventListener("keydown", onKey, { signal: ctx.signal })
```

| What | How |
|---|---|
| **The listener is on the whole page.** | `document`, outside the island's `el`. Xenia doesn't own it, so it would outlive the island if nothing removed it. |
| **It goes with the island.** | `ctx.signal` is an `AbortSignal` that Xenia aborts when the island is destroyed: you leave the page, the server removes it, or it's replaced by a remount. An aborted signal removes every listener added with it. |
| **`destroy` has nothing to undo.** | The listener went with the signal, and Xenia removes `el`. |
| **`fetch` works the same way.** | `fetch(url, { signal: ctx.signal })` is cancelled if the island goes before the reply. If `mount` was waiting for it, that's not a crash: the island is gone, so nothing is reported. |

Each island gets its own signal: a remount's new instance, or a retry
after a crash, starts with a fresh one.

The browser test ([`assets/e2e/listeners.test.mjs`](../../../../assets/e2e/listeners.test.mjs))
counts the document's real `keydown` listeners through Chrome's DevTools
protocol: one more on this page than on another, and the same number
after going back and forth five times.
