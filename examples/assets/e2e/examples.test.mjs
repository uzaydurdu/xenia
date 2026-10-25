// Browser tests for every example page.
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

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// Opens a page, waits for LiveView, and collects browser errors.
async function open(path) {
  const page = await browser.newPage()
  const problems = []
  page.on("pageerror", (e) => problems.push(e.message))
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()) })
  await page.goto(BASE + path)
  await connected(page)
  return { page, problems }
}

async function connected(page) {
  await page.waitForSelector("[data-phx-main].phx-connected")
  await page.waitForTimeout(SETTLE)
}

async function click(page, selector) {
  await page.click(selector)
  await page.waitForTimeout(SETTLE)
}

const text = (page, selector) => page.textContent(selector).then((t) => t.trim())

// Marks an element, to check later that it is the same element (not rebuilt).
const mark = (page, selector) =>
  page.evaluate((s) => { document.querySelector(s).__marked = true }, selector)
const marked = (page, selector) =>
  page.evaluate((s) => document.querySelector(s)?.__marked === true, selector)

// The colour of one pixel of a canvas, at a fraction of its width and height.
const pixel = (page, selector, fx, fy) =>
  page.evaluate(([s, fx, fy]) => {
    const canvas = document.querySelector(s)
    const x = Math.floor(canvas.width * fx)
    const y = Math.floor(canvas.height * fy)
    return Array.from(canvas.getContext("2d").getImageData(x, y, 1, 1).data.slice(0, 3))
  }, [selector, fx, fy])

test("home lists every example, and the sidebar stays alive across pages", async () => {
  const { page, problems } = await open("/")

  assert.equal(await page.locator(".examples li").count(), 29)
  assert.equal(await text(page, "#pages-seen"), "1")
  await mark(page, "#sidebar")

  await click(page, "#sidebar a[href='/chart']")
  await connected(page)
  await click(page, "#sidebar a[href='/rating']")
  await connected(page)

  assert.equal(await text(page, "#pages-seen"), "3")
  assert.equal(await marked(page, "#sidebar"), true, "the sidebar was not rebuilt")
  assert.equal(await page.getAttribute("#sidebar a[href='/rating']", "data-active"), "true")
  assert.deepEqual(problems, [])
  await page.close()
})

test("chart: props, events, commands, and a remount for a new type", async () => {
  const { page, problems } = await open("/chart")
  await mark(page, "#sales canvas")

  // Props: new data reaches the same chart.
  const before = await page.getAttribute("#sales", "data-xenia-props")
  await click(page, "#new-numbers")
  assert.notEqual(await page.getAttribute("#sales", "data-xenia-props"), before)
  assert.equal(await marked(page, "#sales canvas"), true)

  // Events: a click on the chart reaches the LiveView.
  await click(page, "#sales canvas")
  assert.match(await text(page, "#clicked"), /^You clicked (Jan|Feb|Mar|Apr|May|Jun)\.$/)

  // Commands: no error, and the chart is still the same.
  await click(page, "#highlight-march")
  assert.equal(await marked(page, "#sales canvas"), true)

  // A new type rebuilds the chart (ctx.remount).
  await click(page, "#switch-type")
  assert.equal(await marked(page, "#sales canvas"), false)
  assert.match(await text(page, "#switch-type"), /bar chart/)

  assert.deepEqual(problems, [])
  await page.close()
})

// --- The official Chart.js adapter (/adapters/chartjs) -------------------------------

// Every pixel of one canvas row, at a fraction of its height: [r, g, b, a].
const canvasRow = (page, selector, fy) =>
  page.evaluate(([s, fy]) => {
    const canvas = document.querySelector(s)
    const y = Math.floor(canvas.height * fy)
    const data = canvas.getContext("2d").getImageData(0, y, canvas.width, 1).data
    return Array.from({ length: canvas.width }, (_, x) => Array.from(data.slice(x * 4, x * 4 + 4)))
  }, [selector, fy])

// The adapter's palette: Sales and Costs in light mode, Sales in dark mode.
const near = ([r, g, b], [R, G, B]) => Math.abs(r - R) + Math.abs(g - G) + Math.abs(b - B) < 30
const SALES_LIGHT = [79, 70, 229]
const COSTS_LIGHT = [8, 145, 178]
const SALES_DARK = [129, 140, 248]

// The x positions (CSS pixels, page coordinates) where a row shows a color.
async function columnsOf(page, selector, fy, color) {
  const row = await canvasRow(page, selector, fy)
  const box = await page.locator(selector).boundingBox()
  const scale = box.width / row.length
  return row
    .map((pixel, x) => (pixel[3] > 150 && near(pixel, color) ? box.x + x * scale : null))
    .filter((x) => x !== null)
}

