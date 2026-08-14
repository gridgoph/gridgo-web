import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const fixtures: string[] = [];
const scanner = resolve(process.cwd(), "scripts/assert-no-clerk-secrets.mjs");

function fixtureWith(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "gridgo-clerk-scan-"));
  fixtures.push(dir);
  writeFileSync(join(dir, "app.js"), source);
  return dir;
}

function scan(dir: string) {
  return spawnSync(process.execPath, [scanner, dir], { encoding: "utf8" });
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("Clerk client-bundle secret scanner", () => {
  it("fails when a Clerk secret key reaches a client chunk", () => {
    const result = scan(fixtureWith("window.key='sk_test_not-a-real-secret';"));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Clerk secret key");
    expect(result.stderr).not.toContain("sk_test_not-a-real-secret");
  });

  it("accepts publishable keys in client chunks", () => {
    const result = scan(fixtureWith("window.key='pk_test_public-and-expected';"));

    expect(result.status).toBe(0);
  });
});
