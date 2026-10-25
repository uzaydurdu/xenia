/**
 * Xenia's official adapter for D3 (v7): data-driven charts with D3's data joins.
 *
 * D3 is a toolkit, not a chart library, so this adapter offers both:
 *   - built-in kinds: "bar", "line", "area", "scatter", "pie", "donut",
 *     with axes, legend, tooltip, transitions, click/hover/brush events;
 *   - your own charts: createD3({ load, charts: { sankey: { create, update,
 *     destroy } } }) in JS, then kind="sankey" from the server (see Usage).
 *
 * Props:
 *   kind     one of the built-in kinds or a registered name. Default "bar".
 *   data     long format, one object per point:
 *              %{x: "Jan" | 3 | "2026-01-01", y: 42, series: "North", size: 5}
 *            `series` is optional (one series), `size` only for scatter.
 *            Pie/donut: x is the slice label, y its value.
 *   options  (all optional)
 *     x_type        "auto" | "band" | "linear" | "time". Auto: bars use bands;
 *                   numbers are linear; ISO date strings are time; else band.
 *     y_min, y_max  fixed y domain (defaults to 0..max, extended for negatives)
 *     x_label, y_label   axis titles
 *     x_format, y_format d3-format specifier (".0%", "$,.2f"), or for time
 *                        axes a d3-time-format specifier ("%b %d")
 *     colors        list of CSS colors (default: Tableau 10)
 *     curve         "linear" | "monotone" | "step" | "natural" (line/area)
 *     stacked       true stacks bars of several series
 *     points        true draws points on lines (default true)
 *     inner_radius  0..1 hole size for donut (default 0.6)
 *     legend        true | false (default: true when there are 2+ entries)
 *     grid          true | false (default true)
 *     tooltip       true | false (default true)
 *     brush         true lets the user drag a range on line/area/scatter
 *                   charts with a linear or time x axis
 *     duration      transition length in ms (default 300; 0 = none)
 *     margin        %{top, right, bottom, left}
 *
 * Commands:
 *   highlight %{x, series?}   show a point/bar/slice as active with tooltip
 *   clear_highlight
 *   download_svg %{filename?}
 *
 * Events:
 *   select        %{x, y, series, index}   a mark was clicked
 *   hover         same, or %{} when leaving; at most every 100 ms
 *   brush         %{from, to}   the brushed x range (numbers or ISO strings)
 *   legend_click  %{key, hidden}   a legend entry was toggled
 *   error         %{source, message, code}
 *
 * Colors follow the page: text and axes use currentColor, so light and dark
 * mode work without configuration.
 *
 * Usage (the app passes the library in, so Xenia imports nothing):
 *   import { createD3 } from "xenia/d3"
 *   const d3 = createD3({
 *     load: () => import("d3")
 *   })
 *   // createHooks({ D3: d3 }), then <.d3_chart> (Xenia.Adapters.D3)
 *
 *   Your own chart kinds, next to the built-in ones:
 *     createD3({
 *       load: () => import("d3"),
 *       charts: {
 *         heatmap: {
 *           create(view) { return state },     // once
 *           update(state, view) {},            // every data/options change and resize
 *           destroy(state) {},                 // optional
 *         },
 *       },
 *     })
 *   `view` is { d3, svg, root, width, height, data, options, color, select,
 *   hover }; then <.d3_chart kind="heatmap" ...>.
 *
 *   Extend it by spreading: { ...d3, commands: { ...d3.commands, mine() {} } }
 */

import {
  expectLibrary,
  guarded,
  injectStyle,
  isFiniteNumber,
  loadOnce,
  reportError,
  throttle,
  withLibrary,
} from "./shared.js";

const LOAD = 'createD3({ load: () => import("d3") })';

function pickLibrary(library) {
  expectLibrary(typeof library?.select === "function", LOAD);
  return { D3: library };
}

/**
 * Creates the adapter. `load` gives the library (see the usage above); it is
 * called once, when the first component mounts.
 */
