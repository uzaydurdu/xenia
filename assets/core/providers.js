import { jsonEqual } from "./props.js";

/**
 * Shared provider values for Xenia.
 *
 * Example:
 * theme -> "dark"
 *
 * Each provider also remembers which components
 * want to hear about its changes.
 */
const store = new Map();

/**
 * Find an existing provider entry.
 * If it doesn't exist yet, create an empty one.
 */
function entry(name) {
  if (typeof name !== "string" || name.trim() === "") {
    throw new TypeError("[Xenia] Provider name must be a non-empty string");
  }

  let provider = store.get(name);

  if (!provider) {
    provider = {
      has: false,
      value: undefined,
      version: 0,
      listeners: new Set(),
    };

    store.set(name, provider);
  }

  return provider;
}

/**
 * Remove an unused provider entry that was never published.
 *
 * Published values remain available even after every listener
 * unsubscribes, so components mounting during navigation
 * can read the last known value.
 */
function prune(name, provider) {
  if (
    !provider.has &&
    provider.listeners.size === 0 &&
    store.get(name) === provider
  ) {
    store.delete(name);
  }
}

/**
 * Save a shared value and tell interested components
 * when that value actually changes.
 */
export function setProvider(name, value) {
  const provider = entry(name);

  // Same value? Nothing needs updating.
  if (provider.has && jsonEqual(provider.value, value)) {
    return;
  }

  provider.has = true;
  provider.value = value;

  const version = ++provider.version;

  // Tell each interested component about the change.
  // The copy lets listeners subscribe or unsubscribe safely during the loop.
  for (const listener of [...provider.listeners]) {
    if (provider.version !== version) {
      return;
    }

    // (e.g. destroyed by an earlier listener).
    if (!provider.listeners.has(listener)) {
      continue;
    }

    try {
      listener(value);
    } catch (error) {
      console.error("[Xenia] Provider listener failed:", error);
    }
  }
}

/**
 * Read the current provider value.
 *
 * Returns { value } once a value was published, null before that.
 * The wrapper tells "published null" apart from "nothing published".
 */
export function readProvider(name) {
  const provider = store.get(name);

  if (!provider || !provider.has) {
    return null;
  }

  return { value: provider.value };
}

/**
 * Register interest in a provider.
 *
 * Returns a function for stopping notifications.
 * Calling it more than once is harmless.
 */
export function subscribe(name, listener) {
  // fail here, not later inside setProvider's loop
  if (typeof listener !== "function") {
    throw new TypeError("[Xenia] Provider listener must be a function");
  }

  const provider = entry(name);

  provider.listeners.add(listener);

  // Calling this function stops notifications.
  return () => {
    provider.listeners.delete(listener);
    prune(name, provider);
  };
}

/**
 * Clear all providers.
 *
 * Used by unit tests only.
 */
export function resetProviders() {
  store.clear();
}

/**
 * How many listeners a provider has: tests use it to check that destroyed
 * components unsubscribe.
 *
 * Used by unit tests only.
 */
export function listenerCount(name) {
  return store.get(name)?.listeners.size ?? 0;
}
