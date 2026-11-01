# When the connection drops

A code editor that is read-only while the page's LiveView is disconnected.
Open it at `/connection`.

**Try it:** type something, then press "Drop the connection for 2 seconds"
(or turn off your network). While it's down, the editor won't take your
typing. When it's back, type again: the server gets the whole text.

## Why

While a LiveView is disconnected, the events an island sends are dropped:
LiveView can't deliver them. Text typed then would show in the editor, but
the server would never hear about it. Stopping the typing is honest.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page, the editor, and the button that drops the connection. |
| [`assets/js/islands/monaco.js`](../../../../assets/js/islands/monaco.js) | `offlineMonaco`: Xenia's Monaco adapter, extended by spreading. |

## How it works

```js
export const offlineMonaco = {
  ...monaco,
  consumes: [...monaco.consumes, "connection"],
  props: { ...monaco.props, connection: readOnlyWhileOffline },
}
```

| What | How |
|---|---|
| **The island learns about the connection.** | `consumes: ["connection"]`. Xenia gives the island `"connected"` or `"disconnected"` as an ordinary prop: in `mount`, then through its `connection` handler. No listener of its own. |
| **Each island follows its own LiveView.** | The value comes from the island's LiveView hook (`disconnected()` and `reconnected()`). A crash of the page's LiveView counts too: it's disconnected until it has joined again. |
| **The page doesn't change.** | `<.monaco adapter="OfflineMonaco">`: only the adapter knows. The server sends nothing for it. |
| **A mount while disconnected is handled too.** | The adapter's `mount` checks `props.connection` as well, for an island that starts while the connection is down (a lazy one, say). |

For a notice for the whole page, Phoenix already has one: the "We can't
find the internet" flash, and the `phx-disconnected` binding. The connection
value is for what a library inside an island should do.

The browser test ([`assets/e2e/connection.test.mjs`](../../../../assets/e2e/connection.test.mjs))
drops the connection, checks the editor refuses typing, and that typing
reaches the server once it's back; and that a crash of the LiveView sends
the editor `"disconnected"`, then `"connected"`, on the same editor.
