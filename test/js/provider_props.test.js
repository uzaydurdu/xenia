/**
 * M6: provider values delivered as props (CLAUDE.md §5).
 *
 * providers.test.js covers the store on its own. These tests cover what
 * the core does with it:
 * - an adapter that declares `consumes: ["theme"]` receives the theme in
 *   its mount props, and later changes through its ordinary `theme` prop
 *   handler. No new lifecycle concept;
 * - an explicit prop beats the provider value, and removing it falls back;
 * - one subscription per component, released on destroy, kept across
 *   remounts;
 * - the XeniaProvider hook that createHooks adds, which carries the
 *   server-rendered value into the store;
 * - the Monaco adapter's theme mapping (M6 Task E).
 *
 * Each test starts from an empty store (resetProviders): the store is a
 * module-level singleton, shared by every test in this file.
 */

import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { Controller, createHooks } from "../../assets/core/controller.js";
import {
  setProvider,
  readProvider,
  resetProviders,
  listenerCount,
} from "../../assets/core/providers.js";
import {
  createMonaco,
  monacoTheme,
  resolveTheme,
} from "../../assets/adapters/monaco.js";

// The adapter as an app creates it. `load` is never called here: no test in
// this file mounts an editor.
const monaco = createMonaco({ load: () => new Promise(() => {}) });

beforeEach(() => resetProviders());

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A page with one container whose data-xenia-props is `props`. */
function page(t, props = {}) {
  const originalDocument = globalThis.document;
  const dom = new JSDOM(`<div id="chart"></div><div id="other"></div>`);
  globalThis.document = dom.window.document;

  t.after(() => {
    globalThis.document = originalDocument;
    dom.window.close();
  });

  const el = document.getElementById("chart");
  el.setAttribute("data-xenia-props", JSON.stringify(props));
  return { dom, el };
}

/**
 * An adapter that records what it is given. Instances are numbered in
 * mount order, so a test can tell which instance a handler call reached.
 */
function recorder({ consumes = ["theme"], mount } = {}) {
  const calls = { mounts: [], theme: [], destroyed: [] };

  const adapter = {
    consumes,
    mount(el, props, ctx) {
      calls.mounts.push(props);
      const instance = { n: calls.mounts.length, ctx };
      return mount ? mount(instance) : instance;
    },
    destroy(instance) {
      calls.destroyed.push(instance.n);
    },
    props: {
      theme(instance, value) {
        calls.theme.push([instance.n, value]);
      },
    },
  };

  return { adapter, calls };
}

async function mounted(t, { props, ...options } = {}) {
  const { el } = page(t, props);
  const { adapter, calls } = recorder(options);
  const controller = new Controller({ el }, adapter);
  await controller.mount();
  return { el, controller, calls };
}

// ------------------------------------------------------------
// 1. Delivery
// ------------------------------------------------------------

test("a consumed provider value arrives in the mount props", async (t) => {
  setProvider("theme", "dark");

  const { calls } = await mounted(t, { props: { data: [1, 2] } });

  assert.deepEqual(calls.mounts, [{ theme: "dark", data: [1, 2] }]);
  assert.deepEqual(calls.theme, [], "mount had it: no handler call");
});

// The provider element can mount after the component (it renders later in
// the page): the value then arrives through the handler, a moment later.
test("a value published after mount reaches the prop handler", async (t) => {
  const { calls } = await mounted(t);

  setProvider("theme", "dark");

  assert.deepEqual(calls.mounts, [{}]);
  assert.deepEqual(calls.theme, [[1, "dark"]]);
});

test("each change calls the handler once, without a remount", async (t) => {
  setProvider("theme", "dark");
  const { calls } = await mounted(t);

  setProvider("theme", "light");
  setProvider("theme", "light"); // unchanged: the store tells nobody
  setProvider("theme", "dark");

  assert.deepEqual(calls.theme, [
    [1, "light"],
    [1, "dark"],
  ]);
  assert.equal(calls.mounts.length, 1);
  assert.deepEqual(calls.destroyed, []);
});

test("two components consuming the same provider both follow it", async (t) => {
  const { el } = page(t);
  const other = document.getElementById("other");
  other.setAttribute("data-xenia-props", "{}");

  const a = recorder();
  const b = recorder();
  await new Controller({ el }, a.adapter).mount();
  await new Controller({ el: other }, b.adapter).mount();

  setProvider("theme", "dark");

  assert.deepEqual(a.calls.theme, [[1, "dark"]]);
  assert.deepEqual(b.calls.theme, [[1, "dark"]]);
  assert.equal(listenerCount("theme"), 2);
});

