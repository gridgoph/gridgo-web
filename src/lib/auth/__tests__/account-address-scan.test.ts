import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

function scan(source: string) {
  const dir = mkdtempSync(join(tmpdir(), "gridgo-address-scan-"));
  try {
    writeFileSync(join(dir, "chunk.js"), source);
    return spawnSync(process.execPath, [resolve("scripts/assert-no-account-addresses.mjs"), "--dir", dir], { encoding: "utf8", timeout: 2000 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

it("rejects account domains and the exact legacy address with complete local parts", () => {
  for (const address of ["+shop@gridgo.ph", "first.last+shop@gridgo.local", "markdavidprado@gmail.com"]) {
    const result = scan(`const email=${JSON.stringify(address)}`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(address);
  }
});
it("accepts unrelated domains and long minified identifiers within a bounded scan", () => {
  const result = scan(`${"A".repeat(200000)}; const email="shop@example.test";`);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
});
