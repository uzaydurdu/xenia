# Integrity (a test fixture)

Not an example, and not on the home page. `/integrity` exists for the
browser tests in [`assets/e2e/integrity.test.mjs`](../../../../../assets/e2e/integrity.test.mjs).
They check what happens to islands when things go wrong:

- an island toggled by `:if`;
- an id that changes on every render (a mistake, on purpose);
- a root removed by outside JavaScript;
- an event sent with `null`, an event the page doesn't bind, and one with
  no `handle_event` clause;
- a slow mount, removed before it ends.

Every island uses one co-located adapter, `.Probe`, which records each
mount, update and destroy in `window.__integrity`.

The `(tests)` folder is a group: it groups the fixture without adding to
its URL.