test("an adapter that doesn't consume a provider never sees it", async (t) => {
  setProvider("theme", "dark");
  const { calls } = await mounted(t, { consumes: [] });

  setProvider("theme", "light");

  assert.deepEqual(calls.mounts, [{}]);
  assert.deepEqual(calls.theme, []);
  assert.equal(listenerCount("theme"), 0);
});

// ------------------------------------------------------------
// 2. Precedence: an explicit prop beats the provider
// ------------------------------------------------------------

test("an explicit prop beats the provider value", async (t) => {
  setProvider("theme", "dark");
  const { calls } = await mounted(t, { props: { theme: "light" } });

  setProvider("theme", "solarized");

  assert.deepEqual(calls.mounts, [{ theme: "light" }]);
  assert.deepEqual(calls.theme, [], "the provider change is hidden by the prop");
});

test("removing the explicit prop falls back to the provider value", async (t) => {
  setProvider("theme", "dark");
  const { el, controller, calls } = await mounted(t, {
    props: { theme: "light" },
  });

  el.setAttribute("data-xenia-props", "{}");
  controller.update();

  assert.deepEqual(calls.theme, [[1, "dark"]]);
});

// A prop that is present with null is still explicit: only a missing key
// lets the provider value through.
test("an explicit null still beats the provider", async (t) => {
  setProvider("theme", "dark");
  const { calls } = await mounted(t, { props: { theme: null } });

  assert.deepEqual(calls.mounts, [{ theme: null }]);
});

// ------------------------------------------------------------
// 3. Subscription lifetime
// ------------------------------------------------------------

test("destroy releases the subscription", async (t) => {
  const { controller, calls } = await mounted(t);
  assert.equal(listenerCount("theme"), 1);

  controller.destroy();
  setProvider("theme", "dark");

  assert.equal(listenerCount("theme"), 0);
  assert.deepEqual(calls.theme, []);
});

test("a component keeps one subscription across remounts", async (t) => {
  setProvider("theme", "dark");
  const { controller, calls } = await mounted(t);

  for (let i = 0; i < 3; i++) {
    controller.ctx.remount();
    await settle();
  }

  assert.equal(calls.mounts.length, 4);
  assert.equal(listenerCount("theme"), 1);

  setProvider("theme", "light");
  assert.deepEqual(calls.theme, [[4, "light"]], "only the current instance");
});

test("a remount gives the new instance the latest provider value", async (t) => {
  setProvider("theme", "dark");
  const { controller, calls } = await mounted(t);

  setProvider("theme", "light");
  controller.ctx.remount();
  await settle();

  assert.deepEqual(calls.mounts.at(-1), { theme: "light" });
});

test("a change while mount is pending is applied once mount resolves", async (t) => {
  const { el } = page(t);
  let resolve;
  const { adapter, calls } = recorder({
    mount: (instance) => new Promise((r) => (resolve = () => r(instance))),
  });

  setProvider("theme", "dark");
  const controller = new Controller({ el }, adapter);
  const mounting = controller.mount();

  setProvider("theme", "light"); // mount hasn't resolved yet
  assert.deepEqual(calls.theme, []);

  resolve();
  await mounting;

  assert.deepEqual(calls.mounts, [{ theme: "dark" }]);
  assert.deepEqual(calls.theme, [[1, "light"]]);
});

test("a failed mount releases the subscription", async (t) => {
  const { el } = page(t);
  const { adapter } = recorder({
    mount: () => {
      throw new Error("boom");
    },
  });
  const error = mock.method(console, "error", () => {});
  t.after(() => error.mock.restore());

  await new Controller({ el }, adapter).mount();

  assert.equal(listenerCount("theme"), 0);
});

test("an invalid consumes list is reported and ignored", async (t) => {
  const warn = mock.method(console, "warn", () => {});
  t.after(() => warn.mock.restore());

  setProvider("theme", "dark");
  const { calls } = await mounted(t, { consumes: "theme" });

  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /consumes/);
  assert.deepEqual(calls.mounts, [{}]);
  assert.equal(listenerCount("theme"), 0);
});

// ------------------------------------------------------------
// 4. The XeniaProvider hook
// ------------------------------------------------------------

/** A provider element as Xenia.Provider renders it. */
function providerElement(name, json) {
  const el = document.createElement("div");
  el.hidden = true;
  el.dataset.xeniaProvider = name;
  el.dataset.xeniaValue = json;
  document.body.appendChild(el);
  return el;
}

test("createHooks adds XeniaProvider, which publishes on mount and update", (t) => {
  page(t);
  const { XeniaProvider } = createHooks({});
  const el = providerElement("theme", '"dark"');
  const hook = { el };

  XeniaProvider.mounted.call(hook);
  assert.deepEqual(readProvider("theme"), { value: "dark" });

  el.dataset.xeniaValue = '"light"';
  XeniaProvider.updated.call(hook);
  assert.deepEqual(readProvider("theme"), { value: "light" });
});

