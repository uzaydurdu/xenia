# Building pages from folders

Xenia can generate your LiveView routes from a folder, the way the Next.js
App Router does. Folders become URLs, and a `layout.ex` frames every page
below it. A layout can also keep part of the page alive across navigation:
a sidebar, a player, an open editor. All of it is ordinary Phoenix
underneath: generated `live` routes, LiveViews, `on_mount` hooks.

It's opt-in. Hand-written routes and layouts keep working next to it.

In a new app, `mix xenia.install` sets this up for you: the router line
below, a root `layout.ex` and a home `page.ex` in `lib/my_app_web/app/`.

## The folder

```
lib/my_app_web/app/
  layout.ex                 root layout: frames every page
  page.ex                   /
  login/page.ex             /login
  (auth)/                   a route group: not in the URL
    layout.ex               frame + sign-in check
    persistent.ex           a shell that stays alive across the group's pages
    dashboard/page.ex       /dashboard
    runbooks/
      layout.ex             nested frame
      persistent.ex         a panel that stays alive across runbook pages
      page.ex               /runbooks
      [id]/page.ex          /runbooks/:id
  settings/
    live.ex                 one LiveView for every page below
    profile/page.ex         /settings/profile
    security/page.ex        /settings/security
```

| Folder name | Means |
|---|---|
| `runbooks` | a URL segment |
| `(auth)` | a route group: organizes pages and layouts, adds nothing to the URL, and **grants nothing** by itself |
| `[id]` | a parameter, `:id` |
| `[...path]` | a catch-all, `*path`; must be the last folder. The page gets the rest of the URL as a list, and it also matches the folder's own URL, with `[]` |
| `_components` | private: never a route, for modules that belong to nearby pages |

| File | Means |
|---|---|
| `page.ex` | makes its folder a route |
| `layout.ex` | a frame around every page in its folder and below |
| `persistent.ex` | optional: the persistent part of the `layout.ex` next to it |
| `live.ex` | optional: one LiveView owns every page in its folder and below |

Other files are ignored by routing, so a page's helpers can live next to it.
Each of these files defines exactly one module, with any name you like.

## Generating files

Three generators write files in the conventions above, with module names
that mirror the folders:

```
$ mix xenia.gen.layout .
* creating lib/my_app_web/app/layout.ex                    root frame, wraps <Layouts.app>

$ mix xenia.gen.layout "(auth)" --persistent --on-mount MyAppWeb.Auth:require_user
* creating lib/my_app_web/app/(auth)/layout.ex             MyAppWeb.App.AuthLayout
* creating lib/my_app_web/app/(auth)/persistent.ex         MyAppWeb.App.AuthPersistentLive

$ mix xenia.gen.page "(auth)/runbooks/[id]"
* creating lib/my_app_web/app/(auth)/runbooks/[id]/page.ex MyAppWeb.App.Auth.Runbooks.IdPage
```

- **Quote paths** with parentheses or brackets, so your shell leaves them
  alone.
- **A page under a `live.ex`** is generated as a module with only
  `render/1`, because the `live.ex` owns its state (see below). Elsewhere
  it's a LiveView with `use Xenia.Page`, and parameters are assigned in
  `mount/3`.
- **They check before writing.** A page whose URL another page already
  has is refused, and so are a `persistent.ex` without a `layout.ex`, an
  `--on-mount` below a `live.ex`, and an existing file (unless you pass
  `--force`).
- With an existing `layout.ex`, `--persistent` only adds `persistent.ex`.
  Place it in the frame with `{@persistent}`.

`mix help xenia.gen.page` and `mix help xenia.gen.layout` list the options:
`--module`, `--root` for another app folder, and more.

## The router

```elixir
import Xenia.Routes

scope "/" do
  pipe_through :browser

  live_session :app do
    xenia_routes "lib/my_app_web/app"
  end
end
```

This generates ordinary `live` routes, in the order Phoenix must match them
(static segments before dynamic ones). `mix phx.routes` and `~p` work as
usual, and `mix xenia.routes` shows each page with its layouts:

```
/dashboard      MyAppWeb.DashboardPage    RootLayout > AuthLayout (+ ShellLive)
/runbooks/:id   MyAppWeb.RunbookPage      RootLayout > AuthLayout (+ ShellLive) > RunbooksLayout (+ PanelLive)
```

Adding, renaming or removing a page updates the routes without a restart.
Two pages with the same URL are a compile error naming both files.

Keep the whole folder in **one `live_session`**. Persistent parts only
survive navigation within one, and leaving it is a full page load.

## Pages

A page is a LiveView. Add `use Xenia.Page` after your app's `:live_view`:

