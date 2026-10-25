/**
 * Xenia controller: bridges a Phoenix LiveView hook and a client-side adapter.
 *
 * Each hooked element gets one Controller. The Controller owns a child
 * `<div>` inside the Phoenix container and hands it to the adapter, which
 * renders whatever it likes (a chart, a map, a React tree) into it.
 *
 * Data flow:
 * - Server → client props: read as JSON from the container's
 *   `data-xenia-props` attribute. Only changed keys are dispatched.
 * - Server → client commands: pushed via `xenia:command:<element id>`
 *   as `{ command, args }` and routed to `adapter.commands[command]`.
 * - Client → server events: the adapter calls `ctx.emit(name, payload)`;
 *   events must be declared in `adapter.events` and bound to a Phoenix
 *   event name in the container's `data-xenia-events` attribute. Optional
 *   per-event debounce keeps only the latest payload.
 * - Client → server → client calls: `ctx.call(name, payload)` sends the same
 *   kind of event and returns a Promise of the server's reply
 *   (`{:reply, map, socket}`), pushed from the XeniaCall element.
 *
 * Lifecycle: mounting → mounted → destroyed (terminal).
 * - adapter.mount() may be async. Props and commands that arrive while it
 *   is pending are held back, then reconciled (props first, then commands
 *   in order) once it resolves.
 * - Remount: an adapter can call `ctx.remount()` to replace its instance
 *   with a fresh one (mounted → mounting → mounted). From the moment a
 *   remount is requested, commands are queued for the new instance. The
 *   old instance is destroyed, a new child element is created, mount()
 *   runs again with the latest props, and queued commands are replayed.
 *   Each mount gets its own `ctx`, so callbacks from the old instance can
 *   no longer emit events or trigger remounts.
 * - destroy() is safe at any point, including during a pending mount or
 *   remount; a late instance is cleaned up when its mount resolves.
 * - Debounced events still pending at destroy are cancelled. Before
 *   LiveView navigation (`phx:page-loading-start`), they are flushed so
 *   user input isn't lost.
 *
 * Failure policy (a "crash", see crash()):
 * - adapter.mount() throws or rejects: the controller is destroyed, but
 *   adapter.destroy() is not called (§4: no instance exists).
 * - Any adapter callback throws after a successful mount: the controller
 *   is destroyed, including adapter.destroy(), so nothing leaks.
 * - Either way, the page's `on_crash` event is sent, and the <:error> slot
 *   is shown. An element in it with `data-xenia-retry` starts a fresh
 *   controller (adapterHook's restart).
 *
 * Loading: the server-rendered <:loading> slot stays on top of the
 * adapter's element until the first mount finishes (setUpLoading()).
 *
 * Reentrancy: adapter callbacks may synchronously trigger updates, remounts
 * or destruction. Every loop and multi-step operation re-checks the state
 * after calling out, so a destroyed controller is never revived and an
 * older prop snapshot never overwrites a newer one.
 *
 * Adapter contract (§4):
 *   mount(el, props, ctx)          → instance | Promise<instance>
 *   destroy?(instance, ctx)        → void   (synchronous, see checkSyncDestroy)
 *   props?:    { [key]: (instance, value, ctx) => void }
 *   commands?: { [name]: (instance, args, ctx) => void }
 *   events?:   { [name]: { debounce?: number } }
 * Props without a handler are assigned directly: `instance[key] = value`.
 */

import { isMac, matchShortcut, readShortcuts } from "./shortcuts.js";
import { decodeProps, changedKeys, jsonEqual } from "./props.js";
import { setProvider, readProvider, subscribe } from "./providers.js";

/** Controller lifecycle states. */
const State = Object.freeze({
  MOUNTING: "mounting",
  MOUNTED: "mounted",
  DESTROYED: "destroyed",
});

/** XeniaCall hooks (built into createHooks), by their element. */
const callHooks = new WeakMap();

/** Active controllers with potentially pending events. */
const liveControllers = new Set();

/** Windows already listening for LiveView navigation. */
const registeredWindows = new WeakSet();

/**
 * Adapter names known to be registered: every createHooks() key, plus the
 * name of every container an adapterHook() hook has mounted on.
 */
const registeredAdapters = new Set();

/**
 * Tracks which missing adapter name has already been reported
 * for each DOM element.
 *
 * WeakMap avoids retaining elements removed from the page.
 */
const reportedMissingAdapters = new WeakMap();

/**
 * Tracks windows with an installed adapter-registration checker.
 *
 * Each window is handled independently, which also supports
 * separate jsdom environments in tests.
 */
const checkedWindows = new WeakSet();

/**
 * Flush pending debounced adapter events when LiveView starts
 * navigating away from the current page.
 *
 * Installs exactly one listener per window.
 */
function registerNavigationListener() {
  if (typeof window === "undefined") return;
  if (registeredWindows.has(window)) return;

  window.addEventListener("phx:page-loading-start", () => {
    for (const controller of liveControllers) {
      controller.flushEvents();
    }
  });

  registeredWindows.add(window);
}

/**
 * The adapter contract requires destroy() to be synchronous.
 *
 * If an adapter accidentally returns a Promise, warn about
 * the contract violation and handle potential rejection.
 *
 * The Promise is not awaited.
 *
 * @param {*} result Return value of adapter.destroy().
 */
function checkSyncDestroy(result) {
  if (typeof result?.then !== "function") return;

  console.warn(
    "[Xenia] adapter.destroy() must be synchronous; " +
      "the returned Promise is not awaited",
  );

  Promise.resolve(result).catch((error) => {
    console.error("[Xenia] Destroy failed:", error);
  });
}

/**
 * Report Xenia components whose JavaScript adapter was not
 * registered through createHooks().
 *
 * @param {Document} doc Document to inspect.
 */
function checkAdapterRegistrations(root) {
  if (!root) return;

  // `root` itself may be a component (an added node, not a document).
  if (root.matches?.("[data-xenia-adapter]")) reportIfUnregistered(root);

  for (const el of root.querySelectorAll?.("[data-xenia-adapter]") ?? []) {
    reportIfUnregistered(el);
  }
}