test("Chart.js adapter: configured with a plugin, defaults and setup, without copying it", async () => {
  const { page, problems } = await open("/adapters/chartjs")
  const canvas = "#official canvas"
  await click(page, "[data-phx-theme=light]")

  // setup(chart) named the chart for screen readers.
  assert.equal(await page.getAttribute(canvas, "aria-label"), "Chart of Sales and Costs")

  // Our plugin painted the plot area: an empty spot above January is
  // tinted, not transparent.
  const row = await canvasRow(page, canvas, 0.2)
  const [, , , alpha] = row[Math.floor(row.length * 0.12)]
  assert.ok(alpha > 0 && alpha < 60, `the plot background is drawn (alpha ${alpha})`)

  // Both datasets in the light palette.
  assert.ok((await columnsOf(page, canvas, 0.8, SALES_LIGHT)).length > 0)
  assert.ok((await columnsOf(page, canvas, 0.8, COSTS_LIGHT)).length > 0)

  // The app's theme reaches it through consumes: ["theme"].
  await click(page, "[data-phx-theme=dark]")
  assert.ok((await columnsOf(page, canvas, 0.8, SALES_DARK)).length > 0, "dark palette")
  await click(page, "[data-phx-theme=light]")

  assert.deepEqual(problems, [])
  await page.close()
})

test("Chart.js adapter: events, commands and a type change", async () => {
  const { page, problems } = await open("/adapters/chartjs")
  const canvas = "#official canvas"
  await click(page, "[data-phx-theme=light]")
  const box = await page.locator(canvas).boundingBox()
  const barY = box.y + box.height * 0.8

  // Events: a click on the first Sales bar.
  const [firstSales] = await columnsOf(page, canvas, 0.8, SALES_LIGHT)
  await page.mouse.click(firstSales + 4, barY)
  await page.waitForTimeout(SETTLE)
  assert.equal(await text(page, "#clicked"), "Sales, Jan: 40")

  // Commands: hide the Costs dataset, then show it again.
  await click(page, "#toggle-costs")
  assert.equal((await columnsOf(page, canvas, 0.8, COSTS_LIGHT)).length, 0, "costs hidden")
  await click(page, "#toggle-costs")
  assert.ok((await columnsOf(page, canvas, 0.8, COSTS_LIGHT)).length > 0, "costs shown")

  // Events: a click on the legend's Costs entry hides it, and says so.
  const [legendCosts] = await columnsOf(page, canvas, 0.04, COSTS_LIGHT)
  await page.mouse.click(legendCosts + 3, box.y + box.height * 0.04)
  await page.waitForTimeout(SETTLE)
  assert.equal(await text(page, "#legend"), "Costs hidden")

  await click(page, "#highlight-march")

  // A new type rebuilds the chart: no more filled bars.
  await click(page, "#switch-type")
  assert.match(await text(page, "#switch-type"), /bars/)
  assert.equal((await columnsOf(page, canvas, 0.8, SALES_LIGHT)).length < 10, true, "lines, not bars")

  assert.deepEqual(problems, [])
  await page.close()
})

test("Chart.js adapter: extended by spreading, it reports a total", async () => {
  const { page, problems } = await open("/adapters/chartjs")
  const sum = async () => {
    const props = JSON.parse(await page.getAttribute("#revenue", "data-xenia-props"))
    return props.data.datasets.flatMap((d) => d.data).reduce((a, b) => a + b, 0)
  }

  assert.equal(await text(page, "#total"), `The adapter reports a total of ${await sum()}.`)

  await click(page, "#new-numbers")
  assert.equal(await text(page, "#total"), `The adapter reports a total of ${await sum()}.`)

  assert.deepEqual(problems, [])
  await page.close()
})

test("date picker: a form field the server can fill, with errors and a command", async () => {
  const { page, problems } = await open("/date-picker")
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

  // Saving an empty form shows both errors.
  await click(page, "#task-form button")
  assert.match(await text(page, "#task-form"), /Give the task a name/)
  assert.match(await text(page, "#due-errors"), /Pick a date/)

  // The server fills the date; the picker shows it.
  await click(page, "#pick-tomorrow")
  assert.equal(await page.inputValue("#task_due .flatpickr-input"), tomorrow)

  // A command opens the calendar.
  await click(page, "#open-calendar")
  assert.equal(await page.locator("#task_due .flatpickr-calendar.open").count(), 1)
  await page.keyboard.press("Escape")

  // The picked date is submitted with the form.
  await page.fill("#task_title", "Write the release notes")
  await page.waitForTimeout(SETTLE)
  await click(page, "#task-form button")
  assert.equal(await text(page, "#saved"), `Saved: "Write the release notes" is due on ${tomorrow}.`)

  assert.deepEqual(problems, [])
  await page.close()
})

