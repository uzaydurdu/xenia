# File-based routing

How folders become URLs. Open it at `/routing`.

In a Xenia app you don't write a route for each page. You put a `page.ex`
in a folder, and the folder's path is the page's URL. This example uses
every kind of folder there is.

**Try it:** click the links at the top of each page. Every page shows its
route, the file that answers it, and the params it got. Then change the end
of a post's URL in the address bar.

## The files

```
routing/
  layout.ex                    the links at the top of every page below
  page.ex                      /routing
  posts/[slug]/page.ex         /routing/posts/:slug     a parameter
  docs/[...path]/page.ex       /routing/docs/*path      a catch-all
  (company)/layout.ex          a frame for Team and Contact only
  (company)/team/page.ex       /routing/team            "(company)" isn't in the URL
  (company)/contact/page.ex    /routing/contact
  _parts/route_info.ex         never a route: code the pages share
```

| File | What it shows |
|---|---|
| [`page.ex`](page.ex) | A page. Its folder, `routing`, is its URL. |
| [`posts/[slug]/page.ex`](posts/%5Bslug%5D/page.ex) | **A parameter.** `[slug]` matches one part of the URL. `mount/3` gets it as `params["slug"]`. |
| [`docs/[...path]/page.ex`](docs/%5B...path%5D/page.ex) | **A catch-all.** `[...path]` matches the rest of the URL, at any depth, as a list: `/routing/docs/guides/install` gives `["guides", "install"]`. It also matches `/routing/docs`, with `[]`. |
| [`layout.ex`](layout.ex) | **A layout.** It frames every page in its folder and below, inside the app's own layout. |
| [`(company)/layout.ex`](%28company%29/layout.ex) | **A group.** A folder in parentheses stays out of the URL. Its layout frames only the pages inside it. |
| [`_parts/route_info.ex`](_parts/route_info.ex) | **A private folder.** A folder starting with `_` is never a route. Put shared code there. |

## How it works

1. **The router has one line** for the whole app folder:

   ```elixir
   live_session :app do
     xenia_routes "lib/xenia_examples_web/app"
   end
   ```

2. **Each `page.ex` is a LiveView** with `use Xenia.Page`. It has `mount`,
   `handle_event` and `render`, like any LiveView. Xenia draws it inside the
   `layout.ex` files above it, outermost first.
3. **The routes are plain Phoenix routes.** Link to them with
   `<.link navigate={~p"/routing/posts/hello-xenia"}>`; `~p` checks the path
   at compile time. Add, rename or delete a folder, and the routes follow,
   without restarting the server.
4. **See them all** with `mix xenia.routes`. For this example it prints
   (module names shortened here):

   ```
   /routing               RoutingPage                 RootLayout (+ Sidebar) > RoutingLayout
   /routing/contact       Routing.Company.ContactPage RootLayout (+ Sidebar) > RoutingLayout > CompanyLayout
   /routing/docs/*path    Routing.Docs.PathPage       RootLayout (+ Sidebar) > RoutingLayout
   /routing/posts/:slug   Routing.Posts.SlugPage      RootLayout (+ Sidebar) > RoutingLayout
   /routing/team          Routing.Company.TeamPage    RootLayout (+ Sidebar) > RoutingLayout > CompanyLayout
   ```

   `(+ Sidebar)` is the root layout's `persistent.ex`, the sidebar that
   stays alive while you move between pages.

## Titles and the sitemap

- **Each page's `<title>`** comes from its `metadata/1`, and
  `layout.ex`'s `title_template` adds " · File-based routing". A post's
  title and description come from the post itself, and a missing post
  says `robots: "noindex"`. View the page source to see the tags.
- **`/sitemap.xml`** lists the pages. The posts and docs pages say which
  of their URLs to list with `sitemap/0`. `(company)/layout.ex` says
  `sitemap: false`, so Team and Contact aren't listed, as you would do for
  pages behind a sign-in.

## Make your own

The generators write these files for you, with the right module names.
This example started as:

```bash
mix xenia.gen.layout routing
mix xenia.gen.page routing
mix xenia.gen.page "routing/posts/[slug]"
mix xenia.gen.page "routing/docs/[...path]"
mix xenia.gen.layout "routing/(company)"
mix xenia.gen.page "routing/(company)/team"
mix xenia.gen.page "routing/(company)/contact"
```

Two more files have special names: `persistent.ex` (a part of a layout
that stays alive, like this app's sidebar) and `live.ex` (one LiveView for
several pages, see the [Tabs](../tabs) example). The guide
[Building pages from folders](https://hexdocs.pm/xenia/app-folder.html)
covers them all, including sign-in checks with a layout's `on_mount:`.
