/**
 * The contract every official adapter keeps (assets/adapters/*): the app
 * passes the library in with `load`, and the factory returns a plain
 * adapter object.
 *
 * These tests need no library: they check what happens around it. Each
 * adapter's behaviour with its real library is tested in the examples app's
 * browser tests. Chart.js has its own, deeper unit tests (chartjs.test.js).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Controller } from "../../assets/core/controller.js";

const ADAPTERS = {
  chartjs: "createChartjs",
  flatpickr: "createFlatpickr",
  "shoelace-rating": "createShoelaceRating",
  sortablejs: "createSortablejs",
  "tom-select": "createTomSelect",
  leaflet: "createLeaflet",
  tabulator: "createTabulator",
  fullcalendar: "createFullCalendar",
  xterm: "createXterm",
  "monaco-diff": "createMonacoDiff",
  tiptap: "createTiptap",
  uppy: "createUppy",
  wavesurfer: "createWaveSurfer",
  "wavesurfer-multitrack": "createWaveSurferMultitrack",
  d3: "createD3",
};

const entries = Object.fromEntries(
  await Promise.all(
    Object.keys(ADAPTERS).map(async (entry) => [
      entry,
      await import(`../../assets/${entry}.js`),
    ]),
  ),
);

// A library that fails the moment anything touches it.
const untouchable = new Proxy(function () {}, {
  get: (_target, key) => {
    if (key === "then") return undefined; // not a promise
    throw new Error(`the library was touched: ${String(key)}`);
  },
  apply: () => {
    throw new Error("the library was called");
  },
  construct: () => {
    throw new Error("the library was constructed");
  },
});

function component(t, adapter) {
  const dom = new JSDOM(`<div id="c" data-xenia-props="{}"></div>`);
  const original = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = original;
    dom.window.close();
  });

  const container = dom.window.document.getElementById("c");
  const hook = { el: container, pushEvent: () => {} };
  return { controller: new Controller(hook, adapter), container };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

for (const [entry, factoryName] of Object.entries(ADAPTERS)) {
  test(`"xenia/${entry}" exports ${factoryName}, which needs load`, () => {
    assert.deepEqual(Object.keys(entries[entry]), [factoryName]);

    const create = entries[entry][factoryName];
    assert.throws(
      () => create(),
      new RegExp(`pass the library's import: ${factoryName}`),
    );
    assert.throws(() => create({ load: "the library" }), TypeError);
  });

  test(`${factoryName}: a plain adapter object, ready to spread and extend`, () => {
    const adapter = entries[entry][factoryName]({ load: () => untouchable });

    assert.equal(typeof adapter.mount, "function");
    assert.equal(typeof adapter.destroy, "function");
    for (const part of ["props", "commands", "events"]) {
      assert.equal(
        Object.getPrototypeOf(adapter[part] ?? {}),
        Object.prototype,
        part,
      );
    }
    assert.ok(
      Object.hasOwn(adapter.events, "error"),
      "every official adapter reports errors",
    );

    const extended = {
      ...adapter,
      commands: { ...adapter.commands, mine() {} },
    };
    assert.equal(typeof extended.commands.mine, "function");
    assert.equal(
      adapter.commands.mine,
      undefined,
      "the official adapter is unchanged",
    );
  });

  test(`${factoryName}: loads nothing until a component mounts, then once`, async (t) => {
    let loads = 0;
    let release;
    const loaded = new Promise((resolve) => (release = resolve));
    const adapter = entries[entry][factoryName]({
      load: () => (loads++, loaded),
    });

    assert.equal(loads, 0);

    // Two components start mounting, and both are removed before the
    // library arrives: it is loaded once and never touched.
    const first = component(t, adapter);
    const second = component(t, adapter);
    const mounting = [first.controller.mount(), second.controller.mount()];
    await settle();
    first.controller.destroy();
    second.controller.destroy();
    release(untouchable);
    await Promise.all(mounting);
    await settle();

    assert.equal(loads, 1);
    assert.equal(first.container.children.length, 0, "nothing was drawn");
  });

  test(`${factoryName}: the wrong library is a clear error`, async (t) => {
    const errors = t.mock.method(console, "error", () => {});
    const { controller } = component(
      t,
      entries[entry][factoryName]({ load: () => ({}) }),
    );
    await controller.mount();

    const messages = errors.mock.calls.map((call) =>
      call.arguments.map(String).join(" "),
    );
    assert.ok(
      messages.some((message) => /load (didn't|must) give/.test(message)),
      `got: ${messages.join(" | ")}`,
    );
  });
}

test("adapters that follow the app's theme ask for it", () => {
  for (const [entry, factoryName] of Object.entries({
    chartjs: "createChartjs",
    xterm: "createXterm",
    uppy: "createUppy",
  })) {
    const adapter = entries[entry][factoryName]({ load: () => untouchable });
    assert.deepEqual(adapter.consumes, ["theme"], entry);
  }
});

test("createD3: a chart of your own without create and update is a clear error", () => {
  assert.throws(
    () => entries.d3.createD3({ load: () => untouchable, charts: { heatmap: { create() {} } } }),
    /\[Xenia\] createD3: charts\.heatmap needs create and update functions/,
  );
  // A complete one is accepted, and nothing is loaded before a mount.
  const definition = { create() {}, update() {} };
  assert.doesNotThrow(() =>
    entries.d3.createD3({ load: () => untouchable, charts: { heatmap: definition } }),
  );
});
