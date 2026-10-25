# Theme

Islands that follow the app's light and dark mode. Open it at `/theme`.

Without Xenia, every JavaScript component needs its own code to notice a
theme change. With Xenia, the app publishes the theme **once**, and every
island that asks for it gets it.

**Try it:** switch the theme with the buttons at the top right. The first
chart changes its colors. The second stays light.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | Two charts: one follows the theme, one stays light. |
| [`assets/js/app.js`](../../../../assets/js/app.js) | Publishes the theme with `setProvider("theme", ...)`. |
| [`assets/js/islands/chart.js`](../../../../assets/js/islands/chart.js) | Asks for it with `consumes: ["theme"]`. |

## How it works

1. `app.js` reads Phoenix's theme from `<html data-theme>`, and publishes
   it again whenever it changes:

   ```js
   setProvider("theme", document.documentElement.dataset.theme)
   ```

2. The chart adapter asks for it:

   ```js
   consumes: ["theme"],
   ```

3. The theme now arrives like any other prop: in `mount`, and in
   `props.theme` when it changes. The adapter decides what "dark" means for
   Chart.js.
4. A `theme` attribute on the tag wins over the app's theme. That's why the
   second chart stays light:

   ```heex
   <.chart id="pinned" data={@data} theme="light" />
   ```
