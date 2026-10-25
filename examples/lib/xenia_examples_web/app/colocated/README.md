# Island in a page

An island whose adapter lives inside the page that uses it. Open it at
`/colocated`.

Most adapters live in `assets/js/` and are registered in `app.js`. That's
right for an island that many pages use. An island that **only one page**
uses can live in that page instead. Then the page and its JavaScript are in
one file, and `app.js` doesn't change.

**Try it:** click "Add a point". The server adds a point, and the sparkline
updates.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page, **and** its adapter, in a `<script>` tag at the bottom. |

That's the only file.

## How it works

1. The adapter is in a LiveView colocated hook, inside the page's template:

   ```heex
   <script :type={Phoenix.LiveView.ColocatedHook} name=".Sparkline">
     import { adapterHook } from "xenia"
     export default adapterHook({ mount(el, props) { ... }, destroy(chart) { ... } })
   </script>
   ```

   `adapterHook` turns one adapter into one hook. The adapter is the same
   kind as in `assets/js/islands`.

2. LiveView takes the script out when it compiles, and names it after the
   module: `XeniaExamplesWeb.App.ColocatedPage.Sparkline`. Another page can
   have its own `.Sparkline` without a clash.

3. `colocated(".Sparkline")` gives `<.xenia>` that same full name:

   ```heex
   <.xenia id="sparkline" adapter={colocated(".Sparkline")} props={%{points: @points}} />
   ```

4. `app.js` already passes LiveView's colocated hooks to the LiveSocket
   (`...colocatedHooks`), like every new Phoenix app does. That's why
   nothing changes there.
