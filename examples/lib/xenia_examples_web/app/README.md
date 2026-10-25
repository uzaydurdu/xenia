# The app folder

This folder **is** the website. Each `page.ex` is a page, and its folder is
its URL. There are no routes written by hand: the router has one line,

```elixir
xenia_routes "lib/xenia_examples_web/app"
```

and Xenia makes a normal Phoenix route for each page. Run
`mix xenia.routes` to see them.

```
app/
  layout.ex        the frame around every page: header, sidebar, content
  persistent.ex    the sidebar, a LiveView that stays alive across pages
  page.ex          /
  _shared/         a folder starting with _ is never a page
  chart/           /chart
  date-picker/     /date-picker
  rating/          /rating
  theme/           /theme
  loading/         /loading
  colocated/       /colocated
  tabs/            /tabs/first and /tabs/second, sharing one LiveView (live.ex)
  routing/         /routing and below: every kind of folder, explained
  icons/           /icons
  notifications/   /notifications
  languages/       /languages
  settings/        /settings: icons, messages and languages together
  adapters/        one page per official adapter:
    chartjs/       /adapters/chartjs
    monaco/        /adapters/monaco
    tiptap/        /adapters/tiptap
    tabulator/     /adapters/tabulator
    ...            d3, monaco-diff, flatpickr, tom-select, shoelace-rating,
                   sortable, calendar, map, terminal, uppy, wavesurfer, multitrack
  forms/           /forms, official adapters as fields of one form
```

`adapters/` has no `page.ex` of its own, so `/adapters` isn't a page. A
folder only needs a `page.ex` to become one.

## The special files

| File | What it is |
|---|---|
| `page.ex` | A page. Its folder is its URL. |
| `layout.ex` | A frame around every page in its folder and below. |
| `persistent.ex` | A LiveView next to a `layout.ex` that stays alive while you move between that layout's pages. |
| `live.ex` | One LiveView for all pages below it. |

Other files, like the `README.md` in each folder, are ignored.

## The sidebar stays alive

`persistent.ex` is the sidebar. Open a few pages, and watch "Pages opened"
count up. It never starts from zero, because the sidebar's LiveView keeps
running while the pages change. It learns about each page change in
`handle_navigation/2`.

Learn more in the guide
[Building pages from folders](https://hexdocs.pm/xenia/app-folder.html).