```elixir
# app/(auth)/dashboard/page.ex
defmodule MyAppWeb.DashboardPage do
  use MyAppWeb, :live_view
  use Xenia.Page

  def mount(_params, _session, socket), do: {:ok, assign(socket, :alerts, [])}

  def render(assigns) do
    ~H"<h1>Dashboard</h1>"
  end
end
```

`render/1` is only the page. Xenia draws it inside its layouts. Don't call
your app's `<Layouts.app>` here; put it in the root `layout.ex` instead.

## Layouts

```elixir
# app/(auth)/layout.ex
defmodule MyAppWeb.AuthLayout do
  use MyAppWeb, :html
  use Xenia.Layout, on_mount: {MyAppWeb.Auth, :require_user}

  def frame(assigns) do
    ~H"""
    <div class="grid grid-cols-[16rem_1fr]">
      <aside>{@persistent}</aside>
      <main>{@inner_content}</main>
    </div>
    """
  end
end
```

- **`frame/1`** gets the page's assigns, plus `@inner_content`: the page,
  already inside the layouts below this one, and `@persistent`: the
  layout's persistent part, or `nil` without a `persistent.ex`. It is
  redrawn on every navigation.
- **`on_mount:`** hooks run when any page under the layout mounts,
  outermost layout first, exactly like `live_session`'s. **This is where a
  route group gets its protection.** The `(auth)` folder name does nothing;
  its layout's `on_mount` does.

## Persistent parts

A `persistent.ex` next to a `layout.ex` is that layout's persistent part: a
LiveView that stays alive while the user moves between pages under the
layout. The module name is yours.

```elixir
# app/(auth)/persistent.ex
defmodule MyAppWeb.ShellLive do
  use MyAppWeb, :live_view
  use Xenia.Persistent

  def mount(_params, _session, socket), do: {:ok, assign(socket, path: nil)}

  def handle_navigation(uri, socket), do: {:noreply, assign(socket, path: URI.parse(uri).path)}

  def render(assigns) do
    ~H"""
    <nav>
      <.link navigate={~p"/dashboard"} class={@path == "/dashboard" && "font-bold"}>Dashboard</.link>
    </nav>
    """
  end
end
```

The layout's frame places it with `{@persistent}`. It keeps its process,
its assigns and its JavaScript components, an editor's text and undo
history included, while you navigate between pages under its layout. When a
page outside the layout is shown, it goes away; coming back starts a fresh
one.

What to know:
- **It needs a `layout.ex` in the same folder.** Without one, nothing would
  place it, so `xenia_routes` raises at compile time.
- **It can't use `handle_params/3`**, because LiveView doesn't allow it on
  a sticky LiveView. It gets `handle_navigation(uri, socket)` instead: once
  when it connects, and after every navigation and patch.
- **It's configured once.** Pages can't pass it new parameters; send it a
  message.
- **Nested layouts each get their own**, rendered side by side: the shell
  and the runbooks panel are separate persistent parts, and both stay alive
  on runbook pages. (One rendered *inside* another would be destroyed by
  LiveView, which is why Xenia renders them all from the page.)

## Pages that share one LiveView: `live.ex`

Put a `live.ex` in a folder, and every page below it shares one LiveView.
Switching between them is a `<.link patch>`: the process and its state stay,
and `handle_params/3` runs with the new URL. It suits tabs that share data.

```elixir
# app/settings/live.ex
defmodule MyAppWeb.SettingsLive do
  use MyAppWeb, :live_view
  use Xenia.Live

  def mount(_params, _session, socket), do: {:ok, assign(socket, :user, load_user())}

  def render(assigns) do
    ~H"""
    <nav>
      <.link patch={~p"/settings/profile"}>Profile</.link>
      <.link patch={~p"/settings/security"}>Security</.link>
    </nav>
    {Xenia.Live.page(assigns)}
    """
  end
end

# app/settings/profile/page.ex
defmodule MyAppWeb.ProfilePage do
  use MyAppWeb, :html
  def render(assigns), do: ~H"<h1>{@user.name}</h1>"
end
```

- The current page is the route's `@live_action`, and
  `Xenia.Live.page(assigns)` renders it with the owner's assigns. Without
  your own `render/1`, `Xenia.Live` renders just the page.
- The owner handles every event and message. A page under it only provides
  `render/1`.
- **Layouts' `on_mount` runs once, when the owner mounts.** A patch mounts
  nothing, so a `layout.ex` *below* a `live.ex` can't declare `on_mount`:
  `xenia_routes` rejects it at compile time, because the check would be
  skipped when patching to its pages. Put it at or above the `live.ex`.

## Titles, descriptions and social cards

