// Browser tests for an island's lifecycle: navigation, several islands of
// one kind, persistent parts, leaving while loading, and leaks. Unit tests
// with fake libraries can't see these; real Monaco and LiveView can.
//
// Start the app first (from examples/):
//   PORT=4002 mix phx.server
// Then, from examples/assets:
//   E2E_URL=http://localhost:4002 npm run e2e

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { chromium } from "playwright"

const BASE = process.env.E2E_URL ?? "http://localhost:4002"
const SETTLE = 400
const ROUND_TRIP = 900 // more than Monaco's 300 ms change debounce, plus a reply

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

async function open(path, { settle = SETTLE } = {}) {
  const page = await browser.newPage()
  const problems = []
  page.on("pageerror", (e) => problems.push(e.message))
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()) })
  await page.goto(BASE + path)
  await connected(page, settle)
  return { page, problems }
}

async function connected(page, settle = SETTLE) {
  await page.waitForSelector("[data-phx-main].phx-connected")
  await page.waitForTimeout(settle)
}

// Follows a live link and waits for the next page to connect.
async function go(page, selector, path) {
  await page.click(selector)
  await page.waitForURL(BASE + path)
  await connected(page)
}

const editorReady = (page, id) => page.waitForSelector(`#${id} .monaco-editor .view-lines`)

// The Xenia instance of the island `id`, in any LiveView on the page
// (persistent parts are LiveViews of their own).
const IN_PAGE_INSTANCE = (id) => {
  for (const view of Object.values(window.liveSocket.roots)) {
    for (const hook of Object.values(view.viewHooks)) {
      if (hook.el.id === id) return hook._xeniaController?.instance ?? null
    }
  }
  return null
}

// Runs `fn(editor, monaco)` in the page on the island's Monaco editor.
const onEditor = (page, id, fn) =>
  page.evaluate(
    async ([find, id, src]) => {
      const instance = new Function(`return (${find})`)()(id)
      const raw = await instance.raw()
      return new Function("editor", "monaco", `return (${src})(editor, monaco)`)(raw.editor, raw.monaco)
    },
    [IN_PAGE_INSTANCE.toString(), id, fn.toString()],
  )

// Records every event Xenia pushes, with whether LiveView was connected.
// Xenia pushes through liveSocket.execJS (CLAUDE.md §4 Events).
const recordPushes = (page) =>
  page.evaluate(() => {
    const execJS = window.liveSocket.execJS.bind(window.liveSocket)
    window.__pushes = []
    window.liveSocket.execJS = (el, encoded, ...rest) => {
      for (const [command, args] of JSON.parse(encoded)) {
        if (command === "push") {
          window.__pushes.push(`${args.event} connected=${window.liveSocket.main.isConnected()}`)
        }
      }
      return execJS(el, encoded, ...rest)
    }
  })

test("an edit typed just before leaving reaches the server while LiveView is still connected", async () => {
  const { page, problems } = await open("/two-editors")
  await editorReady(page, "editor-a")
  await recordPushes(page)

  await page.click("#editor-a .view-line >> nth=0")
  await page.keyboard.type("Z")
  // Leave within Monaco's 300 ms debounce: Xenia sends the change when
  // navigation starts, before LiveView disconnects the page.
  await page.click("#sidebar a[href='/chart']")
  await page.waitForURL(BASE + "/chart")
  await page.waitForTimeout(1500)

  assert.deepEqual(await page.evaluate(() => window.__pushes), ["a_changed connected=true"])
  assert.deepEqual(problems, [])
  await page.close()
})

test("rapid navigation between editor pages leaves one working set of editors, and no errors", async () => {
  const { page, problems } = await open("/two-editors")
  await editorReady(page, "editor-a")

  const links = ["/adapters/monaco", "/two-editors"]
  for (let i = 0; i < 6; i++) {
    await page.click(`#sidebar a[href='${links[i % 2]}']`)
    await page.waitForTimeout(60)
  }
  await page.waitForURL(BASE + "/two-editors")
  await connected(page, 2000)

  assert.equal(await page.locator(".monaco-editor").count(), 2, "the two editors, nothing left over")
  await page.click("#editor-b .view-line >> nth=0")
  await page.keyboard.press("End")
  await page.keyboard.type("Q")
  assert.match(await onEditor(page, "editor-b", (e) => e.getModel().getLineContent(1)), /Q$/)
  assert.deepEqual(problems, [])
  await page.close()
})

test("two editors: a command and the events stay with their own editor", async () => {
  const { page, problems } = await open("/two-editors")
  await editorReady(page, "editor-a")
  await editorReady(page, "editor-b")
  const value = (id) => onEditor(page, id, (e) => e.getValue())

  await page.click("#insert-editor-a")
  await page.waitForTimeout(ROUND_TRIP)
  assert.match(await value("editor-a"), /inserted into editor-a/, "A received its command")
  assert.doesNotMatch(await value("editor-b"), /inserted/, "B did not")
  assert.match(await page.textContent("#server-editor-a"), /inserted into editor-a/, "A's change went to a_changed")

  await page.click("#editor-b .view-line >> nth=0")
  await page.keyboard.press("End")
  await page.keyboard.type(" typed in B")
  await page.waitForTimeout(ROUND_TRIP)
  assert.match(await page.textContent("#server-editor-b"), /typed in B/, "B's change went to b_changed")
  assert.doesNotMatch(await page.textContent("#server-editor-a"), /typed in B/, "A's copy is untouched")
  assert.deepEqual(problems, [])
  await page.close()
})

