/**
 * The full audit log is Super Admin only. Operations may read one order
 * (`orderId`), a file by id, or the production-override and file-deletion
 * actions. Anything else answers 403. Every `listAudit` call outside the
 * Super Admin tree must stay inside those scopes.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const ADMIN_TREE = join(SRC, "app/admin");

/** The API's allowed actions, as the call sites name them: constant or literal. */
const ALLOWED_ACTIONS = new Set([
  "PRODUCTION_OVERRIDE_ACTION",
  "FILE_EARLY_DELETE_ACTION",
  "FILE_RETENTION_DELETE_ACTION",
  '"order.production_override"',
  '"file.early_delete"',
  '"file.retention_delete"',
]);

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...sourceFilesUnder(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** The argument text of each `listAudit(...)` call, up to its closing brace. */
function auditCalls(source: string): string[] {
  const calls: string[] = [];
  const pattern = /listAudit\(\s*(\{[^}]*\})?/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    calls.push(match[1] ?? "");
  }
  return calls;
}

function allowedForOperations(args: string): boolean {
  const action = /action:\s*([A-Z_]+|"[^"]+")/.exec(args)?.[1];
  if (action && ALLOWED_ACTIONS.has(action)) return true;
  if (/entityType:\s*"file"/.test(args) && /entityId:/.test(args)) return true;
  return /\borderId\b/.test(args) && !/actionQuery:/.test(args) && !/\bactor:/.test(args);
}

describe("audit reads outside the Super Admin tree", () => {
  const calls = sourceFilesUnder(SRC)
    .filter((file) => !file.startsWith(ADMIN_TREE))
    .filter((file) => !file.endsWith(join("lib/api/client.ts")))
    .flatMap((file) =>
      auditCalls(readFileSync(file, "utf8")).map((args) => ({
        file: relative(process.cwd(), file).replaceAll("\\", "/"),
        args,
      })),
    );

  it("finds the workspace records", () => {
    expect(calls.map((call) => call.file).sort()).toEqual([
      "src/components/files/DeletedFile.tsx",
      "src/components/files/OrderFileDeletions.tsx",
      "src/components/orders/OrderAudit.tsx",
      "src/components/orders/OrderWorkspace.tsx",
    ]);
  });

  it("asks only for a scope the API lets Operations read", () => {
    const refused = calls.filter((call) => !allowedForOperations(call.args));
    expect(refused).toEqual([]);
  });

  it("refuses an unscoped read in the check itself", () => {
    expect(allowedForOperations("")).toBe(false);
    expect(allowedForOperations('{ action: "user.role_change" }')).toBe(false);
    expect(allowedForOperations('{ entityType: "file" }')).toBe(false);
  });
});
