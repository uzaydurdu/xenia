# Half-star rating

Shoelace's rating web component, through Xenia's official adapter. Open it at `/adapters/shoelace-rating`.

**Try it:** rate in half stars, and click "Reset to 0". The second rating is read-only.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: its data, its buttons, and its `handle_event`s. |
| [`assets/js/islands/official.js`](../../../../../assets/js/islands/official.js) | `createShoelaceRating({load: () => import("@shoelace-style/shoelace/...rating.js")})`: Xenia's adapter, with the library passed in. |
| [`assets/js/app.js`](../../../../../assets/js/app.js) | Registers it: `createHooks({ShoelaceRating: official.shoelaceRating})`. |

## How it works

- **The tag** is `<.shoelace_rating>`, from `Xenia.Adapters.ShoelaceRating` (its docs list every prop, event and command).
- **Events:** `on_change="rated"` sends the new value.
- **`precision={0.5}`** gives half stars; `readonly` shows a value nobody can change.
- **The server resets it** by changing the `value` assign.
- **Compare** the [Rating](../../rating) basic example, which uses the same web component with no prop code at all.
