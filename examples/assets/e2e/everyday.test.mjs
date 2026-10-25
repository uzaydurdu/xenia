// Browser tests for icons, notifications and languages (/icons,
// /notifications, /languages, /settings).
//
// Start the app first (from examples/):
//   PORT=4002 mix phx.server
// Then, from examples/assets:
//   E2E_URL=http://localhost:4002 npm run e2e

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { chromium } from "playwright"

const BASE = process.env.E2E_URL ?? "http://localhost:4002"
const SETTLE = 300

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// A fresh context per test: its own cookies, so its own language.
async function open(path, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, ...options })
  const page = await context.newPage()
  const problems = []
  page.on("pageerror", (e) => problems.push(e.message))
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()) })
  await page.goto(BASE + path)
  await connected(page)
  return { page, problems, context, close: () => context.close() }
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
const waitText = (page, selector, pattern) =>
  page.waitForFunction(([s, p]) => new RegExp(p).test(document.querySelector(s)?.textContent ?? ""), [selector, pattern.source], { timeout: 10_000 })

const mark = (page, selector) => page.evaluate((s) => { document.querySelector(s).__marked = true }, selector)
const marked = (page, selector) => page.evaluate((s) => document.querySelector(s)?.__marked === true, selector)

// What the browser draws for an icon: its size, its mask, its color.
const iconStyle = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s)
    const style = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    return { width: box.width, height: box.height, mask: style.maskImage || style.webkitMaskImage, color: style.backgroundColor }
  }, selector)

// --- Icons -------------------------------------------------------------------

