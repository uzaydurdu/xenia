/**
 * Helpers shared by Xenia's official adapters (assets/adapters/*).
 *
 * Internal: not exported from any entry point, and not part of the adapter
 * contract. esbuild copies what each adapter uses into its own bundle.
 */

/**
 * Wraps the app's `load` function so the library is loaded once, however
 * many components mount. A failed load isn't kept: the next mount tries
 * again (a lazy chunk can fail on a flaky network).
 *
 * @param {() => unknown} load the app's `() => import("library")`
 * @param {string} hint how to call it, for the error message
 * @returns {() => Promise<unknown>}
 */
export function loadOnce(load, hint) {
  if (typeof load !== "function") {
    throw new TypeError(`[Xenia] pass the library's import: ${hint}`);
  }

  let pending = null;

  return () => {
    pending ??= Promise.resolve()
      .then(load)
      .catch((error) => {
        pending = null;
        throw error;
      });

    return pending;
  };
}

/**
 * Calls `register(...plugins)` only with plugins this library hasn't seen
 * yet, so several factories, or a factory used by many components, never
 * register a plugin twice. Keyed by the library object itself.
 */
const registered = new WeakMap();

export function registerOnce(library, plugins, register) {
  const seen = registered.get(library) ?? new WeakSet();
  registered.set(library, seen);

  const fresh = (plugins ?? []).filter((plugin) => {
    if (
      plugin === null ||
      (typeof plugin !== "object" && typeof plugin !== "function")
    ) {
      throw new TypeError(
        `[Xenia] a plugin must be an object or a function, got: ${plugin}`,
      );
    }

    if (seen.has(plugin)) return false;
    seen.add(plugin);
    return true;
  });

  if (fresh.length > 0) register(...fresh);
}

/**
 * Logs an error and sends it as a JSON-safe `error` event:
 * { source, message, code }. Official adapters declare an `error` event, so
 * a page can show the problem with on_error.
 */
export function reportError(ctx, source, error) {
  console.error(`[Xenia] ${source}:`, error);

  if (!ctx?.isAlive?.()) return;

  ctx.emit("error", {
    source,
    message: error instanceof Error ? error.message : String(error),
    code: error instanceof Error ? error.name : null,
  });
}

/**
 * Wraps a command so it never throws into Xenia. The core destroys a
 * component whose command throws; for a wrong index that's too drastic.
 * Errors, sync or async, become `error` events instead.
 */
export function guarded(source, handler) {
  return (instance, args, ctx) => {
    try {
      const result = handler(instance, args ?? {}, ctx);
      Promise.resolve(result).catch((error) => reportError(ctx, source, error));
    } catch (error) {
      reportError(ctx, source, error);
    }
  };
}

/**
 * Calls `fn` at most once per `ms`: at once on the first call, then once
 * more at the end of a burst with the latest arguments. For continuous
 * streams such as hover; Xenia's debounce is trailing-only, which would
 * send nothing while the stream continues. Has `.cancel()` for destroy().
 */
