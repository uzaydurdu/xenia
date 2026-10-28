// Browser tests for the official adapters (/adapters/*) and the form with
// editors (/forms), each with its real library.
//
// Start the app first (from examples/):
//   PORT=4002 mix phx.server
// Then, from examples/assets:
//   E2E_URL=http://localhost:4002 npm run e2e

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { chromium } from "playwright"

const BASE = process.env.E2E_URL ?? "http://localhost:4002"
const SETTLE = 500

let browser
before(async () => {
  browser = await chromium.launch({
    // A fake microphone for the audio studio, and audio that may play
    // without a gesture.
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  })
})
after(async () => { await browser?.close() })

async function open(path) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, permissions: ["microphone"] })
  const page = await context.newPage()
  const problems = []
  page.on("pageerror", (e) => problems.push(e.message))
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()) })
  await page.goto(BASE + path)
  await page.waitForSelector("[data-phx-main].phx-connected")
  await page.waitForTimeout(SETTLE)
  return { page, problems, close: () => context.close() }
}

async function click(page, selector) {
  await page.click(selector)
  await page.waitForTimeout(SETTLE)
}

const text = (page, selector) => page.textContent(selector).then((t) => t.trim())
const waitText = (page, selector, pattern) =>
  page.waitForFunction(([s, p]) => new RegExp(p).test(document.querySelector(s)?.textContent ?? ""), [selector, pattern.source], { timeout: 10_000 })

test("D3: marks drawn from server data; a click selects one; the kind switches", async () => {
  const { page, problems, close } = await open("/adapters/d3")

  assert.equal(await page.locator("#orders rect.xenia-d3__mark").count(), 10, "5 months × 2 series")

  await page.locator("#orders rect.xenia-d3__mark").first().click()
  await waitText(page, "#selected", /^(North|South), Jan: \d+$/)

  await click(page, "#highlight")
  await click(page, "#kind-pie")
  assert.equal(await page.locator("#orders rect.xenia-d3__mark").count(), 0, "no bars in a pie")
  assert.ok((await page.locator("#orders path").count()) >= 5, "five slices")

  assert.deepEqual(problems, [])
  await close()
})

test("diff editor: both sides, the diff reported, and edits reach the server", async () => {
  const { page, problems, close } = await open("/adapters/monaco-diff")
  await waitText(page, "#changes", /^Changed blocks: [1-9]/)

  // Type at the end of the right side's last line, "end".
  const lines = Number((await text(page, "#lines")).match(/\d+/)[0])
  await page.locator("#diff .modified-in-monaco-diff-editor .view-line", { hasText: /^end$/ }).click()
  await page.keyboard.press("End")
  await page.keyboard.type("\n# one more line")
  await waitText(page, "#lines", new RegExp(`^The server has ${lines + 1} lines`))

  await click(page, "#next")
  assert.deepEqual(problems, [])
  await close()
})

test("rich text: typing reaches the server; commands insert and replace; read-only works", async () => {
  const { page, problems, close } = await open("/adapters/tiptap")
  const editor = page.locator("#notes .ProseMirror")
  await editor.waitFor()

  await editor.click()
  await page.keyboard.press("ControlOrMeta+End")
  await page.keyboard.type(" More words here.")
  await waitText(page, "#stats", /^\d+ words, \d+ characters$/)
  assert.match(await text(page, "#html"), /More words here/)

  // The toolbar: select everything and make it bold.
  await page.keyboard.press("ControlOrMeta+a")
  await page.click('#notes button[aria-label="Bold"]')
  await waitText(page, "#html", /<strong>/)

  await click(page, "#sign")
  assert.match(await editor.innerText(), /sent with Xenia/)
  await click(page, "#draft")
  assert.equal(await page.locator("#notes .ProseMirror h2").innerText(), "A draft")

  await click(page, "#toggle-editable")
  assert.equal(await editor.getAttribute("contenteditable"), "false")

  assert.deepEqual(problems, [])
  await close()
})

