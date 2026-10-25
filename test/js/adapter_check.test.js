/**
 * Unregistered-adapter diagnostics (M4 todo 5).
 *
 * `<.xenia>` renders `data-xenia-adapter="<name>"`. createHooks() remembers
 * every adapter name it registers, and checks the page for containers whose
 * adapter was never registered: when the page first loads, after a LiveView
 * navigation (`phx:page-loading-stop`), and whenever such a container is
 * added or its adapter name changes. Each problem is reported once, naming
 * the element and the exact fix.
 *
 * Without this, a missing registration only shows up as LiveView's generic
 * "unknown hook" message, because LiveView never calls Xenia for a hook it
 * doesn't know.
 *
 * The checker needs a browser `window`, so each test installs a fresh jsdom
 * window and document. The set of registered names is module-level and
 * shared by every test in this file, so each test uses its own adapter names.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createHooks } from "../../assets/core/controller.js";

const noopAdapter = { mount: () => ({}) };

/**
 * Installs a jsdom window as the global `window`/`document` for one test,
 * spies on console.error, and returns helpers. `withoutObserver` removes
 * MutationObserver, to test the navigation trigger on its own.
 */
function setup(t, html, { withoutObserver = false } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  if (withoutObserver) delete dom.window.MutationObserver;

  const original = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;

  const errors = t.mock.method(console, "error", () => {});

  t.after(() => {
    globalThis.window = original.window;
    globalThis.document = original.document;
    dom.window.close();
  });

  return {
    document: dom.window.document,
    window: dom.window,
    messages: () => errors.mock.calls.map((call) => call.arguments.join(" ")),
  };
}

// Lets the initial microtask check and MutationObserver callbacks run.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A component rendered before JavaScript starts, with an adapter nobody
 * registered, is reported once on startup, naming the element, the adapter
 * and the fix.
 */
test("an unregistered adapter is reported once, with the element and the fix", async (t) => {
  const { window, messages } = setup(
    t,
    `<div id="sales" data-xenia-adapter="ChartMissingA"></div>`,
  );

  createHooks({ RegisteredA: noopAdapter });
  await settle();

  assert.deepEqual(messages(), [
    '[Xenia] #sales uses adapter "ChartMissingA", which isn\'t registered. ' +
      "Add it to createHooks({ ChartMissingA: yourAdapter }).",
  ]);

  // Later checks don't repeat the same report for the same element.
  window.dispatchEvent(new window.Event("phx:page-loading-stop"));
  await settle();
  assert.equal(messages().length, 1);
});

test("registered adapters are not reported", async (t) => {
  const { messages } = setup(
    t,
    `<div id="editor" data-xenia-adapter="RegisteredB"></div>`,
  );

  createHooks({ RegisteredB: noopAdapter });
  await settle();

  assert.deepEqual(messages(), []);
});

/**
 * Components can appear after startup, e.g. a LiveView re-render turning on
 * an `:if`. The MutationObserver catches them.
 */
