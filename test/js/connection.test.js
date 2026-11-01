/**
 * consumes: ["connection"]: each island gets its own LiveView's connection,
 * "connected" or "disconnected", as an ordinary prop.
 *
 * LiveView calls a hook's disconnected() when its view loses the socket or
 * crashes and starts rejoining, and reconnected() once it has joined again.
 * adapterHook keeps the value on the hook (so a retry's new Controller
 * starts with it) and re-runs the Controller's update(), which dispatches it
 * under the ordinary prop rules. It is not in the provider store, so it
 * can't be published.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { adapterHook } from "../../assets/core/controller.js";
import {
  setProvider,
  readProvider,
  resetProviders,
  listenerCount,
} from "../../assets/core/providers.js";

beforeEach(() => resetProviders());

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// jsdom has no IntersectionObserver: one the test triggers, for lazy islands.
class FakeObserver {
  static last = null;
  constructor(callback) {
    this.callback = callback;
    FakeObserver.last = this;
  }
  observe(el) {
    this.el = el;
  }
  disconnect() {}
  show() {
    this.callback([{ isIntersecting: true, target: this.el }]);
  }
}

/**
 * Islands in a jsdom page, each with a fake LiveView hook. `islands` maps
 * an id to its data-xenia-props; `attrs` adds attributes to every island,
 * `inner` their children.
 */
function page(t, islands = { island: {} }, { attrs = "", inner = "" } = {}) {
  const html = Object.entries(islands)
    .map(
      ([id, props]) =>
        `<div id="${id}" data-xenia-adapter="Test" data-xenia-props='${JSON.stringify(props)}' ${attrs}>${inner}</div>`,
    )
    .join("");
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);

  const original = {
    document: globalThis.document,
    window: globalThis.window,
    IntersectionObserver: globalThis.IntersectionObserver,
  };
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  dom.window.IntersectionObserver = globalThis.IntersectionObserver = FakeObserver;

  t.after(() => {
    globalThis.document = original.document;
    globalThis.window = original.window;
    globalThis.IntersectionObserver = original.IntersectionObserver;
    dom.window.close();
  });

  const hookFor = (id) => ({
    el: dom.window.document.getElementById(id),
    pushEvent() {},
    handleEvent: (name) => name,
    removeHandleEvent() {},
  });

  return { dom, hookFor };
}

/** An adapter that records its mount props and its `connection` handler calls. */
function recorder(overrides = {}) {
  const log = { mounts: [], connection: [] };
  const adapter = {
    consumes: ["connection"],
    mount: (_el, props) => (log.mounts.push(props), { n: log.mounts.length }),
    destroy() {},
    props: { connection: (_instance, value) => log.connection.push(value) },
    ...overrides,
  };
  return { adapter, log };
}

/** Mounts `adapter` on the island `id` and waits for the mount. */
async function start(hookFor, adapter, id = "island") {
  const hookObject = adapterHook(adapter, "Test");
  const hook = hookFor(id);
  hookObject.mounted.call(hook);
  await settle();

  const call = (name) => hookObject[name].call(hook);
  return { hook, hookObject, call };
}

test("a consuming island gets \"connected\" at mount, and the changes through its handler", async (t) => {
  const { hookFor } = page(t);
  const { adapter, log } = recorder();
  const { call } = await start(hookFor, adapter);

  assert.deepEqual(log.mounts, [{ connection: "connected" }]);
  assert.deepEqual(log.connection, [], "the handler isn't called for the mount value");

  call("disconnected");
  call("reconnected");
  assert.deepEqual(log.connection, ["disconnected", "connected"]);
});

test("the same value twice calls the handler once", async (t) => {
  const { hookFor } = page(t);
  const { adapter, log } = recorder();
  const { call } = await start(hookFor, adapter);

  call("disconnected");
  call("disconnected");
  call("reconnected");
  call("reconnected");
  assert.deepEqual(log.connection, ["disconnected", "connected"]);
});

test("an island that doesn't consume it sees nothing", async (t) => {
  const { hookFor } = page(t);
  const mounts = [];
  const { hook, call } = await start(hookFor, {
    mount: (_el, props) => (mounts.push(props), {}),
    destroy() {},
  });

  call("disconnected");
  call("reconnected");

  assert.deepEqual(mounts, [{}]);
  assert.equal(hook._xeniaController.instance.connection, undefined, "no default assignment");
});