A page and any layout above it can define `metadata/1`. It gets the page's
assigns and returns a map:

```elixir
# app/layout.ex: defaults for every page
def metadata(_assigns) do
  %{
    title: "Acme",
    title_template: "%s · Acme",
    description: "Acme makes rockets.",
    open_graph: %{site_name: "Acme", type: "website"}
  }
end

# app/posts/[slug]/page.ex
def metadata(assigns) do
  %{title: assigns.post.title, description: assigns.post.summary, open_graph: %{type: "article"}}
end
```

- **Merging.** Layouts merge from the outermost in, then the page. A key
  set lower down wins; `open_graph` and `twitter` merge key by key.
- **The title.** The page's `title` goes through the nearest
  `title_template` ("Hello · Acme"). A page without one gets its layouts'
  `title` as it is. A page that assigns `page_title` itself, and has no
  metadata title, keeps its own.
- **When.** After the page has its data: after `mount/3`, or after the
  page's own `handle_params/3` if it defines one. The result is assigned as
  `@xenia_metadata`, and the title as `@page_title`.
- **Keys:** `title`, `title_template`, `description`, `canonical` (a full
  URL), `robots` (e.g. `"noindex"`), `open_graph` and `twitter`. Any other
  key raises, so a typo shows up. `og:title` and `og:description` default
  to the title and description.

Render them in `root.html.heex`, inside `<head>`:

```heex
<.live_title default="Acme">{assigns[:page_title]}</.live_title>
<Xenia.Metadata.tags metadata={assigns[:xenia_metadata]} />
```

The root layout is rendered on the first page load: that's what search
engines and link previews read. On live navigation, LiveView updates the
`<title>`, not the other tags in `<head>`. Under a `live.ex`, give each
page its own metadata title, so the title changes when you patch between
them.

## The sitemap

```elixir
# router.ex, outside the :browser pipeline
get "/sitemap.xml", Xenia.Sitemap, []
```

It lists the folder's pages, with your endpoint's URL in front (or
`base_url:` in the options):

- a page without parameters is listed, unless its `sitemap/0` returns `[]`
- a page with parameters is listed once for each params map its
  `sitemap/0` returns; a catch-all takes a list:

  ```elixir
  def sitemap, do: for(post <- Blog.list_posts(), do: %{slug: post.slug})
  ```

- pages under a layout with `sitemap: false` are left out, for example a
  signed-in area: `use Xenia.Layout, on_mount: ..., sitemap: false`

Hand-written routes aren't listed. `Xenia.Sitemap.paths/1` gives you the
list, to build your own.

## Navigation

Xenia adds no router API. Phoenix's navigation works unchanged with the
generated routes, and `~p` checks paths against them.

| To | In a template | From the server | From JavaScript |
|---|---|---|---|
| go to another page | `<.link navigate={~p"/x"}>` | `push_navigate(socket, to: ~p"/x")` | `JS.navigate("/x")`, or `this.js().navigate("/x")` in a hook |
| switch pages under the same `live.ex` | `<.link patch={~p"/x"}>` | `push_patch(socket, to: ~p"/x")` | `JS.patch("/x")` |
| replace the history entry, so Back skips it | add `replace` | add `replace: true` | add `replace: true` (`{replace: true}` in a hook) |
| go back | | | `history.back()` |
| leave the app folder, or reload everything | `<.link href={~p"/x"}>` | `redirect(socket, to: ~p"/x")` | |

Signing in is the usual case for `replace`: Back shouldn't return to the
sign-in form.

```elixir
def handle_event("sign_in", params, socket) do
  # ...
  {:noreply, push_navigate(socket, to: ~p"/dashboard", replace: true)}
end
```

How each kind affects your pages:
- **`navigate`** mounts the target page's LiveView. Persistent parts of
  layouts that both pages share stay alive, as long as the pages are in the
  same `live_session`.
- **`patch`** keeps the current LiveView and calls its `handle_params/3`.
  Use it between pages under one `live.ex`: `navigate` would start a new
  process even for the same owner, and its state would be lost.
- **`redirect` and `href`** load a new page from the server. Every
  persistent part starts fresh.
- **Back and Forward** are live navigations too, so the same rules apply.

**From a JavaScript component**, report what happened and let the server
decide where to go:

```javascript
// in the adapter, which declares events: { select: {} }
ctx.emit("select", { id: bar.id })
```

```elixir
# the page binds it: <.chart id="incidents" on_select="bar_selected" ... />
def handle_event("bar_selected", %{"id" => id}, socket) do
  {:noreply, push_navigate(socket, to: ~p"/runbooks/#{id}")}
end
```

The server can then check permissions or pick a different page, and the
adapter doesn't need to know your routes.
