// @ts-check
// A plain-JavaScript adapter typed with a JSDoc comment: the way most apps
// will use Xenia's types. Nothing here runs; tsc only checks it.

import { createHooks, adapterHook, setProvider, readProvider, subscribeProvider } from "xenia"

/** A stand-in for a library's own type, as chart.js would provide. */
class Gauge {
  /** @param {HTMLElement} el */
  constructor(el) { this.el = el }
  /** @param {number} value */
  set(value) { this.value = value }
  destroy() {}
}

/**
 * @type {import("xenia").Adapter<
 *   Gauge,
 *   {value: number, label?: string, theme?: "light" | "dark"},
 *   {change: {value: number}, ready: undefined},
 *   {reset: {to: number}}
 * >}
 */
export const gauge = {
  consumes: ["theme"],

  mount(el, props, ctx) {
    const gauge = new Gauge(el)
    gauge.set(props.value)
    ctx.emit("change", { value: props.value })
    ctx.emit("ready")
    fetch("/gauge.json", { signal: ctx.signal })
    el.ownerDocument.addEventListener("keydown", () => {}, { signal: ctx.signal })

    // @ts-expect-error: an event the adapter doesn't declare
    ctx.emit("chnage", { value: 1 })
    // @ts-expect-error: the wrong payload
    ctx.emit("change", { value: "1" })
    // @ts-expect-error: a missing payload
    ctx.emit("change")
    // @ts-expect-error: ctx has no such function
    ctx.emitt("change", { value: 1 })
    // @ts-expect-error: a prop the server doesn't send
    props.valeu

    return gauge
  },

  destroy(gauge) {
    gauge.destroy()
  },

  props: {
    value(gauge, value) {
      if (value !== undefined) gauge.set(value)
    },
    // @ts-expect-error: a handler for a prop that doesn't exist
    colour() {},
  },

  events: { change: { debounce: 100 }, ready: {} },

  commands: {
    reset(gauge, { to }, ctx) {
      gauge.set(to)
      if (ctx.isAlive()) ctx.emit("change", { value: to })
    },
  },
}

/** @type {import("xenia").Adapter<Gauge, {}, {}, {reset: {to: number}}>} */
export const wrongCommand = {
  mount: (el) => new Gauge(el),
  destroy() {},
  commands: {
    // @ts-expect-error: `to` is a number
    reset(gauge, { to }) { gauge.set(to.toUpperCase()) },
  },
}

// An untyped adapter still gets ctx: autocompletion, and its mistakes.
/** @type {import("xenia").Adapter} */
export const loose = {
  mount(el, props, ctx) {
    ctx.emit("anything", props.whatever)
    // @ts-expect-error: still not a ctx function
    ctx.send("x")
    return {}
  },
  destroy() {},
}

// Async mount, a call with its reply, a remount.
/** @type {import("xenia").Adapter<{ query: string }, {}, {search: {query: string}}>} */
export const search = {
  async mount(_el, _props, ctx) {
    /** @type {{options: string[]}} */
    const reply = await ctx.call("search", { query: "el" })
    reply.options.map((option) => option.toUpperCase())
    ctx.remount()
    return { query: "" }
  },
  destroy() {},
  events: { search: {} },
}

export const hooks = createHooks({ Gauge: gauge, Loose: loose, Search: search })
export const one = adapterHook(gauge, "Gauge")

// @ts-expect-error: an adapter needs mount and destroy
createHooks({ Broken: { mount() {} } })

setProvider("theme", "dark")
/** @type {{value: string} | null} */
const theme = readProvider("theme")
const stop = subscribeProvider("theme", (value) => console.log(value))
stop()
console.log(theme, hooks, one)
