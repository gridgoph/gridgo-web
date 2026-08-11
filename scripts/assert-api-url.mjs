#!/usr/bin/env node
/**
 * Prove the deployed API URL is really baked into the built client bundle.
 *
 * `NEXT_PUBLIC_*` values are inlined by the compiler at build time, not read
 * when the container starts. Supplying the API URL only as a runtime
 * environment variable produces a portal that builds green, boots green, and
 * then makes every signed-in browser call `http://127.0.0.1:8787` — the
 * operator's own machine. Nothing in a normal build fails; the failure lands on
 * the captain's users.
 *
 * So the build asserts against the emitted JavaScript rather than against the
 * environment it *meant* to use.
 *
 * Usage (from the repo root, after `next build`):
 *
 *   NEXT_PUBLIC_API_URL=https://gridgo-api.talasora.com node scripts/assert-api-url.mjs
 *   node scripts/assert-api-url.mjs --dir .next --url https://gridgo-api.talasora.com
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Mirrors DEFAULT_API_BASE in src/lib/api/client.ts. */
const DEV_FALLBACK = "http://127.0.0.1:8787";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fail(message, ...detail) {
  console.error(`assert-api-url: ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  process.exit(1);
}

const nextDir = resolve(arg("dir") ?? process.env.NEXT_BUILD_DIR ?? ".next");
const expected = (arg("url") ?? process.env.NEXT_PUBLIC_API_URL ?? "")
  .trim()
  .replace(/\/$/, "");

if (!expected) {
  fail(
    "no expected API URL.",
    "Pass --url or set NEXT_PUBLIC_API_URL to the URL this build should call.",
  );
}

if (!/^https?:\/\/[^/\s]+$/.test(expected)) {
  fail(
    `"${expected}" is not an absolute origin.`,
    "Expected something like https://gridgo-api.talasora.com (no path, no trailing slash).",
  );
}

if (expected === DEV_FALLBACK) {
  fail(
    `the build was pointed at the local development API (${DEV_FALLBACK}).`,
    "A deployed portal must name a reachable public API origin.",
  );
}

/** The client bundle — the only output a browser actually executes. */
const staticDir = join(nextDir, "static");

function jsFilesIn(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...jsFilesIn(full));
    else if (full.endsWith(".js")) found.push(full);
  }
  return found;
}

const files = jsFilesIn(staticDir);

if (files.length === 0) {
  fail(
    `found no client JavaScript under ${staticDir}.`,
    "Run `next build` first, or point --dir at the build output.",
  );
}

const hits = files.filter((file) => readFileSync(file, "utf8").includes(expected));

if (hits.length === 0) {
  fail(
    `"${expected}" is not present in any of the ${files.length} client chunks under ${staticDir}.`,
    "NEXT_PUBLIC_API_URL was not set when `next build` ran, so the bundle kept the",
    `development fallback (${DEV_FALLBACK}) and the deployed portal would call the user's own machine.`,
    "Pass it as a Docker build argument, not only as a runtime environment variable.",
  );
}

console.log(
  `assert-api-url: OK — "${expected}" is inlined in ${hits.length} of ${files.length} client chunks.`,
);
