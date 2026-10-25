# Rating

Shoelace's `<sl-rating>`, a web component. Open it at `/rating`.

A web component is the easiest kind of island. Its adapter needs **no prop
functions**. When a prop changes, Xenia's default is to set it on the
instance, like `node.value = 4`. For a web component, the instance is the
element, so that is all it needs.

**Try it:** pick a rating, and the server shows it. Click "Reset to 0" or
"Use 10 stars": the server changes a prop, and the element follows.

## The files

| File | What it does |
|---|---|
| [`page.ex`](page.ex) | The page: the value, and the buttons. |
| [`assets/js/islands/rating.js`](../../../../assets/js/islands/rating.js) | The adapter: 14 lines of code, with no `props` section. |
| [`components/islands.ex`](../../components/islands.ex) | Declares `<.rating>`. |
| [`assets/css/app.css`](../../../../assets/css/app.css) | Loads Shoelace's theme, so the stars look right. |

## How it works

`mount` creates the element and sets all props on it at once:

```js
const node = Object.assign(document.createElement("sl-rating"), props)
```

Then it listens for `sl-change`, which Shoelace sends only when the user
picks a rating, and reports it with `ctx.emit("change", ...)`.
