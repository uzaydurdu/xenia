/**
 * The two JavaScript entry points (M7).
 *
 * The M7 dry run, a fresh Phoenix app with Xenia unpacked as Hex ships it,
 * found two build failures, both from Monaco living in the core bundle:
 * - `import { createHooks } from "xenia"` failed with "Could not resolve
 *   monaco-editor" in apps that don't use Monaco: esbuild resolves every
 *   import in a bundle, used or not;
 * - apps that do use Monaco failed too: the import, made from inside Xenia's
 *   package, couldn't find monaco-editor in the app's assets/node_modules.
 *
 * So the core ("xenia") has no Monaco at all, the adapter is its own entry
 * point ("xenia/monaco"), and the app passes the import to createMonaco.
 * `mix check` also checks that neither built bundle imports monaco-editor.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import * as core from "../../assets/index.js";
import * as monacoEntry from "../../assets/monaco.js";
import * as chartjsEntry from "../../assets/chartjs.js";

test('"xenia" exports the core and nothing of Monaco', () => {
  assert.deepEqual(Object.keys(core).sort(), [
    "adapterHook",
    "createHooks",
    "readProvider",
    "setProvider",
    "subscribeProvider",
  ]);
});

test('"xenia/monaco" exports createMonaco and the standalone class', () => {
  assert.deepEqual(Object.keys(monacoEntry).sort(), [
    "MonacoAdapter",
    "createMonaco",
  ]);
});

test('"xenia/chartjs" exports createChartjs, and nothing of the core', () => {
  assert.deepEqual(Object.keys(chartjsEntry), ["createChartjs"]);
});

test("createMonaco requires the app's load function", () => {
  assert.throws(
    () => monacoEntry.createMonaco(),
    /load: \(\) => import\("monaco-editor"\)/,
  );
  assert.throws(
    () => monacoEntry.createMonaco({ load: "monaco-editor" }),
    TypeError,
  );
});

test("the standalone MonacoAdapter requires load too", (t) => {
  const dom = new JSDOM(`<div id="editor"></div>`);
  t.after(() => dom.window.close());

  const el = dom.window.document.getElementById("editor");

  assert.throws(() => new monacoEntry.MonacoAdapter(el, {}), /props\.load/);
});

// Mounting goes through the app's load (and passes setup along): Monaco is
// imported by the app's code, never by Xenia's.
test("mounting calls the app's load once", async (t) => {
  const originalDocument = globalThis.document;
  const dom = new JSDOM(`<div id="host"></div>`);
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = originalDocument;
    dom.window.close();
  });

  let loads = 0;
  const adapter = monacoEntry.createMonaco({
    load: () => {
      loads++;
      return new Promise(() => {}); // never resolves: no real Monaco here
    },
  });

  const ctx = { id: "host", emit() {}, setFormValue: () => false };
  const editor = adapter.mount(document.getElementById("host"), {}, ctx);

  assert.equal(loads, 1);
  assert.ok(editor instanceof monacoEntry.MonacoAdapter);
  adapter.destroy(editor);
});

test("the adapter has the same shape as before, plus the app's load", () => {
  const adapter = monacoEntry.createMonaco({ load: async () => ({}) });

  assert.deepEqual(adapter.consumes, ["theme"]);
  assert.deepEqual(Object.keys(adapter.props).sort(), [
    "language",
    "options",
    "theme",
    "themes",
    "value",
  ]);
  assert.deepEqual(Object.keys(adapter.commands).sort(), ["focus", "insert"]);
  assert.deepEqual(adapter.events, { change: { debounce: 300 } });
});
