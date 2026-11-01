// /large-data: the same series as a prop (left) and by commands (right,
// `liveChart`: append_points, replace_points on `ready`). 100 points at
// first; the size buttons switch to 1,000 or 10,000.
// scripts/measure-large-data.mjs measures what each update sends.
//
// Start the app first (from examples/):
//   PORT=4002 mix phx.server
// Then, from examples/assets:
//   E2E_URL=http://localhost:4002 npm run e2e

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { chromium } from "playwright"
import { isBrowserError } from "./console.mjs"

const BASE = process.env.E2E_URL ?? "http://localhost:4002"

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

async function open(path) {
  const page = await browser.newPage()
  const problems = []
  page.on("pageerror", (e) => problems.push(e.message))
  page.on("console", (m) => { if (isBrowserError(m)) problems.push(m.text()) })
  await page.goto(BASE + path)
  await page.waitForSelector("[data-phx-main].phx-connected")
  return { page, problems }
}

// A chart's point count, last value and type, and whether it's still the
// instance marked with `keep`.
const chart = (page, id, keep = false) =>
  page.evaluate(
    ([id, keep]) => {
      for (const view of Object.values(window.liveSocket.roots)) {
        for (const hook of Object.values(view.viewHooks)) {
          if (hook.el.id !== id) continue
          const instance = hook._xeniaController?.instance
          const chart = instance?.chart
          if (keep) window[`__kept_${id}`] = instance
          if (!chart) return null
          const values = chart.data.datasets[0].data
          return {
            points: values.length,
            last: values.at(-1),
            type: chart.config.type,
            same: instance === window[`__kept_${id}`],
          }
        }
      }
      return null
    },
    [id, keep],
  )

const points = (page, count) =>
  page.waitForFunction(
    (count) =>
      ["by-prop", "by-command"].every((id) => {
        for (const view of Object.values(window.liveSocket.roots)) {
          for (const hook of Object.values(view.viewHooks)) {
            if (hook.el.id === id) return hook._xeniaController?.instance?.chart?.data.labels.length === count
          }
        }
        return false
      }),
    count,
    { timeout: 15_000 },
  )

test("a new point: the whole series as a prop, one command for the other chart", async () => {
  const { page, problems } = await open("/large-data")
  await points(page, 100)
  await chart(page, "by-command", true)

  await page.click("#add-point")
  await points(page, 101)

  const left = await chart(page, "by-prop")
  const right = await chart(page, "by-command")
  assert.equal(right.last, left.last, "the same new value in both")
  assert.equal(right.same, true, "appended to the same chart, not remounted")

  assert.match(await page.textContent("#sent-prop"), /about \d+(\.\d+)? (bytes|KB)/)
  assert.match(await page.textContent("#sent-command"), /about \d+ bytes/)

  // A new type: the command chart keeps its points without a replay.
  await page.click("#switch-type")
  await page.waitForFunction(() => document.querySelector("#switch-type").textContent.includes("a line"))
  await points(page, 101)
  assert.equal((await chart(page, "by-prop")).type, "bar")
  assert.equal((await chart(page, "by-command")).type, "bar")

  // A longer series: the prop chart gets it as props, the other as one
  // replace_points command, on the same chart.
  await page.click("#size-10000")
  await points(page, 10_000)
  assert.equal((await chart(page, "by-command")).same, true)
  assert.match(await page.textContent("#sent-prop"), /about \d+ KB/)

  assert.deepEqual(problems, [])
  await page.close()
})

test("after a reconnect, the command chart asks again, and follows the new LiveView", async () => {
  const { page, problems } = await open("/large-data")
  await points(page, 100)
  await page.click("#add-point")
  await points(page, 101)

  // The new LiveView process starts over at 100 points; `ready`, sent on
  // "connected", gets the right chart its series again.
  await page.evaluate(() => window.liveSocket.disconnect())
  await page.waitForFunction(() => !window.liveSocket.isConnected())
  await page.evaluate(() => window.liveSocket.connect())
  await page.waitForSelector("[data-phx-main].phx-connected")
  await points(page, 100)

  assert.deepEqual(problems, [])
  await page.close()
})
