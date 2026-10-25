// A stand-in for a big library, for the "Loading and errors" example.
//
// It takes `delay` ms to "load", like Monaco downloading over a slow
// network. With `fail_first`, its first load fails, as a dropped download
// would, and a retry works. The adapter has no loading or error code at
// all: the page's <:loading> and <:error> slots do that.

const failedOnce = new Set()

export const slow = {
  async mount(el, props) {
    await new Promise((resolve) => setTimeout(resolve, props.delay ?? 1000))

    // `key` changes on every visit to the page, so the demo fails again.
    if (props.fail_first && !failedOnce.has(props.key)) {
      failedOnce.add(props.key)
      throw new Error("the library didn't load (on purpose)")
    }

    const box = el.ownerDocument.createElement("div")
    box.className = "loaded grid h-full place-items-center rounded-box border border-base-300"
    box.textContent = `Loaded after ${props.delay} ms`
    el.appendChild(box)
    return box
  },

  destroy(box) {
    box.remove()
  },
}
