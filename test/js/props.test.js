/**
 * Props utility tests.
 *
 * Covers the three helpers that turn server-rendered props into adapter calls:
 * - jsonEqual(a, b):          deep equality for JSON-shaped values.
 * - changedKeys(prev, next):  which top-level props differ between two snapshots.
 * - decodeProps(el):          reads the JSON props attribute from an element.
 *
 * decodeProps only calls `el.getAttribute()`, so these tests pass a plain
 * object with that one method instead of a real DOM element.
 *
 * Run with: node --test test/js/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { jsonEqual, changedKeys, decodeProps } from "../../assets/core/props.js";

// -----------------------------------------------------------------------------
// jsonEqual
// -----------------------------------------------------------------------------

/**
 * Objects with the same keys and values are equal regardless of key order,
 * since JSON object order carries no meaning.
 */
test("jsonEqual ignores object key order", () => {
  assert.equal(jsonEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
});

/**
 * Comparison is deep: a difference inside a nested array makes the
 * enclosing objects unequal.
 */
test("jsonEqual detects nested changes", () => {
  assert.equal(jsonEqual({ data: [1, 2] }, { data: [1, 3] }), false);
});

// -----------------------------------------------------------------------------
// changedKeys
// -----------------------------------------------------------------------------

/**
 * A key present in the previous props but missing from the next ones is
 * reported as changed, so the adapter is told to clear it.
 */
test("changedKeys detects removed keys", () => {
  assert.deepEqual(changedKeys({ a: 1, b: 2 }, { a: 1 }), ["b"]);
});

// -----------------------------------------------------------------------------
// decodeProps
// -----------------------------------------------------------------------------

/**
 * A valid JSON attribute is parsed into a plain object with the same values.
 */
test("decodeProps handles valid JSON attributes", () => {
  const el = {
    getAttribute: () => '{"value":0.5,"color":"green"}',
  };

  assert.deepEqual(decodeProps(el), { value: 0.5, color: "green" });
});

/**
 * A missing attribute (`getAttribute` returns `null`) yields empty props
 * instead of throwing, so a component without props can still mount.
 */
test("decodeProps returns empty props for missing attribute", () => {
  const el = {
    getAttribute: () => null,
  };

  assert.deepEqual(decodeProps(el), {});
});