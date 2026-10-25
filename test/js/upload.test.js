/**
 * ctx.upload() tests (M5.5, Task D).
 *
 * Xenia events carry JSON, so binary data (a recording, a file) can't
 * travel through ctx.emit(). LiveView already has a binary channel: uploads.
 * ctx.upload(name, files) hands files to the LiveView upload `name` through
 * the hook, so adapters no longer reach into ctx.hook themselves.
 *
 * Contract checked here:
 * - valid files reach hook.upload(name, files) unchanged, and the call
 *   returns true;
 * - invalid input (blank name, non-array, non-file values), a missing
 *   hook.upload, or an upload that throws returns false and logs, but
 *   never throws, so a bad upload can't make Xenia destroy the component;
 * - after destroy, or from a context replaced by a remount, nothing is
 *   uploaded.
 *
 * The hook is a fake that records upload calls. Files are created with the
 * jsdom window's File and Blob, because the controller checks against the
 * element's own window.
 *
 * Run with: node --test test/js/upload.test.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { Controller } from "../../assets/core/controller.js";

/**
 * Creates a jsdom page, a fake Phoenix hook that records upload calls, and
 * a mounted controller.
 *
 * Returns:
 * - `dom`:        the jsdom instance, for File and Blob.
 * - `hook`:       the fake hook; delete or replace `upload` to simulate
 *                 LiveView without uploads, or an upload that fails.
 * - `controller`: a mounted Controller.
 * - `calls`:      every hook.upload call, as `{ name, files }`.
 * - `contexts`:   every ctx the adapter was mounted with.
 */
async function setup(t) {
  const originalDocument = globalThis.document;
  const dom = new JSDOM('<div id="upload-test"></div>');

  globalThis.document = dom.window.document;

  t.after(() => {
    globalThis.document = originalDocument;
    dom.window.close();
  });

  const calls = [];
  const contexts = [];

  const hook = {
    el: dom.window.document.getElementById("upload-test"),

    // Stands in for LiveView's hook.upload(name, files).
    upload(name, files) {
      calls.push({ name, files });
    },
  };

  const adapter = {
    mount: (_el, _props, ctx) => {
      contexts.push(ctx);
      return {};
    },
    destroy: () => {},
  };

  const controller = new Controller(hook, adapter);
  await controller.mount();

  return { dom, hook, controller, calls, contexts };
}

/** A small text file from the jsdom window. */
function textFile(dom, name = "example.txt") {
  return new dom.window.File(["hello"], name, { type: "text/plain" });
}

/** Waits one macrotask, so a scheduled remount runs to completion. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// -----------------------------------------------------------------------------
// 1. VALID UPLOADS
// -----------------------------------------------------------------------------

/**
 * A valid call reaches LiveView unchanged: the same upload name, and the
 * same array of the same File objects.
 */
test("uploads a valid file through Phoenix", async (t) => {
  const { dom, controller, calls } = await setup(t);
  const file = textFile(dom);

  const result = controller.ctx.upload("documents", [file]);

  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "documents");
  assert.deepEqual(calls[0].files, [file]);
});

/**
 * A plain Blob is accepted too: a recording is a Blob before it has a name.
 * Several files go through in one call.
 */
test("accepts Blobs and several files at once", async (t) => {
  const { dom, controller, calls } = await setup(t);
  const blob = new dom.window.Blob(["audio"], { type: "audio/webm" });
  const file = textFile(dom);

  assert.equal(controller.ctx.upload("recordings", [blob, file]), true);
  assert.deepEqual(calls[0].files, [blob, file]);
});

// -----------------------------------------------------------------------------
// 2. INVALID INPUT
//    Rejected before LiveView is called; logged, never thrown.
// -----------------------------------------------------------------------------

/**
 * The name must match an allow_upload/3 name on the server, so an empty
 * or whitespace-only name can never be right.
 */
test("rejects an invalid upload name", async (t) => {
  const { dom, controller, calls } = await setup(t);
  t.mock.method(console, "error", () => {}); // the rejection is logged

  const file = textFile(dom);

  assert.equal(controller.ctx.upload("", [file]), false);
  assert.equal(controller.ctx.upload("   ", [file]), false);
  assert.equal(controller.ctx.upload(null, [file]), false);
  assert.equal(calls.length, 0);
});

/**
 * Only File and Blob objects can be uploaded; strings and plain objects
 * are rejected, even when mixed with real files.
 */
test("rejects values that are not files", async (t) => {
  const { dom, controller, calls } = await setup(t);
  t.mock.method(console, "error", () => {});

  assert.equal(controller.ctx.upload("documents", ["not a file"]), false);
  assert.equal(controller.ctx.upload("documents", [textFile(dom), {}]), false);
  assert.equal(calls.length, 0);
});

/**
 * `files` must be an array, as LiveView expects. A single file passed on
 * its own is a common slip, so it is rejected with a message rather than
 * guessed at.
 */
test("rejects files that aren't an array", async (t) => {
  const { dom, controller, calls } = await setup(t);
  const errors = t.mock.method(console, "error", () => {});

  assert.equal(controller.ctx.upload("documents", textFile(dom)), false);
  assert.equal(calls.length, 0);
  assert.match(String(errors.mock.calls[0].arguments[0]), /array of File\/Blob/);
});

// -----------------------------------------------------------------------------
// 3. LIVEVIEW FAILURES
//    The component keeps running; the failure is reported, not thrown.
// -----------------------------------------------------------------------------

/**
 * Without hook.upload (for example an old LiveView, or a test hook), the
 * call returns false instead of throwing a TypeError.
 */
test("returns false when Phoenix upload is unavailable", async (t) => {
  const { dom, hook, controller } = await setup(t);
  t.mock.method(console, "error", () => {});

  delete hook.upload;

  assert.equal(controller.ctx.upload("documents", [textFile(dom)]), false);
});

/**
 * LiveView throws for an upload name the page never allowed. The error is
 * logged and the call returns false; the controller stays mounted,
 * because a throwing adapter call would otherwise destroy the component.
 */
test("an upload that throws returns false and keeps the component alive", async (t) => {
  const { dom, hook, controller } = await setup(t);
  const errors = t.mock.method(console, "error", () => {});

  hook.upload = () => {
    throw new Error("no upload named documents");
  };

  assert.equal(controller.ctx.upload("documents", [textFile(dom)]), false);
  assert.equal(controller.state, "mounted");
  assert.equal(errors.mock.callCount(), 1);
});

// -----------------------------------------------------------------------------
// 4. LIFECYCLE
//    Late callbacks from a dead or replaced instance upload nothing.
// -----------------------------------------------------------------------------

/**
 * After destroy, a late callback (a recording finishing, a timer) must not
 * start an upload for a component that no longer exists.
 */
test("does not upload after destroy", async (t) => {
  const { dom, controller, calls } = await setup(t);
  const { ctx } = controller;

  controller.destroy();

  assert.equal(ctx.upload("documents", [textFile(dom)]), false);
  assert.equal(calls.length, 0);
});

/**
 * A context replaced by a remount belongs to the old instance. It can't
 * upload; the current context still can.
 */
test("a context replaced by a remount can't upload", async (t) => {
  const { dom, controller, calls, contexts } = await setup(t);
  const oldCtx = contexts[0];

  oldCtx.remount();
  await settle();

  assert.equal(oldCtx.upload("documents", [textFile(dom)]), false);
  assert.equal(calls.length, 0);

  assert.equal(controller.ctx.upload("documents", [textFile(dom)]), true);
  assert.equal(calls.length, 1);
});