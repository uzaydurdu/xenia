/**
 * M5.5 Task A — ctx.setFormValue() tests.
 *
 * A Xenia form component has this DOM structure:
 *
 * <form>
 *   <div id="editor">
 *     <input type="text" hidden autocomplete="off" data-xenia-field name="snippet[code]">
 *     <div>Adapter-owned DOM</div>
 *   </div>
 * </form>
 *
 * The input is rendered by Phoenix (Xenia.Component), not created by the
 * core. It is a text input with the `hidden` attribute, not
 * type="hidden", so LiveView tracks whether the user has used it
 * (CLAUDE.md §6, M5.5 findings); `data-xenia-field` marks it for the core.
 *
 * Tests:
 * - Value conversion
 * - DOM input events
 * - HTML form serialization
 * - Unchanged values
 * - Missing or invalid inputs
 * - Component isolation
 * - Destruction and disconnection
 * - Remounts and stale contexts
 * - Preservation of Phoenix-owned DOM
 * - Quiet server updates (`notify: false`) and the return value, which
 *   tells an adapter whether it is a form field
 *
 * These are controller-level tests. Real phx-change behavior
 * must also be verified in a browser running Phoenix LiveView.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { Controller } from "../../assets/core/controller.js";

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// How the core finds the form input.
const FORM_INPUT = ":scope > input[data-xenia-field][name]";

/**
 * The form input exactly as Xenia.Component renders it. `marked: false`
 * leaves out `data-xenia-field`, for inputs the core must not touch.
 */
function formInput(doc, { name, value = "", type = "text", marked = true }) {
  const input = doc.createElement("input");
  input.type = type;
  input.hidden = true;
  input.autocomplete = "off";
  if (marked) input.setAttribute("data-xenia-field", "");
  if (name !== undefined) input.name = name;
  input.value = value;
  return input;
}

/**
 * Create a fresh form and controller fixture.
 *
 * The adapter captures every generation-scoped context
 * passed to mount().
 */
function setup(
  t,
  {
    field = true,
    value = "initial",
    name = "snippet[code]",
    id = "editor",
  } = {},
) {
  const originalDocument = globalThis.document;

  const dom = new JSDOM(
    `<form id="test-form">
       <div id="${id}"></div>
     </form>`,
    { url: "http://localhost" },
  );

  globalThis.document = dom.window.document;

  t.after(() => {
    globalThis.document = originalDocument;
    dom.window.close();
  });

  const doc = dom.window.document;
  const form = doc.getElementById("test-form");
  const el = doc.getElementById(id);

  let input = null;

  if (field) {
    input = formInput(doc, { name, value });
    el.appendChild(input);
  }

  const events = [];

  form.addEventListener("input", (event) => {
    events.push({
      target: event.target,
      value: event.target.value,
      bubbles: event.bubbles,
      type: event.type,
    });
  });

  const contexts = [];
  const instances = [];
  const destroyedInstances = [];

  const adapter = {
    mount(_mountEl, _props, ctx) {
      contexts.push(ctx);

      const instance = {};
      instances.push(instance);

      return instance;
    },

    destroy(instance) {
      destroyedInstances.push(instance);
    },
  };

  return {
    dom,
    doc,
    form,
    el,
    input,
    events,
    adapter,
    contexts,
    instances,
    destroyedInstances,
    hook: { el },
  };
}

/**
 * Mount a controller using the real Xenia lifecycle.
 */
async function mounted(t, options = {}) {
  const fixture = setup(t, options);

  const controller = new Controller(fixture.hook, fixture.adapter);

  await controller.mount();

  return {
    ...fixture,
    controller,
  };
}

/**
 * Read a field as the browser would serialize it
 * during native form submission.
 */
function submittedValue(fixture, name = "snippet[code]") {
  const data = new fixture.dom.window.FormData(fixture.form);
  return data.get(name);
}

// ------------------------------------------------------------
// 1. Value conversion
// ------------------------------------------------------------

const conversions = [
  ["string", "hello", "hello"],
  ["empty string", "", ""],
  ["integer", 42, "42"],
  ["zero", 0, "0"],
  ["negative number", -12, "-12"],
  ["decimal", 3.14, "3.14"],
  ["true", true, "true"],
  ["false", false, "false"],
  ["null", null, ""],
  ["undefined", undefined, ""],
  ["object", { code: "hello" }, '{"code":"hello"}'],
  ["nested object", { a: { b: 1 } }, '{"a":{"b":1}}'],
  ["array", ["a", "b"], '["a","b"]'],
  ["empty array", [], "[]"],
  ["empty object", {}, "{}"],
];

