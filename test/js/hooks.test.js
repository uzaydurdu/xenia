/**
 * createHooks() tests.
 *
 * These tests drive the generated Phoenix hooks directly, the way LiveView
 * would: `hooks.Editor.mounted.call(hook)` runs the callback with a fake
 * hook as `this`.
 *
 * The fake hook provides only what the hooks use:
 * - `el`: a real jsdom element, so the Controller can append its child;
 * - `handleEvent` / `removeHandleEvent`: record subscriptions, so tests can
 *   inspect which event names were registered and push commands by calling
 *   the stored callback.
 *
 * Commands use the same payload shape the server sends with `push_event`
 * (see Xenia.push_to/4): `{ command, args }`.
 *
 * adapter.mount() returns synchronously, but Controller.mount() awaits it,
 * so tests wait one microtask (`await Promise.resolve()`) before sending
 * commands. Otherwise commands would be queued rather than run.
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createHooks } from "../../assets/core/controller.js";

/**
 * Two components on one page must not receive each other's commands.
 *
 * Each hook subscribes to its own `xenia:command:<id>` event, so a push
 * for editor-b reaches only editor-b's adapter instance. Destroying the
 * hooks must remove both subscriptions.
 */
test("commands reach only the matching component ID", async (t) => {
  const dom = new JSDOM(`
    <div id="editor-a"></div>
    <div id="editor-b"></div>
  `);

  const originalDocument = globalThis.document;
  globalThis.document = dom.window.document;

  t.after(() => {
    globalThis.document = originalDocument;
    dom.window.close();
  });

  const listeners = new Map(); // event name → { eventName, callback }
  const commands = mock.fn(); // records (instance id, args) per command

  // Each instance remembers which container it was mounted in, so the
  // test can tell which component handled a command.
  const adapter = {
    mount(el) {
      return { id: el.parentElement.id };
    },

    commands: {
      focus(instance, args) {
        commands(instance.id, args);
      },
    },

    destroy() {},
  };

  const hooks = createHooks({ Editor: adapter });

  /** Builds a fake Phoenix hook for the element with the given id. */
  function createHook(id) {
    return {
      el: document.getElementById(id),

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

  const first = createHook("editor-a");
  const second = createHook("editor-b");

  hooks.Editor.mounted.call(first);
  hooks.Editor.mounted.call(second);

  await Promise.resolve(); // let both mounts finish

  assert.equal(listeners.has("xenia:command:editor-a"), true);
  assert.equal(listeners.has("xenia:command:editor-b"), true);

  listeners
    .get("xenia:command:editor-b")
    .callback({ command: "focus", args: { position: 3 } });

  assert.equal(commands.mock.callCount(), 1);
  assert.deepEqual(commands.mock.calls[0].arguments, [
    "editor-b",
    { position: 3 },
  ]);

  hooks.Editor.destroyed.call(first);
  hooks.Editor.destroyed.call(second);

  assert.equal(listeners.size, 0);
});

/**
 * Empty, whitespace-only and non-string command names are rejected by the
 * hook before they reach the Controller, so no adapter handler runs.
 */
test("invalid command names are ignored", async (t) => {
  const dom = new JSDOM('<div id="editor"></div>');

  const originalDocument = globalThis.document;
  globalThis.document = dom.window.document;

  t.after(() => {
    globalThis.document = originalDocument;
    dom.window.close();
  });

  let callback; // the command handler the hook registers
  const focus = mock.fn();

  const adapter = {
    mount: () => ({}),
    destroy: () => {},
    commands: { focus },
  };

  const hook = {
    el: document.getElementById("editor"),

    handleEvent(_eventName, handler) {
      callback = handler;
      return 1;
    },

    removeHandleEvent() {},
  };

  t.mock.method(console, "error", () => {}); // silence the expected validation errors

  const hooks = createHooks({ Editor: adapter });
  hooks.Editor.mounted.call(hook);

  await Promise.resolve(); // let the mount finish

  callback({ command: "", args: {} });
  callback({ command: "   ", args: {} });
  callback({ command: null, args: {} });

  assert.equal(focus.mock.callCount(), 0);

  hooks.Editor.destroyed.call(hook);
});