/**
 * Reports one Xenia container if its adapter isn't registered.
 *
 * @param {Element} el An element with a data-xenia-adapter attribute.
 */
function reportIfUnregistered(el) {
  const adapter = el.getAttribute("data-xenia-adapter");

  // Ignore invalid/empty names. Elixir validates these.
  if (!adapter) return;

  // A registered adapter is valid.
  if (registeredAdapters.has(adapter)) return;

  // A co-located adapter (adapterHook in a ColocatedHook) is registered
  // through the hooks LiveView extracted, which the app gives its LiveSocket.
  const socketHooks = liveSocketHooks();
  if (socketHooks && Object.hasOwn(socketHooks, adapter)) return;

  // A co-located name ("MyAppWeb.SalesPage.Chart") can't be checked without
  // the LiveSocket, because createHooks() never sees it.
  const colocated = adapter.includes(".");
  if (colocated && !socketHooks) return;

  // Report each missing adapter only once per element/name.
  if (reportedMissingAdapters.get(el) === adapter) return;

  reportedMissingAdapters.set(el, adapter);

  const elementName = el.id ? `#${el.id}` : "<element>";

  if (colocated) {
    const local = adapter.slice(adapter.lastIndexOf("."));

    console.error(
      `[Xenia] ${elementName} uses the co-located adapter "${adapter}", ` +
        `which the LiveSocket doesn't have. Check that its module defines ` +
        `<script :type={Phoenix.LiveView.ColocatedHook} name="${local}">, ` +
        `and that app.js passes the hooks from "phoenix-colocated/<app>" ` +
        `to the LiveSocket.`,
    );
    return;
  }

  // Quote the property when its name is not a JS identifier.
  const propertyName = /^[A-Za-z_$][\w$]*$/.test(adapter)
    ? adapter
    : JSON.stringify(adapter);

  console.error(
    `[Xenia] ${elementName} uses adapter "${adapter}", ` +
      `which isn't registered. ` +
      `Add it to createHooks({ ${propertyName}: yourAdapter }).`,
  );
}

/**
 * The hooks the app gave its LiveSocket, when the app exposes it as
 * `window.liveSocket` (Phoenix's generated app.js does). Only read, for this
 * development-time diagnostic.
 *
 * @returns {Record<string, unknown> | null}
 */
function liveSocketHooks() {
  const hooks = globalThis.window?.liveSocket?.hooks;
  return hooks && typeof hooks === "object" ? hooks : null;
}

/**
 * Checks only what a batch of DOM mutations changed: elements that were
 * added, and elements whose adapter name changed. Re-scanning the whole
 * document on every mutation would run on every keystroke in an editor,
 * because editors change the DOM constantly.
 *
 * @param {MutationRecord[]} mutations
 */
function checkMutations(mutations) {
  for (const mutation of mutations) {
    if (mutation.type === "attributes") {
      reportIfUnregistered(mutation.target);
      continue;
    }

    for (const node of mutation.addedNodes) {
      if (node.nodeType === 1) checkAdapterRegistrations(node);
    }
  }
}

/**
 * Install adapter-registration diagnostics for a browser window.
 *
 * Checks:
 * 1. Initial document load.
 * 2. LiveView navigation completion.
 * 3. Dynamic insertion of Xenia components.
 * 4. Changes to an existing component's adapter name.
 *
 * Installs only once per window.
 */
function registerAdapterChecker() {
  if (typeof window === "undefined") return;

  const win = window;
  const doc = win.document;

  if (!doc || checkedWindows.has(win)) return;

  checkedWindows.add(win);

  // Always check the document belonging to this window.
  const check = () => checkAdapterRegistrations(doc);

  // Check after LiveView navigation completes.
  win.addEventListener("phx:page-loading-stop", check);

  // Detect new components and adapter-name changes.
  if (typeof win.MutationObserver === "function" && doc.documentElement) {
    const observer = new win.MutationObserver(checkMutations);

    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-xenia-adapter"],
    });
  }

  // Check elements rendered before JavaScript initialization.
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", check, {
      once: true,
    });
  } else {
    queueMicrotask(check);
  }
}

/** True for `{...}` objects: the payloads LiveView's JS `push` can send. */
function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Converts an adapter value into the string stored by an HTML input.
 */
