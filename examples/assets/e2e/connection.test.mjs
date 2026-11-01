// consumes: ["connection"] on /connection: an editor that is read-only while
// its LiveView is disconnected. Xenia sets the value for each island from
// its own LiveView (the hook's disconnected() and reconnected()).
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
  await page.waitForSelector("#notes .monaco-editor .view-lines")
  return { page, problems }
}

// The editor's text, and whether it's read-only, read from Monaco itself.
const editor = (page) =>
  page.evaluate(async () => {
    for (const view of Object.values(window.liveSocket.roots)) {
      for (const hook of Object.values(view.viewHooks)) {
        if (hook.el.id !== "notes") continue
        const { editor } = await hook._xeniaController.instance.raw()
        return { text: editor.getValue(), readOnly: Boolean(editor.getRawOptions().readOnly) }
      }
    }
  })

// Types at the end of the first line, "# Notes".
async function typeAtEnd(page, text) {
  await page.click("#notes .view-line >> nth=0")
  await page.keyboard.press("End")
  await page.keyboard.type(text)
}

test("while disconnected the editor is read-only; once back, typing reaches the server", async () => {
  const { page, problems } = await open("/connection")

  await typeAtEnd(page, "A")
  await page.waitForTimeout(ROUND_TRIP)
  assert.match(await page.textContent("#server-notes"), /has 9 characters/)

  await page.click("#drop") // disconnects for 2 seconds
  await page.waitForFunction(() => !window.liveSocket.isConnected())
  await page.waitForTimeout(200)
  assert.equal((await editor(page)).readOnly, true, "read-only while disconnected")

  await typeAtEnd(page, "B")
  assert.doesNotMatch((await editor(page)).text, /B/, "nothing typed while disconnected")

  await page.waitForSelector("[data-phx-main].phx-connected", { timeout: 5000 })
  await page.waitForTimeout(300)
  assert.equal((await editor(page)).readOnly, false, "editable again")

  // The new LiveView starts from its mount value; the next change carries
  // the whole text, so the server has it all again.
  await typeAtEnd(page, "C")
  await page.waitForTimeout(ROUND_TRIP)
  assert.match((await editor(page)).text, /^# NotesAC\n/)
  assert.match(await page.textContent("#server-notes"), /has 10 characters/)

  assert.deepEqual(problems, [])
  await page.close()
})

test("a crash of the page's LiveView counts too: disconnected, then connected, same editor", async () => {
  const { page, problems } = await open("/connection")

  await page.evaluate(() => {
    window.__seen = []
    for (const view of Object.values(window.liveSocket.roots)) {
      for (const hook of Object.values(view.viewHooks)) {
        if (hook.el.id !== "notes") continue
        window.__instance = hook._xeniaController.instance
        // Record each value the adapter's connection handler receives.
        const controller = hook._xeniaController
        const handler = controller.adapter.props.connection
        controller.adapter = {
          ...controller.adapter,
          props: {
            ...controller.adapter.props,
            connection: (instance, value, ctx) => (window.__seen.push(value), handler(instance, value, ctx)),
          },
        }
      }
    }
  })

  // An event the page has no handle_event clause for crashes its LiveView,
  // which then rejoins; the socket stays up.
  await page.evaluate(() =>
    window.liveSocket.execJS(document.getElementById("drop"), JSON.stringify([["push", { event: "no_such_event" }]])),
  )
  await page.waitForFunction(() => window.__seen.length >= 2, null, { timeout: 5000 })

  assert.deepEqual(await page.evaluate(() => window.__seen), ["disconnected", "connected"])
  assert.equal((await editor(page)).readOnly, false)
  assert.equal(
    await page.evaluate(() => {
      for (const view of Object.values(window.liveSocket.roots)) {
        for (const hook of Object.values(view.viewHooks)) {
          if (hook.el.id === "notes") return hook._xeniaController.instance === window.__instance
        }
      }
    }),
    true,
    "the same editor instance",
  )
  assert.deepEqual(problems, [])
  await page.close()
})
