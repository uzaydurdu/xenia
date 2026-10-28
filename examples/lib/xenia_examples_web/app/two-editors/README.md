# Two editors

Two Monaco editors on one page, each with its own events and commands. Open
it at `/two-editors`.

Islands of the same kind don't share anything. Each one has its own id, so:

| What | How | Where |
|---|---|---|
| **Each editor reports to its own event.** Type in editor A, and the server's copy of A changes, not B's. | `on_change="a_changed"` on one tag, `on_change="b_changed"` on the other. The page chooses the event name, so the same adapter can report anything. | [`page.ex`](page.ex) |
| **A command reaches one editor.** "Insert into A" changes only A. | `Xenia.push_to(socket, "editor-a", "insert", %{text: ...})`. The id in the call picks the editor. | [`page.ex`](page.ex) |

## Why it matters

LiveView's own `push_event` goes to every hook on the page that listens
for that event name. Without Xenia, two editors on one page would both
react to a command meant for one of them, unless you invent a naming
scheme yourself. `Xenia.push_to/4` sends each command to one component
only.

The browser tests check both directions
([`assets/e2e/lifecycle.test.mjs`](../../../../assets/e2e/lifecycle.test.mjs)):
a command for A leaves B alone, and typing in B reaches only B's event.