test("a component added after startup is checked", async (t) => {
  const { document, messages } = setup(t, ``);

  createHooks({ RegisteredC: noopAdapter });
  await settle();
  assert.deepEqual(messages(), []);

  document.body.insertAdjacentHTML(
    "beforeend",
    `<section><div id="late" data-xenia-adapter="ChartMissingC"></div></section>`,
  );
  await settle();

  assert.equal(messages().length, 1);
  assert.match(messages()[0], /#late uses adapter "ChartMissingC"/);
});

/**
 * Changing an existing container's adapter name to an unregistered one is
 * reported; the earlier report for the same element doesn't hide it.
 */
test("an adapter name changing to an unregistered one is reported", async (t) => {
  const { document, messages } = setup(
    t,
    `<div id="swap" data-xenia-adapter="RegisteredD"></div>`,
  );

  createHooks({ RegisteredD: noopAdapter });
  await settle();
  assert.deepEqual(messages(), []);

  document
    .getElementById("swap")
    .setAttribute("data-xenia-adapter", "ChartMissingD");
  await settle();

  assert.equal(messages().length, 1);
  assert.match(messages()[0], /#swap uses adapter "ChartMissingD"/);
});

/**
 * The navigation trigger on its own (no MutationObserver): after LiveView
 * finishes a navigation, the new page's components are checked.
 */
test("components are checked after a LiveView navigation", async (t) => {
  const { window, document, messages } = setup(t, ``, {
    withoutObserver: true,
  });

  createHooks({ RegisteredE: noopAdapter });
  await settle();

  document.body.innerHTML = `<div id="next-page" data-xenia-adapter="ChartMissingE"></div>`;
  assert.deepEqual(messages(), []); // nothing has triggered a check yet

  window.dispatchEvent(new window.Event("phx:page-loading-stop"));
  await settle();

  assert.equal(messages().length, 1);
  assert.match(messages()[0], /#next-page uses adapter "ChartMissingE"/);
});

/**
 * The suggested fix must be valid JavaScript to copy: an adapter name that
 * isn't a JS identifier is quoted.
 */
test("a name that isn't a JS identifier is quoted in the suggested fix", async (t) => {
  const { messages } = setup(
    t,
    `<div id="dash" data-xenia-adapter="chart-missing-f"></div>`,
  );

  createHooks({ RegisteredF: noopAdapter });
  await settle();

  assert.match(
    messages()[0],
    /createHooks\(\{ "chart-missing-f": yourAdapter \}\)/,
  );
});

/**
 * An element without an id is still reported, with a placeholder instead
 * of "#undefined".
 */
test("an element without an id is reported with a placeholder", async (t) => {
  const { messages } = setup(
    t,
    `<div data-xenia-adapter="ChartMissingG"></div>`,
  );

  createHooks({ RegisteredG: noopAdapter });
  await settle();

  assert.match(
    messages()[0],
    /^\[Xenia\] <element> uses adapter "ChartMissingG"/,
  );
});

/**
 * Several createHooks() calls (e.g. one per module) share one registry,
 * and the startup check runs after the current task, so names registered
 * by a second call in the same task aren't reported.
 */
test("names from several createHooks() calls in one task are all known", async (t) => {
  const { messages } = setup(
    t,
    `<div id="one" data-xenia-adapter="RegisteredH1"></div>
     <div id="two" data-xenia-adapter="RegisteredH2"></div>`,
  );

  createHooks({ RegisteredH1: noopAdapter });
  createHooks({ RegisteredH2: noopAdapter });
  await settle();

  assert.deepEqual(messages(), []);
});

/**
 * Only what changed is checked. Editors like Monaco change the DOM on every
 * keystroke; re-scanning the whole document for each change would cost time
 * in production for what is a development diagnostic.
 */
test("unrelated DOM changes don't re-scan the whole document", async (t) => {
  const { document, messages } = setup(
    t,
    `<div id="editor" data-xenia-adapter="RegisteredI"><div id="lines"></div></div>`,
  );

  createHooks({ RegisteredI: noopAdapter });
  await settle();

  const documentScans = t.mock.method(document, "querySelectorAll");

  // A burst of editor-like changes inside a registered component.
  const lines = document.getElementById("lines");
  for (let i = 0; i < 20; i++) {
    lines.insertAdjacentHTML("beforeend", `<span>line ${i}</span>`);
    await settle();
  }

  assert.equal(documentScans.mock.callCount(), 0);
  assert.deepEqual(messages(), []);
});

/**
 * Co-located adapters (M10) never pass through createHooks(): LiveView
 * extracts them into "phoenix-colocated/<app>", and the app spreads those
 * hooks into its LiveSocket. The checker finds them on `window.liveSocket`,
 * which Phoenix's generated app.js sets.
 */
test("a co-located adapter the LiveSocket has is not reported", async (t) => {
  const { window, messages } = setup(
    t,
    `<div id="sales" data-xenia-adapter="App.SalesPage.ChartOk"></div>`,
  );

  window.liveSocket = { hooks: { "App.SalesPage.ChartOk": {} } };
  createHooks({ RegisteredColocatedA: noopAdapter });
  await settle();

  assert.deepEqual(messages(), []);
});

test("a co-located adapter the LiveSocket lacks is reported, with its own fix", async (t) => {
  const { window, messages } = setup(
    t,
    `<div id="sales" data-xenia-adapter="App.SalesPage.ChartGone"></div>`,
  );

  window.liveSocket = { hooks: {} };
  createHooks({ RegisteredColocatedB: noopAdapter });
  await settle();

  assert.deepEqual(messages(), [
    '[Xenia] #sales uses the co-located adapter "App.SalesPage.ChartGone", ' +
      "which the LiveSocket doesn't have. Check that its module defines " +
      '<script :type={Phoenix.LiveView.ColocatedHook} name=".ChartGone">, ' +
      'and that app.js passes the hooks from "phoenix-colocated/<app>" ' +
      "to the LiveSocket.",
  ]);
});

test("without window.liveSocket, a co-located name isn't guessed at", async (t) => {
  const { messages } = setup(
    t,
    `<div id="sales" data-xenia-adapter="App.SalesPage.ChartUnknown"></div>
     <div id="plain" data-xenia-adapter="PlainMissingC"></div>`,
  );

  createHooks({ RegisteredColocatedC: noopAdapter });
  await settle();

  // The plain name is still checked against createHooks().
  assert.deepEqual(messages(), [
    '[Xenia] #plain uses adapter "PlainMissingC", which isn\'t registered. ' +
      "Add it to createHooks({ PlainMissingC: yourAdapter }).",
  ]);
});
