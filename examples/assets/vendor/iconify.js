// Iconify icons as Tailwind classes, the same way Phoenix's heroicons.js
// works: `lucide-save` or `mdi-check-circle` becomes a CSS mask with the
// icon's SVG, colored with `currentColor`. Size it with size-*, color it
// with text-*. Tailwind only writes the classes your templates use, so the
// CSS holds just those icons, and nothing is fetched at runtime.
//
// Each icon set is an npm package of JSON from Iconify, installed in
// assets/: npm install --save-exact @iconify-json/lucide @iconify-json/mdi
// List the ones you use in app.css:
//
//   @plugin "../vendor/iconify" { sets: lucide, mdi; }
//
// Not the official @iconify/tailwind4 plugin: it is an ES module, which the
// standalone Tailwind binary Phoenix uses can't load.
//
// MIT. The icons keep their own licenses: Lucide (ISC), Material Design
// Icons (Apache 2.0).
const plugin = require("tailwindcss/plugin")
const fs = require("fs")

module.exports = plugin.withOptions(({sets = ["lucide"]} = {}) => {
  return function({matchComponents, theme}) {
    for (const set of [].concat(sets)) {
      const file = require.resolve(`@iconify-json/${set}/icons.json`)
      const data = JSON.parse(fs.readFileSync(file, "utf8"))

      // Every icon, plus aliases that are only another name for one.
      const values = {}
      for (const name of Object.keys(data.icons)) values[name] = name
      for (const [alias, {parent, ...transform}] of Object.entries(data.aliases ?? {})) {
        if (data.icons[parent] && Object.keys(transform).length === 0) values[alias] = parent
      }

      matchComponents({
        [set]: (name) => {
          const icon = data.icons[name]
          const width = icon.width ?? data.width ?? 16
          const height = icon.height ?? data.height ?? 16
          const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.left ?? 0} ${icon.top ?? 0} ${width} ${height}">` +
            `${icon.body}</svg>`
          const variable = `--${set}-${name}`

          return {
            [variable]: `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}')`,
            "-webkit-mask": `var(${variable})`,
            "mask": `var(${variable})`,
            "mask-repeat": "no-repeat",
            "mask-size": "100% 100%",
            "background-color": "currentColor",
            "vertical-align": "middle",
            "display": "inline-block",
            "width": theme("spacing.6"),
            "height": theme("spacing.6"),
          }
        },
      }, {values})
    }
  }
})
