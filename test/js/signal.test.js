/**
 * ctx.signal: an AbortSignal per instance, aborted when that instance's
 * destruction begins. An adapter passes it to fetch() and to
 * addEventListener(), and both clean themselves up:
 *
 *   fetch(url, { signal: ctx.signal })
 *   document.addEventListener("keydown", onKey, { signal: ctx.signal })
 *
 * "Destruction begins" means: destroy() (the island removed, a navigation,
 * a crash), a remount replacing the instance, or a failed mount
 * (abandonMount). Always before adapter.destroy() runs, and after
 * isAlive() turned false. Asking for a remount aborts nothing: a pending
 * mount still finishes, and is then replaced.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { Controller, adapterHook } from "../../assets/core/controller.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A promise with its resolve and reject exposed. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** What fetch(url, { signal }) does with an abort: rejects with its reason. */
function abortable(signal) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

/**
 * An island in a jsdom page, with an error slot and `on_crash` bound, and a
 * hook that records what it pushes. `options` may set `inner` (children).
 */
function page(t, { inner = "" } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="island" data-xenia-adapter="Test" data-xenia-props="{}"
         data-xenia-crash="island_crashed">${inner}</div>
  </body></html>`);

  const original = { document: globalThis.document, window: globalThis.window };
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  t.after(() => {
    globalThis.document = original.document;
    globalThis.window = original.window;
    dom.window.close();
  });

  const el = dom.window.document.getElementById("island");
  const pushed = [];
  const hook = {
    el,
    pushEvent: (event, payload) => pushed.push([event, payload]),
    handleEvent: (name) => name,
    removeHandleEvent() {},
  };

  return { dom, doc: dom.window.document, el, hook, pushed };
}

/** Mounts `adapter` with a Controller and waits for the mount. */
async function mounted(t, adapter, options) {
  const fixture = page(t, options);
  const controller = new Controller(fixture.hook, adapter);
  await controller.mount();
  return { ...fixture, controller };
}

// ------------------------------------------------------------
// 1. While the instance is alive
// ------------------------------------------------------------

test("ctx.signal is an AbortSignal, not aborted while the instance is alive", async (t) => {
  const { controller, dom, el, hook } = await mounted(t, {
    mount: () => ({}),
    destroy() {},
    props: { a() {} },
  });
  const { signal } = controller.ctx;

  // The island's own window's AbortSignal, so that page's addEventListener
  // and fetch accept it.
  assert.ok(signal instanceof dom.window.AbortSignal);

  el.setAttribute("data-xenia-props", '{"a":1}');
  controller.update();
  assert.equal(signal.aborted, false, "updates don't abort it");
  assert.equal(hook.el.isConnected, true);
});

test("each instance has its own signal", async (t) => {
  const { controller } = await mounted(t, { mount: () => ({}), destroy() {} });
  const first = controller.ctx.signal;

  controller.ctx.remount();
  await settle();

  assert.notEqual(controller.ctx.signal, first);
});

// ------------------------------------------------------------
// 2. Destruction aborts it, before adapter.destroy
// ------------------------------------------------------------

test("destroy aborts it before adapter.destroy, after isAlive() turned false", async (t) => {
  const seen = {};
  const { controller } = await mounted(t, {
    mount(_el, _props, ctx) {
      ctx.signal.addEventListener("abort", () => (seen.aliveInAbort = ctx.isAlive()));
      return {};
    },
    destroy(_instance, ctx) {
      seen.abortedInDestroy = ctx.signal.aborted;
    },
  });

  controller.destroy();

  assert.deepEqual(seen, { aliveInAbort: false, abortedInDestroy: true });
});

test("the abort's reason is an AbortError, as fetch reports it", async (t) => {
  const { controller } = await mounted(t, { mount: () => ({}), destroy() {} });
  const { signal } = controller.ctx;

  controller.destroy();

  assert.equal(signal.reason?.name, "AbortError");
});

test("a listener added with the signal is gone after destroy, with no adapter code", async (t) => {
  let keys = 0;
  const { controller, doc, dom } = await mounted(t, {
    mount(el, _props, ctx) {
      el.ownerDocument.addEventListener("keydown", () => (keys += 1), { signal: ctx.signal });
      return {};
    },
    destroy() {},
  });
  const press = () => doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "a" }));

  press();
  controller.destroy();
  press();

  assert.equal(keys, 1, "called once before destroy, never after");
});

// ------------------------------------------------------------
// 3. A pending mount
// ------------------------------------------------------------

/**
 * The island is removed while its mount waits on a fetch. The fetch is
 * aborted, the mount rejects with the AbortError, and that is not a crash:
 * the island is gone, so nothing is reported or shown.
 */
test("removed while mount waits on a fetch: the fetch is aborted, quietly", async (t) => {
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  const fixture = page(t, {
    inner: "<template data-xenia-error>It broke.</template>",
  });
  let fetchSignal;
  const controller = new Controller(fixture.hook, {
    async mount(_el, _props, ctx) {
      fetchSignal = ctx.signal;
      await abortable(ctx.signal);
      return {};
    },
    destroy() {},
  });

  const mounting = controller.mount();
  controller.destroy();
  await mounting;
  await settle();

  assert.equal(fetchSignal.aborted, true);
  assert.deepEqual(fixture.pushed, [], "no on_crash");
  assert.equal(fixture.el.querySelector("[data-xenia-crashed]"), null, "no error slot");
  assert.deepEqual(errors, [], "no console error");
});

/**
 * Asking for a remount while mount is pending aborts nothing: the mount
 * finishes, then the remount replaces it, and only then is its signal
 * aborted.
 */
test("ctx.remount() during a pending mount aborts nothing until the replacement", async (t) => {
  const fixture = page(t);
  const pending = deferred();
  const signals = [];
  let mounts = 0;
  const controller = new Controller(fixture.hook, {
    mount(_el, _props, ctx) {
      signals.push(ctx.signal);
      mounts += 1;
      return mounts === 1 ? pending.promise : {};
    },
    destroy() {},
  });

  const mounting = controller.mount();
  controller.ctx.remount();
  assert.equal(signals[0].aborted, false, "requesting a remount doesn't abort");

  pending.resolve({});
  await mounting;
  await settle();

  assert.equal(mounts, 2);
  assert.equal(signals[0].aborted, true, "aborted once replaced");
  assert.equal(signals[1].aborted, false, "the new instance's signal is fresh");
});

// ------------------------------------------------------------
// 4. Remount, failures and retry
// ------------------------------------------------------------

test("a remount aborts the old signal before destroying the old instance", async (t) => {
  const log = [];
  const { controller } = await mounted(t, {
    mount: (_el, _props, ctx) => ({ signal: ctx.signal }),
    destroy(instance, ctx) {
      log.push([instance.signal === ctx.signal, ctx.signal.aborted]);
    },
  });
  const old = controller.ctx.signal;

  controller.ctx.remount();
  await settle();

  assert.deepEqual(log, [[true, true]], "the old ctx's signal, already aborted");
  assert.equal(old.aborted, true);
  assert.equal(controller.ctx.signal.aborted, false);
});

/**
 * A mount that adds a listener with the signal and then throws: the
 * failed mount is torn down without adapter.destroy, so the signal is the
 * only thing that can remove that listener.
 */
test("a failed mount aborts it, so listeners it added go away", async (t) => {
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  let resizes = 0;
  const fixture = page(t);
  const { window } = fixture.dom;
  const resize = () => window.dispatchEvent(new window.Event("resize"));
  const controller = new Controller(fixture.hook, {
    mount(_el, _props, ctx) {
      window.addEventListener("resize", () => (resizes += 1), { signal: ctx.signal });
      resize(); // the listener is really there
      throw new Error("the library failed to start");
    },
    destroy() {},
  });

  await controller.mount();
  resize();

  assert.equal(errors[0]?.[1]?.message, "the library failed to start", "the adapter's own error");
  assert.equal(controller.ctx.signal.aborted, true);
  assert.equal(resizes, 1, "not called after the failed mount");
});

test("a crash after mount aborts it", async (t) => {
  t.mock.method(console, "error", () => {});
  const { controller, el } = await mounted(t, {
    mount: () => ({}),
    destroy() {},
    props: {
      a() {
        throw new Error("the handler broke");
      },
    },
  });
  const { signal } = controller.ctx;

  el.setAttribute("data-xenia-props", '{"a":1}');
  controller.update();

  assert.equal(signal.aborted, true);
});

test("a retry after a crash starts with a fresh signal", async (t) => {
  t.mock.method(console, "error", () => {});
  const { dom, el, hook } = page(t, {
    inner: "<template data-xenia-error><button data-xenia-retry>Retry</button></template>",
  });
  const signals = [];
  const hookObject = adapterHook(
    {
      mount(_el, _props, ctx) {
        signals.push(ctx.signal);
        if (signals.length === 1) throw new Error("first try fails");
        return {};
      },
      destroy() {},
    },
    "Test",
  );

  hookObject.mounted.call(hook);
  await settle();
  el.querySelector("[data-xenia-retry]").dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true }),
  );
  await settle();

  assert.equal(signals.length, 2);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
});

test("the hook's destroyed() aborts it", async (t) => {
  const { hook } = page(t);
  let signal;
  const hookObject = adapterHook(
    {
      mount: (_el, _props, ctx) => ((signal = ctx.signal), {}),
      destroy() {},
    },
    "Test",
  );

  hookObject.mounted.call(hook);
  await settle();
  hookObject.destroyed.call(hook);

  assert.equal(signal.aborted, true);
});