test("date range: the server sets a range, the user picks one, a command opens it", async () => {
  const { page, problems, close } = await open("/adapters/flatpickr")

  await click(page, "#next-week")
  assert.match(await text(page, "#picked"), /^From \d{4}-\d\d-\d\d to \d{4}-\d\d-\d\d\.$/)
  const shown = await page.$$eval("#trip input", (inputs) => inputs.map((input) => input.value))
  assert.ok(shown.some((value) => value.includes(" to ")), `the picker shows the range: ${shown}`)

  // flatpickr puts its calendar at the end of the page, not inside the island.
  await click(page, "#open")
  assert.equal(await page.locator(".flatpickr-calendar.open").count(), 1)

  // Pick a range next month: two days, two clicks.
  await page.click(".flatpickr-calendar.open .flatpickr-next-month")
  const days = page.locator(".flatpickr-calendar.open .flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)")
  await days.nth(2).click()
  await days.nth(6).click()
  await waitText(page, "#picked", /^From \d{4}-\d\d-03 to \d{4}-\d\d-07\.$/)

  assert.deepEqual(problems, [])
  await close()
})

test("tag picker: pick, create, clear", async () => {
  const { page, problems, close } = await open("/adapters/tom-select")
  assert.equal(await text(page, "#value"), "The server has: elixir")

  // Wait for Tom Select's search before pressing Enter.
  await page.click("#langs .ts-control")
  await page.keyboard.type("Gle")
  await page.waitForSelector('.ts-dropdown .option.active:has-text("Gleam")')
  await page.keyboard.press("Enter")
  await waitText(page, "#value", /elixir, gleam$/)

  // Tom Select keeps the search text after a pick: clear it first.
  await page.fill("#langs .ts-control input", "")
  await page.keyboard.type("rust")
  await page.waitForSelector('.ts-dropdown .create:has-text("rust")')
  await page.keyboard.press("Enter")
  await waitText(page, "#value", /elixir, gleam, rust$/)

  await page.keyboard.press("Escape")
  await click(page, "#clear")
  await waitText(page, "#value", /^The server has:\s*$/)

  assert.deepEqual(problems, [])
  await close()
})

test("tag picker: server search through ctx.call, without locking the container", async () => {
  const { page, problems, close } = await open("/adapters/tom-select")

  // Watch LiveView's lock attribute, and the props the server sends.
  await page.evaluate(() => {
    const container = document.getElementById("countries")
    const span = container.querySelector(":scope > [data-xenia-call]")
    window.probe = { containerLocked: 0, callLocked: 0, placeholders: [] }
    new MutationObserver((records) => {
      for (const { target, attributeName } of records) {
        if (attributeName === "data-phx-ref-lock" && target.hasAttribute(attributeName)) {
          if (target === container) window.probe.containerLocked++
          if (target === span) window.probe.callLocked++
        }
        if (target === container && attributeName === "data-xenia-props") {
          window.probe.placeholders.push(JSON.parse(container.dataset.xeniaProps).placeholder)
        }
      }
    }).observe(container, { attributes: true, subtree: true, attributeFilter: ["data-phx-ref-lock", "data-xenia-props"] })
  })

  // Each query's results come from the server's reply.
  const input = page.locator("#countries .ts-control input")
  const options = () => page.locator(".ts-dropdown .option").allTextContents()
  await input.click()
  await input.pressSequentially("and", { delay: 30 })
  await page.waitForFunction(() => document.querySelectorAll(".ts-dropdown .option").length === 5)
  assert.deepEqual((await options()).sort(), ["Finland", "Ireland", "Netherlands", "Poland", "Switzerland"])

  // Fast typing, so several calls are in flight at once.
  await input.fill("")
  await input.pressSequentially("er", { delay: 5 })
  await page.waitForFunction(() => document.querySelectorAll(".ts-dropdown .option").length === 3)
  assert.deepEqual((await options()).sort(), ["Germany", "Netherlands", "Switzerland"])

  await page.keyboard.press("Enter")
  await waitText(page, "#country", /You picked (germany|netherlands|switzerland)\./)

  const probe = await page.evaluate(() => window.probe)
  assert.equal(probe.containerLocked, 0, "the container is never locked")
  assert.ok(probe.callLocked >= 2, `calls push from the call element: ${probe.callLocked}`)
  const counts = probe.placeholders.map((p) => Number(p.match(/\((\d+) searches/)[1]))
  assert.deepEqual(counts, [...counts].sort((a, b) => a - b), `props never go back: ${counts}`)

  assert.deepEqual(problems, [])
  await close()
})

test("half-star rating: a click picks a half star; the server resets it", async () => {
  const { page, problems, close } = await open("/adapters/shoelace-rating")
  const value = () => page.evaluate(() => document.querySelector("#stars sl-rating").value)

  assert.equal(await value(), 3.5)
  const box = await page.locator("#stars sl-rating").boundingBox()
  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height / 2)
  await waitText(page, "#value", /^4\.5 of 5$/)

  await click(page, "#reset")
  assert.equal(await value(), 0)

  assert.deepEqual(problems, [])
  await close()
})