test("rating: a web component, with no prop code", async () => {
  const { page, problems } = await open("/rating")
  const value = () => page.evaluate(() => document.querySelector("#stars sl-rating").value)

  assert.equal(await value(), 3)

  // Shoelace handles clicks on its row of stars: click where the 5th one is.
  const box = await page.locator("#stars sl-rating").boundingBox()
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2)
  await page.waitForTimeout(SETTLE)
  assert.equal(await text(page, "#rated"), "The server has: 5 of 5.")

  // The server changes the props; Xenia sets them on the element.
  await click(page, "#reset")
  assert.equal(await value(), 0)
  await click(page, "#more-stars")
  assert.equal(await page.evaluate(() => document.querySelector("#stars sl-rating").max), 10)

  assert.deepEqual(problems, [])
  await page.close()
})

test("theme: one chart follows the app's theme, the pinned one stays light", async () => {
  const { page, problems } = await open("/theme")

  // A point inside Friday's bar, the tallest one. Its green channel tells
  // the colours apart: light #7c3aed has 58, dark #a78bfa has 139.
  const green = async (id) => (await pixel(page, `#${id} canvas`, 0.88, 0.85))[1]

  await click(page, "[data-phx-theme=light]")
  assert.ok(await green("follows") < 100)
  assert.ok(await green("pinned") < 100)

  await click(page, "[data-phx-theme=dark]")
  assert.ok(await green("follows") > 100, "the first chart turned dark")
  assert.ok(await green("pinned") < 100, "the pinned chart stayed light")

  await click(page, "[data-phx-theme=light]")
  assert.deepEqual(problems, [])
  await page.close()
})

test("code editor: changes reach the server, commands and reset work, our theme and snippets", async () => {
  const { page, problems } = await open("/adapters/monaco")
  await page.waitForSelector("#editor .monaco-editor")
  const code = () => page.evaluate(() => document.querySelector("#editor .view-lines").innerText)

  // Typing reaches the server.
  assert.equal(await text(page, "#lines"), "The server has 4 lines.")
  await page.click("#editor .view-lines")
  await page.keyboard.press("ControlOrMeta+End")
  await page.keyboard.type("\n# one more line")
  await page.waitForTimeout(800)
  assert.equal(await text(page, "#lines"), "The server has 5 lines.")

  // A command inserts text at the cursor.
  await click(page, "#insert")
  assert.match(await code(), /IO\.inspect\(value\)/)

  // Reset forces the server's code.
  await click(page, "#reset")
  await page.waitForTimeout(400)
  assert.doesNotMatch(await code(), /one more line|IO\.inspect\(value\)/)

  // Our snippets: typing "defm" suggests defmodule.
  await page.click("#editor .view-lines")
  await page.keyboard.press("ControlOrMeta+End")
  await page.keyboard.type("\ndefm")
  await page.waitForSelector("#editor .suggest-widget.visible", { timeout: 5000 })
  assert.match(await text(page, "#editor .suggest-widget"), /defmodule/)
  await page.keyboard.press("Escape")

  // Our dark theme.
  await click(page, "[data-phx-theme=dark]")
  const background = await page.evaluate(() =>
    getComputedStyle(document.querySelector("#editor .monaco-editor-background")).backgroundColor)
  assert.equal(background, "rgb(15, 10, 31)")
  await click(page, "[data-phx-theme=light]")

  assert.deepEqual(problems, [])
  await page.close()
})

test("code editor: keyboard shortcuts reach the LiveView, only while the editor has focus", async () => {
  const { page, problems } = await open("/adapters/monaco")
  await page.waitForSelector("#editor .monaco-editor")
  const fontSize = () =>
    page.evaluate(() => getComputedStyle(document.querySelector("#editor .view-lines")).fontSize)

  // Type, then save at once. The editor's change event is debounced by
  // 300 ms; Xenia sends it before the shortcut, so the save sees the new line.
  await page.click("#editor .view-lines")
  await page.keyboard.press("ControlOrMeta+End")
  await page.keyboard.type("\n# saved")
  await page.keyboard.press("ControlOrMeta+s")
  await page.waitForTimeout(SETTLE)
  assert.equal(await text(page, "#saved"), "Saved 5 lines.")

  // A bigger and a smaller font, applied through the options prop.
  await page.keyboard.press("ControlOrMeta+Shift+Period")
  await page.waitForTimeout(SETTLE)
  assert.equal(await text(page, "#font-size"), "16")
  assert.equal(await fontSize(), "16px")

  await page.keyboard.press("ControlOrMeta+Shift+Comma")
  await page.waitForTimeout(SETTLE)
  assert.equal(await text(page, "#font-size"), "14")

  // With focus outside the editor, the same keys aren't its shortcuts.
  await page.focus("#insert")
  await page.keyboard.press("ControlOrMeta+Shift+Period")
  await page.waitForTimeout(SETTLE)
  assert.equal(await text(page, "#font-size"), "14")

  assert.deepEqual(problems, [])
  await page.close()
})

