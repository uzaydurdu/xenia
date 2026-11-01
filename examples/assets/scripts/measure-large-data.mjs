// Measures the large data example (/large-data): what each update sends
// over the LiveView WebSocket, and what it costs in the browser, for the
// chart that gets its points as a prop and the one that gets them by
// commands, at the page's largest series (10,000 points). Not a test: it
// prints numbers (the guide quotes them).
//
// Start the app first (from examples/):
//   PORT=4002 mix phx.server
// Then, from examples/assets:
//   E2E_URL=http://localhost:4002 node scripts/measure-large-data.mjs

import { chromium } from "playwright"

const BASE = process.env.E2E_URL ?? "http://localhost:4002"
const RUNS = Number(process.env.RUNS ?? 5)

const browser = await chromium.launch()
const page = await browser.newPage()

// Every frame the browser receives, from the moment the page opens.
let frames = []
page.on("websocket", (ws) => ws.on("framereceived", ({ payload }) => frames.push(String(payload))))

await page.goto(BASE + "/large-data")
await page.waitForSelector("[data-phx-main].phx-connected")

// Both charts, with Xenia's controller and the Chart.js chart.
const points = (id) =>
  page.evaluate((id) => {
    for (const view of Object.values(window.liveSocket.roots)) {
      for (const hook of Object.values(view.viewHooks)) {
        if (hook.el.id === id) return hook._xeniaController?.instance?.chart?.data.labels.length ?? 0
      }
    }
    return 0
  }, id)

const waitFor = async (expected) => {
  for (let i = 0; i < 200; i++) {
    if ((await points("by-prop")) === expected && (await points("by-command")) === expected) return
    await page.waitForTimeout(50)
  }
  throw new Error(`charts didn't reach ${expected} points`)
}

await waitFor(100)
await page.click("#size-10000")
await waitFor(10_000)

// Timers around what Xenia does with an update (parse the attribute,
// compare the props) and around Chart.js's redraw, per chart.
await page.evaluate(() => {
  window.__timings = []
  const record = (id, what, ms) => window.__timings.push({ id, what, ms })

  for (const view of Object.values(window.liveSocket.roots)) {
    for (const hook of Object.values(view.viewHooks)) {
      const controller = hook._xeniaController
      if (!controller || !["by-prop", "by-command"].includes(hook.el.id)) continue

      for (const method of ["readProps", "dispatchChanges"]) {
        const original = controller[method].bind(controller)
        controller[method] = (...args) => {
          const start = performance.now()
          try {
            return original(...args)
          } finally {
            record(hook.el.id, method, performance.now() - start)
          }
        }
      }

      const proto = controller.instance.Chart.prototype
      if (!proto.__timed) {
        const update = proto.update
        proto.update = function (...args) {
          const start = performance.now()
          try {
            return update.apply(this, args)
          } finally {
            record(this.canvas.closest("[data-xenia-props]")?.id, "Chart.js update", performance.now() - start)
          }
        }
        proto.__timed = true
      }
    }
  }
})

// The bytes of one action: commands to the right chart, and the rest of the
// frames (mostly the left chart's data-xenia-props).
function bytesOf(received) {
  let total = 0
  let commands = 0

  for (const frame of received) {
    total += Buffer.byteLength(frame)
    const visit = (node) => {
      if (Array.isArray(node)) {
        if (typeof node[0] === "string" && node[0].startsWith("xenia:command:")) {
          commands += Buffer.byteLength(JSON.stringify(node))
          return
        }
        node.forEach(visit)
      } else if (node && typeof node === "object") {
        Object.values(node).forEach(visit)
      }
    }
    try {
      visit(JSON.parse(frame))
    } catch {
      // Not JSON (a binary frame): counted in the total only.
    }
  }

  return { total, commands }
}

async function measure(label, action, expected) {
  const rows = []

  for (let run = 0; run < RUNS; run++) {
    frames = []
    await page.evaluate(() => (window.__timings = []))
    await action()
    await waitFor(expected(run))
    await page.waitForTimeout(300)

    const timings = await page.evaluate(() => window.__timings)
    const sum = (id, what) =>
      timings.filter((t) => t.id === id && t.what === what).reduce((s, t) => s + t.ms, 0)

    rows.push({
      ...bytesOf(frames),
      propParse: sum("by-prop", "readProps"),
      propCompare: sum("by-prop", "dispatchChanges"),
      propChart: sum("by-prop", "Chart.js update"),
      commandChart: sum("by-command", "Chart.js update"),
    })
  }

  const median = (key) => {
    const sorted = rows.map((r) => r[key]).sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }

  const kb = (n) => `${(n / 1000).toFixed(1)} KB`
  const ms = (n) => `${n.toFixed(1)} ms`

  console.log(`\n${label} (median of ${RUNS})`)
  console.log(`  WebSocket, received:       ${kb(median("total"))}`)
  console.log(`    of which commands:       ${median("commands")} bytes`)
  console.log(`  Prop chart, Xenia parse:   ${ms(median("propParse"))}`)
  console.log(`  Prop chart, Xenia compare: ${ms(median("propCompare"))}`)
  console.log(`  Prop chart, Chart.js:      ${ms(median("propChart"))}`)
  console.log(`  Command chart, Chart.js:   ${ms(median("commandChart"))}`)
}

// Both charts change in the same reply frame, so a latency per chart
// isn't measurable here; on localhost the transfer is nearly free anyway.
// The bytes are what a real network pays.
let count = 10_000
await measure("Add one point", () => page.click("#add-point"), () => ++count)
await measure("Switch the type (data unchanged)", () => page.click("#switch-type"), () => count)

await browser.close()