export function throttle(fn, ms) {
  let last = -Infinity;
  let timer = null;
  let pending = null;

  const run = (args) => {
    last = Date.now();
    pending = null;
    fn(...args);
  };

  const throttled = (...args) => {
    const wait = ms - (Date.now() - last);

    if (wait <= 0) {
      clearTimeout(timer);
      timer = null;
      run(args);
      return;
    }

    pending = args;
    timer ??= setTimeout(() => {
      timer = null;
      if (pending) run(pending);
    }, wait);
  };

  throttled.cancel = () => {
    clearTimeout(timer);
    timer = null;
    pending = null;
  };

  return throttled;
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Recursively merges plain objects; arrays and other values replace. */
export function deepMerge(base, override) {
  if (!isPlainObject(override)) return override === undefined ? base : override;
  if (!isPlainObject(base)) return override;

  const result = { ...base };

  for (const [key, value] of Object.entries(override)) {
    result[key] = deepMerge(base[key], value);
  }

  return result;
}

// -----------------------------------------------------------------------------
// The library, passed in by the app
// -----------------------------------------------------------------------------

/** What mount() returns for a component removed while its library loaded. */
const NOT_MOUNTED = Object.freeze({ notMounted: true });

/**
 * Loads the library before `adapter.mount`, then hands it to `assign` (which
 * stores it where the adapter's code reads it). A component removed while
 * the library was loading is never drawn: mount returns a placeholder the
 * matching destroy ignores, and `assign` isn't called, so the library isn't
 * touched. Everything else on the adapter is kept as it is, so the result is
 * still a plain object to spread and extend.
 */
export function withLibrary(adapter, loadLibrary, assign) {
  const { mount, destroy } = adapter;

  return {
    ...adapter,

    async mount(el, props, ctx) {
      const library = await loadLibrary();
      if (!ctx.isAlive()) return NOT_MOUNTED;

      assign(library);
      return mount.call(this, el, props, ctx);
    },

    destroy(instance, ctx) {
      if (instance === NOT_MOUNTED) return undefined;
      return destroy.call(this, instance, ctx);
    },
  };
}

/** `module.default`, or the module itself: what `import()` or a value gives. */
export function defaultExport(module) {
  return module?.default ?? module;
}

/** Throws a clear error when `load` didn't give what the adapter needs. */
export function expectLibrary(ok, hint) {
  if (!ok)
    throw new TypeError(
      `[Xenia] load didn't give what the adapter needs: ${hint}`,
    );
}

// -----------------------------------------------------------------------------
// Forms
// -----------------------------------------------------------------------------

/**
 * Remembers values sent to a Phoenix form, so a validate reply that carries
 * the adapter's own, older value can be recognized and ignored. A match also
 * acknowledges every earlier report: replies arrive in order.
 */
export function createEchoes(limit = 100) {
  const sent = [];

  return {
    reported(value) {
      sent.push(value);
      if (sent.length > limit) sent.shift();
    },

    isEcho(value) {
      const index = sent.indexOf(value);
      if (index === -1) return false;

      sent.splice(0, index + 1);
      return true;
    },

    clear() {
      sent.length = 0;
    },
  };
}

/** Comparable key for any JSON value: strings as-is, the rest as JSON. */
function echoKey(value) {
  return typeof value === "string" ? value : JSON.stringify(value ?? null);
}

/**
 * Form-field support for one adapter instance:
 *   field.report(value)   the user changed it: notify the form, remember it
 *   field.isEcho(value)   the server sent back one of our own values
 *   field.clear()         the server forces its value (a new revision)
 *   field.sync(value)     a server value was applied: update the form quietly
 * Outside a form every call is a cheap no-op.
 */
export function createFormField(ctx) {
  const echoes = createEchoes();

  return {
    report(value) {
      if (ctx.setFormValue?.(value)) echoes.reported(echoKey(value));
    },

    isEcho(value) {
      return echoes.isEcho(echoKey(value));
    },

    clear() {
      echoes.clear();
    },

    sync(value) {
      ctx.setFormValue?.(value, { notify: false });
    },
  };
}

/**
 * Stops `input` and `change` events from the library's own DOM (a hidden
 * textarea, a contenteditable, a <select>) from reaching the surrounding
 * <form>, where LiveView would run phx-change for elements that aren't form
 * fields. Returns a function that removes the listeners.
 */
export function isolateFormEvents(el) {
  const stop = (event) => event.stopPropagation();

  el.addEventListener("input", stop);
  el.addEventListener("change", stop);

  return () => {
    el.removeEventListener("input", stop);
    el.removeEventListener("change", stop);
  };
}

// -----------------------------------------------------------------------------
// Data
// -----------------------------------------------------------------------------

/** "fill_color" → "fillColor"; other strings unchanged. */
export function camelize(key) {
  return key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}

/**
 * snake_case keys from Elixir → camelCase for JavaScript. Shallow by default;
 * with `deep: true` also inside nested objects and arrays. camelCase keys
 * pass through, so pages can use either style.
 */
export function camelizeKeys(value, { deep = false } = {}) {
  if (Array.isArray(value)) {
    return deep ? value.map((item) => camelizeKeys(item, { deep })) : value;
  }

  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      camelize(key),
      deep ? camelizeKeys(item, { deep }) : item,
    ]),
  );
}

export const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

/**
 * A list value. Multi-value form fields submit one hidden input holding a
 * JSON array, so after a validate round trip the value is the string
 * "[\"a\",\"b\"]": that string is decoded. A single value becomes a list of
 * one; nil and "" become [].
 */
export function toList(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value;

  if (typeof value === "string" && value.trimStart().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Not JSON: a single value, below.
    }
  }

  return [value];
}

/**
 * Calls `target[method](...args)` if `method` is in `allowed`. Used by
 * generic `call`/`run` commands; the allowlist keeps the server from calling
 * anything destructive. Never build `method` from user input.
 */
export function callMethod(target, method, args, allowed) {
  if (!allowed.includes(method)) {
    throw new Error(
      `"${method}" is not an allowed method. Allowed: ${allowed.join(", ")}`,
    );
  }

  if (typeof target?.[method] !== "function") {
    throw new Error(`"${method}" is not a method of this instance`);
  }

  const list = args == null ? [] : Array.isArray(args) ? args : [args];
  return target[method](...list);
}

/** Adds an adapter's small built-in stylesheet once per document. */
export function injectStyle(doc, id, css) {
  if (doc.getElementById(id)) return;

  const style = doc.createElement("style");
  style.id = id;
  style.textContent = css;
  doc.head.appendChild(style);
}
