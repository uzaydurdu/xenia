// For the nightly CI job: move every library the examples use to its newest
// release within the major version package.json pins (4.5.1 may become the
// newest 4.x; 0.4.12 the newest 0.4.x). Those are the majors Xenia's own
// package.json allows, so a release that breaks an official adapter shows up
// within a day. Xenia itself and Playwright stay as they are.
//
// It loosens this checkout's package.json to ^ ranges and lets `npm update`
// resolve the whole tree. Installing each library alone isn't enough: some
// ship parts that require each other's exact version (Tiptap's extensions
// require exactly their @tiptap/core), so they have to move together.
// Run in CI only: the edited package.json and lockfile are never committed.
//
//   node scripts/newest-libraries.mjs

import { readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const dir = fileURLToPath(new URL("..", import.meta.url))
const path = fileURLToPath(new URL("../package.json", import.meta.url))
const pkg = JSON.parse(readFileSync(path, "utf8"))
const keep = new Set(["xenia", "playwright"])

for (const section of ["dependencies", "devDependencies"]) {
  for (const [name, version] of Object.entries(pkg[section] ?? {})) {
    if (!keep.has(name) && /^\d/.test(version)) pkg[section][name] = `^${version}`
  }
}

writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n")
execFileSync("npm", ["update"], { cwd: dir, stdio: "inherit" })