test("sortable lists: a card dragged to the other list moves there on the server", async () => {
  const { page, problems, close } = await open("/adapters/sortable")

  // Drag in small steps, with a pause before letting go: SortableJS checks
  // what's under the pointer as it moves.
  const card = await page.locator("#todo li", { hasText: "Write the README" }).boundingBox()
  const target = await page.locator("#done li").first().boundingBox()
  const from = { x: card.x + 20, y: card.y + card.height / 2 }
  const to = { x: target.x + 40, y: target.y + target.height * 0.75 }

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let step = 1; step <= 25; step++) {
    await page.mouse.move(from.x + ((to.x - from.x) * step) / 25, from.y + ((to.y - from.y) * step) / 25)
    await page.waitForTimeout(25)
  }
  await page.waitForTimeout(150)
  await page.mouse.up()

  await waitText(page, "#server-order", /done .*Write the README/)
  assert.doesNotMatch(await text(page, "#server-order"), /to do [^;]*Write the README/)
  assert.equal(await page.locator("#done li").count(), 2)

  assert.deepEqual(problems, [])
  await close()
})

test("data table: sort by a header, edit a cell, add a row", async () => {
  const { page, problems, close } = await open("/adapters/tabulator")
  const firstName = () => page.locator("#people .tabulator-row").first().locator(".tabulator-cell").first().innerText()

  await page.click('#people .tabulator-col[tabulator-field="age"] .tabulator-col-title')
  await page.waitForTimeout(SETTLE)
  assert.equal(await firstName(), "José", "youngest first")

  await page.locator('#people .tabulator-row:has-text("Ada") .tabulator-cell[tabulator-field="role"]').click()
  await page.keyboard.press("ControlOrMeta+a")
  await page.keyboard.type("Lead")
  await page.keyboard.press("Enter")
  await waitText(page, "#last", /^Row 1: role is now Lead\.$/)

  await click(page, "#add")
  assert.equal(await page.locator("#people .tabulator-row").count(), 4)
  assert.equal(await text(page, "#count"), "The server has 4 rows.")

  assert.deepEqual(problems, [])
  await close()
})

test("calendar: a click on a day adds an event; a click on an event opens it; commands move", async () => {
  const { page, problems, close } = await open("/adapters/calendar")
  assert.equal(await page.locator("#calendar .fc-event").count(), 2)

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const sameMonth = tomorrow.slice(0, 7) === new Date().toISOString().slice(0, 7)
  const day = sameMonth ? tomorrow : new Date().toISOString().slice(0, 10)
  await page.click(`#calendar .fc-daygrid-day[data-date="${day}"] .fc-daygrid-day-frame`)
  await waitText(page, "#count", /^The server has 3 events\.$/)
  assert.equal(await page.locator("#calendar .fc-event").count(), 3)

  await page.locator("#calendar .fc-event", { hasText: "Team sync" }).click()
  await waitText(page, "#opened", /^Team sync, \d{4}-\d\d-\d\d$/)

  const title = await text(page, "#calendar .fc-toolbar-title")
  await click(page, "#next")
  assert.notEqual(await text(page, "#calendar .fc-toolbar-title"), title)
  await click(page, "#today")
  assert.equal(await text(page, "#calendar .fc-toolbar-title"), title)

  assert.deepEqual(problems, [])
  await close()
})

test("map: markers from the server; click one, drag one", async () => {
  const { page, problems, close } = await open("/adapters/map")
  const pins = page.locator("#map .xenia-map-pin")
  assert.equal(await pins.count(), 3)

  await pins.nth(1).click()
  await waitText(page, "#last", /^You clicked Paris\.$/)

  const berlin = await pins.nth(0).boundingBox()
  await page.mouse.move(berlin.x + berlin.width / 2, berlin.y + berlin.height - 6)
  await page.mouse.down()
  await page.mouse.move(berlin.x + 60, berlin.y + 40, { steps: 8 })
  await page.mouse.up()
  await waitText(page, "#last", /^Berlin moved to -?\d+(\.\d+)?, -?\d+(\.\d+)?\.$/)

  await click(page, "#fly-paris")
  assert.deepEqual(problems, [])
  await close()
})

