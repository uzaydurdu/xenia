# Icons

Ready-made icons as Tailwind classes: Lucide and Material Design Icons
from [Iconify](https://icon-sets.iconify.design), and Phoenix's own
Heroicons. Open it at `/icons`.

**Try it:** switch the theme; the icons follow it. Click Save or Delete.

## Use them

```heex
<.icon name="lucide-save" class="size-5" />
<.icon name="mdi-check-circle" class="size-5 text-success" label="Saved" />
<.icon name="hero-x-mark" />
```

- **The name is the CSS class:** `lucide-<name>`, `mdi-<name>`,
  `hero-<name>`. Find names at icon-sets.iconify.design and heroicons.com.
- **Size and color** with classes, like text: `size-4`, `text-error`.
- **Write names in full.** Tailwind builds only the icons it finds in your
  templates, so `name={"lucide-" <> @kind}` wouldn't be in the CSS.
- **Accessibility:** an icon is hidden from screen readers by default,
  because the text next to it says what it means. A button with only an
  icon gets `aria-label`. An icon that means something alone gets `label`.

## Set it up in your app

1. Install the icon sets you want, in `assets/`:

   ```bash
   npm install --save-exact @iconify-json/lucide @iconify-json/mdi --prefix assets
   ```

2. Copy [`assets/vendor/iconify.js`](../../../../assets/vendor/iconify.js)
   into your `assets/vendor/`. It works like Phoenix's `heroicons.js`.
3. In `assets/css/app.css`, next to the heroicons plugin:

   ```css
   @plugin "../vendor/iconify" {
     sets: lucide, mdi;
   }
   ```

4. Let `<.icon>` in your `core_components.ex` take any icon class. See this
   app's [`core_components.ex`](../../components/core_components.ex)
   (`icon/1`): one clause, with `label` for accessibility.

Why not the official `@iconify/tailwind4` plugin? It's an ES module, and
the standalone Tailwind binary Phoenix uses can't load it.

The icons keep their licenses: Lucide is ISC, Material Design Icons is
Apache 2.0, Heroicons is MIT.
