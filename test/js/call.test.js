/**
 * ctx.call(name, payload): an event that resolves with the server's reply.
 *
 * The server renders a hidden XeniaCall element inside each container that
 * binds events. A call pushes from that hook, so LiveView locks it, not the
 * container (CLAUDE.md §6, M5 findings), and its pushEvent's Promise is the
 * reply. Calls are declared and bound like events, never debounced, and
 * pending events go first.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Controller, createHooks } from "../../assets/core/controller.js";

const hooks = createHooks({});

/**
 * A container that binds `search` (a call) and `change` (an event), with
 * the server's call element inside it. `withCallHook` mounts XeniaCall on it.
 */
function setup(t, { withCallElement = true, withCallHook = true } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="picker" data-xenia-props="{}"
         data-xenia-events='{"search":"search_countries","change":"picked"}'>
      ${withCallElement ? '<span id="picker-xenia-call" hidden data-xenia-call></span>' : ""}
    </div>
  </body></html>`);

  const original = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = original;
    dom.window.close();
  });

  const el = dom.window.document.getElementById("picker");
  const pushes = []; // [from, event, payload]

  const reply = (from) => (event, payload) => {
    pushes.push([from, event, payload]);
    return Promise.resolve({ from, echo: payload });
  };

  const hook = { el, pushEvent: reply("container") };
  const callEl = el.querySelector("[data-xenia-call]");
  const callHook = { el: callEl, pushEvent: reply("call element") };

  const mountCallHook = () => hooks.XeniaCall.mounted.call(callHook);
  if (withCallElement && withCallHook) mountCallHook();

  const adapter = {
    events: { search: {}, change: { debounce: 300 }, unbound: {} },
    mount: (_el, _props, ctx) => ({ ctx }),
    destroy() {},
  };

  return { el, hook, callHook, adapter, pushes, mountCallHook };
}

test("a call resolves with the server's reply, pushed from the call element", async (t) => {
  const { hook, adapter, pushes } = setup(t);
  const controller = new Controller(hook, adapter);
  await controller.mount();

  const reply = await controller.instance.ctx.call("search", { query: "an" });

  assert.deepEqual(reply, { from: "call element", echo: { query: "an" } });
  assert.deepEqual(pushes, [["call element", "search_countries", { query: "an" }]]);
});

test("pending events go first, so a call can't overtake input it depends on", async (t) => {
  const { hook, adapter, pushes } = setup(t);
  const controller = new Controller(hook, adapter);
  await controller.mount();
  const { ctx } = controller.instance;

  ctx.emit("change", { value: "fr" }); // debounced 300 ms
  await ctx.call("search", { query: "fr" });

  assert.deepEqual(
    pushes.map(([, event]) => event),
    ["picked", "search_countries"],
  );
});

test("an undeclared or unbound call rejects with a clear message", async (t) => {
  const { hook, adapter } = setup(t);
  const controller = new Controller(hook, adapter);
  await controller.mount();
  const { ctx } = controller.instance;

  await assert.rejects(ctx.call("nope"), /call "nope" isn't declared in the adapter's events/);
  await assert.rejects(ctx.call("unbound"), /call "unbound" isn't bound by the page \(on_unbound\)/);
});

test("a call from a replaced or destroyed instance rejects", async (t) => {
  const { hook, adapter } = setup(t);
  const controller = new Controller(hook, adapter);
  await controller.mount();
  const { ctx } = controller.instance;

  controller.destroy();

  await assert.rejects(ctx.call("search", {}), /no longer alive/);
});

test("a call made during mount waits for the call element's hook", async (t) => {
  const { hook, adapter, pushes, mountCallHook } = setup(t, { withCallHook: false });
  let calling;

  adapter.mount = (_el, _props, ctx) => {
    calling = ctx.call("search", { query: "" });
    return {};
  };

  const controller = new Controller(hook, adapter);
  const mounting = controller.mount();
  mountCallHook(); // LiveView mounts it in the same patch, a moment later
  await mounting;
  await calling;

  assert.equal(pushes[0][0], "call element");
});

test("without a call element, the container's hook pushes, as a fallback", async (t) => {
  const { hook, adapter, pushes } = setup(t, { withCallElement: false });
  const controller = new Controller(hook, adapter);
  await controller.mount();

  const reply = await controller.instance.ctx.call("search", { query: "x" });

  assert.equal(reply.from, "container");
  assert.equal(pushes[0][0], "container");
});

test("a rejected push rejects the call", async (t) => {
  const { hook, callHook, adapter } = setup(t);
  callHook.pushEvent = () => Promise.reject(new Error("LiveView not connected"));

  const controller = new Controller(hook, adapter);
  await controller.mount();

  await assert.rejects(controller.instance.ctx.call("search", {}), /not connected/);
});

test("XeniaCall is a built-in hook, and its name is reserved", () => {
  assert.equal(typeof hooks.XeniaCall.mounted, "function");
  assert.throws(
    () => createHooks({ XeniaCall: { mount() {} } }),
    /"XeniaCall" is a reserved hook name/,
  );
});
