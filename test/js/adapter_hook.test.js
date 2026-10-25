/**
 * adapterHook() tests (M10, co-located adapters).
 *
 * A co-located adapter lives in a page's module, inside LiveView's
 * ColocatedHook, and exports `adapterHook({...})`. LiveView names the hook
 * after the module ("App.SalesPage.Chart"), so two pages can both define
 * `.Chart`. adapterHook() is the same hook createHooks() builds for each of
 * its entries, so these tests check that a co-located adapter keeps every
 * channel: props, updates, commands, providers and cleanup.
 *
 * The hooks are driven the way LiveView drives them, with a fake hook as
 * `this` (see hooks.test.js).
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { adapterHook, createHooks } from "../../assets/core/controller.js";
import { setProvider } from "../../assets/core/providers.js";

/** Installs a jsdom document for one test. */
function setup(t, html) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  const original = globalThis.document;
  globalThis.document = dom.window.document;

  t.after(() => {
    globalThis.document = original;
    dom.window.close();
  });

  return dom.window.document;
}

/** A fake Phoenix hook for `el`, recording its command subscriptions. */
function fakeHook(el, listeners = new Map()) {
  return {
    el,
    handleEvent(eventName, callback) {
      const ref = { eventName, callback };
      listeners.set(eventName, ref);
      return ref;
    },
    removeHandleEvent(ref) {
      listeners.delete(ref.eventName);
    },
  };
}

// Mount, prop handlers and commands run after a microtask.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A recording adapter: what was mounted, applied, commanded, destroyed. */
function recordingAdapter(label, extra = {}) {
  const calls = [];

  return {
    calls,
    adapter: {
      mount(el, props) {
        calls.push(["mount", props]);
        return { label };
      },
      destroy(instance) {
        calls.push(["destroy", instance.label]);
      },
      props: {
        title(instance, value) {
          calls.push(["title", instance.label, value]);
        },
      },
      commands: {
        highlight(instance, args) {
          calls.push(["highlight", instance.label, args]);
        },
      },
      ...extra,
    },
  };
}

test("a co-located adapter mounts, updates, takes commands and is destroyed", async (t) => {
  const document = setup(
    t,
    `<div id="sales" data-xenia-adapter="App.SalesPage.Chart"
          data-xenia-props='{"title":"Q1"}'></div>`,
  );

  const listeners = new Map();
  const { adapter, calls } = recordingAdapter("sales");
  const hook = adapterHook(adapter);
  const fake = fakeHook(document.getElementById("sales"), listeners);

  hook.mounted.call(fake);
  await settle();

  fake.el.setAttribute("data-xenia-props", '{"title":"Q2"}');
  hook.updated.call(fake);
  await settle();

  listeners
    .get("xenia:command:sales")
    .callback({ command: "highlight", args: { index: 2 } });

  hook.destroyed.call(fake);

  assert.deepEqual(calls, [
    ["mount", { title: "Q1" }],
    ["title", "sales", "Q2"],
    ["highlight", "sales", { index: 2 }],
    ["destroy", "sales"],
  ]);

  assert.equal(listeners.size, 0, "the command subscription is removed");
});

test("two pages' .Chart adapters stay separate", async (t) => {
  const document = setup(
    t,
    `<div id="sales" data-xenia-adapter="App.SalesPage.Chart" data-xenia-props="{}"></div>
     <div id="traffic" data-xenia-adapter="App.TrafficPage.Chart" data-xenia-props="{}"></div>`,
  );

  const listeners = new Map();
  const sales = recordingAdapter("sales");
  const traffic = recordingAdapter("traffic");

  // What LiveView's manifest holds: one hook per module-qualified name.
  const hooks = {
    "App.SalesPage.Chart": adapterHook(sales.adapter),
    "App.TrafficPage.Chart": adapterHook(traffic.adapter),
  };

  const salesHook = fakeHook(document.getElementById("sales"), listeners);
  const trafficHook = fakeHook(document.getElementById("traffic"), listeners);

  hooks["App.SalesPage.Chart"].mounted.call(salesHook);
  hooks["App.TrafficPage.Chart"].mounted.call(trafficHook);
  await settle();

  listeners
    .get("xenia:command:traffic")
    .callback({ command: "highlight", args: {} });

  assert.deepEqual(sales.calls, [["mount", {}]]);
  assert.deepEqual(traffic.calls, [
    ["mount", {}],
    ["highlight", "traffic", {}],
  ]);
});

test("providers reach a co-located adapter like any other", async (t) => {
  const document = setup(
    t,
    `<div id="sales" data-xenia-adapter="App.SalesPage.Chart" data-xenia-props="{}"></div>`,
  );

  const theme = mock.fn();
  const { adapter, calls } = recordingAdapter("sales", { consumes: ["theme"] });
  adapter.props.theme = (_instance, value) => theme(value);

  setProvider("theme", "dark");

  const hook = adapterHook(adapter);
  const fake = fakeHook(document.getElementById("sales"));
  hook.mounted.call(fake);
  await settle();

  setProvider("theme", "light");
  await settle();

  assert.deepEqual(calls[0], ["mount", { theme: "dark" }]);
  assert.deepEqual(
    theme.mock.calls.map((call) => call.arguments[0]),
    ["light"],
  );

  hook.destroyed.call(fake);
});

test("an adapter without mount() is rejected, named when it has a name", () => {
  assert.throws(() => adapterHook({ destroy() {} }), {
    name: "TypeError",
    message: "[Xenia] Adapter must define mount()",
  });

  assert.throws(() => createHooks({ Chart: { destroy() {} } }), {
    name: "TypeError",
    message: '[Xenia] Adapter "Chart" must define mount()',
  });
});

test("messages name the adapter the server rendered", async (t) => {
  const document = setup(
    t,
    `<div data-xenia-adapter="App.SalesPage.Chart" data-xenia-props="{}"></div>`,
  );

  const errors = t.mock.method(console, "error", () => {});
  const { adapter } = recordingAdapter("sales");
  const fake = fakeHook(document.querySelector("[data-xenia-adapter]"));

  adapterHook(adapter).mounted.call(fake);
  await settle();

  assert.equal(
    errors.mock.calls[0].arguments[0],
    '[Xenia] "App.SalesPage.Chart" element needs an id to receive commands',
  );
});

test("createHooks builds its hooks with adapterHook: the same shape", () => {
  const { adapter } = recordingAdapter("x");
  const hooks = createHooks({ Chart: adapter });

  assert.deepEqual(
    Object.keys(hooks.Chart).sort(),
    Object.keys(adapterHook(adapter)).sort(),
  );
});