function formValueToString(value) {
  if (value == null) return "";

  if (typeof value === "string") return value;

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

/**
 * Reads a provider value rendered by Phoenix
 * and saves it in Xenia's shared provider store.
 */
function publishProvider(el) {
  try {
    // Example: "theme"
    const name = el.dataset.xeniaProvider;

    // Example: '"dark"' (JSON text)
    const json = el.dataset.xeniaValue;

    // Convert JSON text into a JavaScript value.
    const value = JSON.parse(json);

    // Save the value on Xenia's shared noticeboard.
    setProvider(name, value);
  } catch (error) {
    console.error("[Xenia] Invalid provider value:", error);
  }
}

/**
 * Validates an adapter's `consumes` list: the provider names it wants.
 * Returns a duplicate-free copy, or [] with a warning when the list is invalid.
 */
function normalizeConsumes(consumes) {
  const list = consumes ?? [];

  const valid =
    Array.isArray(list) &&
    list.every((name) => typeof name === "string" && name.trim() !== "");

  if (!valid) {
    console.warn("[Xenia] Adapter consumes must be an array of provider names");
    return [];
  }

  return [...new Set(list)];
}

export class Controller {
  /**
   * Sets up state and the adapter's mount target without mounting anything.
   *
   * Creates a full-size child `<div>` inside the Phoenix container
   * (`hook.el`) and builds the `ctx` object passed to every adapter call.
   * Decoding props and calling adapter.mount() happen in mount().
   *
   * @param {object} hook    The Phoenix hook (`this` inside hook callbacks).
   * @param {object} adapter The adapter implementing the §4 contract.
   * @param {object} [options]
   * @param {Function} [options.restart] Starts a fresh controller for the
   *   same hook. A retry in the <:error> slot calls it (see adapterHook).
   */
  constructor(hook, adapter, { restart } = {}) {
    // --- Wiring ---------------------------------------------------------
    this.hook = hook;
    this.adapter = adapter;
    this.instance = undefined; // what adapter.mount() returns

    // --- Lifecycle ------------------------------------------------------
    this.state = State.MOUNTING;
    this.mountStarted = false;

    // --- Remounting -----------------------------------------------------
    this.generation = 0; // incremented on each remount; retires old contexts
    this.remountRequested = false; // a remount is scheduled or waiting to run
    this.remounting = false; // a remount is in progress

    // --- Props ----------------------------------------------------------
    // say how they differ.
    this.serverProps = {}; // props exactly as Phoenix sent them
    this.props = {}; // latest props the adapter sees (server + providers)
    this.mountProps = {}; // props the adapter was mounted with

    // --- Queues ---------------------------------------------------------
    this.commands = []; // commands waiting for a ready instance
    this.pendingEvents = new Map(); // event name → { timer, serverEvent, payload }

    // --- Providers ------------------------------------------------------
    this.consumes = normalizeConsumes(adapter.consumes);
    this.unsubscribers = []; // functions that stop provider subscriptions

    // --- Loading and error slots (Xenia.Component) -----------------------
    this.restart = restart;
    this.loading = this.setUpLoading(); // also sets this.frame

    // --- DOM and context ------------------------------------------------
    // created last, so every field above exists when these
    // helpers run.
    this.el = this.createMountTarget();
    this.ctx = this.createContext();

    // --- Keyboard shortcuts ---------------------------------------------
    // On the container, in the capture phase: keydown only reaches it while
    // focus is inside the component, and the capture phase runs before the
    // library's own key handling. The container outlives remounts.
    this.onKeydown = (event) => this.handleShortcut(event);
    this.hook.el.addEventListener?.("keydown", this.onKeydown, true);
  }

  /**
   * Creates a full-size child `<div>`, appends it to the Phoenix container
   * and returns it. The adapter renders into this element, never into
   * `hook.el` itself. Called once per mount generation.
   */
  createMountTarget() {
    const el = document.createElement("div");
    el.style.width = "100%";
    el.style.height = "100%";

    if (this.frame) {
      // The frame's one grid cell, under the placeholder (see setUpLoading).
      el.style.gridArea = "1 / 1";
      el.style.minWidth = "0";
      el.style.minHeight = "0";
      this.frame.insertBefore(el, this.frame.firstChild);
    } else {
      this.hook.el.appendChild(el);
    }

    return el;
  }

  /**
   * Finds the server-rendered <:loading> slot (`data-xenia-loading`) and
   * shows it until the first mount finishes. Returns it, or null.
   *
   * The adapter's element must stay visible and sized while mounting:
   * Chart.js, Monaco and Leaflet measure it. So the placeholder and the
   * element share the one cell of a grid, the frame, with the placeholder
   * on top. In a container with a height, both fill it; in one without,
   * the placeholder's height sizes the element.
   *
   * The frame is created once and kept, so a retry after a crash finds the
   * placeholder again and shows it while the island restarts.
   */
  setUpLoading() {
    const container = this.hook.el;
    this.frame = container.querySelector?.(":scope > [data-xenia-frame]") ?? null;

    const loading =
      (this.frame ?? container).querySelector?.(":scope > [data-xenia-loading]") ??
      null;

    if (!loading) return null;

    if (!this.frame) {
      const frame = document.createElement("div");
      frame.setAttribute("data-xenia-frame", "");
      frame.style.display = "grid";
      frame.style.width = "100%";
      frame.style.height = "100%";

      loading.style.gridArea = "1 / 1";
      loading.style.zIndex = "1";
      loading.style.minWidth = "0";
      loading.style.minHeight = "0";

      container.insertBefore(frame, loading);
      frame.appendChild(loading);
      this.frame = frame;
    }

    loading.hidden = false;
    return loading;
  }

  /**
   * Builds the `ctx` object passed to the adapter for the current mount
   * generation.
   *
   * The context remembers the generation it was created for. After a
   * remount, an old context reports `isAlive() === false`, and its `emit`
   * and `remount` do nothing, so late callbacks from a replaced instance
   * can't affect the new one.
   */
  createContext() {
    const generation = this.generation;

    const isAlive = () =>
      this.generation === generation &&
      this.state !== State.DESTROYED &&
      this.el.isConnected;

    return {
      id: this.hook.el.id,
      hook: this.hook,

      /** True while this context's instance is current and in the page. */
      isAlive,

      /** Sends an adapter event to the server (see emit()). */
      emit: (name, payload) => {
        if (isAlive()) this.emit(name, payload);
      },

      /** Asks the controller to replace this instance with a fresh one. */
      remount: () => {
        if (isAlive()) this.requestRemount();
      },

      setFormValue: (value, options) => {
        if (!isAlive()) return false;
        return this.setFormValue(value, options);
      },

      upload: (name, files) => {
        if (!isAlive()) return false;
        return this.upload(name, files);
      },

      /** Sends an event and resolves with the server's reply (see call()). */
      call: (name, payload) => {
        if (!isAlive()) {
          return Promise.reject(
            new Error(`[Xenia] call "${name}": the instance is no longer alive`),
          );
        }
        return this.call(name, payload);
      },
    };
  }

  /**
   * Combines Phoenix props with shared provider values.
   *
   * Explicit Phoenix props always win.
   */
  readProps() {
    this.serverProps = decodeProps(this.hook.el, this.serverProps);

    const fromProviders = {};

    for (const name of this.consumes) {
      const provided = readProvider(name);

      if (provided !== null) {
        fromProviders[name] = provided.value;
      }
    }

    // Phoenix's explicit props override providers.
    return {
      ...fromProviders,
      ...this.serverProps,
    };
  }

  /**
   * Stop listening to shared provider values.
   */
  unsubscribeProviders() {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }

    this.unsubscribers = [];
  }

  /**
   * Decodes the current props and mounts the adapter. Runs once per mount
   * generation: on first mount, and again for each remount.
   *
   * Never rejects; failures are logged. The two failure kinds are handled
   * differently:
   * - adapter.mount() fails: no instance exists, so the controller cleans
   *   up only its own resources and adapter.destroy() is not called.
   * - Reconciling props fails after a successful mount: an instance exists,
   *   so the full destroy() runs, including adapter.destroy().
   *
   * After a successful mount:
   * - if destroy() ran in the meantime, the late instance is destroyed;
   * - otherwise props that changed during mounting are applied. Then, if a
   *   remount was requested, it runs before any queued command, so commands
   *   reach the replacement instance. Otherwise queued commands are replayed.
   *   During a remount, replay is left to performRemount().
   */
  async mount() {
    if (this.mountStarted || this.state !== State.MOUNTING) return;
    this.mountStarted = true;

    registerNavigationListener();
    liveControllers.add(this);

    let instance;

    try {
      if (this.unsubscribers.length === 0) {
        this.unsubscribers = this.consumes.map((name) =>
          subscribe(name, () => {
            this.update();
          }),
        );
      }

      const props = this.readProps();

      this.props = props;
      this.mountProps = props;

      instance = await this.adapter.mount(this.el, props, this.ctx);
    } catch (error) {
      if (this.state === State.DESTROYED) return;

      console.error("[Xenia] Mount failed:", error);
      this.crash("mount", error, () => this.abandonMount());
      return;
    }

    if (this.state === State.DESTROYED) {
      try {
        checkSyncDestroy(this.adapter.destroy?.(instance, this.ctx));
      } catch (error) {
        console.error("[Xenia] Cleanup after destroy failed:", error);
      }
      return;
    }

    this.instance = instance;
    this.state = State.MOUNTED;

    // The island is up: the placeholder goes (kept hidden for a retry).
    if (this.loading) this.loading.hidden = true;

    // From here on an instance exists, so failures must go through destroy().
    try {
      this.dispatchChanges(this.mountProps, this.props);
    } catch (error) {
      console.error("[Xenia] Initial prop reconciliation failed:", error);
      this.crash("update", error, () => this.destroy());
      return;
    }

    // During a remount, performRemount() decides what happens next.
    if (this.remounting) return;

    if (this.remountRequested) {
      void this.performRemount(); // queued commands go to the new instance
    } else {
      this.flushCommands();
    }
  }

  /**
   * Cleans up after adapter.mount() failed. Marks the controller destroyed
   * and releases its own resources, but never calls adapter.destroy():
   * there is no instance, and the adapter must undo partial work itself.
   */
  abandonMount() {
    this.state = State.DESTROYED;
    this.remountRequested = false;
    this.commands.length = 0;
    this.unsubscribeProviders();
    this.cancelEvents();
    liveControllers.delete(this);

    this.el.remove();
    this.source?.remove();
    this.hook.el.removeEventListener?.("keydown", this.onKeydown, true);
    this.instance = undefined;
  }

  /**
   * Called on every Phoenix `updated()`. Re-decodes props and dispatches
   * the keys that changed.
   *
   * - Invalid JSON is logged and the previous props are kept.
   * - While mounting (or remounting), the new props are only stored;
   *   mount() applies them.
   * - If an adapter handler throws, the controller is destroyed.
   */
  update() {
    if (this.state === State.DESTROYED) return;

    const prev = this.props;

    let next;
    try {
      next = this.readProps();
    } catch (error) {
      console.error("[Xenia] Invalid props:", error);
      return;
    }

    this.props = next;

    if (this.state === State.MOUNTING) return;

    try {
      this.dispatchChanges(prev, next);
    } catch (error) {
      console.error("[Xenia] Adapter update failed:", error);
      this.crash("update", error, () => this.destroy());
    }
  }

  /**
   * Tears the controller down. Idempotent and safe in any state.
   *
   * The state is set to "destroyed" first, so `ctx.isAlive()` is already
   * false inside adapter.destroy(), and a pending remount stops. Queued
   * commands and pending events are dropped (not sent). adapter.destroy()
   * is only called if an instance is mounted; a pending mount cleans up its
   * own late instance. adapter.destroy() is synchronous (checkSyncDestroy);
   * its errors are logged, never thrown.
   */
  destroy() {
    if (this.state === State.DESTROYED) return;

    const wasMounted = this.state === State.MOUNTED;

    this.state = State.DESTROYED;
    this.remountRequested = false;
    this.commands.length = 0;
    this.unsubscribeProviders();
    this.cancelEvents();
    liveControllers.delete(this);

    if (wasMounted) {
      try {
        checkSyncDestroy(this.adapter.destroy?.(this.instance, this.ctx));
      } catch (error) {
        console.error("[Xenia] Destroy failed:", error);
      }
    }

    this.el.remove();
    this.source?.remove();
    this.hook.el.removeEventListener?.("keydown", this.onKeydown, true);
    this.instance = undefined; // release for GC and block stale use
  }

  /**
   * An adapter callback threw. Tells the server, tears the controller down
   * with `teardown` (destroy() or abandonMount()), and shows the <:error>
   * slot.
   *
   * @param {"mount"|"update"|"command"|"remount"} phase What Xenia was doing.
   * @param {*} error What the adapter threw.
   * @param {Function} teardown
   */
  crash(phase, error, teardown) {
    this.reportCrash(phase, error);
    teardown();
    this.showError();
  }

  /**
   * Sends the page's `on_crash` event (`data-xenia-crash`), if it bound one,
   * with `{ id, phase, message }`. Sent before the teardown, while the
   * controller can still push.
   */
  reportCrash(phase, error) {
    if (this.state === State.DESTROYED || !this.hook.el.isConnected) return;

    const serverEvent = this.hook.el.getAttribute?.("data-xenia-crash");
    if (!serverEvent) return;

    const message = String(error?.message ?? error);
    this.push(serverEvent, { id: this.hook.el.id, phase, message });
  }

  /**
   * Shows the server-rendered <:error> slot (`<template data-xenia-error>`)
   * where the island was, and hides the placeholder. A click on an element
   * marked `data-xenia-retry` removes it and starts a fresh controller.
   * Nothing is shown for a component that is no longer in the page.
   */
  showError() {
    if (this.loading) this.loading.hidden = true;

    const container = this.hook.el;
    if (!container.isConnected) return;

    const template = container.querySelector?.(
      ":scope > template[data-xenia-error]",
    );
    if (!template?.content) return;

    const node = document.createElement("div");
    node.setAttribute("data-xenia-crashed", "");
    node.style.height = "100%";
    if (this.frame) node.style.gridArea = "1 / 1";
    node.appendChild(template.content.cloneNode(true));

    if (typeof this.restart === "function") {
      node.addEventListener("click", (event) => {
        if (!event.target?.closest?.("[data-xenia-retry]")) return;

        event.preventDefault();
        node.remove();
        this.restart();
      });
    }

    (this.frame ?? container).appendChild(node);
  }

  /**
   * Sends the LiveView event a keyboard shortcut maps to (Xenia.Shortcuts).
   *
   * A matched combination is the page's: neither the library nor the
   * browser acts on it. Pending events go first, so a shortcut can't
   * overtake input it depends on: `mod+s` right after typing reaches the
   * server after the last change, not before it.
   *
   * @param {KeyboardEvent} event
   */
  handleShortcut(event) {
    if (!this.ctx.isAlive()) return;

    const shortcuts = readShortcuts(this.hook.el);
    if (!shortcuts) return;

    const match = matchShortcut(event, shortcuts, isMac());
    if (!match) return;

    event.preventDefault();
    event.stopPropagation();

    this.flushEvents();
    this.sendEvent(match.event, { shortcut: match.combo });
  }

  /**
   * True when commands can't run yet and must be queued: while mounting,
   * and from the moment a remount is requested until it has finished, so
   * commands never reach an instance that is about to be replaced.
   */
  isWaitingForInstance() {
    return (
      this.state === State.MOUNTING || this.remountRequested || this.remounting
    );
  }

  /**
   * Runs a server command through `adapter.commands[name](instance, args, ctx)`.
   *
   * Commands sent while no instance is ready (see isWaitingForInstance())
   * are queued and replayed later in their original order. Unknown command
   * names are warned about and skipped. If the handler throws, the
   * controller is destroyed.
   *
   * @param {string} name    Command name.
   * @param {*}      payload Arguments passed to the handler.
   */
  command(name, payload) {
    if (this.state === State.DESTROYED) return;

    if (this.isWaitingForInstance()) {
      this.commands.push({ name, payload });
      return;
    }

    try {
      const handler = this.adapter.commands?.[name];

      if (typeof handler !== "function") {
        console.warn(`[Xenia] Unknown command: "${name}"`);
        return;
      }

      handler(this.instance, payload, this.ctx);
    } catch (error) {
      console.error("[Xenia] Adapter command failed:", error);
      this.crash("command", error, () => this.destroy());
    }
  }

  /**
   * Replays queued commands in their original order. Stops early if a
   * command destroys the controller or requests a remount; the rest of the
   * queue then waits for the replacement instance.
   */
  flushCommands() {
    while (
      this.state === State.MOUNTED &&
      !this.isWaitingForInstance() &&
      this.commands.length > 0
    ) {
      const { name, payload } = this.commands.shift();
      this.command(name, payload);
    }
  }

  /**
   * Sends an adapter event to the server, optionally debounced.
   *
   * The event is dropped (silently or with a warning) unless:
   * - the controller is alive;
   * - the event is declared in `adapter.events`;
   * - the container's `data-xenia-events` JSON binds it to a non-empty
   *   Phoenix event name. An unbound event is ignored without a warning,
   *   so templates can opt in to only the events they care about;
   * - its `debounce` (default 0) is a finite, non-negative number of ms.
   *
   * With debounce, each new emit of the same event replaces the pending
   * one, so only the latest payload is sent.
   *
   * @param {string} name    Adapter event name.
   * @param {*}      payload Data sent to the server.
   */
  emit(name, payload) {
    if (!this.ctx.isAlive()) return;

    const { serverEvent, problem } = this.serverEventFor(name);
    if (problem === "undeclared") console.warn(`[Xenia] Undeclared event: "${name}"`);
    if (!serverEvent) return;

    const debounce = this.adapter.events[name]?.debounce ?? 0;

    if (
      typeof debounce !== "number" ||
      !Number.isFinite(debounce) ||
      debounce < 0
    ) {
      console.warn(`[Xenia] Invalid debounce for event "${name}":`, debounce);
      return;
    }

    // A new emit always supersedes a pending one of the same name.
    const previous = this.pendingEvents.get(name);
    if (previous) {
      clearTimeout(previous.timer);
      this.pendingEvents.delete(name);
    }

    if (debounce === 0) {
      this.sendEvent(serverEvent, payload);
      return;
    }

    const timer = setTimeout(() => {
      this.pendingEvents.delete(name);
      this.sendEvent(serverEvent, payload); // re-checks isAlive()
    }, debounce);

    this.pendingEvents.set(name, { timer, serverEvent, payload });
  }

  /**
   * The LiveView event an adapter event is bound to, or why there is none:
   * `{ serverEvent }`, or `{ problem }` with "undeclared" (not in
   * `adapter.events`), "invalid" (unreadable `data-xenia-events`, logged) or
   * "unbound" (the page didn't bind it).
   */
  serverEventFor(name) {
    if (!Object.hasOwn(this.adapter.events ?? {}, name)) {
      return { problem: "undeclared" };
    }

    let bindings;
    try {
      bindings = JSON.parse(
        this.hook.el.getAttribute("data-xenia-events") ?? "{}",
      );
    } catch (error) {
      console.error("[Xenia] Invalid event bindings:", error);
      return { problem: "invalid" };
    }

    const serverEvent = bindings?.[name];
    if (typeof serverEvent !== "string" || !serverEvent.trim()) {
      return { problem: "unbound" };
    }

    return { serverEvent };
  }

  /**
   * Sends an adapter event and returns a Promise of the server's reply: the
   * map its `handle_event` returns as `{:reply, map, socket}`.
   *
   * A call is an event like emit()'s: declared in `adapter.events`, bound by
   * the page (`on_<name>`). It is never debounced, and pending events go
   * first, so a call can't overtake input it depends on.
   *
   * It is pushed from the XeniaCall element the server renders inside the
   * container, with that hook's public `pushEvent`, which returns the reply.
   * LiveView locks the element an event is pushed from until the reply, and
   * locking the container can revert its props (see sendEvent()). The call
   * element is never patched, so locking it is harmless. Without it (no
   * XeniaCall hook registered, or a server-rendered container without one),
   * the container's own hook pushes, as a fallback.
   *
   * Rejects when the event isn't declared or bound, or when LiveView rejects
   * the push (disconnected, the server crashed). An adapter awaiting a call
   * checks `ctx.isAlive()` before using the reply, as with any async work.
   *
   * @param {string} name    Adapter event name.
   * @param {*}      payload Data sent to the server.
   * @returns {Promise<*>}   The server's reply.
   */
  async call(name, payload = {}) {
    const { serverEvent, problem } = this.serverEventFor(name);

    if (!serverEvent) {
      const why = {
        undeclared: "isn't declared in the adapter's events",
        invalid: "has unreadable event bindings",
        unbound: "isn't bound by the page (on_" + name + ")",
      }[problem];
      throw new Error(`[Xenia] call "${name}" ${why}`);
    }

    this.flushEvents();

    // The call element's hook mounts in the same LiveView patch as the
    // container's; if a call comes during mount, it may be a tick behind.
    let callHook = this.callHook();
    if (!callHook && this.hook.el.querySelector?.(":scope > [data-xenia-call]")) {
      await Promise.resolve();
      callHook = this.callHook();
    }

    return (callHook ?? this.hook).pushEvent(serverEvent, payload);
  }

  /** The XeniaCall hook of this container's call element, if mounted. */
  callHook() {
    const el = this.hook.el.querySelector?.(":scope > [data-xenia-call]");
    return el ? callHooks.get(el) : undefined;
  }

  /**
   * The single place where events reach Phoenix. Skips sending if the
   * controller is no longer alive and logs errors instead of throwing.
   *
   * Events are pushed from a hidden element of the core's (see
   * eventSource()), not with `hook.pushEvent`. LiveView locks the element an
   * event is pushed from until the server replies. Locking the container
   * breaks props: when several events overlap, LiveView can restore a stale
   * copy of the locked container on unlock, which reverts `data-xenia-props`
   * to an older value (CLAUDE.md §6, M5 findings). The hidden element is
   * never patched by LiveView, so locking it is harmless.
   *
   * `liveSocket.execJS` with a `push` command is LiveView's public API for
   * this. It sends the payload's keys as the event's params, so it needs a
   * plain object; anything else, and hooks without a liveSocket (tests), use
   * `hook.pushEvent`.
   *
   * @param {string} serverEvent Phoenix event name.
   * @param {*}      payload     Event data.
   */
  sendEvent(serverEvent, payload) {
    if (!this.ctx.isAlive()) return;
    this.push(serverEvent, payload);
  }

  /** The transport itself (see sendEvent()), without the liveness check. */
  push(serverEvent, payload) {
    try {
      const liveSocket = this.hook.liveSocket;

      if (typeof liveSocket?.execJS === "function" && isPlainObject(payload)) {
        liveSocket.execJS(
          this.eventSource(),
          JSON.stringify([["push", { event: serverEvent, value: payload }]]),
        );
      } else {
        this.hook.pushEvent(serverEvent, payload);
      }
    } catch (error) {
      console.error(`[Xenia] Failed to send event "${serverEvent}":`, error);
    }
  }

  /**
   * The hidden element events are pushed from (see sendEvent()). Created on
   * first use inside the container, next to the adapter's element; it
   * belongs to the core, not the adapter, and survives remounts. A <span>
   * has no `value` property and no attributes, so LiveView adds nothing to
   * the payload.
   */
  eventSource() {
    if (!this.source?.isConnected) {
      this.source = document.createElement("span");
      this.source.hidden = true;
      this.hook.el.appendChild(this.source);
    }

    return this.source;
  }

  /**
   * Sends all pending debounced events immediately. Called before LiveView
   * navigation and before a remount, so the latest user input isn't lost.
   *
   * The queue is copied and cleared before sending, so an event handler
   * that triggers another flush can't send anything twice.
   */
  flushEvents() {
    if (!this.ctx.isAlive()) return;

    const pending = [...this.pendingEvents.values()];
    this.pendingEvents.clear();

    for (const event of pending) {
      clearTimeout(event.timer);
    }

    for (const event of pending) {
      if (!this.ctx.isAlive()) break;
      this.sendEvent(event.serverEvent, event.payload);
    }
  }

  /**
   * Drops all pending debounced events without sending them. Used on
   * destroy and on failed mounts.
   */
  cancelEvents() {
    for (const event of this.pendingEvents.values()) {
      clearTimeout(event.timer);
    }

    this.pendingEvents.clear();
  }

  /**
   * Schedules a remount (called via `ctx.remount()`).
   *
   * From this moment, commands are queued for the replacement instance.
   * The remount runs in a microtask, so several requests in the same tick
   * produce a single remount. If a remount is already in progress, the
   * request is kept and performRemount() runs again when it finishes.
   */
  requestRemount() {
    if (this.state === State.DESTROYED || this.remountRequested) return;

    this.remountRequested = true;

    if (!this.remounting) {
      queueMicrotask(() => void this.performRemount());
    }
  }

  /**
   * Replaces the adapter instance with a fresh one, keeping the controller.
   *
   * 1. Flushes the old instance's pending events, so its input isn't lost.
   *    Sending may synchronously destroy the controller, so the state is
   *    re-checked before going on.
   * 2. Retires the old generation: the old `ctx` stops working, and the state
   *    becomes "mounting", so updates are stored and commands are queued
   *    while the old instance is torn down.
   * 3. Destroys the old instance and replaces its child element.
   * 4. Runs mount() with a new context. mount() reads the latest props and
   *    reconciles changes.
   * 5. Clears the remounting flag, then either starts the next remount (if
   *    one was requested meanwhile) or replays queued commands on the new
   *    instance. Replay happens here, in one place, because mount() leaves
   *    it to the remount.
   *
   * Only runs from the "mounted" state; a request made during the initial
   * mount is picked up when that mount finishes. If the controller is
   * destroyed partway through, the remount stops. Errors destroy the
   * controller.
   */
  async performRemount() {
    if (this.state !== State.MOUNTED) return;
    if (!this.remountRequested || this.remounting) return;

    this.remounting = true;
    this.remountRequested = false;

    try {
      this.flushEvents();

      // Sending events may synchronously destroy the controller; never
      // move a destroyed controller back to "mounting".
      if (this.state !== State.MOUNTED) return;

      const oldInstance = this.instance;
      const oldCtx = this.ctx;

      // From here on, the old ctx reports isAlive() === false, and updates
      // and commands wait for the new instance.
      this.generation += 1;
      this.state = State.MOUNTING;
      this.instance = undefined;

      checkSyncDestroy(this.adapter.destroy?.(oldInstance, oldCtx));

      // adapter.destroy() may have destroyed the controller synchronously.
      if (this.state === State.DESTROYED) return;

      this.el.remove();
      this.el = this.createMountTarget();
      this.ctx = this.createContext();

      this.mountStarted = false;
      await this.mount();
    } catch (error) {
      console.error("[Xenia] Remount failed:", error);
      this.crash("remount", error, () => this.destroy());
    } finally {
      this.remounting = false;
    }

    // Only a successful remount continues; failures already destroyed it.
    if (this.state !== State.MOUNTED) return;

    if (this.remountRequested) {
      queueMicrotask(() => void this.performRemount());
    } else {
      this.flushCommands();
    }
  }

  /**
   * Applies one prop to the instance: through `adapter.props[key]` if a
   * handler exists, otherwise by direct assignment `instance[key] = value`.
   *
   * @param {string} key   Prop name.
   * @param {*}      value New value (`undefined` for a removed prop).
   */
  dispatch(key, value) {
    const handler = this.adapter.props?.[key];

    if (typeof handler === "function") {
      handler(this.instance, value, this.ctx);
    } else {
      this.instance[key] = value;
    }
  }

  /**
   * Dispatches every key that differs between two prop snapshots. Stops
   * early if a handler destroys the controller or requests a remount (the
   * new instance is mounted with the latest props anyway). Handler errors
   * propagate, so callers decide the failure policy.
   *
   * Reentrancy: a handler may synchronously trigger a newer update, which
   * replaces `this.props` and dispatches its own changes. That newer update
   * already sent every key whose value it changed, so this loop skips those
   * keys (sending them would overwrite newer values with stale ones). Keys
   * the newer update left as they are still get this loop's value, which
   * is also their latest value.
   *
   * @param {object} prev Props the adapter currently reflects.
   * @param {object} next Props to apply.
   */
  dispatchChanges(prev, next) {
    for (const key of changedKeys(prev, next)) {
      if (this.state !== State.MOUNTED) break;
      if (this.remountRequested) break;

      const superseded =
        this.props !== next && !jsonEqual(this.props[key], next[key]);
      if (superseded) continue;

      this.dispatch(key, next[key]);
    }
  }

  /**
   * Updates the input used by a Phoenix form: the one the server renders
   * as a direct child of the container, marked `data-xenia-field`
   * (`<input type="text" hidden>`, see Xenia.Component).
   *
   * notify: true  -> update input and trigger phx-change
   * notify: false -> update input silently
   *
   * Returns:
   * true  -> a form input exists
   * false -> no active form input exists
   */
  setFormValue(value, { notify = true } = {}) {
    if (!this.ctx?.isAlive()) return false;

    const input = this.hook.el.querySelector(
      ":scope > input[data-xenia-field][name]",
    );

    if (!input) return false;

    const next = formValueToString(value);

    if (input.value === next) return true;

    input.value = next;

    if (notify) {
      input.dispatchEvent(
        new input.ownerDocument.defaultView.Event("input", {
          bubbles: true,
        }),
      );
    }

    return true;
  }

  /**
   * Send files from a Xenia adapter to Phoenix LiveView.
   *
   * Returns true when the upload request was handed
   * to Phoenix, or false when it cannot be started.
   */
  upload(name, files) {
    if (typeof name !== "string" || name.trim() === "") {
      console.error("[Xenia] Upload name must be a non-empty string");
      return false;
    }

    const BlobType = this.hook.el.ownerDocument.defaultView?.Blob;

    if (
      !Array.isArray(files) ||
      !BlobType ||
      !files.every((file) => file instanceof BlobType)
    ) {
      console.error("[Xenia] Upload requires an array of File/Blob objects");
      return false;
    }

    if (typeof this.hook.upload !== "function") {
      console.error("[Xenia] Phoenix LiveView upload is unavailable");
      return false;
    }

    try {
      this.hook.upload(name, files);
      return true;
    } catch (error) {
      console.error("[Xenia] Upload failed:", error);
      return false;
    }
  }
}

