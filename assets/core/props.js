export function decodeProps(el, prev = {}) {
  const raw = el.getAttribute("data-xenia-props");

  if (raw === null) return {};

  try {
    const value = JSON.parse(raw);

    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("Expected a JSON object");
    }

    return value;
  } catch (error) {
    console.warn("[Xenia] Invalid props:", error);
    return prev;
  }
}

export function jsonEqual(a, b) {
  if (a === b) return true;

  const kind = kindOf(a);
  if (kind !== kindOf(b)) return false;

  switch (kind) {
    case "array":
      if (a.length !== b.length) return false;

      for (let i = 0; i < a.length; i++) {
        if (!jsonEqual(a[i], b[i])) return false;
      }
      return true;

    case "object": {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);

      if (aKeys.length !== bKeys.length) return false;

      return aKeys.every(
        (key) => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]),
      );
    }

    default:
      return false;
  }
};

function kindOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

export function changedKeys(prev, next) {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);

  return [...keys].filter(
    (key) =>
      Object.hasOwn(prev, key) !== Object.hasOwn(next, key) ||
      !jsonEqual(prev[key], next[key]),
  );
};
