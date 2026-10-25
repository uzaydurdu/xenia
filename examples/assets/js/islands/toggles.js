// The Settings example's JavaScript part: a list of switches.
//
// The server owns the settings: `items` comes from Phoenix, with each
// label already translated, and every change goes back as a `change`
// event. A new language only changes the labels: the switches are updated
// in place, not rebuilt.

export const toggles = {
  mount(el, props, ctx) {
    const list = el.ownerDocument.createElement("div")
    list.className = "toggles flex flex-col gap-3"
    el.appendChild(list)

    const instance = { list, rows: new Map() }

    list.addEventListener("change", (event) => {
      const key = event.target.dataset.key
      if (key) ctx.emit("change", { key, checked: event.target.checked })
    })

    update(instance, props.items)
    return instance
  },

  destroy(instance) {
    instance.list.remove()
  },

  props: {
    items(instance, items) {
      update(instance, items)
    },
  },

  events: { change: {} },
}

// Adds rows for new keys, and updates labels and states of existing ones.
function update(instance, items = []) {
  const doc = instance.list.ownerDocument

  for (const { key, label, checked } of items) {
    let row = instance.rows.get(key)

    if (!row) {
      const wrapper = doc.createElement("label")
      wrapper.className = "flex cursor-pointer items-center gap-3"
      const input = Object.assign(doc.createElement("input"), { type: "checkbox", className: "toggle toggle-primary" })
      input.dataset.key = key
      const text = doc.createElement("span")
      wrapper.append(input, text)
      instance.list.appendChild(wrapper)
      row = { input, text }
      instance.rows.set(key, row)
    }

    row.text.textContent = label
    row.input.checked = Boolean(checked)
  }
}
