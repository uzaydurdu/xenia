/**
 * Xenia's official Chart.js adapter (`import { createChartjs } from "xenia/chartjs"`).
 *
 * The app passes Chart.js in, so Xenia's bundle imports nothing and apps
 * that don't use Chart.js never install it:
 *
 *   import { createChartjs } from "xenia/chartjs"
 *   export const chartjs = createChartjs({ load: () => import("chart.js/auto") })
 *   // createHooks({ ChartJS: chartjs }), then <.chartjs> (Xenia.Adapters.Chartjs)
 *
 * Every Chart.js chart type and option works: `type`, `data` and `options`
 * go to Chart.js as they are. On top, the adapter adds light and dark
 * colors, click, legend and hover events, and a few commands.
 *
 * Factory options:
 *   load      required: () => import("chart.js/auto"). Called once per
 *             factory, however many charts mount; retried if it failed.
 *   plugins   Chart.js plugins to register (zoom, annotation, datalabels,
 *             or your own object). Registered once per Chart.js module.
 *   options   Chart.js options for every chart of this factory, under each
 *             chart's own `options` prop.
 *   palette   %{light: [colors], dark: [colors]}: dataset colors.
 *   setup     (chart, { Chart, ctx }) => cleanup?  after each chart is
 *             created (also after a type change rebuilds it). A returned
 *             function runs before that chart is destroyed.
 *
 * Props:
 *   type     "bar" | "line" | "pie" | "doughnut" | "radar" | "polarArea" |
 *            "scatter" | "bubble" | any registered type. Changing it
 *            rebuilds the chart: Chart.js can't switch types in place.
 *   data     { labels, datasets }, exactly as Chart.js expects
 *   options  Chart.js options, merged over the themed defaults
 *   theme    the app's theme ("light" or "dark") arrives here through
 *            consumes: ["theme"]. Set it on the tag to pin one, or to
 *            false for no themed colors at all.
 *   Changes to data and options update the chart in place.
 *
 * Commands:
 *   highlight %{dataset_index?, index}   show a point as active, with tooltip
 *   clear_highlight
 *   toggle_dataset %{index, visible?}    hide or show a dataset
 *   reset                                replay the intro animation
 *   download_image %{filename?}          save the chart as a PNG
 *
 * Events:
 *   point_click   %{dataset_index, index, dataset, label, value}
 *   legend_click  %{dataset_index, label, hidden}
 *   hover         %{dataset_index, index, dataset, label, value}, or %{}
 *                 when the pointer leaves all points; at most every 100 ms
 *   error         %{source, message, code}: a command's bad arguments
 *
 * Extending: the factory returns a plain adapter object. Spread it and
 * override or add props, commands and events:
 *   const base = createChartjs({ load })
 *   export const chartjs = { ...base, commands: { ...base.commands, mine() {} } }
 * In a handler, `instance.chart` is the Chart.js chart (null until the
 * first render) and `instance.Chart` is Chart.js itself.
 */

import {
  deepMerge,
  guarded,
  loadOnce,
  registerOnce,
  throttle,
} from "./shared.js";

const DEFAULT_PALETTE = {
  light: [
    "#4f46e5",
    "#0891b2",
    "#d97706",
    "#db2777",
    "#16a34a",
    "#7c3aed",
    "#dc2626",
    "#0d9488",
  ],
  dark: [
    "#818cf8",
    "#22d3ee",
    "#fbbf24",
    "#f472b6",
    "#4ade80",
    "#a78bfa",
    "#f87171",
    "#2dd4bf",
  ],
};

const TEXT = { light: "#52525b", dark: "#a1a1aa" };
const GRID = { light: "#e4e4e7", dark: "#3f3f46" };

/** Types drawn on x/y axes; the others (pie, doughnut, ...) get none. */
const CARTESIAN = new Set(["bar", "line", "scatter", "bubble"]);

/** Types where each data point, not each dataset, gets its own color. */
const PER_POINT_COLORS = new Set(["pie", "doughnut", "polarArea"]);

/** chart.js/auto's module, or Chart itself, as `load` may give it. */
function chartClass(module) {
  const Chart = module?.default ?? module?.Chart ?? module;

  if (typeof Chart !== "function" || typeof Chart.register !== "function") {
    throw new TypeError(
      '[Xenia] createChartjs: load must give Chart.js, e.g. load: () => import("chart.js/auto")',
    );
  }

  return Chart;
}

/** "light", "dark", or null for no theming. Anything else is light. */
function themeMode(theme) {
  if (theme === false) return null;
  return theme === "dark" ? "dark" : "light";
}

function pointDetail(chart, { datasetIndex, index }) {
  const dataset = chart.data.datasets[datasetIndex];

  return {
    dataset_index: datasetIndex,
    index,
    dataset: dataset?.label ?? null,
    label: chart.data.labels?.[index] ?? null,
    value: dataset?.data?.[index] ?? null,
  };
}

