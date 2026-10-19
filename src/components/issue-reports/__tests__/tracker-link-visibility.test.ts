/**
 * GitHub tracker links on issue reports are Super Admin's (the captain, 19 Oct
 * 2026). The desk shows them only when its route passes `trackerLinks`, so
 * this walks the Operations route tree and fails if any file turns them on.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

describe("issue report tracker links", () => {
  it("are never turned on in the Operations tree", () => {
    const files = sourceFilesUnder(join(process.cwd(), "src/app/ops"));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) => /trackerLinks/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("are turned on for Super Admin", () => {
    const page = readFileSync(join(process.cwd(), "src/app/admin/issue-reports/page.tsx"), "utf8");
    expect(page).toMatch(/<IssueReportsDesk trackerLinks \/>/);
  });
});