test("icons: each set draws its icons, sized and colored by classes", async () => {
  const { page, problems, close } = await open("/icons")

  for (const name of ["lucide-house", "mdi-home", "hero-home"]) {
    const style = await iconStyle(page, `#sets .${name}`)
    assert.match(style.mask, /^url\("data:image\/svg\+xml/, `${name} has its SVG`)
    assert.equal(style.width, 24, `${name} is size-6`)
  }

  const sizes = await page.$$eval("#sizes .lucide-star", (els) => els.map((el) => el.getBoundingClientRect().width))
  assert.deepEqual(sizes, [16, 24, 32, 48])

  // An icon is filled with the text color.
  const error = await page.$eval(".lucide-heart.text-error", (el) => {
    const style = getComputedStyle(el)
    return [style.backgroundColor, style.color]
  })
  assert.equal(error[0], error[1])

  assert.deepEqual(problems, [])
  await close()
})

test("icons: visible in light and dark, against each theme's background", async () => {
  const { page, problems, close } = await open("/icons")

  const colors = {}
  for (const theme of ["light", "dark"]) {
    colors[theme] = await page.$eval(`#theme-${theme}`, (panel) => ({
      icon: getComputedStyle(panel.querySelector(".lucide-sun")).backgroundColor,
      panel: getComputedStyle(panel).backgroundColor,
    }))
    assert.notEqual(colors[theme].icon, colors[theme].panel, `the ${theme} icon stands out`)
  }
  assert.notEqual(colors.light.icon, colors.dark.icon, "the icon follows the theme")

  assert.deepEqual(problems, [])
  await close()
})

test("icons: buttons with only an icon have a name; decorative icons are hidden; status icons are announced", async () => {
  const { page, problems, close } = await open("/icons")

  assert.equal(await page.getByRole("button", { name: "Edit" }).count(), 1)
  assert.equal(await page.getByRole("button", { name: "Delete" }).count(), 2, "with text, and icon-only with aria-label")
  assert.equal(await page.getByRole("button", { name: "Save" }).count(), 1)
  assert.equal(await page.getAttribute("#edit span", "aria-hidden"), "true")

  assert.equal(await page.getByRole("img", { name: "Saved" }).count(), 1)
  assert.equal(await page.getByRole("img", { name: "Warning" }).count(), 1)

  assert.deepEqual(problems, [])
  await close()
})

// --- Notifications -----------------------------------------------------------

test("notifications: success, error and info show with their icon, and a click dismisses them", async () => {
  const { page, problems, close } = await open("/notifications")

  await click(page, "#save")
  assert.equal(await text(page, "#flash-success p"), "Document saved successfully")
  assert.equal(await page.getAttribute("#flash-success", "role"), "status")
  assert.equal(await page.locator("#flash-success .lucide-circle-check").count(), 1)

  await click(page, "#flash-success")
  assert.equal(await page.locator("#flash-success").isVisible(), false, "dismissed")

  await click(page, "#info")
  assert.equal(await text(page, "#flash-info p"), "Your changes are saved automatically.")
  assert.equal(await page.locator("#flash-info .lucide-info").count(), 1)
  await click(page, "#flash-info button[aria-label=Close]")
  assert.equal(await page.locator("#flash-info").isVisible(), false, "the close button dismisses too")

  await click(page, "#fail")
  assert.equal(await text(page, "#flash-error p"), "Could not save document. Please try again.")
  assert.equal(await page.getAttribute("#flash-error", "role"), "alert")

  assert.deepEqual(problems, [])
  await close()
})

test("notifications: HTML is shown as text, and a failure's details stay in the log", async () => {
  const { page, problems, close } = await open("/notifications")

  await click(page, "#untrusted")
  assert.equal(
    await text(page, "#flash-info p"),
    "Hello, <b>Mallory</b><script>window.hacked = true</script>!",
  )
  assert.equal(await page.locator("#flash-info b, #flash-info script").count(), 0)
  assert.equal(await page.evaluate(() => window.hacked), undefined)

  await click(page, "#fail")
  const html = await page.content()
  assert.ok(!html.includes("postgres://"), "no database address")
  assert.ok(!html.includes("s3cret"), "no password")

  assert.deepEqual(problems, [])
  await close()
})

test("notifications: a message set before push_navigate shows on the next page; a plain link leaves it behind", async () => {
  const { page, problems, close } = await open("/notifications")

  await click(page, "#save-and-go")
  await page.waitForURL(BASE + "/icons")
  await connected(page)
  assert.equal(await text(page, "#flash-success p"), "Saved. You're on the Icons page now.")

  // Back to /notifications with a link: the old message doesn't follow.
  await click(page, "#icon-nav a[href='/notifications']")
  await connected(page)
  assert.equal(await page.locator("#flash-success").count(), 0)

  await click(page, "#info")
  await click(page, "#go")
  await page.waitForURL(BASE + "/icons")
  await connected(page)
  assert.equal(await page.locator("#flash-info").count(), 0)

  assert.deepEqual(problems, [])
  await close()
})

test("notifications: success and info close by themselves after their countdown; hovering pauses it; errors stay", async () => {
  const { page, problems, close } = await open("/notifications")
  await click(page, "#duration-3000")

  // Closes by itself, and the server's flash is cleared too.
  await click(page, "#save")
  assert.equal(await page.locator("#flash-success .flash-countdown").count(), 1)
  assert.match(await page.getAttribute("#flash-success .alert", "style"), /--flash-duration: 3000ms/)
  await page.waitForSelector("#flash-success", { state: "hidden", timeout: 5000 })
  await click(page, "#shape-sharp") // any server render
  assert.equal(await page.locator("#flash-success").count(), 0, "cleared on the server, not only hidden")

  // Hovering pauses the countdown.
  await click(page, "#info")
  await page.hover("#flash-info .alert")
  await page.waitForTimeout(4000)
  assert.equal(await page.locator("#flash-info").isVisible(), true, "still there while hovered")
  await page.mouse.move(5, 5)
  await page.waitForSelector("#flash-info", { state: "hidden", timeout: 5000 })

  // Errors have no countdown, and stay.
  await click(page, "#fail")
  assert.equal(await page.locator("#flash-error .flash-countdown").count(), 0)
  await page.waitForTimeout(3500)
  assert.equal(await page.locator("#flash-error").isVisible(), true)
  await click(page, "#flash-error")

  // "Never": no countdown at all.
  await click(page, "#duration-never")
  await click(page, "#save")
  assert.equal(await page.locator("#flash-success .flash-countdown").count(), 0)
  await page.waitForTimeout(3500)
  assert.equal(await page.locator("#flash-success").isVisible(), true)

  assert.deepEqual(problems, [])
  await close()
})

test("notifications: they stack, newest on top, without covering each other", async () => {
  const { page, problems, close } = await open("/notifications")
  await click(page, "#duration-never")
  const stack = () =>
    page.$$eval("#flash-group > [id^=flash-]:not([hidden])", (els) =>
      els
        .map((el) => ({ id: el.id, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }))
        .sort((a, b) => a.top - b.top),
    )

  await click(page, "#info")
  await click(page, "#save")
  await click(page, "#fail")
  const three = await stack()
  assert.deepEqual(three.map((m) => m.id), ["flash-error", "flash-success", "flash-info"])
  assert.ok(three[0].bottom <= three[1].top && three[1].bottom <= three[2].top, "none covers another")

  // A new info message goes back to the top.
  await click(page, "#untrusted")
  assert.deepEqual((await stack()).map((m) => m.id), ["flash-info", "flash-error", "flash-success"])

  assert.deepEqual(problems, [])
  await close()
})

test("notifications: other page updates don't restart a countdown", async () => {
  const { page, problems, close } = await open("/notifications")
  await click(page, "#duration-3000")

  await click(page, "#save")
  await page.waitForTimeout(1800)
  await click(page, "#shape-sharp") // a page update while it counts down
  await page.waitForSelector("#flash-success", { state: "hidden", timeout: 2000 })

  assert.deepEqual(problems, [])
  await close()
})

test("notifications: rounded, sharp or pill corners, and the countdown follows them", async () => {
  const { page, problems, close } = await open("/notifications")
  const corners = () =>
    page.evaluate(() => ({
      box: getComputedStyle(document.querySelector("#flash-success .alert")).borderTopLeftRadius,
      line: getComputedStyle(document.querySelector("#flash-success .flash-countdown rect")).rx,
    }))

  await click(page, "#save")
  assert.deepEqual(await corners(), { box: "12px", line: "10.5px" }, "rounded: the theme's radius")
  await click(page, "#flash-success")

  await click(page, "#shape-sharp")
  await click(page, "#save")
  assert.deepEqual(await corners(), { box: "0px", line: "0px" })
  await click(page, "#flash-success")

  await click(page, "#shape-pill")
  await click(page, "#save")
  const pill = await corners()
  assert.ok(parseFloat(pill.box) > 1000, `a pill: ${pill.box}`)
  assert.equal(pill.line, "auto", "rx follows ry: half the height")

  assert.deepEqual(problems, [])
  await close()
})

// --- Languages ---------------------------------------------------------------

test("languages: English and German from Gettext, in the page, its messages and the widget, without a remount", async () => {
  const { page, problems, close } = await open("/languages")

  assert.equal(await text(page, "#heading"), "Languages")
  assert.equal(await text(page, "#stepper [data-action=reset]"), "Reset")
  assert.match(await text(page, "#stepper .stepper span"), /^Total: €12\.50$/)

  // Some state in the widget (the browser's) and in the LiveView (the server's).
  await click(page, "#stepper [data-action=increase]")
  await click(page, "#stepper [data-action=increase]")
  await click(page, "#save")
  assert.equal(await text(page, "#saves"), "Saves so far: 1")
  await mark(page, "#stepper .stepper")

  await click(page, "#locale-de")

  assert.equal(await text(page, "#heading"), "Sprachen")
  assert.match(await text(page, "#save"), /Speichern/)
  assert.match(await text(page, "#cancel"), /Abbrechen/)
  assert.equal(await text(page, "#saves"), "Bisher gespeichert: 1", "the server's state stayed")
  assert.equal(await text(page, "#server-locale"), "de")
  assert.equal(await page.title(), "Sprachen")

  // The widget: new words and a German price, the same element and count.
  assert.equal(await text(page, "#stepper [data-action=reset]"), "Zurücksetzen")
  assert.equal(await page.getAttribute("#stepper [data-action=increase]", "aria-label"), "Mehr")
  assert.equal(await text(page, "#stepper output"), "3")
  assert.match(await text(page, "#stepper .stepper span"), /^Gesamt: 37,50\s€$/)
  assert.equal(await marked(page, "#stepper .stepper"), true, "the widget wasn't rebuilt")

  // Messages are translated too.
  await click(page, "#cancel")
  assert.equal(await text(page, "#flash-info p"), "Änderungen verworfen")

  assert.deepEqual(problems, [])
  await close()
})

test("languages: the choice carries to the next page and the next visit", async () => {
  const { page, problems, close } = await open("/languages")

  await click(page, "#locale-de")
  await click(page, "#sidebar a[href='/settings']")
  await connected(page)
  assert.equal(await text(page, "#heading"), "Einstellungen", "live navigation")

  await page.reload()
  await connected(page)
  assert.equal(await text(page, "#heading"), "Einstellungen", "a new page load")

  await click(page, "#locale-en")
  assert.equal(await text(page, "#heading"), "Settings")

  assert.deepEqual(problems, [])
  await close()
})

// --- All three: the settings panel --------------------------------------------

test("settings: a translated panel, a JavaScript part that keeps its state, an icon button and a translated message", async () => {
  const { page, problems, close } = await open("/settings")

  assert.match(await text(page, "#save"), /^Save changes$/)
  assert.equal(await page.locator("#save .lucide-save").count(), 1)

  // The JavaScript switches report to the server.
  await click(page, "#toggles input[data-key=summary]")
  await waitText(page, "#server-settings", /summary: true/)
  await mark(page, "#toggles .toggles")

  await click(page, "#locale-de")
  assert.equal(await text(page, "#heading"), "Einstellungen")
  assert.match(await text(page, "#save"), /^Änderungen speichern$/)
  assert.deepEqual(
    await page.$$eval("#toggles label span", (spans) => spans.map((s) => s.textContent)),
    ["E-Mail-Benachrichtigungen", "Wöchentliche Zusammenfassung"],
  )
  assert.equal(await page.isChecked("#toggles input[data-key=summary]"), true, "the switch kept its state")
  assert.equal(await marked(page, "#toggles .toggles"), true, "the switches weren't rebuilt")

  await click(page, "#save")
  assert.equal(await text(page, "#flash-success p"), "Einstellungen erfolgreich gespeichert")
  assert.equal(await page.locator("#flash-success .lucide-circle-check").count(), 1)
  assert.equal(await page.getAttribute("#flash-success button", "aria-label"), "Schließen")

  assert.deepEqual(problems, [])
  await close()
})