test("an explicit connection prop wins; removing it falls back to the island's value", async (t) => {
  const { hookFor } = page(t, { island: { connection: "pinned" } });
  const { adapter, log } = recorder();
  const { hook, hookObject, call } = await start(hookFor, adapter);

  assert.deepEqual(log.mounts, [{ connection: "pinned" }]);

  call("disconnected");
  assert.deepEqual(log.connection, [], "the explicit prop still wins");

  hook.el.setAttribute("data-xenia-props", "{}");
  hookObject.updated.call(hook);
  assert.deepEqual(log.connection, ["disconnected"]);
});

test("each island follows its own LiveView", async (t) => {
  const { hookFor } = page(t, { a: {}, b: {} });
  const a = recorder();
  const b = recorder();
  const islandA = await start(hookFor, a.adapter, "a");
  await start(hookFor, b.adapter, "b");

  islandA.call("disconnected");
  assert.deepEqual(a.log.connection, ["disconnected"]);
  assert.deepEqual(b.log.connection, [], "the other island's LiveView is still connected");
});

test("a mount still pending when it disconnects gets the value right after", async (t) => {
  const { hookFor } = page(t);
  let resolve;
  const { adapter, log } = recorder({
    mount: (_el, props) => (log.mounts.push(props), new Promise((r) => (resolve = r))),
  });
  const hookObject = adapterHook(adapter, "Test");
  const hook = hookFor("island");

  hookObject.mounted.call(hook);
  hookObject.disconnected.call(hook);
  assert.deepEqual(log.connection, [], "nothing before mount resolves");

  resolve({});
  await settle();
  assert.deepEqual(log.mounts, [{ connection: "connected" }]);
  assert.deepEqual(log.connection, ["disconnected"], "the catch-up after mount");
});

test("a lazy island that becomes visible while disconnected mounts with \"disconnected\"", async (t) => {
  const { hookFor } = page(t, { island: {} }, { attrs: 'data-xenia-lazy="visible"' });
  const { adapter, log } = recorder();
  const { call } = await start(hookFor, adapter);

  call("disconnected");
  assert.deepEqual(log.mounts, [], "not visible yet");

  FakeObserver.last.show();
  await settle();
  assert.deepEqual(log.mounts, [{ connection: "disconnected" }]);
  assert.deepEqual(log.connection, []);
});

test("a remount gets the current value", async (t) => {
  const { hookFor } = page(t);
  const { adapter, log } = recorder();
  const { hook, call } = await start(hookFor, adapter);

  call("disconnected");
  hook._xeniaController.ctx.remount();
  await settle();

  assert.deepEqual(log.mounts, [{ connection: "connected" }, { connection: "disconnected" }]);
});

test("a retry after a crash starts with the current value", async (t) => {
  t.mock.method(console, "error", () => {});
  const { dom, hookFor } = page(t, { island: {} }, {
    inner: "<template data-xenia-error><button data-xenia-retry>Retry</button></template>",
  });
  let attempts = 0;
  const { adapter, log } = recorder({
    mount(_el, props) {
      attempts += 1;
      if (attempts === 1) throw new Error("first try fails");
      log.mounts.push(props);
      return {};
    },
  });
  const { hook, call } = await start(hookFor, adapter);

  call("disconnected"); // the crashed island has no Controller to update
  hook.el
    .querySelector("[data-xenia-retry]")
    .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await settle();

  assert.deepEqual(log.mounts, [{ connection: "disconnected" }]);
});

test("after destroyed(), disconnected() and reconnected() do nothing", async (t) => {
  const { hookFor } = page(t);
  const { adapter, log } = recorder();
  const { call } = await start(hookFor, adapter);

  call("destroyed");
  call("disconnected");
  call("reconnected");
  assert.deepEqual(log.connection, []);
});

test("it isn't in the provider store: no subscription, and it can't be published", async (t) => {
  const warnings = [];
  t.mock.method(console, "warn", (message) => warnings.push(message));
  const { hookFor } = page(t);
  const { adapter, log } = recorder({ consumes: ["connection", "theme"] });
  await start(hookFor, adapter);

  assert.equal(listenerCount("connection"), 0);
  assert.equal(listenerCount("theme"), 1, "other names still subscribe");

  setProvider("connection", "disconnected");
  assert.equal(readProvider("connection"), null);
  assert.deepEqual(log.connection, [], "the island ignores it");
  assert.match(warnings.join("\n"), /"connection" is set by Xenia/);
});
