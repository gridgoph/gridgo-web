import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { DEV_ACCOUNTS } from "@/app/login/dev-accounts";

/**
 * The sign-in page is public. An account address rendered there — or merely
 * present in the bundle behind a runtime flag — publishes the account list,
 * super admin included, to anyone who opens the page. Wrong passwords do not
 * make that safe.
 *
 * `scripts/assert-no-account-addresses.mjs` proves the emitted build carries
 * none of them, but it can only run after a build. These assertions run on
 * every `npm test`, so a reintroduction is caught at review time and the build
 * assertion is the backstop rather than the first line of defence.
 */

const SRC = resolve(__dirname, "../../..");
const GUARDED_MODULE = resolve(SRC, "app/login/dev-accounts.ts");
/** No `g` flag — this is reused with `.test()`, which is stateful when global. */
const ACCOUNT_ADDRESS =
  /(?:[A-Za-z0-9._%+-]+@gridgo\.(?:ph|local)|markdavidprado@gmail\.com)\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Tests are never shipped; they may name accounts.
      return entry === "__tests__" ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx|css)$/.test(full) ? [full] : [];
  });
}

describe("account address disclosure", () => {
  it("keeps every account address in the one build-time guarded module", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => file !== GUARDED_MODULE)
      .filter((file) => ACCOUNT_ADDRESS.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file));

    expect(offenders).toEqual([]);
  });

  it("drops the guarded module's addresses from a production build", () => {
    const source = readFileSync(GUARDED_MODULE, "utf8");

    // The compiler substitutes NODE_ENV, folding this to a constant `[]`.
    // A runtime flag would still ship the literals to the browser.
    expect(source).toContain('process.env.NODE_ENV === "production"');
    expect(source).toMatch(/\?\s*\[\]/);
  });

  it("has retired the @gridgo.local placeholder domain", () => {
    for (const account of DEV_ACCOUNTS) {
      expect(account.email).not.toMatch(/@gridgo\.local$/);
    }
  });

  it("advertises the official Clerk supplier, not the @gridgo.ph shop fixture", () => {
    const supplier = DEV_ACCOUNTS.find((account) => account.role === "Supplier partner");
    expect(supplier?.email).toBe("markdavidprado@gmail.com");
    for (const account of DEV_ACCOUNTS) {
      if (account.role === "Supplier partner") continue;
      expect(account.email).toMatch(/@gridgo\.ph$/);
    }
  });
});
