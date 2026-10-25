/**
 * Keyboard shortcuts for one component: matching a keydown against the
 * component's `data-xenia-shortcuts`, `{ "mod+s": "save", ... }`.
 *
 * The server writes every combination in one form (Xenia.Shortcuts):
 * modifiers in the order mod, ctrl, meta, alt, shift, then the key, all
 * lowercase. `mod` is Cmd on a Mac and Ctrl elsewhere; `ctrl` and `meta`
 * are those keys exactly.
 *
 * A key press is described twice and either description may match:
 * - by `event.key`, the character the layout produces ("s", "/"), so
 *   shortcuts follow the user's keyboard layout;
 * - by `event.code`, the physical key, so a combination still matches when
 *   a modifier changes the character: Shift+. gives ">", and on a Mac
 *   Option+S gives "ß". `mod+shift+.` and `alt+s` match by code.
 */

const MODIFIER_ORDER = ["ctrl", "meta", "alt", "shift"];

// event.key values with a name in shortcuts.
const KEY_NAMES = {
  " ": "space",
  "+": "plus",
  Esc: "escape",
  Spacebar: "space",
  Up: "arrowup",
  Down: "arrowdown",
  Left: "arrowleft",
  Right: "arrowright",
  Del: "delete",
};

// event.code → key, for the keys whose character a modifier can change.
const CODE_KEYS = {
  Equal: "=",
  Minus: "-",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
  Space: "space",
};

const MODIFIER_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "AltGraph",
  "OS",
]);

/** True on macOS (and iPadOS with a keyboard), where `mod` is Cmd. */
export function isMac(nav = globalThis.navigator) {
  const platform = nav?.userAgentData?.platform ?? nav?.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** The key part of a press, by its character. */
function keyName(event) {
  const key = event.key;
  if (!key) return null;
  return KEY_NAMES[key] ?? key.toLowerCase();
}

/** The key part of a press, by its physical key. */
function codeName(event) {
  const code = event.code ?? "";
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return CODE_KEYS[code] ?? null;
}

/** The pressed modifiers, in canonical order. */
function modifiers(event) {
  return MODIFIER_ORDER.filter((name) => event[`${name}Key`]);
}

/**
 * "mod+shift+s" as this platform presses it: "meta+shift+s" on a Mac,
 * "ctrl+shift+s" elsewhere. Modifiers are re-sorted after the swap.
 */
export function expand(combo, mac) {
  const parts = combo.split("+");
  const key = parts.pop();
  const mods = new Set(
    parts.map((part) => (part === "mod" ? (mac ? "meta" : "ctrl") : part)),
  );
  return [...MODIFIER_ORDER.filter((name) => mods.has(name)), key].join("+");
}

/**
 * The shortcut a keydown matches, or null.
 *
 * @param {KeyboardEvent} event
 * @param {Record<string, string>} shortcuts combination → LiveView event
 * @param {boolean} mac
 * @returns {{ combo: string, event: string } | null}
 */
export function matchShortcut(event, shortcuts, mac) {
  // Typing with an input method, a held-down key, or a modifier alone.
  if (event.isComposing || event.keyCode === 229) return null;
  if (event.repeat) return null;
  if (MODIFIER_KEYS.has(event.key)) return null;

  const mods = modifiers(event);
  const expanded = Object.entries(shortcuts).map(([combo, serverEvent]) => ({
    pressed: expand(combo, mac),
    match: { combo, event: serverEvent },
  }));

  // The character first, then the physical key: on a non-QWERTY layout
  // the two can name different keys, and the character is what the user
  // sees on the keycap.
  for (const key of [keyName(event), codeName(event)]) {
    if (!key) continue;
    const pressed = [...mods, key].join("+");
    const found = expanded.find((shortcut) => shortcut.pressed === pressed);
    if (found) return found.match;
  }

  return null;
}

/**
 * Reads a container's shortcuts. A missing or invalid attribute means none
 * (the server always writes valid JSON; only a hand-made container can't).
 */
export function readShortcuts(el) {
  const json = el.getAttribute("data-xenia-shortcuts");
  if (!json) return null;

  try {
    const shortcuts = JSON.parse(json);
    return shortcuts && typeof shortcuts === "object" ? shortcuts : null;
  } catch (error) {
    console.error("[Xenia] Invalid data-xenia-shortcuts:", error);
    return null;
  }
}
