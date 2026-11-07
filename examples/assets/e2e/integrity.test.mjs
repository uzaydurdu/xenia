// Lifecycle integrity: what happens to islands when things go wrong. The
// lifecycle guard's Stage A tests (docs: CLAUDE.md §6 "Lifecycle
// integrity"), on the /integrity test fixture. Every island there uses one
// probe adapter, which records in window.__integrity each mount, update,
// command and destroy Xenia asks of it.
//
// Tests marked `todo` state a guarantee Xenia doesn't keep yet: they run
// and report, without failing the suite. Drop `todo` once it's fixed.
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

async function open(path = "/integrity") {
  const page = await browser.newPage()
  const problems = []
  page.on("pageerror", (e) => problems.push(e.message))
  page.on("console", (m) => { if (isBrowserError(m)) problems.push(m.text()) })
  await page.goto(BASE + path)
  await page.waitForSelector("[data-phx-main].phx-connected")
  await page.waitForFunction(() => window.__integrity?.events.includes("ready emitter #5"))
  const cdp = await page.context().newCDPSession(page)
  return { page, problems, cdp }
}

// The probe's log, from entry `from` on.
const events = (page, from = 0) => page.evaluate((from) => window.__integrity.events.slice(from), from)
const count = (page) => page.evaluate(() => window.__integrity.events.length)
const alive = (page) => page.evaluate(() => window.__integrity.alive.slice())
const until = (page, entry) =>
  page.waitForFunction((entry) => window.__integrity.events.includes(entry), entry)

// The Xenia hooks LiveView holds, by id, "(detached)" when out of the page.
const hooks = (page) =>
  page.evaluate(() => {
    const ids = []
    for (const view of Object.values(window.liveSocket.roots))
      for (const hook of Object.values(view.viewHooks))
        if (hook._xeniaController) ids.push(hook.el.id + (hook.el.isConnected ? "" : " (detached)"))
    return ids.sort()
  })

// keydown listeners on document, as DevTools sees them: each probe instance
// adds one, and only its destroy removes it.
async function keydownListeners(cdp) {
  const { result } = await cdp.send("Runtime.evaluate", { expression: "document" })
  const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId })
  await cdp.send("Runtime.releaseObject", { objectId: result.objectId })
  return listeners.filter((listener) => listener.type === "keydown").length
}

// Calls `ctx.emit` on the probe instance of island `id`.
const emit = (page, id, event, payload) =>
  page.evaluate(([id, event, payload]) => {
    for (const view of Object.values(window.liveSocket.roots))
      for (const hook of Object.values(view.viewHooks))
        if (hook.el.id === id && hook._xeniaController)
          return hook._xeniaController.instance.ctx.emit(event, payload)
  }, [id, event, payload])

const text = (page, selector) => page.textContent(selector).then((t) => t.trim())

test("A: an island toggled by :if is destroyed once, then mounted clean", async () => {
  const { page, problems, cdp } = await open()
  const start = { hooks: await hooks(page), listeners: await keydownListeners(cdp) }

  let from = await count(page)
  await page.click("#toggle")
  await until(page, "destroy toggled #1 (1)")
  assert.deepEqual(await events(page, from), ["destroy toggled #1 (1)"])
  assert.ok(!(await hooks(page)).includes("toggled"))
  assert.equal(await keydownListeners(cdp), start.listeners - 1)

  from = await count(page)
  await page.click("#toggle")
  await until(page, "mount-microtask toggled #6")
  assert.deepEqual(await events(page, from), [
    "mount toggled #6",
    "ready toggled #6",
    "mount-microtask toggled #6",
  ])
  assert.deepEqual(await hooks(page), start.hooks)
  assert.equal(await keydownListeners(cdp), start.listeners)
  assert.deepEqual(problems, [])
  await page.close()
})