test("island in a page: a colocated adapter, named after its module", async () => {
  const { page, problems } = await open("/colocated")

  assert.equal(
    await page.getAttribute("#sparkline", "phx-hook"),
    "XeniaExamplesWeb.App.ColocatedPage.Sparkline",
  )
  await mark(page, "#sparkline canvas")

  await click(page, "#add-point")
  assert.equal(await text(page, "#points"), "Points on the server: 6")
  assert.equal(await marked(page, "#sparkline canvas"), true, "updated, not rebuilt")

  assert.deepEqual(problems, [])
  await page.close()
})

test("tabs: two pages share one LiveView, so the count survives a tab switch", async () => {
  const { page, problems } = await open("/tabs/first")

  await click(page, "#add")
  await click(page, "#add")
  assert.equal(await text(page, "#count"), "2")

  await click(page, "#tab-second")
  assert.equal(new URL(page.url()).pathname, "/tabs/second")
  assert.match(await text(page, "#tab-content"), /Second tab/)
  assert.equal(await text(page, "#count"), "2")

  assert.deepEqual(problems, [])
  await page.close()
})

test("file-based routing: folders become URLs, with parameters, a catch-all, a group and nested layouts", async () => {
  const { page, problems } = await open("/routing")
  assert.equal(await text(page, "#route"), "/routing")
  assert.equal(await text(page, "#file"), "app/routing/page.ex")
  await mark(page, "#sidebar")
  const visit = async (href) => {
    await click(page, `#routing-nav a[href='${href}']`)
    await connected(page)
    assert.equal(new URL(page.url()).pathname, href)
  }

  // [slug]: one part of the URL, as a string.
  await visit("/routing/posts/hello-xenia")
  assert.equal(await text(page, "#route"), "/routing/posts/:slug")
  assert.equal(await text(page, "#params"), `%{"slug" => "hello-xenia"}`)
  assert.equal(await text(page, "#post-title"), "Hello, Xenia")
  assert.equal(await page.locator("#company").count(), 0, "not in the group: no group layout")

  // Any slug matches; the page decides what it means.
  await click(page, "a[href='/routing/posts/anything']")
  await connected(page)
  assert.equal(await text(page, "#post-title"), `No post called "anything"`)

  // [...path]: the rest of the URL, as a list, at any depth, or none.
  await visit("/routing/docs/guides/forms/errors")
  assert.equal(await text(page, "#params"), `%{"path" => ["guides", "forms", "errors"]}`)
  assert.equal(await text(page, "#segments"), "3")
  await click(page, "#breadcrumb a[href='/routing/docs/guides']")
  await connected(page)
  assert.equal(await text(page, "#params"), `%{"path" => ["guides"]}`)
  await visit("/routing/docs")
  assert.equal(await text(page, "#params"), `%{"path" => []}`)

  // (company): not in the URL, and its layout frames only its pages.
  await visit("/routing/team")
  assert.equal(await text(page, "#file"), "app/routing/(company)/team/page.ex")
  assert.equal(await page.locator("#company #route-info").count(), 1, "inside the group's layout")
  assert.equal(await page.locator("#routing-nav").count(), 1, "inside routing/layout.ex too")
  await visit("/routing/contact")
  assert.equal(await page.locator("#company #route-info").count(), 1)

  // The app's sidebar stayed alive, and marks the example as current.
  assert.equal(await marked(page, "#sidebar"), true, "the sidebar was not rebuilt")
  assert.equal(await page.getAttribute("#sidebar a[href='/routing']", "data-active"), "true")
  assert.deepEqual(problems, [])
  await page.close()

  // Group names and private folders are never URLs.
  for (const path of ["/routing/company/team", "/routing/(company)/team", "/routing/_parts"]) {
    const response = await fetch(BASE + path)
    assert.equal(response.status, 404, path)
  }
})