/** Palette colors for datasets that don't set their own. */
function colorDatasets(type, datasets, mode, palette) {
  if (!mode)
    return datasets.map((dataset) => ({
      ...dataset,
      data: [...(dataset.data ?? [])],
    }));

  const colors = palette[mode];

  return datasets.map((dataset, i) => {
    const datasetType = dataset.type ?? type;
    const data = [...(dataset.data ?? [])];

    if (PER_POINT_COLORS.has(datasetType)) {
      return {
        backgroundColor: data.map((_, j) => colors[j % colors.length]),
        borderColor: mode === "dark" ? "#18181b" : "#ffffff",
        ...dataset,
        data,
      };
    }

    const color = colors[i % colors.length];

    return {
      borderColor: color,
      backgroundColor: datasetType === "line" ? color : `${color}cc`,
      borderWidth: 2,
      ...(datasetType === "bar" ? { borderRadius: 4 } : {}),
      ...(datasetType === "line"
        ? { tension: 0.3, pointRadius: 3, pointHoverRadius: 6 }
        : {}),
      ...dataset,
      data,
    };
  });
}

function baseOptions(instance, type, mode) {
  const { ctx, Chart } = instance;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: true },
    onClick: (_event, elements, chart) => {
      if (elements.length > 0)
        ctx.emit("point_click", pointDetail(chart, elements[0]));
    },
    onHover: (event, elements, chart) => {
      const target = event.native?.target;
      if (target)
        target.style.cursor = elements.length > 0 ? "pointer" : "default";

      const key = elements[0]
        ? `${elements[0].datasetIndex}:${elements[0].index}`
        : null;
      if (key === instance.hoverKey) return;

      instance.hoverKey = key;
      instance.emitHover(elements[0] ? pointDetail(chart, elements[0]) : {});
    },
    plugins: {
      legend: {
        onClick: (event, item, legend) => {
          // Keep Chart.js's default toggling, then report the result.
          Chart.defaults.plugins.legend.onClick.call(
            legend,
            event,
            item,
            legend,
          );

          const index = item.datasetIndex ?? item.index;
          const chart = legend.chart;
          const hidden =
            item.datasetIndex != null
              ? !chart.isDatasetVisible(index)
              : !chart.getDataVisibility(index);

          ctx.emit("legend_click", {
            dataset_index: index,
            label: item.text,
            hidden,
          });
        },
      },
    },
  };

  // Respect reduced motion: no animations at all.
  if (instance.win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    options.animation = false;
  }

  if (!mode) return options;

  options.plugins.legend.labels = {
    color: TEXT[mode],
    usePointStyle: true,
    boxWidth: 8,
    boxHeight: 8,
  };
  options.plugins.tooltip = { padding: 10, cornerRadius: 6 };

  if (CARTESIAN.has(type)) {
    const axis = {
      ticks: { color: TEXT[mode] },
      grid: { color: GRID[mode] },
      border: { color: GRID[mode] },
    };
    options.scales = { x: { ...axis, grid: { display: false } }, y: axis };
  } else if (type === "radar" || type === "polarArea") {
    options.scales = {
      r: {
        ticks: { color: TEXT[mode], backdropColor: "transparent" },
        grid: { color: GRID[mode] },
        angleLines: { color: GRID[mode] },
        pointLabels: { color: TEXT[mode] },
      },
    };
  }

  return options;
}

function buildConfig(instance) {
  const { type = "bar", data = {}, options = {}, theme } = instance.config;
  const mode = themeMode(theme);
  const { factory } = instance;

  return {
    type,
    data: {
      ...data,
      labels: [...(data.labels ?? [])],
      datasets: colorDatasets(type, data.datasets ?? [], mode, factory.palette),
    },
    // Themed defaults, then the factory's options, then the chart's own.
    options: deepMerge(
      deepMerge(baseOptions(instance, type, mode), factory.options),
      options,
    ),
  };
}

/** Destroys the current chart, running its setup cleanup first. */
function destroyChart(instance) {
  try {
    instance.cleanup?.();
  } finally {
    instance.cleanup = null;
    instance.chart?.destroy();
    instance.chart = null;
  }
}

/** Creates the chart, rebuilds it for a new type, or updates it in place. */
function render(instance) {
  const config = buildConfig(instance);

  if (instance.chart && instance.chartType === config.type) {
    instance.chart.data = config.data;
    instance.chart.options = config.options;
    instance.chart.update();
    return;
  }

  destroyChart(instance);
  instance.chart = new instance.Chart(instance.canvas, config);
  instance.chartType = config.type;

  const cleanup = instance.factory.setup?.(instance.chart, {
    Chart: instance.Chart,
    ctx: instance.ctx,
  });
  instance.cleanup = typeof cleanup === "function" ? cleanup : null;
}

