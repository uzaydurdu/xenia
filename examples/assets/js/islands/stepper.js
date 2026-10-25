// The Languages example's JavaScript widget: a quantity stepper.
//
// It owns its count in the browser. Its words come from Phoenix as the
// `labels` prop, translated with Gettext; the price is formatted here, for
// the app's `locale` (a provider, see app/layout.ex). When the language
// changes, only those props change: Xenia calls the handlers below, the
// widget isn't rebuilt, and the count stays.

export const stepper = {
  consumes: ["locale"],

  mount(el, props) {
    const doc = el.ownerDocument
    const root = doc.createElement("div")
    root.className =
      "stepper flex flex-wrap items-center gap-3 rounded-box border border-base-300 bg-base-100 p-4"

    const button = (action, text, className = "btn btn-sm") => {
      const b = doc.createElement("button")
      Object.assign(b, { type: "button", className, textContent: text })
      b.dataset.action = action
      return b
    }

    const parts = {
      decrease: button("decrease", "−"),
      count: Object.assign(doc.createElement("output"), {
        className: "min-w-8 text-center text-lg font-semibold",
      }),
      increase: button("increase", "+"),
      total: Object.assign(doc.createElement("span"), { className: "text-sm" }),
      reset: button("reset", "", "btn btn-sm btn-ghost"),
    }
    root.append(...Object.values(parts))
    el.appendChild(root)

    const instance = { root, parts, count: 1, labels: props.labels ?? {}, price: props.price ?? 0, locale: props.locale }

    root.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action
      if (action === "increase") instance.count += 1
      if (action === "decrease") instance.count = Math.max(0, instance.count - 1)
      if (action === "reset") instance.count = 1
      render(instance)
    })

    render(instance)
    return instance
  },

  destroy(instance) {
    instance.root.remove()
  },

  props: {
    labels(instance, labels) {
      instance.labels = labels ?? {}
      render(instance)
    },
    price(instance, price) {
      instance.price = price ?? 0
      render(instance)
    },
    locale(instance, locale) {
      instance.locale = locale
      render(instance)
    },
  },
}

// Text only through textContent and attributes: translations are data.
function render({ parts, count, labels, price, locale }) {
  const money = new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-US", {
    style: "currency",
    currency: "EUR",
  })

  parts.decrease.setAttribute("aria-label", labels.decrease ?? "")
  parts.increase.setAttribute("aria-label", labels.increase ?? "")
  parts.count.textContent = String(count)
  parts.total.textContent = `${labels.total ?? ""}: ${money.format(count * price)}`
  parts.reset.textContent = labels.reset ?? ""
}