// Also the evidence for the identity diagnostics (decision 4): within one
// patch, the new root's mount runs first and the old root's destroy follows,
// both before a microtask queued by the mount. So one microtask can pair
// them, with no LiveSocket option and no observer.
test("B: an id that changes on every render remounts; a stable id updates; one microtask sees both", async () => {
  const { page, problems } = await open()

  const from = await count(page)
  await page.click("#rerender")
  await until(page, "mount-microtask unstable-1 #6")
  const log = await events(page, from)

  assert.deepEqual(log.filter((e) => e.startsWith("update stable")), ["update stable #2 renders=1"])
  assert.ok(!log.some((e) => e.startsWith("mount stable") || e.startsWith("destroy stable")))

  const mount = log.indexOf("mount unstable-1 #6")
  const destroy = log.indexOf("destroy unstable-0 #3 (1)")
  const microtask = log.indexOf("mount-microtask unstable-1 #6")
  assert.ok(mount >= 0 && mount < destroy && destroy < microtask, log.join("\n"))

  assert.deepEqual(problems, [])
  await page.close()
})

test("C: a root removed by outside JavaScript: its controller lives until navigation, then is destroyed once", async () => {
  const { page, problems, cdp } = await open()
  const listeners = await keydownListeners(cdp)

  await page.evaluate(() => document.getElementById("victim").remove())
  await page.click("#rerender")
  await until(page, "mount-microtask victim #7")

  // Today: no destroy for the removed root, so its library keeps its
  // listener, and the next render mounts a second instance with its id.
  assert.ok(!(await events(page)).some((e) => e.startsWith("destroy victim #4")))
  assert.deepEqual(await alive(page).then((a) => a.filter((n) => n.startsWith("victim"))), ["victim #4", "victim #7"])
  assert.ok((await hooks(page)).includes("victim (detached)"))
  assert.equal(await keydownListeners(cdp), listeners + 1)

  // Navigation destroys every hook, the detached one too, each once.
  await page.click("#sidebar a[href='/chart']")
  await page.waitForURL(BASE + "/chart")
  await until(page, "destroy victim #4 (1)")
  const destroys = (await events(page)).filter((e) => e.startsWith("destroy "))
  assert.ok(destroys.every((e) => e.endsWith("(1)")), destroys.join("\n"))
  assert.deepEqual(await alive(page), [])
  assert.equal(await keydownListeners(cdp), 0)

  assert.deepEqual(problems, [])
  await page.close()
})

test("C: a root removed by outside JavaScript is cleaned up once the patch settles",
  { todo: "Stage D: the controller is only destroyed at the next navigation" },
  async () => {
    const { page, cdp } = await open()
    const listeners = await keydownListeners(cdp)

    await page.evaluate(() => document.getElementById("victim").remove())
    await page.click("#rerender")
    await until(page, "mount-microtask victim #7")

    assert.ok((await events(page)).includes("destroy victim #4 (1)"))
    assert.equal(await keydownListeners(cdp), listeners)
    await page.close()
  })

test("C: a command reaches only the current instance for its id (CLAUDE.md §4 Commands)",
  { todo: "a detached controller still runs commands: Controller.command() doesn't check that its root is in the page" },
  async () => {
    const { page } = await open()

    await page.evaluate(() => document.getElementById("victim").remove())
    await page.click("#rerender")
    await until(page, "mount-microtask victim #7")

    const from = await count(page)
    await page.click("#ping-victim")
    await until(page, "ping victim #7")
    await page.waitForTimeout(200)
    assert.deepEqual(await events(page, from), ["ping victim #7"])
    await page.close()
  })

test("D: a value, then null, then no value: the server and the conditional UI follow", async () => {
  const { page, problems } = await open()

  await emit(page, "emitter", "change", { value: "x" })
  await page.waitForSelector("#has-value")
  assert.equal(await text(page, "#params"), '%{"value" => "x"}')

  // null arrives as nil, not as a missing key.
  await emit(page, "emitter", "change", { value: null })
  await page.waitForSelector("#has-value", { state: "detached" })
  assert.equal(await text(page, "#params"), '%{"value" => nil}')

  await emit(page, "emitter", "change", {})
  await page.waitForFunction(() => document.querySelector("#params").textContent.trim() === "%{}")

  assert.deepEqual(problems, [])
  await page.close()
})

