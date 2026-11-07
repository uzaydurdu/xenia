// The lifecycle guard's overhead baseline (Stage A, CLAUDE.md §6
// "Lifecycle integrity"):
// - the cost of Xenia's document-wide MutationObserver (the
//   unregistered-adapter check) while typing in Monaco, with it and
//   without it;
// - LiveView's patch time on a few pages (its profiling output).
// Diagnostics added later are measured against these numbers.
//
// Start the app first (from examples/):
//   PORT=4002 mix phx.server
// Then, from examples/assets:
//   E2E_URL=http://localhost:4002 node scripts/measure-observer.mjs
// RUNS=5 by default.
import { chromium } from "playwright"

const BASE = process.env.E2E_URL ?? "http://localhost:4002"
const RUNS = Number(process.env.RUNS ?? 5)
const TEXT = "IO.puts(:hello) # typing in Monaco, one key at a time ".repeat(4) // 220 keys

// Runs before the page's scripts. "with": time the callback of any observer
// on <html> with subtree (only Xenia's). "without": that observe() does nothing.
const instrument = (mode) => {
  const Original = window.MutationObserver
  window.__mo = { calls: 0, records: 0, ms: 0, observers: 0 }
  window.MutationObserver = class extends Original {
    constructor(callback) {
      let timed = false
      super((records, observer) => {
        if (!timed) return callback(records, observer)
        const t0 = performance.now()
        try { return callback(records, observer) } finally {
          window.__mo.ms += performance.now() - t0
          window.__mo.calls += 1
          window.__mo.records += records.length
        }
      })
      this.__markTimed = () => { timed = true }
    }
    observe(target, options) {
      if (target === document.documentElement && options?.subtree) {
        window.__mo.observers += 1
        if (mode === "without") return
        this.__markTimed()
      }
      return super.observe(target, options)
    }
  }
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

async function run(browser, mode) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.addInitScript(instrument, mode)
  await page.addInitScript(() => sessionStorage.setItem("phx:live-socket:profiling", "true"))
  const patches = []
  page.on("console", (m) => {
    const match = m.text().match(/^full patch complete: ([\d.]+) ms/)
    if (match) patches.push(Number(match[1]))
  })
  await page.goto(BASE + "/adapters/monaco")
  await page.waitForSelector("[data-phx-main].phx-connected")
  await page.waitForSelector("#editor .view-lines")
  await page.waitForTimeout(500)
  await page.click("#editor .view-lines")
  await page.keyboard.press("ControlOrMeta+End")
  await page.evaluate(() => Object.assign(window.__mo, { calls: 0, records: 0, ms: 0 }))
  patches.length = 0

  const cdp = await context.newCDPSession(page)
  await cdp.send("Performance.enable")
  const metric = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]))
  const before = await metric()
  const t0 = Date.now()
  await page.keyboard.type(TEXT, { delay: 15 })
  await page.waitForTimeout(800) // the last debounced change and its patch
  const after = await metric()
  const mo = await page.evaluate(() => window.__mo)
  await context.close()
  return {
    mode,
    keys: TEXT.length,
    wallMs: Date.now() - t0,
    scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
    taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
    observer: mo,
    patches,
  }
}

async function patchTimes(browser) {
  for (const [path, button, wait] of [["/integrity", "#rerender", 150], ["/chart", "#switch-type", 250]]) {
    const page = await browser.newPage()
    await page.addInitScript(() => sessionStorage.setItem("phx:live-socket:profiling", "true"))
    const patches = []
    page.on("console", (m) => {
      const match = m.text().match(/^full patch complete: ([\d.]+) ms/)
      if (match) patches.push(Number(match[1]))
    })
    await page.goto(BASE + path)
    await page.waitForSelector("[data-phx-main].phx-connected")
    await page.waitForTimeout(800)
    patches.length = 0
    for (let i = 0; i < 20; i++) {
      await page.click(button)
      await page.waitForTimeout(wait)
    }
    console.log(`\n${path} (${button} x20): ${patches.length} patches, median ${median(patches).toFixed(2)} ms, max ${Math.max(...patches).toFixed(2)} ms`)
    await page.close()
  }
}

const browser = await chromium.launch()
const results = { with: [], without: [] }
for (let i = 0; i < RUNS; i++) {
  for (const mode of i % 2 ? ["without", "with"] : ["with", "without"]) results[mode].push(await run(browser, mode))
}
await patchTimes(browser)
await browser.close()

for (const mode of ["with", "without"]) {
  const rs = results[mode]
  console.log(`\n${mode} the observer (${rs.length} runs, ${rs[0].keys} keys each):`)
  console.log("  observers on <html>:", rs.map((r) => r.observer.observers).join(" "))
  console.log("  main-thread task time, ms:", rs.map((r) => r.taskMs.toFixed(0)).join(" "), "median", median(rs.map((r) => r.taskMs)).toFixed(0))
  console.log("  script time, ms:", rs.map((r) => r.scriptMs.toFixed(0)).join(" "), "median", median(rs.map((r) => r.scriptMs)).toFixed(0))
  if (mode === "with") {
    console.log("  observer callback, ms:", rs.map((r) => r.observer.ms.toFixed(1)).join(" "), "median", median(rs.map((r) => r.observer.ms)).toFixed(1))
    console.log("  callbacks / mutation records:", rs.map((r) => `${r.observer.calls}/${r.observer.records}`).join(" "))
    console.log("  per key, ms:", (median(rs.map((r) => r.observer.ms)) / rs[0].keys).toFixed(4))
  }
  const allPatches = rs.flatMap((r) => r.patches)
  console.log("  LiveView full patches:", allPatches.length, "median ms", allPatches.length ? median(allPatches).toFixed(2) : "-", "max", allPatches.length ? Math.max(...allPatches).toFixed(2) : "-")
}
