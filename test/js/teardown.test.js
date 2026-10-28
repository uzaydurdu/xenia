/**
 * Teardown and liveness, as the README and the ownership guide promise them:
 *
 * - pending events are sent when a LiveView navigation starts, while the
 *   view is still connected (by destroyed() it is not);
 * - ctx.isAlive() is false once the element leaves the DOM, even before
 *   LiveView calls destroyed(), and events emitted then are dropped;
 * - the hook's destroyed() destroys the adapter exactly once, and removes
 *   only the element Xenia created.
 *
 * The rest of the lifecycle (destroy during a pending mount, remounts,
 * failures) is in controller.test.js and slots.test.js.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Controller, adapterHook } from "../../assets/core/controller.js";

/** A container in a jsdom page, with `window` set for the navigation listener. */
function setup(t) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="editor" data-xenia-props="{}" data-xenia-events='{"change":"code_changed"}'></div>
  </body></html>`);

  const original = { document: globalThis.document, window: globalThis.window };
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  t.after(() => {
    globalThis.document = original.document;
    globalThis.window = original.window;
    dom.window.close();
  });

  const el = dom.window.document.getElementById("editor");
  const pushed = [];

  const hook = {
    el,
    pushEvent: (event, payload) => pushed.push([event, payload]),
    handleEvent: (name) => name,
    removeHandleEvent() {},
  };

  return { dom, el, hook, pushed };
}

test("a navigation start sends pending events, while LiveView is still connected", async (t) => {
  const { dom, hook, pushed } = setup(t);
  let ctx;

  const controller = new Controller(hook, {
    events: { change: { debounce: 10_000 } },
    mount: (_el, _props, mountCtx) => {
      ctx = mountCtx;
      return {};
    },
    destroy() {},
  });
  await controller.mount();

  ctx.emit("change", { value: "typed just before leaving" });
  assert.deepEqual(pushed, [], "debounced: not sent yet");

  dom.window.dispatchEvent(new dom.window.Event("phx:page-loading-start"));

  assert.deepEqual(pushed, [["code_changed", { value: "typed just before leaving" }]]);
  controller.destroy();
});

test("isAlive() is false once the element leaves the DOM, before destroyed() runs", async (t) => {
  const { el, hook, pushed } = setup(t);
  let ctx;

  const controller = new Controller(hook, {
    events: { change: {} },
    mount: (_el, _props, mountCtx) => {
      ctx = mountCtx;
      return {};
    },
    destroy() {},
  });
  await controller.mount();
  assert.equal(ctx.isAlive(), true);

  el.remove(); // LiveView patched the container away; destroyed() hasn't run yet

  assert.equal(ctx.isAlive(), false);
  ctx.emit("change", { value: "late" });
  assert.deepEqual(pushed, [], "a dead instance's events are dropped");
  controller.destroy();
});

test("the hook's destroyed() destroys the adapter exactly once, and removes only Xenia's element", async (t) => {
  const { el, hook } = setup(t);
  const destroyed = [];
  const own = el.ownerDocument.createElement("span"); // something LiveView rendered
  el.appendChild(own);

  const hookObject = adapterHook(
    {
      mount: (mountEl) => ({ mountEl }),
      destroy: (instance) => destroyed.push(instance),
    },
    "Monaco",
  );

  hookObject.mounted.call(hook);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const mountEl = el.lastElementChild;

  hookObject.destroyed.call(hook);
  hookObject.destroyed.call(hook); // LiveView never does this, but it must be safe

  assert.equal(destroyed.length, 1);
  assert.equal(destroyed[0].mountEl, mountEl, "destroy got the instance mount returned");
  assert.equal(mountEl.isConnected, false, "Xenia's element is gone");
  assert.equal(own.isConnected, true, "the container's other children are untouched");
});
