// What a LiveView reconnect does to islands.
//
// A reconnect is a new LiveView process on the server: mount runs again,
// and the server's state starts over. In the browser nothing is torn down:
// the islands keep their instances, text and undo history. Form fields get
// their values back through LiveView's form recovery; any other island's
// value reaches the server again with its next event. Events sent while
// disconnected are dropped (LiveView rejects pushes then).
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
const ROUND_TRIP = 900 // more than Monaco's 300 ms change debounce, plus a reply

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

// Drops the LiveView connection, then connects again and waits for the
// fresh LiveView to join.
async function disconnect(page) {
  await page.evaluate(() => window.liveSocket.disconnect())
  await page.waitForFunction(() => !window.liveSocket.isConnected())
}

async function reconnect(page) {
  await page.evaluate(() => window.liveSocket.connect())
  await page.waitForSelector("[data-phx-main].phx-connected")
  await page.waitForTimeout(400)
}

// The Xenia instance of the island `id`, in any LiveView on the page.
const instanceOf = (page, id, keep) =>
  page.evaluate(
    ([id, keep]) => {
      for (const view of Object.values(window.liveSocket.roots)) {
        for (const hook of Object.values(view.viewHooks)) {
          if (hook.el.id !== id) continue
          const instance = hook._xeniaController?.instance
          if (keep) window.__kept = instance
          return instance === window.__kept
        }
      }
      return null
    },
    [id, keep],
  )

const editorValue = (page, id) =>
  page.evaluate(async (id) => {
    for (const view of Object.values(window.liveSocket.roots)) {
      for (const hook of Object.values(view.viewHooks)) {
        if (hook.el.id === id) return (await hook._xeniaController.instance.raw()).editor.getValue()
      }
    }
  }, id)

async function typeAtEnd(page, id, text) {
  await page.click(`#${id} .view-line >> nth=0`)
  await page.keyboard.press("End")
  await page.keyboard.type(text)
}

test("a reconnect keeps the islands; the server learns their value from their next event", async () => {
  const { page, problems } = await open("/two-editors")
  await page.waitForSelector("#editor-a .monaco-editor .view-lines")
  await instanceOf(page, "editor-a", true)

  await typeAtEnd(page, "editor-a", " Q")
  await page.waitForTimeout(ROUND_TRIP)
  assert.match(await page.textContent("#server-editor-a"), /Q/)

  await disconnect(page)
  await typeAtEnd(page, "editor-a", "R") // sent while disconnected: dropped
  await page.waitForTimeout(ROUND_TRIP)
  await reconnect(page)

  assert.equal(await instanceOf(page, "editor-a"), true, "the same editor instance")
  assert.match(await editorValue(page, "editor-a"), /QR/, "with everything the user typed")
  assert.equal(
    await page.textContent("#server-editor-a"),
    "# Editor A\n",
    "the new LiveView has its mount value",
  )

  // The next change carries the whole text, so the server has it all again.
  await typeAtEnd(page, "editor-a", "S")
  await page.waitForTimeout(ROUND_TRIP)
  assert.match(await page.textContent("#server-editor-a"), /QRS/)

  // And commands reach the island again.
  await page.click("#insert-editor-b")
  await page.waitForTimeout(ROUND_TRIP)
  assert.match(await editorValue(page, "editor-b"), /inserted into editor-b/)
  assert.deepEqual(problems, [])
  await page.close()
})

test("form fields: after a reconnect, form recovery gives the server the islands' values back", async () => {
  const { page, problems } = await open("/forms")
  await page.waitForSelector("#post_code .monaco-editor .view-lines")
  const serverCode = () =>
    page.evaluate(() => JSON.parse(document.querySelector("#post_code").dataset.xeniaProps).value.value)

  await page.fill("#post_title", "Hello Xenia")
  await page.click("#post_code .view-lines")
  await page.keyboard.type("IO.puts(:hello)")
  await page.waitForTimeout(ROUND_TRIP)
  assert.match(await serverCode(), /IO\.puts/, "the server has the code")

  await disconnect(page)
  await reconnect(page)
  await page.waitForTimeout(ROUND_TRIP)

  assert.match(await serverCode(), /IO\.puts/, "recovered by the new LiveView")
  assert.equal(await page.inputValue("#post_title"), "Hello Xenia")
  assert.deepEqual(problems, [])
  await page.close()
})
