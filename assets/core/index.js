export { createHooks, adapterHook } from "./controller.js";

// Providers (CLAUDE.md §5), for app code. An app publishes a value it owns,
// e.g. the theme from its own toggle, with setProvider("theme", "dark"); every
// adapter that consumes "theme" receives it as a prop. Code outside Xenia's
// adapters can read the same value with readProvider or subscribeProvider.
export {
  setProvider,
  readProvider,
  subscribe as subscribeProvider,
} from "./providers.js";