test("loading and errors: a placeholder while it loads, an error slot, on_crash and a retry", async () => {
  // The placeholder is in the server's HTML: it shows before any JavaScript.
  const html = await (await fetch(BASE + "/loading")).text()
  assert.match(html, /id="slow"[\s\S]*?data-xenia-loading[\s\S]*?Loading…/)

  const page = await browser.newPage()
  const problems = []
  page.on("pageerror", (e) => problems.push(e.message))
  page.on("console", (m) => {
    // The broken island's failure is logged on purpose.
    if (m.type() === "error" && !m.text().includes("Mount failed")) problems.push(m.text())
  })
  await page.goto(BASE + "/loading")
  await page.waitForSelector("[data-phx-main].phx-connected")

  // The slow island: the placeholder fills its box, over the empty island.
  const placeholder = page.locator("#slow [data-xenia-loading]")
  assert.equal(await placeholder.isVisible(), true)
  const box = await placeholder.boundingBox()
  assert.ok(Math.abs(box.height - 140) < 2, `the placeholder fills the island: ${box.height}`)

  await page.waitForSelector("#slow .loaded", { timeout: 5000 })
  assert.equal(await placeholder.isVisible(), false)
  assert.ok(Math.abs((await page.locator("#slow .loaded").boundingBox()).height - 140) < 2)

  // The broken island: its error replaces the placeholder, and the server hears.
  await page.waitForSelector("#broken [data-xenia-crashed]", { timeout: 5000 })
  assert.equal(await page.locator("#broken [data-xenia-loading]").isVisible(), false)
  await page.waitForFunction(() => document.querySelector("#crash-report").textContent.includes("crashed"))
  assert.equal(
    await text(page, "#crash-report"),
    "broken crashed in mount: the library didn't load (on purpose)",
  )

  // Try again: the placeholder comes back, then the island loads.
  await page.click("#broken [data-xenia-retry]")
  assert.equal(await page.locator("#broken [data-xenia-crashed]").count(), 0)
  assert.equal(await page.locator("#broken [data-xenia-loading]").isVisible(), true)
  await page.waitForSelector("#broken .loaded", { timeout: 5000 })
  assert.equal(await page.locator("#broken [data-xenia-loading]").isVisible(), false)

  assert.deepEqual(problems, [])
  await page.close()
})

test("metadata and sitemap: titles, descriptions and social tags from metadata/1; a sitemap.xml", async () => {
  // What a search engine gets: the first page load.
  const html = await (await fetch(BASE + "/routing/posts/hello-xenia")).text()
  const tag = (pattern) => html.match(pattern)?.[1]
  assert.equal(tag(/<title[^>]*>([^<]*)<\/title>/), "Hello, Xenia · File-based routing", "the layout's template")
  assert.match(tag(/<meta[^>]*name="description"[^>]*content="([^"]*)"/), /^This post&#39;s URL is/)
  assert.equal(tag(/<meta[^>]*property="og:type"[^>]*content="([^"]*)"/), "article", "the page beats the root layout")
  assert.equal(tag(/<meta[^>]*property="og:site_name"[^>]*content="([^"]*)"/), "Xenia examples", "from the root layout")

  const missing = await (await fetch(BASE + "/routing/posts/nope")).text()
  assert.match(missing, /<meta[^>]*name="robots"[^>]*content="noindex"/)

  // A page that sets page_title itself keeps it, as og:title too.
  const chart = await (await fetch(BASE + "/chart")).text()
  assert.match(chart, /<title[^>]*>Chart<\/title>/)
  assert.match(chart, /<meta[^>]*property="og:title"[^>]*content="Chart"/)

  // The tab title follows live navigation.
  const { page, problems } = await open("/routing")
  assert.equal(await page.title(), "Overview · File-based routing")
  await click(page, "#routing-nav a[href='/routing/posts/folders-are-urls']")
  await connected(page)
  assert.equal(await page.title(), "Folders are URLs · File-based routing")
  assert.deepEqual(problems, [])
  await page.close()

  // The sitemap: static pages, the pages sitemap/0 lists, and not the group with sitemap: false.
  const response = await fetch(BASE + "/sitemap.xml")
  assert.match(response.headers.get("content-type"), /application\/xml/)
  const xml = await response.text()
  for (const path of ["/", "/chart", "/routing", "/routing/docs", "/routing/docs/guides/install", "/routing/posts/hello-xenia"]) {
    assert.ok(xml.includes(`<loc>${BASE}${path}</loc>`), `${path} is listed`)
  }
  assert.ok(!xml.includes("/routing/team"), "the (company) layout says sitemap: false")
  assert.ok(!xml.includes("/routing/posts/nope"), "only the posts sitemap/0 lists")
})
