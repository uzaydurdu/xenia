/**
 * The official Chart.js adapter (`createChartjs` from "xenia/chartjs").
 *
 * The app passes Chart.js in with `load`, so these tests pass a fake one:
 * a class that records what the adapter asks of it. The adapter runs inside
 * the real Controller, as in a browser. The real Chart.js is tested in the
 * examples app's browser tests (/chartjs).
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Controller } from "../../assets/core/controller.js";
import { setProvider, resetProviders } from "../../assets/core/providers.js";
import { createChartjs } from "../../assets/chartjs.js";

beforeEach(() => resetProviders());

// A stand-in for chart.js/auto: a Chart class that records its use.
function fakeChartJs() {
  const created = [];

  class Chart {
    static registered = [];
    static legendClicks = 0;
    static defaults = {
      plugins: { legend: { onClick: () => Chart.legendClicks++ } },
    };

    static register(...plugins) {
      Chart.registered.push(...plugins);
    }

    constructor(canvas, config) {
      Object.assign(this, {
        canvas,
        config,
        data: config.data,
        options: config.options,
      });
      this.updates = 0;
      this.destroyed = false;
      this.visible = {};
      this.tooltip = {
        setActiveElements: (active) => (this.tooltipActive = active),
      };
      created.push(this);
    }

    update() {
      this.updates++;
    }

    destroy() {
      this.destroyed = true;
    }

    getDatasetMeta(index) {
      const data = this.data.datasets[index]?.data ?? [];
      return { data: data.map((_, i) => ({ x: i * 10, y: i * 10 })) };
    }

    setActiveElements(active) {
      this.active = active;
    }

    isDatasetVisible(index) {
      return this.visible[index] !== false;
    }

    setDatasetVisibility(index, visible) {
      this.visible[index] = visible;
    }
  }

  return { module: { default: Chart }, Chart, created };
}

const SALES = {
  labels: ["Jan", "Feb"],
  datasets: [{ label: "Sales", data: [3, 5] }],
};

// One component: a jsdom container, a fake hook that records events.
function setup(t, adapter, props = { data: SALES }) {
  const dom = new JSDOM(`<div id="c"></div>`);
  const original = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = original;
    dom.window.close();
  });

  const container = dom.window.document.getElementById("c");
  container.setAttribute("data-xenia-props", JSON.stringify(props));
  container.setAttribute(
    "data-xenia-events",
    JSON.stringify({
      point_click: "clicked",
      legend_click: "legend",
      error: "failed",
    }),
  );

  const sent = [];
  const hook = {
    el: container,
    pushEvent: (event, payload) => sent.push([event, payload]),
  };
  const controller = new Controller(hook, adapter);

  return { controller, container, sent };
}

// Lets the async mount and the coalesced render run.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mounted(t, adapter, props) {
  const parts = setup(t, adapter, props);
  await parts.controller.mount();
  await settle();
  return parts;
}

// --- Loading the library -----------------------------------------------------

test("Chart.js is loaded once per factory, only when a chart mounts", async (t) => {
  const { module } = fakeChartJs();
  let loads = 0;
  const chartjs = createChartjs({ load: () => (loads++, module) });

  assert.equal(loads, 0, "creating the adapter loads nothing");

  await mounted(t, chartjs);
  await mounted(t, chartjs);
  assert.equal(loads, 1);
});

test("plugins are registered once per Chart.js, across factories", async (t) => {
  const { module, Chart } = fakeChartJs();
  const zoom = { id: "zoom" };
  const labels = { id: "labels" };

  await mounted(t, createChartjs({ load: () => module, plugins: [zoom] }));
  await mounted(t, createChartjs({ load: () => module, plugins: [zoom] }));
  await mounted(
    t,
    createChartjs({ load: () => module, plugins: [zoom, labels] }),
  );

  assert.deepEqual(Chart.registered, [zoom, labels]);
});

test("a failed load is retried by the next chart", async (t) => {
  const { module } = fakeChartJs();
  let attempts = 0;
  const chartjs = createChartjs({
    load: () => {
      attempts++;
      if (attempts === 1) throw new Error("network down");
      return module;
    },
  });

  const errors = t.mock.method(console, "error", () => {});
  const first = setup(t, chartjs);
  await first.controller.mount();
  assert.equal(errors.mock.callCount() > 0, true, "the failed mount is logged");

  const second = await mounted(t, chartjs);
  assert.equal(attempts, 2);
  assert.equal(second.container.querySelector("canvas") !== null, true);
});

test("load must give Chart.js, and is required", async (t) => {
  assert.throws(
    () => createChartjs({}),
    /pass the library's import: createChartjs/,
  );
  assert.throws(
    () => createChartjs({ load: () => ({}), setup: "no" }),
    /setup must be a function/,
  );

  const errors = t.mock.method(console, "error", () => {});
  const { controller } = setup(
    t,
    createChartjs({ load: () => ({ nope: true }) }),
  );
  await controller.mount();

  const logged = errors.mock.calls.map((call) =>
    String(call.arguments.at(-1)?.message ?? call.arguments),
  );
  assert.ok(logged.some((message) => /load must give Chart\.js/.test(message)));
});

test("a chart removed while Chart.js loads is never drawn", async (t) => {
  const { module, created } = fakeChartJs();
  let release;
  const chartjs = createChartjs({
    load: () => new Promise((resolve) => (release = resolve)),
  });

  const { controller, container } = setup(t, chartjs);
  const mounting = controller.mount();
  await settle();

  controller.destroy(); // the page navigated away
  release(module);
  await mounting;
  await settle();

  assert.equal(created.length, 0);
  assert.equal(container.querySelector("canvas"), null);
});

// --- Rendering ---------------------------------------------------------------

test("the chart gets its type, data, palette colors and merged options", async (t) => {
  const { module, created } = fakeChartJs();
  const chartjs = createChartjs({
    load: () => module,
    options: {
      plugins: { title: { display: true, text: "From the factory" } },
    },
  });

  await mounted(t, chartjs, {
    type: "line",
    data: SALES,
    options: { plugins: { title: { text: "From the page" } } },
  });

  const [chart] = created;
  assert.equal(chart.config.type, "line");
  assert.deepEqual(chart.config.data.labels, ["Jan", "Feb"]);
  assert.equal(
    chart.config.data.datasets[0].borderColor,
    "#4f46e5",
    "the light palette",
  );
  assert.equal(
    chart.config.options.plugins.title.display,
    true,
    "the factory's options",
  );
  assert.equal(
    chart.config.options.plugins.title.text,
    "From the page",
    "the page's options win",
  );
});

test("new data updates the same chart; a new type rebuilds it, with setup each time", async (t) => {
  const { module, created } = fakeChartJs();
  const calls = [];
  const chartjs = createChartjs({
    load: () => module,
    setup: (chart, { Chart, ctx }) => {
      calls.push(["setup", chart.config.type, typeof Chart, typeof ctx.emit]);
      return () => calls.push(["cleanup", chart.config.type]);
    },
  });

  const { controller, container } = await mounted(t, chartjs);

  container.setAttribute(
    "data-xenia-props",
    JSON.stringify({ data: { ...SALES, labels: ["Mar", "Apr"] } }),
  );
  controller.update();
  await settle();
  assert.equal(created.length, 1);
  assert.equal(created[0].updates, 1);
  assert.deepEqual(created[0].data.labels, ["Mar", "Apr"]);

  container.setAttribute(
    "data-xenia-props",
    JSON.stringify({ type: "pie", data: SALES }),
  );
  controller.update();
  await settle();
  assert.equal(created.length, 2);
  assert.equal(created[0].destroyed, true);

  controller.destroy();
  assert.equal(created[1].destroyed, true);
  assert.deepEqual(calls, [
    ["setup", "bar", "function", "function"],
    ["cleanup", "bar"],
    ["setup", "pie", "function", "function"],
    ["cleanup", "pie"],
  ]);
});

test("the app's theme arrives through consumes; the tag's theme wins; false turns colors off", async (t) => {
  const { module, created } = fakeChartJs();
  const chartjs = createChartjs({ load: () => module });
  setProvider("theme", "dark");

  await mounted(t, chartjs);
  assert.equal(
    created[0].config.data.datasets[0].borderColor,
    "#818cf8",
    "dark palette",
  );

  await mounted(t, chartjs, { data: SALES, theme: "light" });
  assert.equal(
    created[1].config.data.datasets[0].borderColor,
    "#4f46e5",
    "pinned light",
  );

  await mounted(t, chartjs, { data: SALES, theme: false });
  assert.equal(
    created[2].config.data.datasets[0].borderColor,
    undefined,
    "no themed colors",
  );

  // A theme change re-renders in place.
  setProvider("theme", "light");
  await settle();
  assert.equal(created[0].data.datasets[0].borderColor, "#4f46e5");
  assert.equal(created.length, 3, "no chart was rebuilt");
});

// --- Events and commands -------------------------------------------------------

test("clicks on points and on the legend become events", async (t) => {
  const { module, created, Chart } = fakeChartJs();
  const { sent } = await mounted(t, createChartjs({ load: () => module }));
  const [chart] = created;

  chart.config.options.onClick({}, [{ datasetIndex: 0, index: 1 }], chart);
  chart.config.options.plugins.legend.onClick(
    {},
    { datasetIndex: 0, text: "Sales" },
    { chart },
  );

  assert.deepEqual(sent, [
    [
      "clicked",
      { dataset_index: 0, index: 1, dataset: "Sales", label: "Feb", value: 5 },
    ],
    ["legend", { dataset_index: 0, label: "Sales", hidden: false }],
  ]);
  assert.equal(
    Chart.legendClicks,
    1,
    "Chart.js's own legend toggling still runs",
  );
});

test("commands drive the chart; wrong arguments become an error event, not a crash", async (t) => {
  const { module, created } = fakeChartJs();
  const { controller, sent } = await mounted(
    t,
    createChartjs({ load: () => module }),
  );
  const errors = t.mock.method(console, "error", () => {});

  controller.command("highlight", { index: 1 });
  assert.deepEqual(created[0].active, [{ datasetIndex: 0, index: 1 }]);

  controller.command("toggle_dataset", { index: 0 });
  assert.equal(created[0].visible[0], false);

  controller.command("highlight", { index: 9 });
  assert.deepEqual(sent.at(-1), [
    "failed",
    {
      source: "highlight",
      message: "no point at dataset 0, index 9",
      code: "RangeError",
    },
  ]);
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(controller.ctx.isAlive(), true, "the chart is still there");
});

// --- Extending -------------------------------------------------------------------

test("the adapter is a plain object: spread it to add commands and wrap props", async (t) => {
  const { module, created } = fakeChartJs();
  const base = createChartjs({ load: () => module });
  const titles = [];

  const extended = {
    ...base,
    props: {
      ...base.props,
      data(instance, data, ctx) {
        base.props.data(instance, data, ctx);
        titles.push(data.labels.join(" "));
      },
    },
    commands: {
      ...base.commands,
      sum(instance, _args, ctx) {
        const total = instance.chart.data.datasets[0].data.reduce(
          (a, b) => a + b,
          0,
        );
        ctx.emit("error", {
          source: "sum",
          message: String(total),
          code: null,
        });
      },
    },
  };

  const { controller, container, sent } = await mounted(t, extended);

  container.setAttribute(
    "data-xenia-props",
    JSON.stringify({ data: { ...SALES, labels: ["Q1", "Q2"] } }),
  );
  controller.update();
  await settle();
  controller.command("sum", {});

  assert.deepEqual(titles, ["Q1 Q2"]);
  assert.deepEqual(sent.at(-1), [
    "failed",
    { source: "sum", message: "8", code: null },
  ]);
  assert.equal(created.length, 1);
  assert.equal(
    typeof base.commands.sum,
    "undefined",
    "the official adapter is unchanged",
  );
});
