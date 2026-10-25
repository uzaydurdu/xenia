# D3 adapter

Bar, line and pie charts, drawn by D3 from data the server sends. Open it at `/adapters/d3`.

**Try it:** click a bar, a point or a slice. Switch between bar, line and pie, and click "Highlight March".

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createD3({load: () => import("d3")})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({D3: official.d3})`. |

## How it works

- **The tag** is `<.d3_chart>`, from `Xenia.Adapters.D3` (its docs list every prop, event and command).
- **Events:** `on_select="selected"` sends the clicked mark's `x`, `y` and series.
- **Commands:** `Xenia.push_to(socket, "orders", "highlight", %{x: "Mar", series: "North"})`.
- **`kind`** is an ordinary prop: changing it redraws on the same instance. The page shows three of the built-in kinds; the module docs list all of them.
- **Your own charts:** `createD3({load, charts: {...}})` adds chart kinds of your own next to bar, line and pie.
