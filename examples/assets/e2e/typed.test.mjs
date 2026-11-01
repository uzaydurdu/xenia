// /typed: an adapter written in TypeScript (assets/js/islands/budget.ts),
// compiled by Phoenix's esbuild as it is. Its types are checked by
// `npm run typecheck`; this test checks that it runs: props, an event and
// a command.
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
  await page.waitForSelector("#budget canvas")
  return { page, problems }
}

// The Chart.js chart the island mounted.
const chart = (page, fn) =>
  page.evaluate((fn) => {
    for (const view of Object.values(window.liveSocket.roots)) {
      for (const hook of Object.values(view.viewHooks)) {
        if (hook.el.id === "budget") return new Function("chart", `return (${fn})(chart)`)(hook._xeniaController.instance)
      }
    }
  }, fn.toString())

test("the TypeScript island runs: props, an event and a command", async () => {
  const { page, problems } = await open("/typed")

  assert.deepEqual(await chart(page, (c) => c.data.datasets[0].data), [30, 70])

  // Props: the page sends new numbers to the same chart.
  await page.click("#spend")
  await page.waitForFunction(() => document.querySelector("#spent").textContent.includes("40"))
  assert.deepEqual(await chart(page, (c) => c.data.datasets[0].data), [40, 60])

  // Event: a click on the "left" part reaches the page.
  const { x, y } = await chart(page, (c) => c.getDatasetMeta(0).data[1].tooltipPosition())
  const box = await page.locator("#budget canvas").boundingBox()
  await page.mouse.click(box.x + x, box.y + y)
  await page.waitForFunction(() => document.querySelector("#clicked").textContent.includes("left"))
  assert.equal((await page.textContent("#clicked")).trim(), "You clicked left: 60.")

  // Command: the page asks the chart to highlight "left".
  await page.mouse.move(0, 0)
  await page.click("#highlight-left")
  await page.waitForTimeout(300)
  assert.deepEqual(await chart(page, (c) => c.getActiveElements().map((e) => e.index)), [1])

  assert.deepEqual(problems, [])
  await page.close()
})