for (const [kind, value, expected] of conversions) {
  test(`converts ${kind} to a form value`, async (t) => {
    const fixture = await mounted(t);

    fixture.controller.ctx.setFormValue(value);

    assert.equal(fixture.input.value, expected);

    // Confirm the converted value would be submitted.
    assert.equal(submittedValue(fixture), expected);
  });
}

// ------------------------------------------------------------
// 2. Form events
// ------------------------------------------------------------

test("changed value dispatches one bubbling input event", async (t) => {
  const { controller, input, events } = await mounted(t);

  controller.ctx.setFormValue("updated");

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "input");
  assert.equal(events[0].target, input);
  assert.equal(events[0].value, "updated");
  assert.equal(events[0].bubbles, true);
});

test("event sees the already-updated input value", async (t) => {
  const { controller, input, events } = await mounted(t);

  controller.ctx.setFormValue("new text");

  assert.equal(input.value, "new text");
  assert.equal(events[0].value, "new text");
});

test("unchanged value does not dispatch an event", async (t) => {
  const { controller, events } = await mounted(t, {
    value: "same",
  });

  controller.ctx.setFormValue("same");

  assert.deepEqual(events, []);
});

test("equality is checked after conversion", async (t) => {
  const { controller, events } = await mounted(t, {
    value: "42",
  });

  controller.ctx.setFormValue(42);

  assert.deepEqual(events, []);
});

test("repeating the newly assigned value does not dispatch twice", async (t) => {
  const { controller, events } = await mounted(t);

  controller.ctx.setFormValue("updated");
  controller.ctx.setFormValue("updated");
  controller.ctx.setFormValue("updated");

  assert.deepEqual(
    events.map(({ value }) => value),
    ["updated"],
  );
});

test("rapid consecutive changes preserve event order", async (t) => {
  const { controller, input, events } = await mounted(t);

  controller.ctx.setFormValue("a");
  controller.ctx.setFormValue("ab");
  controller.ctx.setFormValue("ab");
  controller.ctx.setFormValue("abc");
  controller.ctx.setFormValue("abcd");

  assert.deepEqual(
    events.map(({ value }) => value),
    ["a", "ab", "abc", "abcd"],
  );

  assert.equal(input.value, "abcd");
});

test("twenty rapid changes preserve the final submitted value", async (t) => {
  const fixture = await mounted(t);

  let text = "";

  for (let index = 0; index < 20; index++) {
    text += "x";
    fixture.controller.ctx.setFormValue(text);
  }

  assert.equal(fixture.events.length, 20);
  assert.equal(fixture.input.value, "x".repeat(20));
  assert.equal(submittedValue(fixture), "x".repeat(20));
});

test("mounting never dispatches an initial change event", async (t) => {
  const fixture = await mounted(t, {
    value: "from server",
  });

  assert.equal(fixture.input.value, "from server");
  assert.deepEqual(fixture.events, []);
});

// ------------------------------------------------------------
// 3. Real HTML form serialization
// ------------------------------------------------------------

test("the form input participates in FormData", async (t) => {
  const fixture = await mounted(t);

  fixture.controller.ctx.setFormValue("IO.puts(:hello)");

  assert.equal(submittedValue(fixture), "IO.puts(:hello)");
});

test("an untouched field submits its server-rendered value", async (t) => {
  const fixture = await mounted(t, {
    value: "initial code",
  });

  assert.equal(submittedValue(fixture), "initial code");

  assert.deepEqual(fixture.events, []);
});

test("the form input preserves nested Phoenix field names", async (t) => {
  const fixture = await mounted(t, {
    name: "snippet[settings][code]",
  });

  fixture.controller.ctx.setFormValue("nested");

  assert.equal(submittedValue(fixture, "snippet[settings][code]"), "nested");
});

test("a cleared field is submitted as an empty string", async (t) => {
  const fixture = await mounted(t, {
    value: "some code",
  });

  fixture.controller.ctx.setFormValue("");

  assert.equal(submittedValue(fixture), "");
  assert.equal(fixture.events.length, 1);
});

