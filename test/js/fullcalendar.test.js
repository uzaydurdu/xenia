/**
 * The official FullCalendar adapter (`createFullCalendar` from
 * "xenia/fullcalendar"): a cleared date selection reaches the server.
 *
 * A fake Calendar records its options and, like FullCalendar 6.1, calls
 * `unselect` synchronously whenever a selection goes, inside its own API
 * calls too (`calendar.unselect()`, `prev()`, ...). The adapter runs inside
 * the real Controller. The real FullCalendar runs in the examples' browser
 * tests (/adapters/calendar).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Controller } from "../../assets/core/controller.js";
import { createFullCalendar } from "../../assets/fullcalendar.js";

class FakeCalendar {
  constructor(host, options) {
    this.options = options;
    this.selection = null;
  }
  render() {}
  destroy() {}
  setOption() {}
  // The API: a selection, and clearing it, as FullCalendar does them.
  select(start, end) {
    this.selection = { start, end };
    this.options.select({
      startStr: start,
      endStr: end ?? start,
      allDay: true,
    });
  }
  unselect(pointerEvent) {
    if (!this.selection) return;
    this.selection = null;
    this.options.unselect({ jsEvent: pointerEvent?.origEvent ?? null });
  }
  next() {
    this.unselect();
  }
}

async function mounted(t) {
  const dom = new JSDOM(`<div id="calendar"></div>`);
  const original = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = original;
    dom.window.close();
  });

  const container = dom.window.document.getElementById("calendar");
  container.setAttribute(
    "data-xenia-props",
    JSON.stringify({ selectable: true }),
  );
  container.setAttribute(
    "data-xenia-events",
    JSON.stringify({ select: "selected", unselect: "unselected" }),
  );

  const sent = [];
  const hook = {
    el: container,
    pushEvent: (event, payload) => sent.push([event, payload]),
  };
  const adapter = createFullCalendar({
    load: () => ({ Calendar: FakeCalendar, plugins: [] }),
  });
  const controller = new Controller(hook, adapter);
  await controller.mount();

  return {
    calendar: controller.instance.calendar,
    command: (name, args) => controller.command(name, args),
    sent,
  };
}

test("the user clearing a selection is reported as unselect", async (t) => {
  const { calendar, sent } = await mounted(t);

  // The user selects, then clicks elsewhere: FullCalendar passes the click.
  calendar.options.select({
    startStr: "2026-11-09",
    endStr: "2026-11-11",
    allDay: true,
  });
  calendar.selection = { start: "2026-11-09" };
  calendar.unselect({ origEvent: { type: "pointerup" } });

  assert.deepEqual(sent, [
    ["selected", { start: "2026-11-09", end: "2026-11-11", all_day: true }],
    ["unselected", {}],
  ]);
});

test("other dates shown clear the selection too, and that's reported", async (t) => {
  const { calendar, sent } = await mounted(t);

  calendar.selection = { start: "2026-11-09" };
  calendar.next(); // the toolbar's next button: no pointer event

  assert.deepEqual(sent, [["unselected", {}]]);
});

test("the server's own unselect and select commands aren't reported back as unselect", async (t) => {
  const { calendar, command, sent } = await mounted(t);

  calendar.selection = { start: "2026-11-09" };
  command("unselect");
  assert.equal(calendar.selection, null);
  assert.deepEqual(sent, []);

  calendar.selection = { start: "2026-11-09" };
  command("select", { start: "2026-11-12", end: "2026-11-13" });
  assert.deepEqual(calendar.selection, {
    start: "2026-11-12",
    end: "2026-11-13",
  });
  assert.ok(!sent.some(([event]) => event === "unselected"));

  // The guard is only for the command: the user's next clear is reported.
  calendar.unselect({ origEvent: { type: "pointerup" } });
  assert.deepEqual(sent.at(-1), ["unselected", {}]);
});
