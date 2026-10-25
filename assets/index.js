// `import ... from "xenia"`: the core only. Tier 2 adapters have their own
// entry points (Monaco: assets/monaco.js, `"xenia/monaco"`), so an app that
// doesn't use them never has to resolve their libraries.
export * from "./core/index.js";