/**
 * Turns one adapter into one Phoenix hook. createHooks() builds every one of
 * its hooks with this, so both ways of registering share one Controller:
 * props, events, commands, form fields, providers and cleanup behave the
 * same.
 *
 * The hook creates a Controller on `mounted()`, forwards `updated()` to it,
 * and destroys it on `destroyed()`. Server commands arrive on the
 * per-element event `xenia:command:<element id>` as `{ command, args }`, so
 * each push reaches only its own element, which therefore needs a stable
 * `id`.
 *
 * Use it directly for a co-located adapter: one that lives in the module of
 * the page that uses it, in LiveView's ColocatedHook, which namespaces its
 * name per module. The app still calls createHooks() once, for Xenia's
 * built-in hooks, and passes LiveView's extracted hooks to its LiveSocket.
 *
 * @example
 *   <script :type={Phoenix.LiveView.ColocatedHook} name=".Chart">
 *     import { adapterHook } from "xenia"
 *     export default adapterHook({ mount(el, props) { ... }, destroy(chart) { ... } })
 *   </script>
 *
 * @param {object} adapter `mount`, `destroy`, and optionally `props`,
 *   `events`, `commands` and `consumes`.
 * @param {string} [hookName] The registered name, for messages. Without it,
 *   messages use the name the server rendered (`data-xenia-adapter`).
 * @returns {object} A Phoenix hook.
 * @throws {TypeError} If the adapter has no `mount()` function.
 */
