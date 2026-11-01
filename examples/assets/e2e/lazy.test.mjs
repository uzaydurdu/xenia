// Lazy islands: `lazy="visible"` waits until the island is near the screen
// before mounting it, and so, with code splitting, before downloading its
// library. The page is /lazy: a Monaco editor below the fold.
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

// A class only Monaco's code contains, readable in the dev build the tests
// run against (see splitting.test.mjs).
const MONACO = "StandaloneCodeEditor"

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

async function open(path) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  const problems = []
  const monaco = [] // the scripts with Monaco in them, as they arrive
  page.on("pageerror", (e) => problems.push(e.message))
  page.on("console", (m) => { if (isBrowserError(m)) problems.push(m.text()) })

  // Reading a script's body takes time (Monaco's is several MB), and can
  // finish after the editor is on screen. Each read is kept, so a test can
  // wait for them before it counts.
  const pending = new Set()
  page.on("response", (res) => {
    if (res.request().resourceType() !== "script") return
    const read = res.text().catch(() => "").then((body) => {
      if (body.includes(MONACO)) monaco.push(new URL(res.url()).pathname)
    })
    pending.add(read)
    read.finally(() => pending.delete(read))
  })
  const reads = () => Promise.all([...pending])

  await page.goto(BASE + path)
  await page.waitForSelector("[data-phx-main].phx-connected")
  return { page, problems, monaco, reads }
}

// Monaco renders spaces as non-breaking spaces; compare plain text.
const editorText = async (page) =>
  (await page.locator("#later .view-lines").innerText()).replace(/\u00a0/g, " ")

test("a lazy editor below the fold isn't downloaded or started until you scroll to it", async () => {
  const { page, problems, monaco, reads } = await open("/lazy")
  await page.waitForTimeout(1500)
  await reads()

  assert.equal(await page.locator("#later .monaco-editor").count(), 0, "not started")
  assert.ok(await page.locator("#later [data-xenia-loading]").isVisible(), "the placeholder shows")
  assert.deepEqual(monaco, [], "Monaco not downloaded")

  await page.locator("#later").scrollIntoViewIfNeeded()
  await page.waitForSelector("#later .monaco-editor .view-lines")
  await reads() // the editor runs, so Monaco's response has arrived
  assert.equal(monaco.length, 1, "Monaco downloaded once it was needed")
  assert.match(await editorText(page), /An editor that waited for you/, "the server's value")
  assert.deepEqual(problems, [])
  await page.close()
})

test("a command sent before the island is visible arrives once it starts", async () => {
  const { page, problems } = await open("/lazy")

  await page.click("#insert-now")
  await page.waitForFunction(() => document.querySelector("#sent").textContent.includes("1"))
  assert.equal(await page.locator("#later .monaco-editor").count(), 0, "still waiting")

  await page.locator("#later").scrollIntoViewIfNeeded()
  await page.waitForSelector("#later .monaco-editor .view-lines")
  await page.waitForFunction(() =>
    document
      .querySelector("#later .view-lines")
      ?.innerText.replace(/\u00a0/g, " ")
      .includes("Sent from the top of the page."),
  )
  // The insert is a change, so it reaches the server like typing does.
  await page.waitForFunction(() => document.querySelector("#lines").textContent.includes("3 lines"))
  assert.deepEqual(problems, [])
  await page.close()
})

test("leaving before the island is visible: nothing downloaded, no errors", async () => {
  const { page, problems, monaco, reads } = await open("/lazy")
  await page.click("#sidebar a[href='/chart']")
  await page.waitForURL(BASE + "/chart")
  await page.waitForSelector("#sales canvas")
  await page.waitForTimeout(1000)
  await reads()

  assert.deepEqual(monaco, [])
  assert.deepEqual(problems, [])
  await page.close()
})