test("terminal: the server greets, echoes, and answers commands", async () => {
  const { page, problems, close } = await open("/adapters/terminal")
  const screen = () => page.evaluate(() => document.querySelector("#terminal .xterm-rows").innerText)
  await page.waitForFunction(() => /Welcome to Xenia/.test(document.querySelector("#terminal .xterm-rows")?.innerText ?? ""))

  // xterm.js draws on the next animation frame, which can lag behind the
  // server's reply on a slow machine (CI), so wait for the screen itself.
  const waitScreen = (pattern) =>
    page.waitForFunction(
      (source) => new RegExp(source).test(document.querySelector("#terminal .xterm-rows").innerText),
      pattern.source,
    )

  await page.click("#terminal .xterm-screen")
  await page.keyboard.type("echo hello from the browser")
  await page.keyboard.press("Enter")
  await waitText(page, "#commands", /^Commands run: 1$/)
  await waitScreen(/\nhello from the browser\n/)
  assert.match(await screen(), /\nhello from the browser\n/)

  await page.keyboard.type("help")
  await page.keyboard.press("Enter")
  await waitText(page, "#commands", /^Commands run: 2$/)
  await waitScreen(/help, date, echo <text>, clear/)
  assert.match(await screen(), /help, date, echo <text>, clear/)

  assert.deepEqual(problems, [])
  await close()
})

test("file uploads: a file added to Uppy reaches the LiveView as an upload", async () => {
  const { page, problems, close } = await open("/adapters/uppy")

  await page.locator("#uploader input.uppy-Dashboard-input").first().setInputFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Hello from a JS island\n"),
  })

  await waitText(page, "#uploaded", /Received hello\.txt \(23 bytes\)/)
  assert.deepEqual(problems, [])
  await close()
})

test("audio waveform: loads, plays and pauses, and shows the server's region", async () => {
  const { page, problems, close } = await open("/adapters/wavesurfer")
  await waitText(page, "#duration", /^Loaded: 2\.0 seconds\.$/)

  await click(page, "#play-pause")
  await waitText(page, "#state", /playing/)
  await click(page, "#play-pause")
  await waitText(page, "#state", /paused/)

  await click(page, "#mark")
  const region = page.locator('#wave [part~="region"]')
  assert.equal(await region.count(), 1)
  await region.click()
  await waitText(page, "#clicked", /^You clicked the region Middle\.$/)

  assert.deepEqual(problems, [])
  await close()
})

test("audio studio: two tracks load; a recording from the (fake) microphone", async () => {
  const { page, problems, close } = await open("/adapters/multitrack")
  await waitText(page, "#ready", /^Tracks ready: intro, echo/)

  await click(page, "#record")
  await waitText(page, "#recording", /started/)
  await page.waitForTimeout(1200)
  await click(page, "#stop")
  await waitText(page, "#recorded", /^Recorded \d+(\.\d)? s, \d+ bytes\.$/)

  assert.deepEqual(problems, [])
  await close()
})

test("a form with editors: errors once used, and every field submitted", async () => {
  const { page, problems, close } = await open("/forms")

  // Saving the empty form shows each field's error.
  await click(page, "#post-form button.btn-primary")
  for (const field of ["code", "body", "due"]) {
    assert.ok((await page.locator(`#${field}-errors p`).count()) > 0, `${field} shows its error`)
  }

  await page.fill("#post_title", "Hello Xenia")

  await page.click("#post_code .view-lines")
  await page.keyboard.type("IO.puts(:hello)")

  await page.click("#post_body .ProseMirror")
  await page.keyboard.type("A post with rich text.")

  await page.locator("#post_due input").last().click()
  await page.click(".flatpickr-calendar.open .flatpickr-next-month")
  await page.locator(".flatpickr-calendar.open .flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)").nth(9).click()

  await page.click("#post_tags .ts-control")
  await page.keyboard.type("Phoen")
  await page.waitForSelector('.ts-dropdown .option.active:has-text("Phoenix")')
  await page.keyboard.press("Enter")
  await page.keyboard.press("Escape")

  const stars = await page.locator("#post_priority sl-rating").boundingBox()
  await page.mouse.click(stars.x + stars.width * 0.7, stars.y + stars.height / 2)

  await page.waitForTimeout(800)
  await click(page, "#post-form button.btn-primary")

  await waitText(page, "#saved", /Title: Hello Xenia/)
  const saved = await text(page, "#saved")
  assert.match(saved, /Code: 1 lines/)
  assert.match(saved, /Body: A post with rich text\./)
  assert.match(saved, /Publish on: \d{4}-\d\d-10/)
  assert.match(saved, /Tags: phoenix/)
  assert.match(saved, /Priority: 4 of 5/)

  assert.deepEqual(problems, [])
  await close()
})
