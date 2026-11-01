// Which browser console messages a test fails on.
//
// Phoenix's dev server streams its own logs into the browser console
// (`reloader.enableServerLogs()` in assets/js/app.js), marked with 📡. Those
// come from the server, not the page, and some examples log server errors
// on purpose (Notifications). With the code-split app.js, the stream starts
// in time on every page, so it has to be left out here.
export const isBrowserError = (message) =>
  message.type() === "error" && !message.text().startsWith("%c📡")
