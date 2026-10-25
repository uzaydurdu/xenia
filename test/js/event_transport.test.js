/**
 * How events reach LiveView (M5 finding, CLAUDE.md §6).
 *
 * LiveView locks the element an event is pushed from until the server
 * replies. Pushing from the container (`hook.pushEvent`) let LiveView
 * restore a stale copy of the container when several events overlapped,
 * reverting `data-xenia-props` (seen in a browser with Shoelace's rating:
 * hover, focus and change events in quick succession). So the core pushes
 * from a hidden element of its own with `liveSocket.execJS`, LiveView's
 * public API for JS commands. These tests pin that down.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Controller } from "../../assets/core/controller.js";

function setup(t, { liveSocket = true } = {}) {
  const dom = new JSDOM(
    `<div id="c" data-xenia-props="{}" data-xenia-events='{"change":"changed","save":"saved"}'></div>`,
  );
  const original = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = original;
    dom.window.close();
  });

  const execs = [];
  const pushes = [];
  const container = dom.window.document.getElementById("c");
  const hook = {
    el: container,
    pushEvent: (event, payload) => pushes.push([event, payload]),
    ...(liveSocket && {
      liveSocket: { execJS: (el, encoded) => execs.push({ el, command: JSON.parse(encoded) }) },
    }),
  };

  const adapter = {
    mount: () => ({}),
    events: { change: {}, save: {} },
    props: { kind: (_i, _v, ctx) => ctx.remount() },
  };

  return { hook, adapter, container, execs, pushes };
}

test("events are pushed with execJS from a hidden element, not from the container", async (t) => {
  const { hook, adapter, container, execs, pushes } = setup(t);
  const controller = new Controller(hook, adapter);
  await controller.mount();

  controller.ctx.emit("change", { value: 4 });

  assert.equal(pushes.length, 0, "hook.pushEvent is not used");
  assert.equal(execs.length, 1);
  assert.deepEqual(execs[0].command, [["push", { event: "changed", value: { value: 4 } }]]);

  const source = execs[0].el;
  assert.equal(source.tagName, "SPAN");
  assert.equal(source.hidden, true);
  assert.equal(source.parentElement, container, "inside the container");
  assert.notEqual(source, container, "not the container: LiveView would lock it");
  assert.notEqual(source, controller.el, "not the adapter's element: the adapter owns that");
  assert.equal(source.attributes.length, 1, "only `hidden`, so LiveView adds nothing to the payload");
});

test("the hidden element is created once, survives a remount, and goes away on destroy", async (t) => {
  const { hook, adapter, container, execs } = setup(t);
  const controller = new Controller(hook, adapter);
  await controller.mount();

  controller.ctx.emit("change", { value: 1 });
  controller.ctx.emit("save", { value: 1 });
  assert.equal(execs[0].el, execs[1].el, "reused");

  // Remount through a prop handler, then emit from the new instance.
  container.setAttribute("data-xenia-props", JSON.stringify({ kind: "line" }));
  controller.update();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.ctx.emit("change", { value: 2 });
  assert.equal(execs.at(-1).el, execs[0].el, "same element after the remount");

  controller.destroy();
  assert.equal(execs[0].el.isConnected, false, "removed on destroy");
  assert.equal(container.children.length, 0);
});

// LiveView's JS push sends the payload's keys as the event params, so only
// plain objects can go that way.
test("a payload that isn't a plain object falls back to hook.pushEvent", async (t) => {
  const { hook, adapter, execs, pushes } = setup(t);
  const controller = new Controller(hook, adapter);
  await controller.mount();

  controller.ctx.emit("change", "just a string");
  controller.ctx.emit("change", [1, 2]);

  assert.equal(execs.length, 0);
  assert.deepEqual(pushes, [
    ["changed", "just a string"],
    ["changed", [1, 2]],
  ]);
});

test("without a liveSocket (a plain hook, or tests), events use hook.pushEvent", async (t) => {
  const { hook, adapter, pushes } = setup(t, { liveSocket: false });
  const controller = new Controller(hook, adapter);
  await controller.mount();

  controller.ctx.emit("change", { value: 4 });

  assert.deepEqual(pushes, [["changed", { value: 4 }]]);
});