// The value belongs to the page, not to the element: during a navigation
// the next page's components may mount before its provider does.
test("the value outlives the provider element", (t) => {
  page(t);
  const { XeniaProvider } = createHooks({});
  const el = providerElement("theme", '"dark"');

  XeniaProvider.mounted.call({ el });
  el.remove();

  assert.equal(XeniaProvider.destroyed, undefined);
  assert.deepEqual(readProvider("theme"), { value: "dark" });
});

test("invalid JSON is reported, and the last value stays", (t) => {
  page(t);
  const error = mock.method(console, "error", () => {});
  t.after(() => error.mock.restore());

  const { XeniaProvider } = createHooks({});
  const el = providerElement("theme", '"dark"');
  XeniaProvider.mounted.call({ el });

  el.dataset.xeniaValue = "{not json";
  XeniaProvider.updated.call({ el });

  assert.equal(error.mock.callCount(), 1);
  assert.deepEqual(readProvider("theme"), { value: "dark" });
});

test("XeniaProvider is a reserved hook name", () => {
  assert.throws(
    () => createHooks({ XeniaProvider: { mount() {}, destroy() {} } }),
    /reserved/,
  );
});

test("the hook's value reaches a consuming component", async (t) => {
  const { el } = page(t);
  const { XeniaProvider } = createHooks({});
  const { adapter, calls } = recorder();
  await new Controller({ el }, adapter).mount();

  XeniaProvider.mounted.call({ el: providerElement("theme", '"dark"') });

  assert.deepEqual(calls.theme, [[1, "dark"]]);
});

// ------------------------------------------------------------
// 5. Monaco consumes the theme (Task E)
// ------------------------------------------------------------

test("the Monaco adapter consumes the theme provider", () => {
  assert.deepEqual(monaco.consumes, ["theme"]);
});

test("Monaco maps the app's light and dark to its own theme names", () => {
  assert.equal(monacoTheme("light"), "vs");
  assert.equal(monacoTheme("dark"), "vs-dark");
});

test("other themes pass through unchanged", () => {
  const custom = { name: "solarized", base: "vs-dark" };

  assert.equal(monacoTheme("hc-black"), "hc-black");
  assert.equal(monacoTheme(custom), custom);
  assert.equal(monacoTheme(undefined), undefined);
});

test("the theme prop handler applies the mapped theme", () => {
  const applied = [];
  const editor = { applyTheme: (theme) => applied.push(theme) };

  monaco.props.theme(editor, "dark");
  monaco.props.theme(editor, "light");
  monaco.props.theme(editor, "hc-black");

  assert.deepEqual(applied, ["vs-dark", "vs", "hc-black"]);
});

// `themes` (the app's own Monaco themes, M6 follow-up): each app theme it
// names gets that Monaco theme; the rest keep the defaults.
const MIDNIGHT = { name: "midnight", base: "vs-dark" };

test("resolveTheme prefers the app's own themes, then the defaults", () => {
  const themes = { dark: MIDNIGHT };

  assert.equal(resolveTheme({ app: "dark", themes }), MIDNIGHT);
  assert.equal(resolveTheme({ app: "light", themes }), "vs", "not named: default");
  assert.equal(resolveTheme({ app: "dark", themes: undefined }), "vs-dark");
  assert.equal(resolveTheme({ app: "hc-black", themes }), "hc-black");
  assert.equal(resolveTheme({ app: undefined, themes }), undefined);
});

// The order of handlers within one update is unspecified (§4), so whichever
// of `theme` and `themes` arrives second must still see the other's value.
test("theme and themes resolve together, in either order", () => {
  for (const order of [["theme", "themes"], ["themes", "theme"]]) {
    const applied = [];
    const editor = { applyTheme: (theme) => applied.push(theme) };
    const values = { theme: "dark", themes: { dark: MIDNIGHT } };

    for (const key of order) monaco.props[key](editor, values[key]);

    assert.equal(applied.at(-1), MIDNIGHT, order.join(" then "));
  }
});

test("a toggle after themes arrived uses the app's own theme", () => {
  const applied = [];
  const editor = { applyTheme: (theme) => applied.push(theme) };

  monaco.props.themes(editor, { dark: MIDNIGHT, light: "github-light" });
  monaco.props.theme(editor, "dark");
  monaco.props.theme(editor, "light");

  assert.deepEqual(applied.slice(-2), [MIDNIGHT, "github-light"]);
});
