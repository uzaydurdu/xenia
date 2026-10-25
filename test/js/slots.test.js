/**
 * The <:loading> and <:error> slots (Xenia.Component), and `on_crash`.
 *
 * The server renders both slots inside the container: the placeholder as
 * `<div data-xenia-loading>`, the error as `<template data-xenia-error>`.
 * The core keeps the placeholder on top until the first mount finishes,
 * and shows the error, sends `on_crash`, and offers a retry when an adapter
 * callback throws. Adapters need no code for any of it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Controller, adapterHook } from "../../assets/core/controller.js";

const SLOTS = `
  <div data-xenia-loading style="height: 100%">Loading…</div>
  <template data-xenia-error>It broke. <button data-xenia-retry>Try again</button></template>
`;

/** A container with both slots, `on_crash` bound, inside a jsdom document. */
function setup(t, { slots = SLOTS, crash = "island_crashed", props = {} } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="island" data-xenia-adapter="Test"
         data-xenia-props='${JSON.stringify(props)}'
         ${crash ? `data-xenia-crash="${crash}"` : ""}>${slots}</div>
  </body></html>`);

  const original = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = original;
    dom.window.close();
  });

  const el = dom.window.document.getElementById("island");
  const pushed = [];
  const listeners = new Map();

  const hook = {
    el,
    pushEvent: (event, payload) => pushed.push([event, payload]),
    handleEvent(name, callback) {
      listeners.set(name, callback);
      return name;
    },
    removeHandleEvent(name) {
      listeners.delete(name);
    },
  };

  const send = (command, args = {}) =>
    listeners.get("xenia:command:island")?.({ command, args });

  return { dom, el, hook, pushed, send };
}

/** A promise with its resolve and reject exposed. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const quiet = (t) => t.mock.method(console, "error", () => {});

const loadingOf = (el) => el.querySelector("[data-xenia-loading]");
const crashedOf = (el) => el.querySelector("[data-xenia-crashed]");

test("the placeholder stays on top of the adapter's element until mount finishes", async (t) => {
  const { el, hook } = setup(t);
  const pending = deferred();
  let target;

  const controller = new Controller(hook, {
    mount(mountEl) {
      target = mountEl;
      return pending.promise;
    },
    destroy() {},
  });
  const mounting = controller.mount();

  const frame = el.querySelector(":scope > [data-xenia-frame]");
  assert.ok(frame, "a frame holds the placeholder and the element");
  assert.equal(target.parentNode, frame, "the element is in the frame, sized");
  assert.equal(loadingOf(el).parentNode, frame);
  assert.equal(frame.firstChild, target, "the placeholder comes after it, on top");
  assert.equal(loadingOf(el).hidden, false);

  pending.resolve({});
  await mounting;

  assert.equal(loadingOf(el).hidden, true, "hidden once mounted");
  assert.equal(target.isConnected, true);
});

test("without a <:loading> slot the container keeps its usual structure", async (t) => {
  const { el, hook } = setup(t, { slots: "" });
  let target;

  const controller = new Controller(hook, {
    mount(mountEl) {
      target = mountEl;
      return {};
    },
    destroy() {},
  });
  await controller.mount();

  assert.equal(target.parentNode, el);
  assert.equal(el.querySelector("[data-xenia-frame]"), null);
});

test("a remount doesn't bring the placeholder back", async (t) => {
  const { el, hook } = setup(t);
  let ctx;

  const controller = new Controller(hook, {
    mount(_el, _props, mountCtx) {
      ctx = mountCtx;
      return {};
    },
    destroy() {},
  });
  await controller.mount();

  ctx.remount();
  await settle();

  assert.equal(loadingOf(el).hidden, true);
  assert.equal(el.querySelectorAll("[data-xenia-frame] > div:not([data-xenia-loading])").length, 1);
});

test("mount throws: the error slot replaces the placeholder, and the server hears it", async (t) => {
  quiet(t);
  const { el, hook, pushed } = setup(t);
  let destroyed = false;

  const controller = new Controller(hook, {
    mount() {
      throw new Error("no canvas");
    },
    destroy() {
      destroyed = true;
    },
  });
  await controller.mount();

  assert.equal(loadingOf(el).hidden, true);
  assert.match(crashedOf(el).textContent, /It broke\./);
  assert.deepEqual(pushed, [
    ["island_crashed", { id: "island", phase: "mount", message: "no canvas" }],
  ]);
  assert.equal(destroyed, false, "no instance, so no destroy (§4)");
});

test("an async mount that rejects crashes the same way", async (t) => {
  quiet(t);
  const { el, hook, pushed } = setup(t);

  const controller = new Controller(hook, {
    mount: async () => {
      throw new Error("chunk failed to load");
    },
    destroy() {},
  });
  await controller.mount();

  assert.ok(crashedOf(el));
  assert.equal(pushed[0][1].message, "chunk failed to load");
});

test("a prop handler that throws: phase update, the instance is destroyed", async (t) => {
  quiet(t);
  const { el, hook, pushed } = setup(t, { props: { a: 1 } });
  const calls = [];

  const controller = new Controller(hook, {
    mount: () => ({}),
    destroy: () => calls.push("destroy"),
    props: {
      a() {
        throw new Error("bad value");
      },
    },
  });
  await controller.mount();

  el.setAttribute("data-xenia-props", JSON.stringify({ a: 2 }));
  controller.update();

  assert.deepEqual(calls, ["destroy"]);
  assert.equal(pushed[0][1].phase, "update");
  assert.ok(crashedOf(el));
});

test("a command that throws: phase command", async (t) => {
  quiet(t);
  const { el, hook, pushed } = setup(t);

  const controller = new Controller(hook, {
    mount: () => ({}),
    destroy() {},
    commands: {
      zoom() {
        throw new Error("no zoom");
      },
    },
  });
  await controller.mount();
  controller.command("zoom", {});

  assert.deepEqual(pushed[0], [
    "island_crashed",
    { id: "island", phase: "command", message: "no zoom" },
  ]);
  assert.ok(crashedOf(el));
});

test("a destroy that throws during a remount: phase remount", async (t) => {
  quiet(t);
  const { el, hook, pushed } = setup(t);
  let ctx;

  const controller = new Controller(hook, {
    mount(_el, _props, mountCtx) {
      ctx = mountCtx;
      return {};
    },
    destroy() {
      throw new Error("stuck");
    },
  });
  await controller.mount();

  ctx.remount();
  await settle();

  assert.equal(pushed[0][1].phase, "remount");
  assert.ok(crashedOf(el));
});

test("no on_crash and no error slot: torn down quietly, as before", async (t) => {
  quiet(t);
  const { el, hook, pushed } = setup(t, { slots: "", crash: null });

  const controller = new Controller(hook, {
    mount() {
      throw new Error("boom");
    },
    destroy() {},
  });
  await controller.mount();

  assert.deepEqual(pushed, []);
  assert.equal(crashedOf(el), null);
  assert.equal(el.children.length, 0, "the adapter's element is gone");
});

test("a component removed before it crashes shows nothing and sends nothing", async (t) => {
  quiet(t);
  const { el, hook, pushed } = setup(t);
  const pending = deferred();

  const controller = new Controller(hook, {
    mount: () => pending.promise,
    destroy() {},
  });
  const mounting = controller.mount();

  el.remove();
  controller.destroy();
  pending.reject(new Error("too late"));
  await mounting;

  assert.deepEqual(pushed, []);
  assert.equal(crashedOf(el), null);
});

test("retry starts a fresh island, with the placeholder while it loads", async (t) => {
  quiet(t);
  const { dom, el, hook, pushed, send } = setup(t);
  let attempts = 0;
  const second = deferred();
  const commands = [];

  const hookObject = adapterHook(
    {
      mount() {
        attempts += 1;
        if (attempts === 1) throw new Error("first try fails");
        return second.promise;
      },
      destroy() {},
      commands: { ping: (instance, args) => commands.push([instance.n, args]) },
    },
    "Test",
  );

  hookObject.mounted.call(hook);
  await settle();
  assert.ok(crashedOf(el), "the first mount crashed");
  assert.equal(pushed.length, 1);

  crashedOf(el)
    .querySelector("[data-xenia-retry]")
    .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  assert.equal(crashedOf(el), null, "the error is gone");
  assert.equal(attempts, 2, "mounted again");
  assert.equal(loadingOf(el).hidden, false, "the placeholder is back while it loads");
  assert.equal(el.querySelectorAll("[data-xenia-frame]").length, 1, "one frame, reused");

  send("ping", { x: 1 }); // queued until the new mount finishes
  second.resolve({ n: 2 });
  await settle();

  assert.equal(loadingOf(el).hidden, true);
  assert.deepEqual(commands, [[2, { x: 1 }]], "commands reach the new instance");
});

test("a retry after the hook was destroyed does nothing", async (t) => {
  quiet(t);
  const { dom, el, hook } = setup(t);
  let attempts = 0;

  const hookObject = adapterHook(
    {
      mount() {
        attempts += 1;
        throw new Error("fails");
      },
      destroy() {},
    },
    "Test",
  );

  hookObject.mounted.call(hook);
  await settle();
  const retry = crashedOf(el).querySelector("[data-xenia-retry]");

  hookObject.destroyed.call(hook);
  retry.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  assert.equal(attempts, 1);
});

test("clicks elsewhere in the error slot don't retry", async (t) => {
  quiet(t);
  const { dom, el, hook } = setup(t);
  let attempts = 0;

  const hookObject = adapterHook(
    {
      mount() {
        attempts += 1;
        throw new Error("fails");
      },
      destroy() {},
    },
    "Test",
  );

  hookObject.mounted.call(hook);
  await settle();
  crashedOf(el).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  assert.equal(attempts, 1);
  assert.ok(crashedOf(el));
});
