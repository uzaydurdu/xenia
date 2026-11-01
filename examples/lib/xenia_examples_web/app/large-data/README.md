# Large data

The same series in two charts: one gets it as a prop, the other by
commands. Open it at `/large-data`.

**Try it:** press "Add a point" and "Switch to bars", and compare what
each chart was sent (the page shows it under each chart). Then pick 10,000
points and do it again: the prop chart's share grows with the series, the
command chart's doesn't.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The series, both charts, and what each update sends them. |
| [`assets/js/islands/chartjs.js`](../../../../assets/js/islands/chartjs.js) | `liveChart`: the official Chart.js adapter, extended by spreading with two commands and a `ready` event. |
| [`assets/scripts/measure-large-data.mjs`](../../../../assets/scripts/measure-large-data.mjs) | Measures the bytes on the WebSocket, and the time in the browser. |

## What each update costs

Measured with `measure-large-data.mjs` at 10,000 points (median of 5;
LiveView 1.2.13, Chromium):

| | Data as a prop | Data by commands |
|---|---|---|
| Add one point | 109 KB | 99 bytes |
| Switch the type (data unchanged) | 109 KB | 208 bytes (its props: `type`, `options`) |

A prop is sent again whole whenever it changes. And Xenia sends a
component's props as one attribute, so a change to `type` sends `data`
again too.

In the browser, Xenia's own work is small: under half a millisecond to
parse and compare those props. Chart.js's redraw is what takes time, about
30 ms for 10,000 points (120 ms to switch to bars), however the points
arrived. Two Chart.js settings keep it that low here: no dot on each point
(`pointRadius: 0` on the dataset, which wins over the official adapter's
default), and bars that fill their slot, so 10,000 of them still show. See
[Chart.js's performance advice](https://www.chartjs.org/docs/latest/general/performance.html).

## How the right chart works

| What | How |
|---|---|
| **The server keeps the series.** | The chart's props are only `type` and `options`, so they stay small. |
| **The chart asks for it when it starts.** | `liveChart`'s `mount` emits `ready`, and `handle_event("chart_ready", ...)` answers with a `replace_points` command carrying the whole series, once. |
| **Every change is a command with only what changed.** | "Add a point" sends `append_points` with one label and one value. |
| **A new type keeps the points.** | `liveChart` stores the points through the official adapter's `data` handler, so a rebuild for a new type draws them again. |
| **A reconnect gets the server's series again.** | A reconnect is a new LiveView process, which starts over. `liveChart` consumes `"connection"`, and emits `ready` again when it's back to `"connected"`. |

The browser test ([`assets/e2e/large_data.test.mjs`](../../../../assets/e2e/large_data.test.mjs))
checks that a point reaches both charts (the right one without a remount),
that a new type keeps the right chart's points, and that after a reconnect
it follows the new LiveView's series.
