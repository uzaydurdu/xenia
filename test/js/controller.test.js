/**
 * Controller integration tests (jsdom).
 *
 * Unlike the unit tests with hand-made fakes, these run the Controller
 * against a real DOM from jsdom, so element attachment, removal and
 * `isConnected` behave as in a browser.
 *
 * Each test calls `setup()`, which:
 * - creates a document containing the Phoenix-owned container `<div id="x">`;
 * - stores props as JSON in `data-xenia-props`, the way the server renders them;
 * - provides a minimal adapter (§4 contract) that records every call in
 *   `calls`, so tests can assert both which handlers ran and in what order.
 *
 * Remount tests use `setupNumbered()` instead, which numbers adapter
 * instances (1, 2, …) and records calls as `[kind, instanceId, value]`,
 * so assertions can tell an old instance from its replacement.
 *
 * Async timing is controlled with two helpers:
 * - `deferred()`: a promise the test resolves manually, used to hold a
 *   mount or destroy open while the test acts (update, command, destroy);
 * - `settle()`: waits one macrotask, so scheduled remounts and all pending
 *   microtasks finish before the test continues.
 *
 * Prop tests assume changedKeys() reports keys in object order.
 *
 * Sections:
 * 1. Mount contract         6. Commands
 * 2. Async reconciliation   7. Remount
 * 3. Updates after mount    8. Reentrancy
 * 4. Destruction            9. Cleanup failures
 * 5. Mount failures
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Controller } from "../../assets/core/controller.js";

/**
 * Creates an isolated DOM, a Phoenix-like hook and a recording adapter.
 *
 * The global `document` is swapped for the jsdom one and restored via
 * `t.after()`, so tests can't leak DOM state into each other.
 *
 * Returns:
 * - `hook`:     `{ el }`, where `el` is the container Phoenix would own.
 * - `adapter`:  mount/destroy plus one prop handler (`a`) and one command
 *               (`run`), each pushing an entry into `calls`.
 * - `calls`:    ordered log of adapter activity, e.g. `["a", 2]`.
 * - `setProps`: simulates the server re-rendering with new props.
 */
function setup(t, props = {}) {
  const originalDocument = globalThis.document;

  const dom = new JSDOM("<div id='x'></div>");
  globalThis.document = dom.window.document;

  t.after(() => {
    globalThis.document = originalDocument;
    dom.window.close();
  });

  const el = document.getElementById("x");

  const setProps = (value) => {
    el.setAttribute("data-xenia-props", JSON.stringify(value));
  };

  setProps(props);

  const calls = [];

  const adapter = {
    mount: (_el, props) => {
      calls.push(["mount", props]);
      return {};
    },

    destroy: () => {
      calls.push(["destroy"]);
    },

    props: {
      a: (_instance, value) => {
        calls.push(["a", value]);
      },
    },

    commands: {
      run: (_instance, args) => {
        calls.push(["run", args]);
      },
    },
  };

  return {
    hook: { el },
    adapter,
    calls,
    setProps,
  };
}

/**
 * Like setup(), but every adapter instance gets an id (1, 2, …) and calls
 * are recorded with it: `["mount", id, props]`, `["destroy", id]`,
 * `["run", id, args]`. Also returns `named(kind)`, which filters `calls`
 * to one kind, e.g. `named("mount")`.
 */
function setupNumbered(t, props = {}) {
  const base = setup(t, props);
  const { adapter, calls } = base;

  let mounts = 0;

  adapter.mount = (_el, mountProps) => {
    const instance = { id: ++mounts };
    calls.push(["mount", instance.id, mountProps]);
    return instance;
  };

  adapter.destroy = (instance) => {
    calls.push(["destroy", instance.id]);
  };

  adapter.commands = {
    run: (instance, args) => {
      calls.push(["run", instance.id, args]);
    },
  };

  const named = (kind) => calls.filter(([k]) => k === kind);

  return { ...base, named };
}

/**
 * Returns a promise together with its `resolve` function, so a test can
 * decide exactly when a pending adapter call completes.
 */
