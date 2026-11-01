# Lazy islands

A Monaco editor that starts only when you scroll to it. Open it at `/lazy`.

```heex
<.monaco id="later" lazy="visible" value={@code} on_change="code_changed">
  <:loading>The editor starts when you scroll here.</:loading>
</.monaco>
```

| What | How |
|---|---|
| **The editor doesn't start until it's near the screen.** | `lazy="visible"`. Xenia watches the island with an `IntersectionObserver`, and mounts it when it's within 200 px of the viewport. Until then, the `<:loading>` slot shows. |
| **Monaco isn't downloaded until then either.** | The app uses code splitting (see Xenia's README, "Code splitting"), so `load: () => import("monaco-editor")` is a file of its own. It's fetched by the mount, which now waits. |
| **A command sent earlier isn't lost.** Press the button, then scroll: the line is there. | `Xenia.push_to/4` works as usual. Xenia queues the command until the editor has mounted, as it does for any island that's still loading. |
| **The server's value is the one the editor starts with.** | The editor reads its props when it mounts, so it gets the latest `@code`. |

Every tag takes `lazy`: `<.xenia>`, the official adapters' tags, and the
tags you declare with `use Xenia.Components`.

The browser test ([`assets/e2e/lazy.test.mjs`](../../../../assets/e2e/lazy.test.mjs))
checks that Monaco is neither downloaded nor mounted before you scroll, that
a command sent before then arrives, and that leaving before you scroll
leaves no errors.
