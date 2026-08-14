#!/usr/bin/env node
/**
 * Prove the production build ships no GRIDGO account addresses.
 *
 * The sign-in page is public. It used to render a "Demo accounts" panel listing
 * `supplier@`, `ops@` and `admin@` — an account list, super admin included,
 * handed to anyone who opened `https://gridgo-dash.talasora.com/login`. Rotating
 * the passwords did not fix that; the addresses were the disclosure.
 *
 * The local-development convenience that replaced it lives behind
 * `process.env.NODE_ENV === "production" ? [] : […]` in
 * `src/app/login/dev-accounts.ts`, which the compiler folds to a constant empty
 * list. That is an argument about what the compiler *should* do. This asserts
 * against what it actually emitted — both the client chunks a browser
 * downloads and the server bundle that renders the HTML.
 *
 * Runs as part of `npm run build`, so a reintroduction fails the build rather
 * than the deploy.
 *
 * Usage:
 *
 *   node scripts/assert-no-account-addresses.mjs
 *   node scripts/assert-no-account-addresses.mjs --dir .next
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Any address on a GRIDGO account domain — the live `gridgo.ph` and the
 * retired `gridgo.local` placeholder — plus the official Clerk supplier
 * Gmail that the local picker advertises. The domain half is deliberately
 * not a list of the known local names: a fourth `@gridgo.ph` added later
 * must fail this too. The Gmail is the one named address that is not on
 * those domains, so it is hunted by exact match.
 */
const ACCOUNT_ADDRESS =
  /(?:[A-Za-z0-9._%+-]+@gridgo\.(?:ph|local)|markdavidprado@gmail\.com)\b/g;

/** Emitted output that can reach a browser, directly or as rendered HTML. */
const SCANNED_EXTENSIONS = [".js", ".mjs", ".cjs", ".json", ".html", ".rsc", ".txt"];

/** Build cache, not build output — never served. */
const SKIPPED_DIRECTORIES = new Set(["cache"]);

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fail(message, ...detail) {
  console.error(`assert-no-account-addresses: ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  process.exit(1);
}

const nextDir = resolve(arg("dir") ?? process.env.NEXT_BUILD_DIR ?? ".next");

function filesIn(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry)) found.push(...filesIn(full));
    } else if (SCANNED_EXTENSIONS.some((ext) => full.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

const files = filesIn(nextDir);

if (files.length === 0) {
  fail(
    `found no build output under ${nextDir}.`,
    "Run `next build` first, or point --dir at the build output.",
  );
}

const hits = [];
for (const file of files) {
  const found = readFileSync(file, "utf8").match(ACCOUNT_ADDRESS);
  if (found) hits.push({ file: relative(nextDir, file), found: [...new Set(found)] });
}

if (hits.length > 0) {
  fail(
    `${hits.length} build artefact(s) contain GRIDGO account addresses.`,
    "The sign-in page is public — shipping these publishes the account list.",
    ...hits.map(({ file, found }) => `${file}: ${found.join(", ")}`),
    "Keep addresses behind the build-time guard in src/app/login/dev-accounts.ts.",
  );
}

console.log(
  `assert-no-account-addresses: OK — no account addresses in ${files.length} build artefacts under ${nextDir}.`,
);
