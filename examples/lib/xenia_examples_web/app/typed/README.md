# A typed island

A Chart.js doughnut whose adapter is written in TypeScript. Open it at
`/typed`.

**Try it:** press "Spend 10", click a part of the chart, and press
"Highlight what's left". Props, an event and a command, all typed.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: the props it sends, the event it handles, the command it sends. |
| [`assets/js/islands/budget.ts`](../../../../assets/js/islands/budget.ts) | The adapter, in TypeScript. |
| [`assets/tsconfig.json`](../../../../assets/tsconfig.json) | The type check's settings. |

## How it works

The adapter names three things, and Xenia's `Adapter` type checks the
adapter against them:

```ts
import Chart from "chart.js/auto"
import type { Adapter } from "xenia"

type Props = { spent: number; left: number; theme?: "light" | "dark" }
type Events = { segment_click: { segment: "spent" | "left"; amount: number } }
type Commands = { highlight: { segment: "spent" | "left" } }

export const budget: Adapter<Chart<"doughnut">, Props, Events, Commands> = { ... }
```

| What | How |
|---|---|
| **Phoenix builds it as it is.** | esbuild compiles `.ts` files without any setup: `import {budget} from "./islands/budget"` in `app.js` finds `budget.ts`. |
| **The editor knows everything.** | `props.spent` is a number, `ctx.emit` offers only `"segment_click"`, and the chart is Chart.js's own `Chart` type, from Chart.js's package. Xenia never describes Chart.js. |
| **Mistakes are found before the page runs.** | `npm run typecheck`, in `assets/`. |

A misspelled event, and a payload the page doesn't expect, as
`npm run typecheck` reports them:

```
js/islands/budget.ts(55,20): error TS2345: Argument of type '"segment_clik"' is not assignable to parameter of type '"segment_click"'.
js/islands/budget.ts(56,13): error TS2322: Type '"both"' is not assignable to type 'Segment'.
```

## The same in plain JavaScript

No TypeScript file needed: a comment gives a `.js` adapter the same checks,
and `// @ts-check` turns them on.

```js
// @ts-check
import Chart from "chart.js/auto"

/** @type {import("xenia").Adapter<Chart<"doughnut">, {spent: number, left: number}, {segment_click: {segment: string, amount: number}}>} */
export const budget = { ... }
```

## In your own app

`mix xenia.install` already tells TypeScript where Xenia's types are (step
3). The rest:

1. `npm install --save-dev typescript` in `assets/`, and
   `"typecheck": "tsc -p ."` in its `package.json` scripts.
2. In `assets/tsconfig.json` (Phoenix generates one), remove `baseUrl`:
   TypeScript 7 refuses it. Add `"moduleResolution": "bundler"` and
   `"module": "esnext"`.
3. With Xenia from Hex, `paths` needs two lines next to Phoenix's
   `"*": ["../deps/*"]`. `mix xenia.install` adds them; by hand:

   ```json
   "xenia": ["../deps/xenia/priv/types/xenia.d.ts"],
   "xenia/*": ["../deps/xenia/priv/types/*.d.ts"]
   ```

   This app doesn't need them: its `package.json` links Xenia into
   `node_modules`.

The browser test ([`assets/e2e/typed.test.mjs`](../../../../assets/e2e/typed.test.mjs))
checks that the TypeScript island runs: the props update the chart, a click
reaches the page, and the command highlights a part.
