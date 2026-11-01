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
  const scripts = [] // every script the page requested, in order
  page.on("pageerror", (e) => problems.push(e.message))
  page.on("console", (m) => { if (isBrowserError(m)) problems.push(m.text()) })
  page.on("request", (req) => { if (req.resourceType() === "script") scripts.push(req.url()) })

  await page.goto(BASE + path)
  await page.waitForSelector("[data-phx-main].phx-connected")
  return { page, problems, scripts }
}

// Which of these scripts contain Monaco. The test fetches each one itself:
// reading Monaco's 20 MB body back out of the browser (response.text()) was
// unreliable on CI, and a response event can trail what the page shows.
const bodies = new Map()
const containsMonaco = (url) => {
  if (!bodies.has(url)) bodies.set(url, fetch(url).then((r) => r.text()).then((b) => b.includes(MONACO)))
  return bodies.get(url)
}
async function monacoScripts(scripts) {
  const urls = [...scripts]
  const flags = await Promise.all(urls.map(containsMonaco))
  return urls.filter((_, i) => flags[i]).map((url) => new URL(url).pathname)
}

// Polls `check` until it returns something truthy, or the time is up.
async function eventually(check, ms = 15_000) {
  const deadline = Date.now() + ms
  for (;;) {
    const value = await check()
    if (value || Date.now() > deadline) return value
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

const paths = (scripts) => scripts.map((url) => new URL(url).pathname).join(", ")

// Monaco renders spaces as non-breaking spaces; compare plain text.
const editorText = async (page) =>
  (await page.locator("#later .view-lines").innerText()).replace(/\u00a0/g, " ")

test("a lazy editor below the fold isn't downloaded or started until you scroll to it", async () => {
  const { page, problems, scripts } = await open("/lazy")
  await page.waitForTimeout(1500)

  assert.equal(await page.locator("#later .monaco-editor").count(), 0, "not started")
  assert.ok(await page.locator("#later [data-xenia-loading]").isVisible(), "the placeholder shows")
  assert.deepEqual(await monacoScripts(scripts), [], `Monaco not downloaded; scripts: ${paths(scripts)}`)

  await page.locator("#later").scrollIntoViewIfNeeded()
  await page.waitForSelector("#later .monaco-editor .view-lines")
  const monaco = (await eventually(async () => {
    const found = await monacoScripts(scripts)
    return found.length > 0 && found
  })) || []
  assert.equal(monaco.length, 1, `Monaco downloaded once it was needed; scripts: ${paths(scripts)}`)
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
  const { page, problems, scripts } = await open("/lazy")
  await page.click("#sidebar a[href='/chart']")
  await page.waitForURL(BASE + "/chart")
  await page.waitForSelector("#sales canvas")
  await page.waitForTimeout(1000)

  assert.deepEqual(await monacoScripts(scripts), [], `scripts: ${paths(scripts)}`)
  assert.deepEqual(problems, [])
  await page.close()
})
