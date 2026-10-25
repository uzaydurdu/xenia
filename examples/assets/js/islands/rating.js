// The rating island: Shoelace's <sl-rating>, a web component.
// Used by the rating example (lib/xenia_examples_web/app/rating).
//
// A web component needs no prop functions at all. Xenia's default is to
// set each prop on the instance (node.value = 4), and for a web component
// that is exactly right.

import "@shoelace-style/shoelace/dist/components/rating/rating.js"

export const rating = {
  mount(el, props, ctx) {
    const node = Object.assign(document.createElement("sl-rating"), props)

    // Shoelace sends sl-change only when the user picks a rating.
    node.addEventListener("sl-change", () => ctx.emit("change", { value: node.value }))

    return el.appendChild(node)
  },

  destroy(node) {
    node.remove()
  },

  events: {
    change: {},
  },
}