test("updating code does not change ordinary sibling fields", async (t) => {
  const fixture = await mounted(t);

  const title = fixture.doc.createElement("input");
  title.type = "text";
  title.name = "snippet[title]";
  title.value = "My snippet";

  fixture.form.insertBefore(title, fixture.el);

  fixture.controller.ctx.setFormValue("new code");

  const data = new fixture.dom.window.FormData(fixture.form);

  assert.equal(data.get("snippet[title]"), "My snippet");
  assert.equal(data.get("snippet[code]"), "new code");
});

// ------------------------------------------------------------
// 4. Missing and invalid form inputs
// ------------------------------------------------------------

test("without a form input, setFormValue is a no-op", async (t) => {
  const fixture = await mounted(t, {
    field: false,
  });

  assert.doesNotThrow(() => {
    fixture.controller.ctx.setFormValue("ignored");
  });

  assert.deepEqual(fixture.events, []);
  assert.equal(fixture.el.querySelector("input"), null);
});

test("a marked input without a name is ignored", async (t) => {
  const fixture = await mounted(t, {
    field: false,
  });

  const unnamed = formInput(fixture.doc, { value: "unchanged" });

  fixture.el.prepend(unnamed);

  fixture.controller.ctx.setFormValue("new value");

  assert.equal(unnamed.value, "unchanged");
  assert.deepEqual(fixture.events, []);
});

test("a marked input in the adapter subtree is ignored", async (t) => {
  const fixture = await mounted(t, {
    field: false,
  });

  const nested = formInput(fixture.doc, {
    name: "library[internal]",
    value: "untouched",
  });

  fixture.controller.el.appendChild(nested);

  fixture.controller.ctx.setFormValue("updated");

  assert.equal(nested.value, "untouched");
  assert.deepEqual(fixture.events, []);
});

// Only the marked input is the form bridge. A direct-child input without
// the marker, visible or type="hidden", isn't the core's to write.
for (const type of ["text", "hidden"]) {
  test(`an unmarked direct-child ${type} input is not used as the form bridge`, async (t) => {
    const fixture = await mounted(t, {
      field: false,
    });

    const unmarked = formInput(fixture.doc, {
      name: "snippet[code]",
      value: "normal input",
      type,
      marked: false,
    });

    fixture.el.prepend(unmarked);

    assert.equal(fixture.controller.ctx.setFormValue("ignored"), false);
    assert.equal(unmarked.value, "normal input");
    assert.deepEqual(fixture.events, []);
  });
}

test("a marked input outside the container is ignored", async (t) => {
  const fixture = await mounted(t, {
    field: false,
  });

  const other = formInput(fixture.doc, {
    name: "snippet[other]",
    value: "untouched",
  });

  fixture.form.appendChild(other);

  fixture.controller.ctx.setFormValue("new value");

  assert.equal(other.value, "untouched");
  assert.deepEqual(fixture.events, []);
});

// ------------------------------------------------------------
// 5. Component isolation
// ------------------------------------------------------------

test("two Xenia components update only their own form fields", async (t) => {
  const fixture = await mounted(t, {
    name: "snippet[code]",
    value: "code",
  });

  const ratingEl = fixture.doc.createElement("div");
  ratingEl.id = "rating";

  const ratingInput = formInput(fixture.doc, {
    name: "snippet[rating]",
    value: "3",
  });

  ratingEl.appendChild(ratingInput);
  fixture.form.appendChild(ratingEl);

  const ratingController = new Controller({ el: ratingEl }, fixture.adapter);

  await ratingController.mount();

  fixture.controller.ctx.setFormValue("new code");
  ratingController.ctx.setFormValue(5);

  const data = new fixture.dom.window.FormData(fixture.form);

  assert.equal(data.get("snippet[code]"), "new code");
  assert.equal(data.get("snippet[rating]"), "5");

  assert.equal(fixture.events.length, 2);
  assert.equal(fixture.events[0].target, fixture.input);
  assert.equal(fixture.events[1].target, ratingInput);

  ratingController.destroy();
});

// ------------------------------------------------------------
// 6. Destruction and liveness
// ------------------------------------------------------------

test("setFormValue does nothing after destroy", async (t) => {
  const fixture = await mounted(t);

  const oldCtx = fixture.controller.ctx;

  fixture.controller.destroy();

  oldCtx.setFormValue("too late");

  assert.equal(fixture.input.value, "initial");
  assert.deepEqual(fixture.events, []);
});

test("destroy does not remove the server-rendered input", async (t) => {
  const fixture = await mounted(t);

  fixture.controller.destroy();

  assert.equal(
    fixture.el.querySelector(FORM_INPUT),
    fixture.input,
  );

  assert.equal(submittedValue(fixture), "initial");
});

