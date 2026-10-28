# Contributing to Xenia

Thanks for helping. One person maintains Xenia, so small, focused pull
requests with tests are the easiest to review. For anything bigger, open
an issue first to talk it through.

## Set up

You need Elixir 1.15 or later, and Node.js for the JavaScript tests (CI
uses Node 24).

```bash
git clone https://github.com/uzaydurdu/xenia && cd xenia
mix setup   # dependencies, esbuild, the bundles, and the npm packages
mix check   # what CI runs
```

`mix check` checks:
- formatting, and compiling with warnings as errors;
- the bundles;
- the Elixir and JavaScript tests;
- the Hex package and the docs.

## Browser tests

The unit tests use fake libraries. The examples app's browser tests
(Playwright, Chromium) use the real ones, through LiveView navigation,
forms and the network.

```bash
cd examples && mix setup
cd assets && npx playwright install chromium   # once
cd .. && PORT=4002 mix phx.server

# in another terminal
cd examples/assets && E2E_URL=http://localhost:4002 npm run e2e
```

CI runs them on every push. Every night it also runs them against the
newest releases of LiveView, Phoenix and each adapter's library.

## The rules that keep Xenia small

- **The ownership boundary.** Xenia's core owns:
  - mounting;
  - comparing props;
  - liveness;
  - sending events and routing commands;
  - the order of destruction.

  An adapter owns its library. A change that teaches the core about one
  library is the wrong change. See
  [What Xenia owns, what your adapter owns](guides/ownership-boundary.md).
- **The library test.** Every feature must work for a library Xenia has
  never heard of, through an adapter written in an app. A feature that only
  works for the official adapters is the wrong feature.
- **No new lifecycle concept** beyond mount, destroy, prop handlers and
  remount, unless the pull request explains which libraries need it and
  why the existing ones can't do it.
- **Commit the rebuilt bundles.** `priv/static` is committed:
  `mix assets.build` rebuilds it, and CI checks that it matches the
  sources.
- **Official adapters** need:
  - tests with a fake library (no library installed);
  - a page and a browser test in `examples/`;
  - docs in their tag module.

  A library's new major version joins its range in `package.json` only
  after its browser test passes on it.
- **Never hardcode `phx-`.** Use the configured binding prefix.

## Pull requests

- Include tests for what you changed, and make sure `mix check` passes.
- For a change users will notice:
  - add a line to `CHANGELOG.md`, under the unreleased version;
  - update the docs: the README, a guide, or the module docs.
- By contributing, you agree that your contribution is licensed under the
  MIT license (see `LICENSE`).

## Security

Please don't open a public issue for a security problem. See
[SECURITY.md](SECURITY.md).
