/**
 * Keyboard shortcuts (Xenia.Shortcuts on the server, shortcuts.js here).
 *
 * A component's `data-xenia-shortcuts` maps key combinations to LiveView
 * events. The controller listens on the container in the capture phase, so
 * only key presses while focus is inside the component count, and they're
 * handled before the library's own keys. Matching is tested on its own;
 * the controller tests use `ctrl+...` so they don't depend on the machine
 * running them (`mod` is Cmd on a Mac).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Controller } from "../../assets/core/controller.js";
import { expand, isMac, matchShortcut } from "../../assets/core/shortcuts.js";

// A keydown as the browser describes it.
const key = (init) => ({
  key: "",
  code: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...init,
});

// --- Matching ------------------------------------------------------------------

test("mod is Cmd on a Mac and Ctrl elsewhere", () => {
  const shortcuts = { "mod+s": "save" };
  const cmdS = key({ key: "s", code: "KeyS", metaKey: true });
  const ctrlS = key({ key: "s", code: "KeyS", ctrlKey: true });

  assert.deepEqual(matchShortcut(cmdS, shortcuts, true), {
    combo: "mod+s",
    event: "save",
  });
  assert.equal(matchShortcut(ctrlS, shortcuts, true), null);
  assert.deepEqual(matchShortcut(ctrlS, shortcuts, false), {
    combo: "mod+s",
    event: "save",
  });
  assert.equal(matchShortcut(cmdS, shortcuts, false), null);
});

test("the modifiers must match exactly", () => {
  const shortcuts = { "ctrl+s": "save" };

  assert.equal(
    matchShortcut(key({ key: "s", code: "KeyS" }), shortcuts, false),
    null,
  );
  assert.equal(
    matchShortcut(
      key({ key: "S", code: "KeyS", ctrlKey: true, shiftKey: true }),
      shortcuts,
      false,
    ),
    null,
  );
});

test("a key a modifier changes still matches, by its physical key", () => {
  // Shift+. gives ">"; on a Mac, Option+S gives "ß".
  const bigger = key({
    key: ">",
    code: "Period",
    metaKey: true,
    shiftKey: true,
  });
  const alt = key({ key: "ß", code: "KeyS", altKey: true });

  assert.equal(
    matchShortcut(bigger, { "mod+shift+.": "bigger" }, true).event,
    "bigger",
  );
  assert.equal(matchShortcut(alt, { "alt+s": "save" }, true).event, "save");
});

test("named keys and the user's layout", () => {
  assert.equal(
    matchShortcut(
      key({ key: "Escape", code: "Escape" }),
      { escape: "close" },
      false,
    ).event,
    "close",
  );
  assert.equal(
    matchShortcut(
      key({ key: "ArrowUp", code: "ArrowUp", altKey: true }),
      { "alt+arrowup": "up" },
      false,
    ).event,
    "up",
  );
  assert.equal(
    matchShortcut(
      key({ key: " ", code: "Space", ctrlKey: true }),
      { "ctrl+space": "suggest" },
      false,
    ).event,
    "suggest",
  );
  // On an AZERTY keyboard, the "z" character is where QWERTY has "w".
  assert.equal(
    matchShortcut(
      key({ key: "z", code: "KeyW", ctrlKey: true }),
      { "ctrl+z": "undo" },
      false,
    ).event,
    "undo",
  );
});

test("when the character and the physical key name different shortcuts, the character wins", () => {
  // AZERTY: the key labelled "a" sits where QWERTY has "q".
  const press = key({ key: "a", code: "KeyQ", ctrlKey: true });
  const shortcuts = { "ctrl+q": "quit-ish", "ctrl+a": "all" };

  assert.equal(matchShortcut(press, shortcuts, false).event, "all");
});

test("composing text, a held-down key, or a modifier alone never match", () => {
  const shortcuts = { "ctrl+s": "save", shift: "x" };
  const base = { key: "s", code: "KeyS", ctrlKey: true };

  assert.equal(
    matchShortcut(key({ ...base, isComposing: true }), shortcuts, false),
    null,
  );
  assert.equal(
    matchShortcut(key({ ...base, keyCode: 229 }), shortcuts, false),
    null,
  );
  assert.equal(
    matchShortcut(key({ ...base, repeat: true }), shortcuts, false),
    null,
  );
  assert.equal(
    matchShortcut(
      key({ key: "Control", code: "ControlLeft", ctrlKey: true }),
      shortcuts,
      false,
    ),
    null,
  );
});

test("expand writes mod as the platform's key, in canonical order", () => {
  assert.equal(expand("mod+shift+s", true), "meta+shift+s");
  assert.equal(expand("mod+alt+k", false), "ctrl+alt+k");
  assert.equal(expand("mod+ctrl+f", true), "ctrl+meta+f");
});

test("isMac reads the platform", () => {
  assert.equal(isMac({ platform: "MacIntel" }), true);
  assert.equal(isMac({ userAgentData: { platform: "macOS" } }), true);
  assert.equal(isMac({ platform: "Win32" }), false);
  assert.equal(isMac({ platform: "Linux x86_64" }), false);
});

// --- The controller ---------------------------------------------------------------

function setup(t, shortcuts = { "ctrl+s": "save" }) {
  const dom = new JSDOM(`
    <div id="c" data-xenia-props="{}" data-xenia-events='{"change":"changed"}'
         data-xenia-shortcuts='${JSON.stringify(shortcuts)}'></div>
    <input id="outside">
  `);
  const original = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = original;
    dom.window.close();
  });

  const sent = [];
  const container = dom.window.document.getElementById("c");
  const hook = {
    el: container,
    pushEvent: (event, payload) => sent.push([event, payload]),
  };

  const adapter = {
    mount(el) {
      return el.appendChild(dom.window.document.createElement("textarea"));
    },
    destroy() {},
    events: { change: { debounce: 300 } },
  };

  const press = (target, init) => {
    const event = new dom.window.KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    return event;
  };

  return { dom, container, hook, adapter, sent, press };
}

test("a shortcut pressed inside the component sends its event, and nothing else sees it", async (t) => {
  const { container, hook, adapter, sent, press } = setup(t);
  const controller = new Controller(hook, adapter);
  await controller.mount();

  let libraryGotIt = false;
  controller.instance.addEventListener("keydown", () => (libraryGotIt = true));

  const event = press(controller.instance, {
    key: "s",
    code: "KeyS",
    ctrlKey: true,
  });

  assert.deepEqual(sent, [["save", { shortcut: "ctrl+s" }]]);
  assert.equal(event.defaultPrevented, true, "the browser doesn't act on it");
  assert.equal(libraryGotIt, false, "the library doesn't see it");
  assert.equal(container.contains(controller.instance), true);
});

test("other keys pass through to the library", async (t) => {
  const { hook, adapter, sent, press } = setup(t);
  const controller = new Controller(hook, adapter);
  await controller.mount();

  let libraryGotIt = false;
  controller.instance.addEventListener("keydown", () => (libraryGotIt = true));

  const event = press(controller.instance, { key: "s", code: "KeyS" });

  assert.deepEqual(sent, []);
  assert.equal(event.defaultPrevented, false);
  assert.equal(libraryGotIt, true);
});

test("pending events are sent first, so a save can't overtake the last change", async (t) => {
  const { hook, adapter, sent, press } = setup(t);
  const controller = new Controller(hook, adapter);
  await controller.mount();

  controller.ctx.emit("change", { value: "typed" }); // debounced, still pending
  press(controller.instance, { key: "s", code: "KeyS", ctrlKey: true });

  assert.deepEqual(sent, [
    ["changed", { value: "typed" }],
    ["save", { shortcut: "ctrl+s" }],
  ]);
});

test("keys pressed outside the component are not its shortcuts", async (t) => {
  const { dom, hook, adapter, sent, press } = setup(t);
  const controller = new Controller(hook, adapter);
  await controller.mount();

  press(dom.window.document.getElementById("outside"), {
    key: "s",
    code: "KeyS",
    ctrlKey: true,
  });
  assert.deepEqual(sent, []);
});

test("changed shortcuts apply at once, and none apply after destroy", async (t) => {
  const { container, hook, adapter, sent, press } = setup(t);
  const controller = new Controller(hook, adapter);
  await controller.mount();
  const inside = controller.instance;

  // The server re-renders the attribute (LiveView patches data-* attributes).
  container.setAttribute(
    "data-xenia-shortcuts",
    JSON.stringify({ "ctrl+k": "palette" }),
  );
  press(inside, { key: "s", code: "KeyS", ctrlKey: true });
  press(inside, { key: "k", code: "KeyK", ctrlKey: true });
  assert.deepEqual(sent, [["palette", { shortcut: "ctrl+k" }]]);

  controller.destroy();
  container.appendChild(inside);
  press(inside, { key: "k", code: "KeyK", ctrlKey: true });
  assert.equal(sent.length, 1, "the listener is gone");
});

test("a component without shortcuts ignores every key", async (t) => {
  const { container, hook, adapter, sent, press } = setup(t);
  container.removeAttribute("data-xenia-shortcuts");
  const controller = new Controller(hook, adapter);
  await controller.mount();

  const event = press(controller.instance, {
    key: "s",
    code: "KeyS",
    ctrlKey: true,
  });
  assert.deepEqual(sent, []);
  assert.equal(event.defaultPrevented, false);
});