test("D: an event the page doesn't bind is dropped silently: no push, no message", async () => {
  const { page, problems } = await open()
  const messages = []
  page.on("console", (m) => { if (!m.text().includes("📡")) messages.push(m.text()) })
  await page.evaluate(() => {
    window.__pushes = []
    const execJS = window.liveSocket.execJS.bind(window.liveSocket)
    window.liveSocket.execJS = (el, encoded, ...rest) => {
      for (const [command, args] of JSON.parse(encoded)) if (command === "push") window.__pushes.push(args.event)
      return execJS(el, encoded, ...rest)
    }
  })

  await emit(page, "emitter", "unbound", { value: 1 })
  await page.waitForTimeout(300)

  assert.deepEqual(await page.evaluate(() => window.__pushes), [])
  assert.deepEqual(messages.filter((m) => m.includes("unbound")), [])
  assert.deepEqual(problems, [])
  await page.close()
})

// The push gets no reply (category 3), and nothing in the browser says why:
// LiveView rejoins quietly. The islands stay mounted; the server's fresh
// assigns arrive as ordinary prop updates.
test("D: an event with no handle_event clause crashes the LiveView; it rejoins, and the islands stay", async () => {
  const { page, problems } = await open()

  await page.click("#rerender")
  await page.waitForFunction(() => document.querySelector("#renders").textContent.includes("1"))
  await emit(page, "emitter", "change", { value: "x" })
  await page.waitForSelector("#has-value")

  const from = await count(page)
  await emit(page, "emitter", "broken", { value: 1 })
  await until(page, "update stable #2 renders=0")
  await page.waitForSelector("[data-phx-main].phx-connected")

  // The server started over from mount...
  assert.equal(await text(page, "#renders"), "Renders: 0")
  assert.equal(await text(page, "#value"), ":unset")

  // ...and the islands with stable ids weren't remounted.
  const log = await events(page, from)
  for (const id of ["stable", "victim", "emitter", "toggled"]) {
    assert.ok(!log.some((e) => e.startsWith(`mount ${id} `) || e.startsWith(`destroy ${id} `)), log.join("\n"))
  }

  assert.deepEqual(problems, [])
  await page.close()
})

test("F: a slow mount removed before it ends is destroyed once, as soon as it resolves", async () => {
  const { page, problems, cdp } = await open()
  const listeners = await keydownListeners(cdp)

  const from = await count(page)
  await page.click("#toggle-slow")
  await until(page, "mount slow #6")
  await page.click("#toggle-slow")
  await until(page, "destroy slow #6 (1)")

  assert.deepEqual(await events(page, from), [
    "mount slow #6",
    "mount-microtask slow #6",
    "ready slow #6",
    "destroy slow #6 (1)",
  ])
  assert.ok(!(await alive(page)).some((name) => name.startsWith("slow")))
  assert.equal(await keydownListeners(cdp), listeners)
  assert.deepEqual(problems, [])
  await page.close()
})

test("F: toggled ten times quickly, every instance is destroyed once, and one is left", async () => {
  const { page, problems, cdp } = await open()
  const listeners = await keydownListeners(cdp)

  const from = await count(page)
  for (let i = 0; i < 10; i++) await page.click("#toggle")
  await page.waitForFunction(() => document.querySelector("#toggled"))
  await page.waitForTimeout(500)

  const log = await events(page, from)
  const mounts = log.filter((e) => e.startsWith("mount toggled"))
  const destroys = log.filter((e) => e.startsWith("destroy toggled"))
  assert.equal(destroys.length, mounts.length, log.join("\n")) // the first instance, and all but the last new one
  assert.ok(destroys.every((e) => e.endsWith("(1)")))
  assert.deepEqual(await alive(page).then((a) => a.filter((n) => n.startsWith("toggled"))).then((a) => a.length), 1)
  assert.equal(await keydownListeners(cdp), listeners)
  assert.deepEqual(problems, [])
  await page.close()
})
