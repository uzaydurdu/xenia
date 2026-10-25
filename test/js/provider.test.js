import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  setProvider,
  readProvider,
  subscribe,
  resetProviders,
} from "../../assets/core/providers.js";

// Give each test a clean noticeboard.
beforeEach(() => {
  resetProviders();
});

// -----------------------------------------------------------------------------
// STORING AND READING
// -----------------------------------------------------------------------------

test("a value can be stored and read", () => {
  setProvider("theme", "dark");

  assert.deepEqual(readProvider("theme"), {
    value: "dark",
  });
});

test("an unknown provider returns null", () => {
  assert.equal(readProvider("theme"), null);
});

// NEW: the { value } wrapper exists for exactly this case.
test("a published null is different from no value", () => {
  setProvider("user", null);

  assert.deepEqual(readProvider("user"), {
    value: null,
  });
});

// -----------------------------------------------------------------------------
// NOTIFICATIONS
// -----------------------------------------------------------------------------

test("subscribers hear theme changes", () => {
  const heard = [];

  subscribe("theme", (value) => {
    heard.push(value);
  });

  setProvider("theme", "dark");
  setProvider("theme", "light");

  assert.deepEqual(heard, ["dark", "light"]);
});

// NEW: documents the contract; components call readProvider for the current value.
test("subscribing does not deliver the current value", () => {
  setProvider("theme", "dark");

  const heard = [];

  subscribe("theme", (value) => {
    heard.push(value);
  });

  assert.deepEqual(heard, []);
});

test("the same value does not notify twice", () => {
  const heard = [];

  subscribe("theme", (value) => {
    heard.push(value);
  });

  setProvider("theme", "dark");
  setProvider("theme", "dark");

  assert.deepEqual(heard, ["dark"]);
});

test("equal objects do not cause redundant updates", () => {
  const heard = [];

  subscribe("theme", (value) => {
    heard.push(value);
  });

  setProvider("theme", { mode: "dark" });
  setProvider("theme", { mode: "dark" });

  // REFINED: checks the delivered value, not only the count.
  assert.deepEqual(heard, [{ mode: "dark" }]);
});

// NEW: one provider's change must not reach another provider's listeners.
test("providers are independent", () => {
  const heard = [];

  subscribe("theme", (value) => {
    heard.push(value);
  });

  setProvider("locale", "de");

  assert.deepEqual(heard, []);
});

// -----------------------------------------------------------------------------
// UNSUBSCRIBING
// -----------------------------------------------------------------------------

test("unsubscribe stops notifications", () => {
  const heard = [];

  const stop = subscribe("theme", (value) => {
    heard.push(value);
  });

  setProvider("theme", "dark");

  stop();

  setProvider("theme", "light");

  assert.deepEqual(heard, ["dark"]);
});

// NEW: a destroy() may run twice; the second stop must not break other listeners.
test("calling unsubscribe twice is harmless", () => {
  const heard = [];

  const stop = subscribe("theme", () => {});

  stop();
  stop();

  subscribe("theme", (value) => {
    heard.push(value);
  });

  setProvider("theme", "dark");

  assert.deepEqual(heard, ["dark"]);
});

test("the value remains available after unsubscribe", () => {
  const stop = subscribe("theme", () => {});

  setProvider("theme", "dark");

  stop();

  assert.deepEqual(readProvider("theme"), {
    value: "dark",
  });
});

// NEW: the unused entry is removed; the provider still counts as unpublished.
test("unsubscribing without a value leaves the provider unknown", () => {
  const stop = subscribe("theme", () => {});

  stop();

  assert.equal(readProvider("theme"), null);
});

// NEW: a wrong argument fails at once, not later inside setProvider.
test("a listener must be a function", () => {
  assert.throws(() => subscribe("theme", "not a function"), TypeError);
});

// -----------------------------------------------------------------------------
// ROBUSTNESS
// -----------------------------------------------------------------------------

// REFINED: t.mock restores console.error automatically, and we can check it was used.
test("one broken listener does not block another", (t) => {
  const consoleError = t.mock.method(console, "error", () => {});
  const heard = [];

  subscribe("theme", () => {
    throw new Error("Something went wrong");
  });

  subscribe("theme", (value) => {
    heard.push(value);
  });

  setProvider("theme", "dark");

  assert.deepEqual(heard, ["dark"]);
  assert.equal(consoleError.mock.callCount(), 1);
});

// NEW: e.g. a theme change destroys another component before its turn.
test("a listener removed during a notification is not called", () => {
  const heard = [];
  let stopSecond;

  subscribe("theme", (value) => {
    heard.push(["first", value]);
    stopSecond();
  });

  stopSecond = subscribe("theme", (value) => {
    heard.push(["second", value]);
  });

  setProvider("theme", "dark");

  assert.deepEqual(heard, [["first", "dark"]]);
});

// NEW: a component mounted by a listener starts with the next change.
test("a listener added during a notification waits for the next change", () => {
  const heard = [];
  let added = false;

  subscribe("theme", () => {
    if (!added) {
      added = true;

      subscribe("theme", (value) => {
        heard.push(value);
      });
    }
  });

  setProvider("theme", "dark");
  setProvider("theme", "light");

  assert.deepEqual(heard, ["light"]);
});

// NEW: a listener that changes the value must not let others receive it out of order.
test("a nested change reaches everyone in order", () => {
  const heard = [];

  subscribe("theme", (value) => {
    heard.push(["first", value]);

    if (value === "dark") {
      setProvider("theme", "light");
    }
  });

  subscribe("theme", (value) => {
    heard.push(["second", value]);
  });

  setProvider("theme", "dark");

  // "second" never sees the outdated "dark".
  assert.deepEqual(heard, [
    ["first", "dark"],
    ["first", "light"],
    ["second", "light"],
  ]);

  assert.deepEqual(readProvider("theme"), {
    value: "light",
  });
});

// -----------------------------------------------------------------------------
// RESET
// -----------------------------------------------------------------------------

test("resetProviders clears stored values", () => {
  setProvider("theme", "dark");

  resetProviders();

  assert.equal(readProvider("theme"), null);
});

// NEW: listeners from an earlier test must not leak into the next one.
test("resetProviders clears subscribers", () => {
  const heard = [];

  subscribe("theme", (value) => {
    heard.push(value);
  });

  resetProviders();

  setProvider("theme", "dark");

  assert.deepEqual(heard, []);
});