// ctx.signal on /listeners: an island adds a keydown listener to the whole
// document with { signal: ctx.signal }. Xenia aborts the signal when the
// island is destroyed, which removes the listener; its destroy() is empty.
//
// The listeners are counted for real, through Chrome's DevTools protocol
// (DOMDebugger.getEventListeners on document).
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

// The number of keydown listeners on document, as DevTools sees them.
async function keydownListeners(cdp) {
  const { result } = await cdp.send("Runtime.evaluate", { expression: "document" })
  const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId })
  await cdp.send("Runtime.releaseObject", { objectId: result.objectId })
  return listeners.filter((listener) => listener.type === "keydown").length
}

// Live navigation through the sidebar, then wait for the new page.
async function go(page, path) {
  await page.click(`#sidebar a[href='${path}']`)
  await page.waitForFunction((path) => location.pathname === path, path)
  await page.waitForSelector("[data-phx-main].phx-connected")
  await page.waitForTimeout(150)
}

test("a key pressed anywhere on the page reaches the island", async () => {
  const { page, problems } = await open("/listeners")
  await page.waitForSelector("#keys output")
  assert.equal(await page.textContent("#keys output"), "Press any key.")

  await page.click("h1") // focus outside the island
  await page.keyboard.press("k")
  await page.keyboard.press("x")
  assert.equal(await page.textContent("#keys output"), "Last key: x (2 pressed)")

  assert.deepEqual(problems, [])
  await page.close()
})

test("the island's listener goes with it: they never pile up across navigations", async () => {
  const { page, problems } = await open("/listeners")
  await page.waitForSelector("#keys output")
  const cdp = await page.context().newCDPSession(page)

  const onPage = await keydownListeners(cdp)
  await go(page, "/chart")
  const elsewhere = await keydownListeners(cdp)
  assert.equal(onPage - elsewhere, 1, "the island's listener is gone with the island")

  for (let i = 0; i < 5; i++) {
    await go(page, "/listeners")
    await go(page, "/chart")
  }
  assert.equal(await keydownListeners(cdp), elsewhere, "none left behind after 5 visits")

  await go(page, "/listeners")
  assert.equal(await keydownListeners(cdp), onPage, "one again, the new island's")
  await page.click("h1")
  await page.keyboard.press("q")
  assert.equal(await page.textContent("#keys output"), "Last key: q (1 pressed)", "a fresh island")

  assert.deepEqual(problems, [])
  await page.close()
})