test("destroy does not dispatch a form input event", async (t) => {
  const fixture = await mounted(t);

  fixture.controller.destroy();

  assert.deepEqual(fixture.events, []);
});

test("a detached Xenia container cannot update form state", async (t) => {
  const fixture = await mounted(t);

  const ctx = fixture.controller.ctx;

  fixture.el.remove();

  ctx.setFormValue("after removal");

  assert.equal(fixture.input.value, "initial");
  assert.deepEqual(fixture.events, []);
});

test("late callbacks from a destroyed instance cannot write values", async (t) => {
  const fixture = await mounted(t);

  const ctx = fixture.contexts[0];

  fixture.controller.destroy();

  await settle();

  ctx.setFormValue("late callback");

  assert.equal(fixture.input.value, "initial");
  assert.deepEqual(fixture.events, []);
});

// ------------------------------------------------------------
// 7. Remounts and generation-scoped contexts
// ------------------------------------------------------------

test("remount creates a fresh adapter context", async (t) => {
  const fixture = await mounted(t);

  const oldCtx = fixture.contexts[0];

  oldCtx.remount();

  await settle();

  assert.equal(fixture.contexts.length, 2);
  assert.notEqual(fixture.contexts[1], oldCtx);
  assert.equal(fixture.controller.ctx, fixture.contexts[1]);
});

test("a stale context cannot update the new instance's form value", async (t) => {
  const fixture = await mounted(t);

  const oldCtx = fixture.contexts[0];

  oldCtx.remount();

  await settle();

  oldCtx.setFormValue("stale");

  assert.equal(fixture.input.value, "initial");
  assert.deepEqual(fixture.events, []);
});

test("a new context can update the original form input", async (t) => {
  const fixture = await mounted(t);

  const originalInput = fixture.input;

  fixture.controller.ctx.remount();

  await settle();

  fixture.controller.ctx.setFormValue("after remount");

  assert.equal(fixture.input, originalInput);
  assert.equal(fixture.input.value, "after remount");
  assert.equal(submittedValue(fixture), "after remount");

  assert.deepEqual(
    fixture.events.map(({ value }) => value),
    ["after remount"],
  );
});

test("remount preserves the latest form value", async (t) => {
  const fixture = await mounted(t);

  fixture.controller.ctx.setFormValue("latest");

  const inputBefore = fixture.input;

  fixture.controller.ctx.remount();

  await settle();

  assert.equal(fixture.input, inputBefore);
  assert.equal(fixture.input.value, "latest");
  assert.equal(submittedValue(fixture), "latest");
});

test("remount does not dispatch an extra input event", async (t) => {
  const fixture = await mounted(t);

  fixture.controller.ctx.setFormValue("updated");

  assert.equal(fixture.events.length, 1);

  fixture.controller.ctx.remount();

  await settle();

  assert.equal(fixture.events.length, 1);
});

test("repeated remounts keep old contexts inactive", async (t) => {
  const fixture = await mounted(t);

  const firstCtx = fixture.controller.ctx;

  firstCtx.remount();
  await settle();

  const secondCtx = fixture.controller.ctx;

  secondCtx.remount();
  await settle();

  const thirdCtx = fixture.controller.ctx;

  assert.equal(fixture.contexts.length, 3);

  firstCtx.setFormValue("first stale");
  secondCtx.setFormValue("second stale");

  assert.equal(fixture.input.value, "initial");
  assert.deepEqual(fixture.events, []);

  thirdCtx.setFormValue("current");

  assert.equal(fixture.input.value, "current");
  assert.equal(fixture.events.length, 1);
});

// ------------------------------------------------------------
// 8. DOM ownership
// ------------------------------------------------------------

test("mount keeps the form input next to the adapter mount element", async (t) => {
  const fixture = await mounted(t);

  assert.deepEqual(
    [...fixture.el.children],
    [fixture.input, fixture.controller.el],
  );
});

test("remount replaces only the adapter mount element", async (t) => {
  const fixture = await mounted(t);

  const originalInput = fixture.input;
  const originalMountEl = fixture.controller.el;

  fixture.controller.ctx.remount();

  await settle();

  assert.equal(
    fixture.el.querySelector(FORM_INPUT),
    originalInput,
  );

  assert.notEqual(fixture.controller.el, originalMountEl);

  assert.deepEqual(
    [...fixture.el.children],
    [originalInput, fixture.controller.el],
  );
});