/** The props of one update are coalesced into one render. */
function scheduleRender(instance) {
  if (instance.renderPending) return;
  instance.renderPending = true;

  queueMicrotask(() => {
    instance.renderPending = false;
    if (instance.ctx.isAlive() && !instance.destroyed) render(instance);
  });
}

function setConfig(key) {
  return (instance, value) => {
    instance.config = { ...instance.config, [key]: value };
    scheduleRender(instance);
  };
}

function highlight(chart, { dataset_index: datasetIndex = 0, index }) {
  const point = chart.getDatasetMeta(datasetIndex)?.data?.[index];

  if (!point) {
    throw new RangeError(`no point at dataset ${datasetIndex}, index ${index}`);
  }

  const active = [{ datasetIndex, index }];
  chart.setActiveElements(active);
  chart.tooltip.setActiveElements(active, { x: point.x, y: point.y });
  chart.update();
}

/** A command that needs a chart: an error event if there is none yet. */
function withChart(name, fn) {
  return guarded(name, (instance, args, ctx) => {
    if (!instance.chart) throw new Error("the chart isn't ready");
    return fn(instance, args, ctx);
  });
}

/**
 * Creates a Chart.js adapter. See the top of this file.
 *
 * @param {{
 *   load: () => unknown,
 *   plugins?: object[],
 *   options?: object,
 *   palette?: { light?: string[], dark?: string[] },
 *   setup?: (chart: object, extra: { Chart: Function, ctx: object }) => (void | (() => void)),
 * }} config
 * @returns {object} a Xenia adapter
 */
export function createChartjs({
  load,
  plugins = [],
  options = {},
  palette = {},
  setup,
} = {}) {
  const loadChart = loadOnce(
    load,
    'createChartjs({ load: () => import("chart.js/auto") })',
  );

  if (setup !== undefined && typeof setup !== "function") {
    throw new TypeError("[Xenia] createChartjs: setup must be a function");
  }

  const factory = {
    options,
    setup,
    palette: {
      light: palette.light ?? DEFAULT_PALETTE.light,
      dark: palette.dark ?? DEFAULT_PALETTE.dark,
    },
  };

  return {
    consumes: ["theme"],

    async mount(el, props, ctx) {
      const Chart = chartClass(await loadChart());
      registerOnce(Chart, plugins, (...fresh) => Chart.register(...fresh));

      const doc = el.ownerDocument;

      // Chart.js needs a positioned, sized parent for responsive charts.
      const frame = doc.createElement("div");
      frame.style.cssText =
        "position: relative; width: 100%; height: 100%; min-height: 12rem;";
      const canvas = doc.createElement("canvas");
      frame.appendChild(canvas);
      el.appendChild(frame);

      const instance = {
        Chart,
        factory,
        win: doc.defaultView,
        doc,
        ctx,
        frame,
        canvas,
        config: {
          type: props.type,
          data: props.data,
          options: props.options,
          theme: props.theme,
        },
        chart: null,
        chartType: null,
        cleanup: null,
        renderPending: false,
        destroyed: false,
        hoverKey: null,
        emitHover: throttle(
          (detail) => ctx.isAlive() && ctx.emit("hover", detail),
          100,
        ),
      };

      // Removed while Chart.js was loading: Xenia calls destroy() next, so
      // don't draw anything.
      if (!ctx.isAlive()) return instance;

      try {
        render(instance);
        return instance;
      } catch (error) {
        destroyChart(instance);
        frame.remove();
        throw error;
      }
    },

    destroy(instance) {
      instance.destroyed = true;
      instance.emitHover.cancel();
      destroyChart(instance);
      instance.frame.remove();
    },

    props: {
      type: setConfig("type"),
      data: setConfig("data"),
      options: setConfig("options"),
      theme: setConfig("theme"),
    },

    commands: {
      highlight: withChart("highlight", (i, args) => highlight(i.chart, args)),

      clear_highlight: withChart("clear_highlight", (i) => {
        i.chart.setActiveElements([]);
        i.chart.tooltip.setActiveElements([], { x: 0, y: 0 });
        i.chart.update();
      }),

      toggle_dataset: withChart("toggle_dataset", (i, { index, visible }) => {
        if (!Number.isInteger(index))
          throw new TypeError("toggle_dataset expects %{index: integer}");

        const show = visible ?? !i.chart.isDatasetVisible(index);
        i.chart.setDatasetVisibility(index, show);
        i.chart.update();
      }),

      reset: withChart("reset", (i) => {
        i.chart.reset();
        i.chart.update();
      }),

      download_image: withChart(
        "download_image",
        (i, { filename = "chart.png" }) => {
          const link = i.doc.createElement("a");
          link.href = i.chart.toBase64Image("image/png", 1);
          link.download = filename;
          link.click();
        },
      ),
    },

    events: {
      point_click: {},
      legend_click: {},
      hover: {}, // throttled in the adapter
      error: {},
    },
  };
}
