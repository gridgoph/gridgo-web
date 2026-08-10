/**
 * Commission secrecy is an authorization rule, and the easiest way to break it
 * from the portal is to reuse the Operations money component on a supplier
 * screen. This walks the supplier route tree and fails if that ever happens.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SUPPLIER_ROUTES = join(process.cwd(), "src/app/supplier");

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFilesUnder(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("supplier route tree", () => {
  const files = sourceFilesUnder(SUPPLIER_ROUTES);

  it("has files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("never imports the Operations money breakdown", () => {
    const offenders = files.filter((file) =>
      readFileSync(file, "utf8").includes("MoneyBreakdown"),
    );
    expect(offenders).toEqual([]);
  });

  it("never reads commission fields off an order", () => {
    const offenders = files.filter((file) => {
      const src = readFileSync(file, "utf8");
      return (
        src.includes("commissionMinor") || src.includes("commissionRatePercent")
      );
    });
    expect(offenders).toEqual([]);
  });

  it("offers no cash-on-delivery path", () => {
    const offenders = files.filter((file) => {
      const src = readFileSync(file, "utf8");
      return /\bcod\b|codEligible|cash on delivery/i.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