function deferred() {
  let resolve;

  const promise = new Promise((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

/**
 * Waits one macrotask. All pending microtasks (scheduled remounts and
 * awaited synchronous adapter calls) run before it resolves.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// -----------------------------------------------------------------------------
// 1. MOUNT CONTRACT TEST CASES
//    What adapter.mount() receives, and how the child element is set up.
// -----------------------------------------------------------------------------

/**
 * adapter.mount(el, props, ctx) must receive the Controller's own child
 * element (never the Phoenix container), the decoded props object, and the
 * Controller's context. The child is sized to fill its container.
 */
test("mount receives the child element, props, and context", async (t) => {
  const { hook, adapter } = setup(t, { a: 1 });

  let received;
  adapter.mount = (el, props, ctx) => {
    received = { el, props, ctx };
    return {};
  };

  const controller = new Controller(hook, adapter);
  await controller.mount();

  // Mounting into hook.el would let Phoenix patches destroy the adapter's DOM.
  assert.equal(received.el, controller.el);
  assert.notEqual(received.el, hook.el);

  assert.deepEqual(received.props, { a: 1 });
  assert.equal(received.ctx, controller.ctx);

  assert.equal(controller.el.style.width, "100%");
  assert.equal(controller.el.style.height, "100%");
});

// -----------------------------------------------------------------------------
// 2. ASYNC RECONCILIATION TEST CASES
//    Props that change while adapter.mount() is pending are applied once,
//    after mounting, using only the latest value.
// -----------------------------------------------------------------------------

/**
 * A prop change during a pending mount must not reach the adapter early,
 * but must be applied right after the mount resolves.
 */
test("props changed during mounting are caught up once", async (t) => {
  const { hook, adapter, calls, setProps } = setup(t, { a: 1 });

  const pending = deferred();
  adapter.mount = () => pending.promise;

  const controller = new Controller(hook, adapter);
  const mounting = controller.mount(); // intentionally not awaited yet

  setProps({ a: 2 });
  controller.update();

  assert.deepEqual(calls, []);

  pending.resolve({});
  await mounting;

  assert.deepEqual(calls, [["a", 2]]);
  assert.equal(controller.state, "mounted");
});

/**
 * Several updates during a pending mount collapse into a single dispatch
 * of the final value; intermediate values are never sent to the adapter.
 */
test("multiple pending updates are coalesced", async (t) => {
  const { hook, adapter, calls, setProps } = setup(t, { a: 1 });

  const pending = deferred();
  adapter.mount = () => pending.promise;

  const controller = new Controller(hook, adapter);
  const mounting = controller.mount();

  setProps({ a: 2 });
  controller.update();

  setProps({ a: 3 });
  controller.update();

  setProps({ a: 4 });
  controller.update();

  assert.deepEqual(calls, []);

  pending.resolve({});
  await mounting;

  assert.deepEqual(calls, [["a", 4]]);
});

// -----------------------------------------------------------------------------
// 3. UPDATE TEST CASES
//    How changed props reach the adapter once it is mounted.
// -----------------------------------------------------------------------------

/**
 * After mounting, a changed prop is dispatched to its custom handler.
 */
test("props are dispatched after mounting", async (t) => {
  const { hook, adapter, calls, setProps } = setup(t, { a: 1 });

  const controller = new Controller(hook, adapter);
  await controller.mount();

  calls.length = 0; // ignore mount activity; only updates matter here

  setProps({ a: 5 });
  controller.update();

  assert.deepEqual(calls, [["a", 5]]);
});

/**
 * A prop without a custom handler falls back to assigning the value
 * directly onto the instance returned by adapter.mount().
 */
test("default prop handler assigns to the instance", async (t) => {
  const { hook, adapter, setProps } = setup(t, { color: "blue" });

  const instance = { color: "blue" };
  adapter.mount = () => instance;

  const controller = new Controller(hook, adapter);
  await controller.mount();

  setProps({ color: "green" });
  controller.update();

  assert.equal(instance.color, "green");
});

/**
 * A key removed from the server props is dispatched with `undefined`,
 * so the adapter can clear it.
 */
test("removed props dispatch undefined", async (t) => {
  const { hook, calls, setProps, adapter } = setup(t, { a: 1 });

  const controller = new Controller(hook, adapter);
  await controller.mount();

  calls.length = 0;

  setProps({});
  controller.update();

  assert.deepEqual(calls, [["a", undefined]]);
});

// -----------------------------------------------------------------------------
// 4. DESTRUCTION TEST CASES
//    destroy() is terminal, safe during a pending mount, and only touches
//    the Controller's own DOM.
// -----------------------------------------------------------------------------

/**
 * Once destroyed, the Controller ignores further updates and commands.
 */
test("updates and commands are ignored after destroy", async (t) => {
  const { hook, adapter, calls, setProps } = setup(t, { a: 1 });

  const controller = new Controller(hook, adapter);
  await controller.mount();

  controller.destroy();
  calls.length = 0; // ignore the destroy call itself

  setProps({ a: 10 });
  controller.update();
  controller.command("run", { value: 2 });

  assert.deepEqual(calls, []);
});

/**
 * If destroy() runs while adapter.mount() is still pending, there is no
 * instance to clean up yet. When the mount later resolves, the Controller
 * must destroy that late instance exactly once instead of leaking it.
 */
test("destroy during pending mount cleans up late instance", async (t) => {
  const { hook, adapter, calls } = setup(t);

  const pending = deferred();
  const instance = { ready: true };

  adapter.mount = () => pending.promise;
  adapter.destroy = (received) => {
    calls.push(["destroy", received]);
  };

  const controller = new Controller(hook, adapter);
  const mounting = controller.mount();

  controller.destroy();

  // No instance exists yet, so the adapter must not be asked to clean up.
  assert.deepEqual(calls, []);
  assert.equal(controller.el.isConnected, false);

  pending.resolve(instance);
  await mounting;

  assert.deepEqual(calls, [["destroy", instance]]);
  assert.equal(controller.state, "destroyed");
});

/**
 * ctx.isAlive() is true until destroy starts and already false while
 * adapter.destroy() runs, because the state is set to "destroyed" first.
 * Adapters can rely on this to skip work inside async callbacks.
 */
test("isAlive returns false inside destroy", async (t) => {
  const { hook, adapter } = setup(t);

  let aliveDuringDestroy;
  adapter.destroy = (_instance, ctx) => {
    aliveDuringDestroy = ctx.isAlive();
  };

  const controller = new Controller(hook, adapter);

  assert.equal(controller.ctx.isAlive(), true);

  await controller.mount();
  controller.destroy();

  assert.equal(aliveDuringDestroy, false);
  assert.equal(controller.ctx.isAlive(), false);
});

/**
 * destroy() removes the Controller's child element but leaves the
 * Phoenix-owned container in the document untouched.
 */
test("destroy removes only the child element", async (t) => {
  const { hook, adapter } = setup(t);

  const controller = new Controller(hook, adapter);
  await controller.mount();

  assert.equal(hook.el.contains(controller.el), true);

  controller.destroy();

  assert.equal(hook.el.contains(controller.el), false);
  assert.equal(document.getElementById("x"), hook.el);
  assert.equal(hook.el.isConnected, true);
});

// -----------------------------------------------------------------------------
// 5. MOUNT FAILURE TEST CASES
// -----------------------------------------------------------------------------

/**
 * A rejected mount moves the Controller to "destroyed" and removes its
 * child element, but never calls adapter.destroy(): no instance was ever
 * created, so there is nothing for the adapter to clean up.
 */
test("mount rejection never calls adapter.destroy", async (t) => {
  const { hook, adapter, calls } = setup(t);

  t.mock.method(console, "error", () => {}); // silence the expected error log

  adapter.mount = async () => {
    throw new Error("Mount failed");
  };

  const controller = new Controller(hook, adapter);
  await controller.mount();

  assert.equal(controller.state, "destroyed");
  assert.deepEqual(calls, []);
  assert.equal(controller.el.isConnected, false);
});

// -----------------------------------------------------------------------------
// 6. COMMAND TEST CASES
// -----------------------------------------------------------------------------

/**
 * Commands sent during a pending mount are queued and replayed in their
 * original order once the mount resolves. Prop reconciliation runs first,
 * so replayed commands see the latest props.
 */
test("commands are queued during mount and replayed in order", async (t) => {
  const { hook, adapter, calls, setProps } = setup(t, { a: 1 });

  const pending = deferred();
  adapter.mount = () => pending.promise;

  const controller = new Controller(hook, adapter);
  const mounting = controller.mount();

  controller.command("run", { step: 1 });
  controller.command("run", { step: 2 });

  setProps({ a: 3 });
  controller.update();

  assert.deepEqual(calls, []);

  pending.resolve({});
  await mounting;

  assert.deepEqual(calls, [
    ["a", 3],
    ["run", { step: 1 }],
    ["run", { step: 2 }],
  ]);
});

// -----------------------------------------------------------------------------
// 7. REMOUNT TEST CASES
//    ctx.remount() replaces the adapter instance while the Controller lives
//    on. Requests are coalesced, wait for a pending mount, and hold back
//    props and commands until the replacement is ready.
// -----------------------------------------------------------------------------

/**
 * Two ctx.remount() calls in the same tick produce a single replacement:
 * the first instance is destroyed once and exactly one new instance is
 * mounted.
 */
test("two remount requests create only one replacement", async (t) => {
  const { hook, adapter, named } = setupNumbered(t);

  const controller = new Controller(hook, adapter);
  await controller.mount();

  controller.ctx.remount();
  controller.ctx.remount();

  await settle();

  assert.deepEqual(named("destroy"), [["destroy", 1]]);
  assert.equal(named("mount").length, 2); // initial + one replacement
  assert.equal(controller.instance.id, 2);
  assert.equal(controller.state, "mounted");
});

/**
 * A remount requested while the initial adapter.mount() is still pending
 * waits until that mount resolves, then replaces the instance. A command
 * sent in the meantime is delivered to the replacement, not the first
 * instance.
 */
test("remount requested during pending mount executes afterward", async (t) => {
  const { hook, adapter, named } = setupNumbered(t);

  // Hold only the first mount open; the replacement mounts synchronously.
  const pending = deferred();
  const mountInstance = adapter.mount;
  adapter.mount = (el, props, ctx) => {
    const instance = mountInstance(el, props, ctx);
    return instance.id === 1 ? pending.promise.then(() => instance) : instance;
  };

  const controller = new Controller(hook, adapter);
  const mounting = controller.mount();

  controller.ctx.remount();
  controller.command("run", { step: 1 });

  await settle();

  // Still waiting for the first mount: no replacement, no command yet.
  assert.equal(named("mount").length, 1);
  assert.deepEqual(named("run"), []);

  pending.resolve();
  await mounting;
  await settle();

  assert.deepEqual(named("destroy"), [["destroy", 1]]);
  assert.equal(named("mount").length, 2);
  assert.deepEqual(named("run"), [["run", 2, { step: 1 }]]);
  assert.equal(controller.instance.id, 2);
});

/**
 * When a prop handler requests a remount, the remaining changed props are
 * not sent to the old instance. The replacement is mounted with the full
 * latest props instead, so nothing is lost.
 */
test("remaining prop handlers stop when remount is requested", async (t) => {
  const { hook, adapter, calls, named, setProps } = setupNumbered(t, {
    a: 1,
    b: 1,
  });

  let remountRequested = false;

  adapter.props = {
    a: (instance, value, ctx) => {
      calls.push(["a", instance.id, value]);

      if (!remountRequested) {
        remountRequested = true;
        ctx.remount();
      }
    },

    b: (instance, value) => {
      calls.push(["b", instance.id, value]);
    },
  };

  const controller = new Controller(hook, adapter);
  await controller.mount();

  setProps({ a: 2, b: 2 });
  controller.update();

  await settle();

  assert.deepEqual(named("a"), [["a", 1, 2]]);
  assert.deepEqual(named("b"), []); // never sent to instance 1

  assert.deepEqual(named("mount"), [
    ["mount", 1, { a: 1, b: 1 }],
    ["mount", 2, { a: 2, b: 2 }], // replacement starts with the latest props
  ]);
});

/**
 * Makes the adapter's second mount (the remount's replacement) asynchronous,
 * so a test can act while the remount is still in progress. destroy() is
 * synchronous (§4), so the replacement's mount is the only part of a remount
 * that can be slow.
 */
function holdReplacementMount(adapter, calls) {
  const mounting = deferred();
  let mounts = 0;

  adapter.mount = (_el, mountProps) => {
    const instance = { id: ++mounts };
    calls.push(["mount", instance.id, mountProps]);
    return instance.id === 1 ? instance : mounting.promise.then(() => instance);
  };

  return mounting;
}

/**
 * Commands sent after a remount is requested (before it starts) and while
 * it is running (the replacement still mounting) are queued and delivered,
 * in order, to the replacement instance only.
 */
test("commands queued during remount reach the new instance", async (t) => {
  const { hook, adapter, calls, named } = setupNumbered(t);
  const mounting = holdReplacementMount(adapter, calls);

  const controller = new Controller(hook, adapter);
  await controller.mount();

  controller.ctx.remount();
  controller.command("run", { step: 1 }); // requested, not started yet

  await settle(); // old instance destroyed, replacement mount pending

  controller.command("run", { step: 2 }); // remount in progress

  assert.deepEqual(named("run"), []);
  assert.deepEqual(named("destroy"), [["destroy", 1]]);

  mounting.resolve();
  await settle();

  assert.deepEqual(named("run"), [
    ["run", 2, { step: 1 }],
    ["run", 2, { step: 2 }],
  ]);
});

/**
 * Destroying the controller while the replacement is still mounting stops
 * the remount: the replacement is destroyed as soon as its mount resolves,
 * never receives commands or props, the old instance is not destroyed a
 * second time, and the child element is removed.
 */
test("destroy during asynchronous remount prevents another mount", async (t) => {
  const { hook, adapter, calls, named } = setupNumbered(t);
  const mounting = holdReplacementMount(adapter, calls);

  const controller = new Controller(hook, adapter);
  await controller.mount();

  controller.ctx.remount();
  await settle(); // old instance destroyed, replacement mount pending

  controller.command("run", { step: 1 });
  controller.destroy();

  mounting.resolve();
  await settle();

  assert.equal(named("mount").length, 2);
  assert.deepEqual(named("destroy"), [
    ["destroy", 1],
    ["destroy", 2], // the late replacement is cleaned up
  ]);
  assert.deepEqual(named("run"), []);
  assert.equal(controller.state, "destroyed");
  assert.equal(controller.instance, undefined);
  assert.equal(hook.el.children.length, 0);
});

// -----------------------------------------------------------------------------
// 8. REENTRANCY TEST CASES
//    A prop handler can synchronously trigger a newer update. The older
//    dispatch loop must not overwrite newer values, but must still deliver
//    keys the newer update didn't touch.
// -----------------------------------------------------------------------------

/**
 * Builds prop handlers for `a` and `b` that record values. The first time
 * `a` receives 2, it synchronously triggers a nested update to `nested`,
 * simulating an adapter callback that causes Phoenix to re-render.
 */
function reentrantHandlers(calls, setProps, getController, nested) {
  let triggered = false;

  return {
    a: (_instance, value) => {
      calls.push(["a", value]);

      if (value === 2 && !triggered) {
        triggered = true;
        setProps(nested);
        getController().update();
      }
    },

    b: (_instance, value) => {
      calls.push(["b", value]);
    },
  };
}

/** Returns only the prop dispatches from `calls`, in order. */
const propCalls = (calls) =>
  calls.filter(([kind]) => kind === "a" || kind === "b");

/**
 * The nested update changes `b` too, so it sends the newer `b: 3` itself.
 * The outer loop must then skip its stale `b: 2`.
 */
test("reentrant prop updates don't overwrite newer values", async (t) => {
  const { hook, adapter, calls, setProps } = setup(t, { a: 1, b: 1 });

  let controller;
  adapter.props = reentrantHandlers(calls, setProps, () => controller, {
    a: 3,
    b: 3,
  });

  controller = new Controller(hook, adapter);
  await controller.mount();

  setProps({ a: 2, b: 2 });
  controller.update();

  assert.deepEqual(propCalls(calls), [
    ["a", 2],
    ["a", 3],
    ["b", 3], // stale ["b", 2] never follows
  ]);
});

/**
 * The nested update leaves `b` unchanged, so it never sends `b`. The outer
 * loop must still deliver `b: 2`, which is also the latest value.
 */
test("reentrant prop updates still apply keys the newer update left unchanged", async (t) => {
  const { hook, adapter, calls, setProps } = setup(t, { a: 1, b: 1 });

  let controller;
  adapter.props = reentrantHandlers(calls, setProps, () => controller, {
    a: 3,
    b: 2,
  });

  controller = new Controller(hook, adapter);
  await controller.mount();

  setProps({ a: 2, b: 2 });
  controller.update();

  assert.deepEqual(propCalls(calls), [
    ["a", 2],
    ["a", 3],
    ["b", 2],
  ]);
});

// -----------------------------------------------------------------------------
// 9. CLEANUP FAILURE TEST CASES
//    A failing adapter.destroy() must leave the Controller destroyed, logged
//    and without unhandled errors. destroy() is synchronous (§4); one that
//    returns a Promise anyway is warned about.
// -----------------------------------------------------------------------------

/**
 * If adapter.destroy() throws while a remount tears down the old instance,
 * the controller is destroyed instead of mounting a replacement. The error
 * is logged, nothing is thrown, and the child element is removed.
 */
test("failed adapter cleanup during remount terminates the controller safely", async (t) => {
  const { hook, adapter, named } = setupNumbered(t);

  const errors = t.mock.method(console, "error", () => {});

  adapter.destroy = () => {
    throw new Error("cleanup failed");
  };

  const controller = new Controller(hook, adapter);
  await controller.mount();

  controller.ctx.remount();
  await settle();

  assert.equal(controller.state, "destroyed");
  assert.equal(named("mount").length, 1); // no replacement
  assert.equal(hook.el.children.length, 0);

  const messages = errors.mock.calls.map((call) => call.arguments[0]);
  assert.ok(messages.includes("[Xenia] Remount failed:"));
});

/**
 * §4: destroy() is synchronous. An adapter.destroy() that returns a Promise
 * breaks the contract: the controller doesn't wait for it, warns the adapter
 * author, and logs the Promise's rejection rather than leaving it unhandled.
 */
test("an async adapter.destroy() is not awaited, warned about, and its rejection logged", async (t) => {
  const { hook, adapter } = setup(t);

  const warnings = t.mock.method(console, "warn", () => {});
  const errors = t.mock.method(console, "error", () => {});

  adapter.destroy = async () => {
    throw new Error("cleanup failed");
  };

  const controller = new Controller(hook, adapter);
  await controller.mount();

  controller.destroy();

  // Destroyed immediately, without waiting for the Promise.
  assert.equal(controller.state, "destroyed");
  assert.equal(hook.el.children.length, 0);

  const warned = warnings.mock.calls.map((call) => call.arguments[0]);
  assert.ok(warned.some((message) => message.includes("must be synchronous")));

  await settle(); // let the rejection reach the logging handler

  const messages = errors.mock.calls.map((call) => call.arguments[0]);
  assert.ok(messages.includes("[Xenia] Destroy failed:"));
});