export function adapterHook(adapter, hookName) {
  if (typeof adapter?.mount !== "function") {
    const name = hookName === undefined ? "" : ` "${hookName}"`;
    throw new TypeError(`[Xenia] Adapter${name} must define mount()`);
  }

  registerAdapterChecker();

  return {
    mounted() {
      // For a co-located adapter, the module-qualified hook name.
      const name =
        hookName ?? this.el.getAttribute("data-xenia-adapter") ?? "adapter";

      // Its hook exists, so later checks needn't look further.
      registeredAdapters.add(name);

      // Starts the island. A retry in the <:error> slot calls it again, for
      // a fresh controller on the same element.
      const start = () => {
        if (this._xeniaDestroyed) return;

        this._xeniaController = new Controller(this, adapter, { restart: start });
        void this._xeniaController.mount();
      };

      if (!this.el.id) {
        console.error(
          `[Xenia] "${name}" element needs an id to receive commands`,
        );
      } else {
        // Subscribe only to commands targeting this element.
        this._xeniaHandler = this.handleEvent(
          `xenia:command:${this.el.id}`,
          ({ command, args } = {}) => {
            if (typeof command !== "string" || !command.trim()) {
              console.error(`[Xenia] Invalid command for "${name}":`, command);
              return;
            }

            // The controller queues the command if no instance is ready.
            this._xeniaController?.command(command, args);
          },
        );
      }

      // Start mounting without blocking the Phoenix hook.
      start();
    },

    updated() {
      this._xeniaController?.update();
    },

    destroyed() {
      // Unregister the event listener before tearing down the controller.
      if (this._xeniaHandler !== undefined) {
        this.removeHandleEvent(this._xeniaHandler);
        this._xeniaHandler = undefined;
      }

      this._xeniaDestroyed = true;
      this._xeniaController?.destroy();
      this._xeniaController = undefined;
    },
  };
}

