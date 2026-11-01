// Code splitting: each library an island loads with `load: () => import(...)`
// is its own file, downloaded only by pages whose islands need it.
// (config/config.exs builds app.js with --splitting; Monaco's workers are a
// second esbuild profile without it, since classic workers can't `import`.)
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

// A class only Monaco's code contains. It's readable in the dev build the
// tests run against; a production build minifies the name away.
const MONACO = "StandaloneCodeEditor"

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// Opens a page and records every script it downloads, and the workers it starts.
async function open(path) {
  const page = await browser.newPage()
  const problems = []
  const scripts = []
  const workers = []
  page.on("pageerror", (e) => problems.push(e.message))
  page.on("console", (m) => { if (isBrowserError(m)) problems.push(m.text()) })
  page.on("worker", (w) => workers.push(new URL(w.url()).pathname))
  // Reading a script's body takes time (Monaco's is several MB): each read
  // is kept, so a test can wait for them before it counts.
  const pending = new Set()
  page.on("response", (res) => {
    if (res.request().resourceType() !== "script") return
    const read = res.text().catch(() => "").then((body) => {
      scripts.push({ path: new URL(res.url()).pathname, bytes: body.length, monaco: body.includes(MONACO) })
    })
    pending.add(read)
    read.finally(() => pending.delete(read))
  })
  const reads = () => Promise.all([...pending])

  await page.goto(BASE + path)
  await page.waitForSelector("[data-phx-main].phx-connected")
  return { page, problems, scripts, workers, reads }
}

test("a page without Monaco doesn't download it", async () => {
  const { page, problems, scripts, reads } = await open("/chart")
  await page.waitForSelector("#sales canvas")
  await page.waitForTimeout(1000)
  await reads()

  assert.ok(scripts.some((s) => s.path.endsWith("/assets/js/app.js")), "app.js loaded")
  assert.deepEqual(scripts.filter((s) => s.monaco).map((s) => s.path), [], "no Monaco")
  assert.deepEqual(problems, [])
  await page.close()
})

test("the Monaco page downloads Monaco, and its workers start", async () => {
  const { page, problems, scripts, workers, reads } = await open("/adapters/monaco")
  await page.waitForSelector("#editor .monaco-editor .view-lines")
  await page.waitForTimeout(1500) // for the workers to start
  await reads()

  const monaco = scripts.filter((s) => s.monaco)
  assert.equal(monaco.length, 1, "one chunk with Monaco")
  assert.match(monaco[0].path, /^\/assets\/js\/chunks\//, "a chunk, not app.js")
  assert.ok(workers.some((w) => w.endsWith("/assets/js/monaco/editor.worker.js")), `workers: ${workers}`)
  assert.deepEqual(problems, [], "no worker errors, no import errors")
  await page.close()
})