test("multiple remounts do not duplicate the form input", async (t) => {
  const fixture = await mounted(t);

  for (let index = 0; index < 3; index++) {
    fixture.controller.ctx.remount();
    await settle();
  }

  const inputs = fixture.el.querySelectorAll(FORM_INPUT);

  assert.equal(inputs.length, 1);
  assert.equal(inputs[0], fixture.input);
});

test("form value changes never replace the form input node", async (t) => {
  const fixture = await mounted(t);

  const original = fixture.input;

  fixture.controller.ctx.setFormValue("first");
  fixture.controller.ctx.setFormValue("second");

  assert.equal(fixture.input, original);

  assert.equal(
    fixture.el.querySelector(FORM_INPUT),
    original,
  );
});

test("setFormValue submits the value through FormData", async (t) => {
  const fixture = await mounted(t);

  fixture.controller.ctx.setFormValue("IO.puts(:hello_world)");

  assert.equal(fixture.input.value, "IO.puts(:hello_world)");

  assert.equal(fixture.events.length, 1);

  const formData = new fixture.dom.window.FormData(fixture.form);

  assert.equal(formData.get("snippet[code]"), "IO.puts(:hello_world)");
});

// ------------------------------------------------------------
// 9. Quiet server updates and return values
//
// User edits notify Phoenix; server changes update the input
// silently. The return value tells an adapter whether it is a
// form field: true even when nothing changed, false when there
// is no live form input.
// ------------------------------------------------------------

/**
 * A server change (e.g. the form reset after Save) must reach the
 * form input, because LiveView never patches it inside
 * phx-update="ignore". With `notify: false` it is written without
 * an "input" event, so the server isn't asked to validate its own
 * value. The call still returns true: the component is a form field.
 */
test("notify: false updates the input without notifying Phoenix", async (t) => {
  const fixture = await mounted(t);

  const result = fixture.controller.ctx.setFormValue("value from server", {
    notify: false,
  });

  assert.equal(result, true);
  assert.equal(fixture.input.value, "value from server");
  assert.equal(submittedValue(fixture), "value from server");
  assert.deepEqual(fixture.events, []);
});

/**
 * A quiet update doesn't suppress later notifications: once the
 * server's value is in place, the next user edit fires phx-change
 * as usual, and only that edit reaches the form.
 */
test("user editing after a silent update notifies Phoenix", async (t) => {
  const fixture = await mounted(t);

  fixture.controller.ctx.setFormValue("server text", { notify: false });
  fixture.controller.ctx.setFormValue("user text");

  assert.deepEqual(
    fixture.events.map(({ value }) => value),
    ["user text"],
  );
});

/**
 * An unchanged value still returns true. "true" means "this
 * component is a form field", not "something was written", so
 * adapters can rely on it to decide whether to track echoes.
 */
test("setFormValue returns true for an unchanged value", async (t) => {
  const fixture = await mounted(t, { value: "same" });

  assert.equal(fixture.controller.ctx.setFormValue("same"), true);
  assert.deepEqual(fixture.events, []);
});

/**
 * Without a server-rendered form input the component isn't a
 * form field, so setFormValue returns false. The Monaco adapter
 * uses this to skip echo tracking outside forms.
 */
test("setFormValue returns false outside a form field", async (t) => {
  const fixture = await mounted(t, { field: false });

  assert.equal(fixture.controller.ctx.setFormValue("hello"), false);
});

/**
 * After destroy the context is dead: the call returns false and
 * leaves the input as the server rendered it, even for a late
 * callback.
 */
test("setFormValue returns false after destruction", async (t) => {
  const fixture = await mounted(t);
  const { ctx } = fixture.controller;

  fixture.controller.destroy();

  assert.equal(ctx.setFormValue("too late"), false);
  assert.equal(fixture.input.value, "initial");
  assert.deepEqual(fixture.events, []);
});

/**
 * A context replaced by a remount returns false too, so an old
 * editor instance can't mistake itself for a live form field.
 */
test("setFormValue returns false from a context replaced by a remount", async (t) => {
  const fixture = await mounted(t);
  const oldCtx = fixture.contexts[0];

  oldCtx.remount();
  await settle();

  assert.equal(oldCtx.setFormValue("stale"), false);
  assert.equal(fixture.input.value, "initial");
  assert.deepEqual(fixture.events, []);
});