/**
 * Builds a Phoenix `hooks` object from an adapter registry.
 *
 * Each registry entry becomes a hook of the same name (see adapterHook),
 * plus Xenia's built-in hooks: XeniaProvider, XeniaNavigation and XeniaCall. Call it
 * once even when every adapter is co-located, for those built-in hooks.
 *
 * @example
 *   const liveSocket = new LiveSocket("/live", Socket, {
 *     hooks: createHooks({ Chart: chartAdapter }),
 *   });
 *
 * @param {Record<string, object>} registry Hook name → adapter.
 * @returns {Record<string, object>} Hooks to pass to LiveSocket.
 * @throws {TypeError} If an adapter has no `mount()` function.
 */
export function createHooks(registry) {
  const hooks = {};

  for (const reserved of ["XeniaProvider", "XeniaNavigation", "XeniaCall"]) {
    if (Object.hasOwn(registry, reserved)) {
      throw new TypeError(`[Xenia] "${reserved}" is a reserved hook name`);
    }
  }

  for (const [hookName, adapter] of Object.entries(registry)) {
    hooks[hookName] = adapterHook(adapter, hookName);
    registeredAdapters.add(hookName);
  }

  // A special Phoenix hook for shared provider values.
  // This is registered automatically, not by the application.
  hooks.XeniaProvider = {
    mounted() {
      publishProvider(this.el);
    },

    updated() {
      publishProvider(this.el);
    },

    // No destroyed() here.
    // We keep the last value during LiveView navigation.
  };

  // The element ctx.call pushes from (see Controller.call()): a hidden span
  // the server renders inside each container that binds events. Its public
  // pushEvent returns the server's reply. Registered automatically.
  hooks.XeniaCall = {
    mounted() {
      callHooks.set(this.el, this);
    },

    destroyed() {
      callHooks.delete(this.el);
    },
  };

  // Tells a layout's persistent part (Xenia.Persistent) which page is shown.
  // A sticky LiveView can't define handle_params (LiveView raises), so it
  // learns the URL from here: once when it connects, then from LiveView's
  // `phx:navigate` window event, which fires on every live navigation,
  // patch and back/forward. The server side is Xenia.Persistent's
  // handle_navigation/2. Registered automatically.
  hooks.XeniaNavigation = {
    mounted() {
      this.report = (href) => this.pushEvent("xenia:navigate", { href });
      this.onNavigate = (event) =>
        this.report(event.detail?.href ?? window.location.href);

      this.report(window.location.href);
      window.addEventListener("phx:navigate", this.onNavigate);
    },

    destroyed() {
      window.removeEventListener("phx:navigate", this.onNavigate);
    },
  };

  registerAdapterChecker();

  return hooks;
}
