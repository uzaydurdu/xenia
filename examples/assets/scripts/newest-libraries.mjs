// For the nightly CI job: install the newest release of every library the
// examples use, within the major version package.json pins (^4.5.1 means
// the newest 4.x; ^0.4.12 the newest 0.4.x). Those are the majors Xenia's own
// package.json allows, so a release that breaks an official adapter shows up
// within a day. Xenia itself and Playwright stay as they are.
//
//   node scripts/newest-libraries.mjs

import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const dir = fileURLToPath(new URL("..", import.meta.url))
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)))
const keep = new Set(["xenia", "playwright"])

const specs = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
  .filter(([name, version]) => !keep.has(name) && /^\d/.test(version))
  .map(([name, version]) => `${name}@^${version}`)

execFileSync("npm", ["install", "--no-save", ...specs], { cwd: dir, stdio: "inherit" })
