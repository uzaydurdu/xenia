/**
 * createEchoes() tests (M5.5, Task C).
 *
 * In a form, every edit the Monaco adapter reports goes to the server via
 * phx-change, and every validate reply re-renders the editor's `value` prop
 * from the submitted params. When the user keeps typing, those replies
 * carry text that is already out of date: applying them would overwrite
 * newer text in the editor.
 *
 * createEchoes() is the adapter's memory of what it reported:
 * - reported(value): remember a value just sent to the form;
 * - isEcho(value):   true if the value is one of those reports coming back.
 *                    A match also acknowledges every earlier report, since
 *                    replies arrive in the order the edits were sent;
 * - clear():         forget everything, used when the server forces its
 *                    own value with a new revision.
 *
 * These tests cover the helper on its own. Whether the editor really keeps
 * fast typing through validation round trips is checked in the browser.
 *
 * Run with: node --test test/js/monaco_echo.test.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createEchoes } from "../../assets/adapters/monaco.js";

/**
 * The typing case: the user types "H", "He", "Hel", and the validate
 * replies come back in the same order. Each reply is the adapter's own
 * earlier value, so each one is an echo and gets ignored.
 */
test("recognizes old responses from Phoenix", () => {
  const echoes = createEchoes();

  echoes.reported("H");
  echoes.reported("He");
  echoes.reported("Hel");

  assert.equal(echoes.isEcho("H"), true);
  assert.equal(echoes.isEcho("He"), true);
  assert.equal(echoes.isEcho("Hel"), true);
});

/**
 * A value the adapter never reported came from the server itself, for
 * example a reset after Save. It is not an echo, so the editor applies it.
 */
test("recognizes a new server value as different", () => {
  const echoes = createEchoes();

  echoes.reported("Hello");

  assert.equal(echoes.isEcho("Server reset"), false);
});

/**
 * After clear() nothing counts as an echo, not even a value reported
 * earlier. The adapter clears when the server bumps `revision`, so a
 * forced server value is always applied, even if the user once typed the
 * same text.
 */
test("clear forgets previously reported values", () => {
  const echoes = createEchoes();

  echoes.reported("Hello");
  echoes.clear();

  assert.equal(echoes.isEcho("Hello"), false);
});

/**
 * The same text can be reported more than once (type "a", delete it,
 * type "a" again). Each report is matched by its own reply, in order, so
 * repeated values and the empty string are all recognized.
 */
test("handles repeated text values", () => {
  const echoes = createEchoes();

  echoes.reported("a");
  echoes.reported("");
  echoes.reported("a");

  assert.equal(echoes.isEcho("a"), true);
  assert.equal(echoes.isEcho(""), true);
  assert.equal(echoes.isEcho("a"), true);
});

/**
 * The same value reported twice in a row is one report: the second leaves
 * the form's input unchanged, so no phx-change is sent and no reply comes.
 * Monaco does this: an 18-character insertText produced 18 change events,
 * each reading the finished text. Kept as 18 entries, one reply removed one,
 * and the other 17 later swallowed form recovery's value after a reconnect
 * (found by the /form browser tests).
 */
test("a value reported twice in a row is remembered once", () => {
  const echoes = createEchoes();

  echoes.reported("IO.puts :hi");
  echoes.reported("IO.puts :hi");
  echoes.reported("IO.puts :hi");

  assert.equal(echoes.isEcho("IO.puts :hi"), true);
  assert.equal(echoes.isEcho("IO.puts :hi"), false, "nothing left over");
});

/**
 * Replies arrive in order, so a reply for "ab" means the one for "a" was
 * already handled or skipped. Matching "ab" therefore forgets "a" as
 * well. A late "a" is no longer treated as an echo, while "abc", reported
 * after "ab", still is.
 */
test("removes acknowledged values from memory", () => {
  const echoes = createEchoes();

  echoes.reported("a");
  echoes.reported("ab");
  echoes.reported("abc");

  assert.equal(echoes.isEcho("ab"), true);

  // "a" and "ab" have been acknowledged and removed.
  assert.equal(echoes.isEcho("a"), false);
  assert.equal(echoes.isEcho("abc"), true);
});