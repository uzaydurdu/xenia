/**
 * lazy="visible" (data-xenia-lazy): the island's Controller exists at once,
 * but its mount waits until an IntersectionObserver sees the container.
 * Commands queue and props are read at mount, exactly as for a slow mount.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { adapterHook } from "../../assets/core/controller.js";

// jsdom has no IntersectionObserver: a fake one the test triggers.
class FakeObserver {
  static all = [];
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.disconnected = false;
    FakeObserver.all.push(this);
  }
  observe(el) { this.el = el; }
  disconnect() { this.disconnected = true; }
  report(isIntersecting) {
    this.callback([{ isIntersecting, target: this.el }]);
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A container in a jsdom page, a fake hook whose handleEvent keeps the
 * command handler, and the adapterHook for `adapter`.
 */
function setup(t, adapter, { lazy = "visible", observer = true } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="island" data-xenia-props='{"value":1}'
      ${lazy ? `data-xenia-lazy="${lazy}"` : ""}></div>
  </body></html>`);

  const original = {
    document: globalThis.document,
    window: globalThis.window,
    IntersectionObserver: globalThis.IntersectionObserver,
  };
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  // In a browser, window.IntersectionObserver and the global are the same.
  if (observer) dom.window.IntersectionObserver = globalThis.IntersectionObserver = FakeObserver;
  FakeObserver.all = [];
  t.after(() => {
    globalThis.document = original.document;
    globalThis.window = original.window;
    globalThis.IntersectionObserver = original.IntersectionObserver;
    dom.window.close();
  });

  const el = dom.window.document.getElementById("island");
  const handlers = {};
  const hook = {
    el,
    pushEvent() {},
    handleEvent: (name, callback) => ((handlers[name] = callback), name),
    removeHandleEvent() {},
  };
  const hookObject = adapterHook(adapter, "Island");
  const command = (name, args = {}) => handlers["xenia:command:island"]({ command: name, args });

  return { el, hook, hookObject, command, observer: () => FakeObserver.all.at(-1) };
}

test("it mounts only once the island is visible, then stops observing", async (t) => {
  const mounts = [];
  const { hook, hookObject, observer } = setup(t, {
    mount: (_el, props) => (mounts.push(props), {}),
    destroy() {},
  });

  hookObject.mounted.call(hook);
  await tick();
  assert.equal(mounts.length, 0, "not before it's visible");
  assert.equal(observer().el, hook.el, "the container is observed");
  assert.equal(observer().options.rootMargin, "200px", "a little before it's on screen");

  observer().report(false);
  await tick();
  assert.equal(mounts.length, 0, "an entry that isn't intersecting doesn't mount it");

  observer().report(true);
  await tick();
  assert.deepEqual(mounts, [{ value: 1 }]);
  assert.ok(observer().disconnected);
});

test("commands sent before it's visible arrive after mount, in order", async (t) => {
  const received = [];
  const { hook, hookObject, command, observer } = setup(t, {
    mount: () => ({}),
    destroy() {},
    commands: { note: (_instance, args) => received.push(args.n) },
  });

  hookObject.mounted.call(hook);
  await tick();
  command("note", { n: 1 });
  command("note", { n: 2 });
  assert.deepEqual(received, [], "queued, not delivered");

  observer().report(true);
  await tick();
  assert.deepEqual(received, [1, 2]);
});

test("props changed before it's visible: mount gets the latest", async (t) => {
  const mounts = [];
  const changes = [];
  const { el, hook, hookObject, observer } = setup(t, {
    mount: (_el, props) => (mounts.push(props), {}),
    destroy() {},
    props: { value: (_instance, value) => changes.push(value) },
  });

  hookObject.mounted.call(hook);
  await tick();
  el.setAttribute("data-xenia-props", '{"value":2}');
  hookObject.updated.call(hook);
  el.setAttribute("data-xenia-props", '{"value":3}');
  hookObject.updated.call(hook);

  observer().report(true);
  await tick();
  assert.deepEqual(mounts, [{ value: 3 }], "one mount, with the latest props");
  assert.deepEqual(changes, [], "no prop handler for what mount already had");
});

test("destroyed before it's visible: no mount, no destroy, the observer stops", async (t) => {
  let mounts = 0;
  let destroys = 0;
  const { hook, hookObject, observer } = setup(t, {
    mount: () => (mounts++, {}),
    destroy: () => destroys++,
  });

  hookObject.mounted.call(hook);
  await tick();
  const watching = observer();
  hookObject.destroyed.call(hook);
  assert.ok(watching.disconnected);

  // A late report from the observer changes nothing.
  watching.report(true);
  await tick();
  assert.equal(mounts, 0);
  assert.equal(destroys, 0);
});

test("without lazy, it mounts at once and nothing is observed", async (t) => {
  let mounts = 0;
  const { hook, hookObject } = setup(t, { mount: () => (mounts++, {}), destroy() {} }, { lazy: null });

  hookObject.mounted.call(hook);
  await tick();
  assert.equal(mounts, 1);
  assert.equal(FakeObserver.all.length, 0);
});

test("a browser without IntersectionObserver mounts at once", async (t) => {
  let mounts = 0;
  const { hook, hookObject } = setup(
    t,
    { mount: () => (mounts++, {}), destroy() {} },
    { observer: false },
  );

  hookObject.mounted.call(hook);
  await tick();
  assert.equal(mounts, 1);
});

test("an unknown lazy value mounts at once", async (t) => {
  let mounts = 0;
  const { hook, hookObject } = setup(t, { mount: () => (mounts++, {}), destroy() {} }, { lazy: "idle" });

  hookObject.mounted.call(hook);
  await tick();
  assert.equal(mounts, 1, "only visible is supported so far");
});