export function createD3({ load: libraryImport, charts = {} } = {}) {
  const loadLibrary = loadOnce(libraryImport, LOAD);
  let D3;
  // -----------------------------------------------------------------------------
  // Custom chart registry
  // -----------------------------------------------------------------------------

  const customCharts = new Map();

  /**
   * Registers a custom chart kind (from createD3's `charts` option).
   *
   *   registerD3Chart("heatmap", {
   *     create(view)           → state (anything), called once
   *     update(state, view)    called on every data/options change and resize
   *     destroy(state)         optional cleanup
   *   })
   *
   * `view` is { d3, svg, root, width, height, data, options, color, select,
   * hover }: svg is the D3 selection of the <svg>, root a <g> inside it,
   * width/height the drawable size, color(key) a palette lookup, and
   * select(detail) / hover(detail) send the adapter's events.
   */
  function registerD3Chart(name, definition) {
    if (
      typeof definition?.create !== "function" ||
      typeof definition?.update !== "function"
    ) {
      throw new TypeError(`[Xenia] createD3: charts.${name} needs create and update functions`);
    }

    customCharts.set(name, definition);
  }

  // -----------------------------------------------------------------------------
  // Defaults and helpers
  // -----------------------------------------------------------------------------

  const BUILT_IN = new Set(["bar", "line", "area", "scatter", "pie", "donut"]);
  const POINT_KINDS = new Set(["line", "area", "scatter"]);

  const curves = () => ({
    linear: D3.curveLinear,
    monotone: D3.curveMonotoneX,
    step: D3.curveStep,
    natural: D3.curveNatural,
  });

  const STYLE = `
  .xenia-d3 { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; font: 12px system-ui, sans-serif; }
  .xenia-d3__plot { position: relative; flex: 1; min-height: 0; }
  .xenia-d3__plot svg { display: block; overflow: visible; }
  .xenia-d3__legend { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 0 4px 6px; }
  .xenia-d3__legend button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; opacity: 0.9; }
  .xenia-d3__legend button[aria-pressed="false"] { opacity: 0.35; }
  .xenia-d3__legend button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; border-radius: 2px; }
  .xenia-d3__swatch { width: 10px; height: 10px; border-radius: 2px; }
  .xenia-d3__tooltip { position: absolute; pointer-events: none; padding: 6px 8px; border-radius: 6px; font-size: 12px; line-height: 1.3;
    background: rgba(24, 24, 27, 0.92); color: #fafafa; white-space: nowrap; transform: translate(-50%, calc(-100% - 10px)); opacity: 0; transition: opacity 100ms; }
  .xenia-d3__tooltip[data-visible] { opacity: 1; }
  .xenia-d3 .domain, .xenia-d3 .tick line { stroke: currentColor; stroke-opacity: 0.25; }
  .xenia-d3 .xenia-d3__grid line { stroke: currentColor; stroke-opacity: 0.1; }
  .xenia-d3 .xenia-d3__grid .domain { display: none; }
  .xenia-d3 .tick text, .xenia-d3__axis-label { fill: currentColor; opacity: 0.75; }
  .xenia-d3 .xenia-d3__mark { cursor: pointer; transition: opacity 150ms; }
  .xenia-d3 .xenia-d3__focus { fill: none; stroke: currentColor; stroke-width: 2; pointer-events: none; }
`;

  function settings(options = {}) {
    return {
      x_type: "auto",
      curve: "monotone",
      points: true,
      inner_radius: 0.6,
      grid: true,
      tooltip: true,
      brush: false,
      stacked: false,
      duration: 300,
      ...options,
      margin: {
        top: 12,
        right: 16,
        bottom: 28,
        left: 44,
        ...(options.margin ?? {}),
      },
    };
  }

  /** Normalizes data rows and keeps their original index. */
  function normalize(data) {
    if (!Array.isArray(data)) return [];

    return data
      .map((row, index) => ({
        x: row?.x,
        y: Number(row?.y),
        series: row?.series == null ? "" : String(row.series),
        size: row?.size,
        index,
      }))
      .filter((row) => row.x != null && Number.isFinite(row.y));
  }

  const unique = (values) => [...new Set(values)];

  const looksLikeDate = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}/.test(value) &&
    !Number.isNaN(Date.parse(value));

  function resolveXType(kind, rows, opts) {
    if (opts.x_type !== "auto") return opts.x_type;
    if (kind === "bar") return "band";
    if (rows.length && rows.every((row) => isFiniteNumber(row.x)))
      return "linear";
    if (rows.length && rows.every((row) => looksLikeDate(row.x))) return "time";
    return "band";
  }

  function xValue(xType, x) {
    return xType === "time" ? new Date(x) : x;
  }

  function formatter(spec, xType) {
    if (!spec) return null;
    return xType === "time" ? D3.timeFormat(spec) : D3.format(spec);
  }

  function describe(row) {
    const x = row.x instanceof Date ? row.x.toISOString() : row.x;
    return { x, y: row.y, series: row.series || null, index: row.index };
  }

  function rowKey(row) {
    return `${row.series}\u0000${row.x}`;
  }

  // -----------------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------------

  function render(instance) {
    const { plot, svg } = instance;
    const { width, height } = plot.getBoundingClientRect();

    if (width <= 0 || height <= 0) return;

    const kind = instance.kind ?? "bar";
    const opts = settings(instance.options);

    svg
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);

    if (!BUILT_IN.has(kind)) {
      renderCustom(instance, kind, width, height, opts);
      return;
    }

    if (instance.custom) destroyCustom(instance);

    const rows = normalize(instance.data);
    const isPie = kind === "pie" || kind === "donut";

    // Legend keys are series, or slice labels for pies.
    const keys = isPie
      ? unique(rows.map((row) => String(row.x)))
      : unique(rows.map((row) => row.series));
    const color = D3.scaleOrdinal(keys, opts.colors ?? D3.schemeTableau10);
    const visible = rows.filter(
      (row) => !instance.hidden.has(isPie ? String(row.x) : row.series),
    );

    renderLegend(instance, keys, color, opts);

    // Re-measure: the legend may have changed the plot's height.
    const box = plot.getBoundingClientRect();
    svg
      .attr("width", box.width)
      .attr("height", box.height)
      .attr("viewBox", `0 0 ${box.width} ${box.height}`);

    const margin = { ...opts.margin };
    if (opts.x_label) margin.bottom += 16;
    if (opts.y_label) margin.left += 16;

    const w = Math.max(0, box.width - margin.left - margin.right);
    const h = Math.max(0, box.height - margin.top - margin.bottom);

    const root = svg
      .selectAll("g.xenia-d3__root")
      .data([null])
      .join("g")
      .attr("class", "xenia-d3__root")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // A kind change starts from a clean root: marks of another kind can't be reused.
    if (instance.renderedKind !== kind) {
      root.selectAll("*").remove();
      instance.renderedKind = kind;
    }

    const transition = svg
      .transition()
      .duration(instance.firstRender ? 0 : opts.duration);
    instance.firstRender = false;

    const layout = isPie
      ? renderPie(instance, root, visible, color, w, h, opts, transition, kind)
      : renderCartesian(
          instance,
          root,
          visible,
          rows,
          color,
          w,
          h,
          opts,
          transition,
          kind,
          margin,
        );

    instance.layout = { ...layout, margin, kind };
    applyActive(instance);
  }

  function renderCartesian(
    instance,
    root,
    visible,
    allRows,
    color,
    w,
    h,
    opts,
    transition,
    kind,
    margin,
  ) {
    const xType = resolveXType(kind, allRows, opts);
    const series = unique(visible.map((row) => row.series));
    const rows = visible.map((row) => ({ ...row, x: xValue(xType, row.x) }));

    // --- x scale ---------------------------------------------------------------
    let x;
    if (xType === "band") {
      const domain = unique(allRows.map((row) => row.x));
      x =
        kind === "bar"
          ? D3.scaleBand(domain, [0, w]).padding(0.2)
          : D3.scalePoint(domain, [0, w]).padding(0.5);
    } else {
      const extent = D3.extent(rows, (row) => row.x);
      x = (xType === "time" ? D3.scaleTime() : D3.scaleLinear())
        .domain(extent[0] == null ? [0, 1] : extent)
        .range([0, w]);
      if (xType === "linear") x.nice();
    }

    // --- y scale ---------------------------------------------------------------
    const stacked = kind === "bar" && opts.stacked && series.length > 1;
    let stackedSeries = null;

    if (stacked) {
      const table = D3.rollups(
        rows,
        (group) => Object.fromEntries(group.map((r) => [r.series, r.y])),
        (r) => r.x,
      ).map(([xKey, values]) => ({ x: xKey, ...values }));
      stackedSeries = D3.stack()
        .keys(series)
        .value((d, key) => d[key] ?? 0)(table);
    }

    const yValues = stacked
      ? stackedSeries.flat().flatMap((d) => [d[0], d[1]])
      : rows.map((row) => row.y);
    const yLow = Math.min(0, D3.min(yValues) ?? 0);
    const yHigh = Math.max(0, D3.max(yValues) ?? 1);
    const y = D3.scaleLinear(
      [opts.y_min ?? yLow, opts.y_max ?? (yHigh === yLow ? yLow + 1 : yHigh)],
      [h, 0],
    );
    if (opts.y_min == null && opts.y_max == null) y.nice();

    // --- axes and grid ---------------------------------------------------------
    const xAxis = D3.axisBottom(x).ticks(Math.max(2, Math.floor(w / 80)));
    const xFormat = formatter(opts.x_format, xType);
    if (xFormat) xAxis.tickFormat(xFormat);

    const yAxis = D3.axisLeft(y).ticks(Math.max(2, Math.floor(h / 40)));
    const yFormat = formatter(opts.y_format, "linear");
    if (yFormat) yAxis.tickFormat(yFormat);

    const grid = root
      .selectAll("g.xenia-d3__grid")
      .data(opts.grid ? [null] : [])
      .join("g")
      .attr("class", "xenia-d3__grid");
    grid.transition(transition).call(
      D3.axisLeft(y)
        .ticks(Math.max(2, Math.floor(h / 40)))
        .tickSize(-w)
        .tickFormat(""),
    );

    root
      .selectAll("g.xenia-d3__x")
      .data([null])
      .join("g")
      .attr("class", "xenia-d3__x")
      .attr("transform", `translate(0,${y(Math.max(y.domain()[0], 0))})`)
      .transition(transition)
      .call(xAxis);
    root
      .selectAll("g.xenia-d3__y")
      .data([null])
      .join("g")
      .attr("class", "xenia-d3__y")
      .transition(transition)
      .call(yAxis);

    root
      .selectAll("text.xenia-d3__axis-label--x")
      .data(opts.x_label ? [opts.x_label] : [])
      .join("text")
      .attr("class", "xenia-d3__axis-label xenia-d3__axis-label--x")
      .attr("x", w / 2)
      .attr("y", h + margin.bottom - 4)
      .attr("text-anchor", "middle")
      .text((d) => d);
    root
      .selectAll("text.xenia-d3__axis-label--y")
      .data(opts.y_label ? [opts.y_label] : [])
      .join("text")
      .attr("class", "xenia-d3__axis-label xenia-d3__axis-label--y")
      .attr("transform", "rotate(-90)")
      .attr("x", -h / 2)
      .attr("y", -margin.left + 12)
      .attr("text-anchor", "middle")
      .text((d) => d);

    const marks = root
      .selectAll("g.xenia-d3__marks")
      .data([null])
      .join("g")
      .attr("class", "xenia-d3__marks");
    const position = (row) => [
      x(row.x) + (x.bandwidth ? x.bandwidth() / 2 : 0),
      y(row.y),
    ];

    // --- bars ------------------------------------------------------------------
    if (kind === "bar") {
      // Bars handle pointer events per mark; drop handlers of point kinds.
      instance.svg.on(".xenia", null);
      root.selectAll("g.xenia-d3__brush").remove();
      let bars;

      if (stacked) {
        bars = stackedSeries
          .flatMap((layer) =>
            layer.map((d) => {
              const source = rows.find(
                (row) => row.series === layer.key && row.x === d.data.x,
              );
              return {
                ...source,
                x0: d.data.x,
                y0: d[0],
                y1: d[1],
                bandX: x(d.data.x),
                width: x.bandwidth(),
              };
            }),
          )
          .filter((bar) => bar.series != null);
      } else {
        const inner = D3.scaleBand(series, [0, x.bandwidth()]).padding(0.05);
        bars = rows.map((row) => ({
          ...row,
          y0: Math.min(0, row.y),
          y1: Math.max(0, row.y),
          bandX: x(row.x) + (inner(row.series) ?? 0),
          width: inner.bandwidth(),
        }));
      }

      marks
        .selectAll("rect.xenia-d3__mark")
        .data(bars, rowKey)
        .join((enter) =>
          enter
            .append("rect")
            .attr("class", "xenia-d3__mark")
            .attr("x", (d) => d.bandX)
            .attr("width", (d) => d.width)
            .attr("y", y(0))
            .attr("height", 0),
        )
        .attr("fill", (d) => color(d.series))
        .on("click", (event, d) => select(instance, d))
        .on("pointerenter", (event, d) => hover(instance, d))
        .on("pointerleave", () => hover(instance, null))
        .transition(transition)
        .attr("x", (d) => d.bandX)
        .attr("width", (d) => d.width)
        .attr("y", (d) => y(d.y1))
        .attr("height", (d) => Math.max(0, y(d.y0) - y(d.y1)));

      return {
        rows: bars,
        position: (d) => [d.bandX + d.width / 2, y(d.y1)],
        marks: () => marks.selectAll("rect.xenia-d3__mark"),
        xType,
        x,
      };
    }

    // --- lines, areas, points ----------------------------------------------------
    marks.selectAll("rect.xenia-d3__mark").remove();

    const bySeries = D3.group(rows, (row) => row.series);
    const sorted = [...bySeries].map(([name, points]) => [
      name,
      [...points].sort((a, b) => D3.ascending(+x(a.x), +x(b.x))),
    ]);
    const curve = curves()[opts.curve] ?? D3.curveMonotoneX;

    if (kind === "area") {
      const area = D3.area()
        .x((d) => position(d)[0])
        .y0(y(0))
        .y1((d) => y(d.y))
        .curve(curve);
      marks
        .selectAll("path.xenia-d3__area")
        .data(sorted, ([name]) => name)
        .join("path")
        .attr("class", "xenia-d3__area")
        .attr("fill", ([name]) => color(name))
        .attr("fill-opacity", 0.25)
        .transition(transition)
        .attr("d", ([, points]) => area(points));
    } else {
      marks.selectAll("path.xenia-d3__area").remove();
    }

    if (kind === "line" || kind === "area") {
      const line = D3.line()
        .x((d) => position(d)[0])
        .y((d) => y(d.y))
        .curve(curve);
      marks
        .selectAll("path.xenia-d3__line")
        .data(sorted, ([name]) => name)
        .join("path")
        .attr("class", "xenia-d3__line")
        .attr("fill", "none")
        .attr("stroke-width", 2)
        .attr("stroke", ([name]) => color(name))
        .transition(transition)
        .attr("d", ([, points]) => line(points));
    } else {
      marks.selectAll("path.xenia-d3__line").remove();
    }

    const showPoints = kind === "scatter" || (kind === "line" && opts.points);
    const sizes = D3.scaleSqrt(
      D3.extent(rows, (row) => Number(row.size) || 1),
      [3, 14],
    );

    marks
      .selectAll("circle.xenia-d3__mark")
      .data(showPoints ? rows : [], rowKey)
      .join((enter) =>
        enter
          .append("circle")
          .attr("class", "xenia-d3__mark")
          .attr("cx", (d) => position(d)[0])
          .attr("cy", (d) => position(d)[1])
          .attr("r", 0),
      )
      .attr("fill", (d) => color(d.series))
      .attr("fill-opacity", kind === "scatter" ? 0.75 : 1)
      .transition(transition)
      .attr("cx", (d) => position(d)[0])
      .attr("cy", (d) => position(d)[1])
      .attr("r", (d) =>
        kind === "scatter" && d.size != null
          ? sizes(Number(d.size))
          : kind === "scatter"
            ? 5
            : 3,
      );

    // Pointer handling for point kinds: nearest point within 40 px.
    const nearest = (event) => {
      const [px, py] = D3.pointer(event, root.node());
      const found = D3.least(rows, (row) =>
        Math.hypot(position(row)[0] - px, position(row)[1] - py),
      );
      return found &&
        Math.hypot(position(found)[0] - px, position(found)[1] - py) <= 40
        ? found
        : null;
    };

    instance.svg
      .on("pointermove.xenia", (event) => hover(instance, nearest(event)))
      .on("pointerleave.xenia", () => hover(instance, null))
      .on("click.xenia", (event) => {
        const row = nearest(event);
        if (row) select(instance, row);
      });

    // Brush on continuous x axes.
    const brushable = opts.brush && xType !== "band";
    const brushGroup = root
      .selectAll("g.xenia-d3__brush")
      .data(brushable ? [null] : [])
      .join("g")
      .attr("class", "xenia-d3__brush");

    if (brushable) {
      const brush = D3.brushX()
        .extent([
          [0, 0],
          [w, h],
        ])
        .on("end", (event) => {
          if (!event.selection || !event.sourceEvent) return;

          const [from, to] = event.selection.map((px) => x.invert(px));
          const out = (value) =>
            value instanceof Date ? value.toISOString() : value;
          instance.ctx.emit("brush", { from: out(from), to: out(to) });
          brushGroup.call(brush.move, null);
        });

      brushGroup.call(brush);
    }

    return {
      rows,
      position,
      marks: () => marks.selectAll("circle.xenia-d3__mark"),
      xType,
      x,
    };
  }

  function renderPie(
    instance,
    root,
    visible,
    color,
    w,
    h,
    opts,
    transition,
    kind,
  ) {
    instance.svg.on(".xenia", null);
    root
      .selectAll(
        ".xenia-d3__grid, .xenia-d3__x, .xenia-d3__y, .xenia-d3__axis-label, .xenia-d3__brush",
      )
      .remove();

    // One slice per label: values of several series are summed.
    visible = D3.rollups(
      visible,
      (rows) => D3.sum(rows, (row) => row.y),
      (row) => String(row.x),
    ).map(([x, y], index) => ({ x, y, series: "", index }));

    const radius = Math.max(0, Math.min(w, h) / 2);
    const inner =
      kind === "donut"
        ? radius * Math.min(Math.max(opts.inner_radius, 0), 0.95)
        : 0;
    const arc = D3.arc()
      .innerRadius(inner)
      .outerRadius(radius)
      .padAngle(kind === "donut" ? 0.01 : 0);
    const slices = D3.pie()
      .sort(null)
      .value((row) => Math.max(0, row.y))(visible);

    const center = root
      .selectAll("g.xenia-d3__marks")
      .data([null])
      .join("g")
      .attr("class", "xenia-d3__marks")
      .attr("transform", `translate(${w / 2},${h / 2})`);

    center
      .selectAll("path.xenia-d3__mark")
      .data(slices, (slice) => String(slice.data.x))
      .join((enter) =>
        enter
          .append("path")
          .attr("class", "xenia-d3__mark")
          .each(function (slice) {
            this._current = { ...slice, endAngle: slice.startAngle };
          }),
      )
      .attr("fill", (slice) => color(String(slice.data.x)))
      .attr("stroke", "var(--xenia-d3-slice-border, transparent)")
      .on("click", (event, slice) => select(instance, slice.data))
      .on("pointerenter", (event, slice) => hover(instance, slice.data))
      .on("pointerleave", () => hover(instance, null))
      .transition(transition)
      .attrTween("d", function (slice) {
        const interpolate = D3.interpolate(this._current ?? slice, slice);
        this._current = interpolate(1);
        return (t) => arc(interpolate(t));
      });

    const byKey = new Map(slices.map((slice) => [String(slice.data.x), slice]));

    return {
      rows: visible,
      position: (row) => {
        const slice = byKey.get(String(row.x));
        const [cx, cy] = slice ? arc.centroid(slice) : [0, 0];
        return [w / 2 + cx, h / 2 + cy];
      },
      marks: () => center.selectAll("path.xenia-d3__mark"),
      pie: true,
    };
  }

  function renderLegend(instance, keys, color, opts) {
    const show = opts.legend ?? keys.length > 1;
    const entries = show ? keys.filter((key) => key !== "") : [];

    D3.select(instance.legend)
      .selectAll("button")
      .data(entries, (key) => key)
      .join((enter) => {
        const button = enter.append("button").attr("type", "button");
        button.append("span").attr("class", "xenia-d3__swatch");
        button.append("span").attr("class", "xenia-d3__label");
        return button;
      })
      .attr("aria-pressed", (key) => String(!instance.hidden.has(key)))
      .on("click", (event, key) => {
        const hidden = !instance.hidden.has(key);
        if (hidden) instance.hidden.add(key);
        else instance.hidden.delete(key);

        instance.ctx.emit("legend_click", { key, hidden });
        scheduleRender(instance);
      })
      .call((button) => {
        button
          .select(".xenia-d3__swatch")
          .style("background", (key) => color(key));
        button.select(".xenia-d3__label").text((key) => key);
      });
  }

  // -----------------------------------------------------------------------------
  // Interaction
  // -----------------------------------------------------------------------------

  function select(instance, row) {
    instance.ctx.emit("select", describe(row));
  }

  function hover(instance, row) {
    instance.hovered = row;
    applyActive(instance);
    instance.emitHover(row ? describe(row) : {});
  }

  /** Shows the hovered or highlighted mark: tooltip, focus ring, dimming. */
  function applyActive(instance) {
    const { layout, tooltip } = instance;
    if (!layout) return;

    const active = instance.hovered ?? findHighlighted(instance);
    const opts = settings(instance.options);
    const activeKey = active ? rowKey(active) : null;

    layout.marks().attr("opacity", (d) => {
      if (!activeKey) return 1;
      const row = d.data ?? d; // pie slices wrap the row
      return rowKey(row) === activeKey
        ? 1
        : layout.pie || instance.layout.kind === "bar"
          ? 0.35
          : 0.6;
    });

    // Focus ring for point kinds.
    const root = instance.svg.select("g.xenia-d3__root");
    const focus =
      POINT_KINDS.has(layout.kind) && active ? [layout.position(active)] : [];
    root
      .selectAll("circle.xenia-d3__focus")
      .data(focus)
      .join("circle")
      .attr("class", "xenia-d3__focus")
      .attr("r", 7)
      .attr("cx", (d) => d[0])
      .attr("cy", (d) => d[1]);

    if (!active || !opts.tooltip) {
      tooltip.removeAttribute("data-visible");
      return;
    }

    const [px, py] = layout.position(active);
    const xText =
      active.x instanceof Date
        ? D3.timeFormat(opts.x_format ?? "%Y-%m-%d")(active.x)
        : active.x;
    const yFormat = formatter(opts.y_format, "linear") ?? ((value) => value);

    tooltip.textContent = `${active.series ? `${active.series} · ` : ""}${xText}: ${yFormat(active.y)}`;
    tooltip.style.left = `${px + layout.margin.left}px`;
    tooltip.style.top = `${py + layout.margin.top}px`;
    tooltip.setAttribute("data-visible", "");
  }

  function findHighlighted(instance) {
    const target = instance.highlighted;
    if (!target || !instance.layout) return null;

    return (
      instance.layout.rows.find((row) => {
        const x = row.x instanceof Date ? row.x.toISOString() : row.x;
        const wanted =
          instance.layout.xType === "time"
            ? new Date(target.x).toISOString()
            : target.x;
        return (
          String(x) === String(wanted) &&
          (target.series == null || row.series === String(target.series))
        );
      }) ?? null
    );
  }

  // -----------------------------------------------------------------------------
  // Custom charts
  // -----------------------------------------------------------------------------

  function customView(instance, width, height, opts) {
    const keys = unique(normalize(instance.data).map((row) => row.series));

    return {
      d3: D3,
      svg: instance.svg,
      root: instance.svg
        .selectAll("g.xenia-d3__root")
        .data([null])
        .join("g")
        .attr("class", "xenia-d3__root"),
      width,
      height,
      data: instance.data ?? [],
      options: opts,
      color: D3.scaleOrdinal(keys, opts.colors ?? D3.schemeTableau10),
      select: (detail) => instance.ctx.emit("select", detail ?? {}),
      hover: (detail) => instance.emitHover(detail ?? {}),
    };
  }

  function renderCustom(instance, kind, width, height, opts) {
    const definition = customCharts.get(kind);

    if (!definition) {
      reportError(
        instance.ctx,
        "kind",
        new Error(
          `unknown chart kind "${kind}"; pass it in createD3({ charts })`,
        ),
      );
      return;
    }

    if (instance.custom?.kind !== kind) {
      if (instance.custom) destroyCustom(instance);

      instance.svg.selectAll("*").remove();
      instance.svg.on(".xenia", null);
      D3.select(instance.legend).selectAll("*").remove();
      instance.renderedKind = kind;
      instance.layout = null;

      instance.custom = {
        kind,
        definition,
        state: definition.create(customView(instance, width, height, opts)),
      };
    }

    instance.custom.definition.update(
      instance.custom.state,
      customView(instance, width, height, opts),
    );
  }

  function destroyCustom(instance) {
    try {
      instance.custom.definition.destroy?.(instance.custom.state);
    } catch (error) {
      console.error("[Xenia d3] custom chart cleanup failed:", error);
    }

    instance.custom = null;
    instance.svg.selectAll("*").remove();
  }

  // -----------------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------------

  /** Renders at most once per animation frame (props, resize, legend). */
  function scheduleRender(instance) {
    if (instance.frame) return;

    instance.frame = instance.win.requestAnimationFrame(() => {
      instance.frame = 0;
      if (!instance.ctx.isAlive() || instance.destroyed) return;

      try {
        render(instance);
      } catch (error) {
        reportError(instance.ctx, "render", error);
      }
    });
  }

  function setter(key) {
    return (instance, value) => {
      instance[key] = value;
      if (key === "kind") instance.hidden.clear();
      scheduleRender(instance);
    };
  }

  const adapter = {
    mount(el, props, ctx) {
      const doc = el.ownerDocument;
      injectStyle(doc, "xenia-d3-style", STYLE);

      const host = doc.createElement("div");
      host.className = "xenia-d3";
      host.innerHTML = `
      <div class="xenia-d3__legend" role="group" aria-label="Legend"></div>
      <div class="xenia-d3__plot"><svg role="img"></svg><div class="xenia-d3__tooltip" role="status"></div></div>
    `;
      el.appendChild(host);

      const instance = {
        ctx,
        win: doc.defaultView,
        host,
        legend: host.querySelector(".xenia-d3__legend"),
        plot: host.querySelector(".xenia-d3__plot"),
        svg: D3.select(host.querySelector("svg")),
        tooltip: host.querySelector(".xenia-d3__tooltip"),
        kind: props.kind ?? "bar",
        data: props.data ?? [],
        options: props.options ?? {},
        hidden: new Set(),
        hovered: null,
        highlighted: null,
        layout: null,
        custom: null,
        renderedKind: null,
        firstRender: true,
        frame: 0,
        destroyed: false,
        emitHover: throttle(
          (detail) => ctx.isAlive() && ctx.emit("hover", detail),
          100,
        ),
        resize: null,
      };

      instance.resize = new ResizeObserver(() => scheduleRender(instance));
      instance.resize.observe(instance.plot);
      scheduleRender(instance);

      return instance;
    },

    destroy(instance) {
      instance.destroyed = true;
      instance.win.cancelAnimationFrame(instance.frame);
      instance.resize.disconnect();
      instance.emitHover.cancel();
      instance.svg.interrupt().selectAll("*").interrupt();
      if (instance.custom) destroyCustom(instance);
      instance.host.remove();
    },

    props: {
      kind: setter("kind"),
      data: setter("data"),
      options: setter("options"),
    },

    commands: {
      highlight: guarded("highlight", (instance, { x, series }) => {
        if (x == null) throw new TypeError("highlight expects %{x, series?}");
        instance.highlighted = { x, series };
        applyActive(instance);
      }),

      clear_highlight: guarded("clear_highlight", (instance) => {
        instance.highlighted = null;
        applyActive(instance);
      }),

      download_svg: guarded(
        "download_svg",
        (instance, { filename = "chart.svg" }) => {
          const node = instance.svg.node().cloneNode(true);
          node.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          node.setAttribute(
            "style",
            `color: ${instance.win.getComputedStyle(instance.host).color}; font: 12px sans-serif`,
          );

          const blob = new instance.win.Blob(
            [new instance.win.XMLSerializer().serializeToString(node)],
            {
              type: "image/svg+xml",
            },
          );
          const url = instance.win.URL.createObjectURL(blob);
          const link = instance.host.ownerDocument.createElement("a");
          link.href = url;
          link.download = filename;
          link.click();
          setTimeout(() => instance.win.URL.revokeObjectURL(url), 1000);
        },
      ),
    },

    events: {
      select: {},
      hover: {}, // throttled in the adapter
      brush: {},
      legend_click: {},
      error: {},
    },
  };

  for (const [kind, definition] of Object.entries(charts))
    registerD3Chart(kind, definition);

  return withLibrary(adapter, loadLibrary, (library) => {
    ({ D3 } = pickLibrary(library));
  });
}
