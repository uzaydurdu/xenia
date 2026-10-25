// The date picker island: flatpickr as a form field.
// Used by the date picker example (lib/xenia_examples_web/app/date-picker).
// It is the same adapter as in the guide "Wrapping any JavaScript library".

import flatpickr from "flatpickr"
import "flatpickr/dist/flatpickr.min.css"

export const datePicker = {
  mount(el, props, ctx) {
    const input = el.appendChild(document.createElement("input"))

    return flatpickr(input, {
      defaultDate: props.value || null,
      minDate: props.min,
      static: true, // keep the calendar inside el
      // flatpickr calls onChange for the user's picks only, not for setDate(_, false)
      onChange: (_dates, value) => {
        ctx.emit("change", { value })
        // Write the value into the form, and run the form's phx-change.
        ctx.setFormValue(value)
      },
    })
  },

  destroy(picker) {
    picker.destroy()
  },

  props: {
    // The server changed the value: show it, and update the form quietly.
    value(picker, value, ctx) {
      picker.setDate(value || null, false)
      ctx.setFormValue(picker.input.value, { notify: false })
    },

    min(picker, min) {
      picker.set("minDate", min)
    },
  },

  events: {
    change: {},
  },

  commands: {
    open(picker) {
      picker.open()
    },

    clear(picker, _args, ctx) {
      picker.clear(false) // false: no onChange, the server asked for this
      ctx.setFormValue("", { notify: false })
    },
  },
}