test("a persistent part keeps its editor across pages: the same process, instance, text and undo", async () => {
  const { page, problems } = await open("/scratchpad")
  await editorReady(page, "scratchpad-editor")
  const pid = () => page.getAttribute("#scratchpad", "data-pid")
  const first = await pid()
  await page.evaluate(([find]) => { window.__scratchpad = new Function(`return (${find})`)()("scratchpad-editor") }, [IN_PAGE_INSTANCE.toString()])
  const same = () =>
    page.evaluate(([find]) => new Function(`return (${find})`)()("scratchpad-editor") === window.__scratchpad, [IN_PAGE_INSTANCE.toString()])

  await page.click("#scratchpad-editor .view-line >> nth=0")
  await page.keyboard.type("on call")
  await page.waitForTimeout(ROUND_TRIP)

  for (const [link, path, heading] of [
    ["#to-second", "/scratchpad/second", "The second page"],
    ["#to-first", "/scratchpad", "An editor that stays open"],
    ["#to-second", "/scratchpad/second", "The second page"],
  ]) {
    await go(page, link, path)
    assert.equal(await page.textContent("#page h1"), heading, `${path}: a new page`)
    assert.equal(await pid(), first, `${path}: the same scratchpad process`)
    assert.ok(await same(), `${path}: the same editor instance`)
    assert.equal(await onEditor(page, "scratchpad-editor", (e) => e.getValue()), "on call", `${path}: its text`)
    assert.ok(await onEditor(page, "scratchpad-editor", (e) => e.getModel().canUndo()), `${path}: its undo history`)
  }

  // Leaving the scratchpad's pages ends it; coming back starts a fresh one.
  await go(page, "#sidebar a[href='/chart']", "/chart")
  assert.equal(await page.locator("#scratchpad").count(), 0)
  await go(page, "#sidebar a[href='/scratchpad']", "/scratchpad")
  await editorReady(page, "scratchpad-editor")
  assert.notEqual(await pid(), first, "a new scratchpad process")
  assert.equal(await onEditor(page, "scratchpad-editor", (e) => e.getValue()), "")
  assert.deepEqual(problems, [])
  await page.close()
})

test("leaving a page while its islands are still loading: no errors, nothing drawn later, no on_crash", async () => {
  // /loading has two slow islands: one loads in 1.5 s, the other fails its
  // first load after 0.6 s and reports it with on_crash. Leave before either.
  const { page, problems } = await open("/loading", { settle: 0 })
  await recordPushes(page)
  await page.evaluate(() => {
    window.__drawn = 0
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) if (node.classList?.contains("loaded")) window.__drawn++
      }
    }).observe(document.body, { childList: true, subtree: true })
    window.liveSocket.enableLatencySim(500)
  })
  assert.equal(await page.locator("#slow [data-xenia-loading]:visible").count(), 1, "still loading")

  await page.click("#sidebar a[href='/chart']")
  await page.waitForURL(BASE + "/chart")
  await page.waitForTimeout(2500) // longer than both islands' loading

  assert.equal(await page.evaluate(() => window.__drawn), 0, "no island was drawn after leaving")
  assert.deepEqual(
    (await page.evaluate(() => window.__pushes)).filter((p) => p.startsWith("crashed")),
    [],
    "no on_crash for an island that's gone",
  )
  await page.evaluate(() => window.liveSocket.disableLatencySim())
  assert.deepEqual(problems, [])
  await page.close()
})

test("no leaks across 50 navigations between pages with editors and a chart", async () => {
  const { page, problems } = await open("/two-editors")
  await editorReady(page, "editor-b")
  const cdp = await page.context().newCDPSession(page)

  const heap = async () => {
    await cdp.send("HeapProfiler.collectGarbage")
    return (await cdp.send("Runtime.getHeapUsage")).usedSize
  }
  // What's alive in the browser: the Xenia islands LiveView still knows
  // about, and Monaco's own lists of editors and models. Monaco keeps every
  // editor that wasn't disposed, so a leaked one shows up here.
  const alive = () =>
    page.evaluate(async () => {
      let islands = 0
      let monaco = null
      for (const view of Object.values(window.liveSocket.roots)) {
        for (const hook of Object.values(view.viewHooks)) {
          if (!hook._xeniaController) continue
          islands++
          monaco ??= (await hook._xeniaController.instance?.raw?.())?.monaco
        }
      }
      return {
        islands,
        editors: monaco?.editor.getEditors().length,
        models: monaco?.editor.getModels().length,
      }
    })

  const start = await alive()
  assert.deepEqual(start, { islands: 2, editors: 2, models: 2 }, "two editors, two models")

  let warm = 0
  for (let i = 1; i <= 50; i++) {
    const to = i % 2 ? "/chart" : "/two-editors"
    await page.click(`#sidebar a[href='${to}']`)
    await page.waitForURL(BASE + to)
    await connected(page, 150)
    if (to === "/two-editors") {
      await editorReady(page, "editor-b")
      assert.deepEqual(await alive(), start, `navigation ${i}: no editors or models left over`)
    }
    if (i === 10) warm = await heap()
  }

  const grown = (await heap()) - warm
  console.log(`  heap after 10 navigations: ${(warm / 1e6).toFixed(1)} MB; growth over the next 40: ${(grown / 1e6).toFixed(1)} MB`)
  // A leaked Monaco editor costs megabytes; 20 of them would show clearly.
  assert.ok(grown < 15e6, `the heap levels off (grew ${(grown / 1e6).toFixed(1)} MB)`)
  assert.deepEqual(problems, [])
  await page.close()
})
