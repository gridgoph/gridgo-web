import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { EarlyAccessPage, EarlyAccessSignup } from "@/lib/api/early-access";
import {
  appendPage,
  applyGrant,
  formatManilaDateTime,
  grantError,
  grantToast,
  grantedByLabel,
  hasMore,
  listChangeNotice,
  listFromPage,
  listLoadError,
  nextOffset,
  pagingSummary,
  searchFromView,
  sourceLabel,
  viewFromSearch,
  viewKey,
} from "@/lib/early-access";

function signup(n: number, over: Partial<EarlyAccessSignup> = {}): EarlyAccessSignup {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    email: `tester${n}@example.com`,
    source: null,
    platform: "android",
    status: "pending",
    createdAt: "2026-11-17T10:00:00.000Z",
    grantedAt: null,
    grantedBy: null,
    ...over,
  };
}

function page(
  rows: EarlyAccessSignup[],
  counts = { pending: 3, granted: 1 },
  total = 3,
): EarlyAccessPage {
  return { signups: rows, counts, total, limit: 50, offset: 0 };
}

describe("view in the URL", () => {
  it("defaults to Waiting and keeps it out of the URL", () => {
    expect(viewFromSearch(new URLSearchParams())).toEqual({ filter: "pending", q: "" });
    expect(searchFromView({ filter: "pending", q: "" })).toBe("");
  });

  it("round-trips a filter and a search, and ignores an unknown status", () => {
    const view = viewFromSearch(new URLSearchParams("status=granted&q=Ana"));
    expect(view).toEqual({ filter: "granted", q: "Ana" });
    expect(searchFromView(view)).toBe("?status=granted&q=Ana");
    expect(viewFromSearch(new URLSearchParams("status=removed")).filter).toBe("pending");
  });

  it("keys a view by filter and a case-blind trimmed search", () => {
    expect(viewKey({ filter: "all", q: " Ana " })).toBe(
      viewKey({ filter: "all", q: "ana" }),
    );
    expect(viewKey({ filter: "all", q: "ana" })).not.toBe(
      viewKey({ filter: "pending", q: "ana" }),
    );
  });
});

describe("paging and grants in place", () => {
  it("offers more only while the server holds rows not yet read", () => {
    const list = listFromPage(
      { filter: "pending", q: "" },
      page([signup(1), signup(2)], { pending: 3, granted: 0 }, 3),
    );
    expect(nextOffset(list)).toBe(2);
    expect(hasMore(list)).toBe(true);
    const full = appendPage(list, page([signup(3)], { pending: 3, granted: 0 }, 3));
    expect(full.rows.map((r) => r.email)).toEqual([
      "tester1@example.com",
      "tester2@example.com",
      "tester3@example.com",
    ]);
    expect(hasMore(full)).toBe(false);
  });

  it("keeps a row shown once when a new sign-up pushed it onto the next page", () => {
    const list = listFromPage(
      { filter: "pending", q: "" },
      page([signup(1), signup(2)], { pending: 4, granted: 0 }, 4),
    );
    const next = appendPage(
      list,
      page([signup(2), signup(3)], { pending: 4, granted: 0 }, 4),
    );
    expect(next.rows.map((r) => r.id)).toEqual([
      signup(1).id,
      signup(2).id,
      signup(3).id,
    ]);
  });

  it("keeps a granted row in place under Waiting and moves the counts by one", () => {
    const list = listFromPage(
      { filter: "pending", q: "" },
      page([signup(1), signup(2)], { pending: 3, granted: 1 }, 3),
    );
    const granted = signup(1, {
      status: "granted",
      grantedAt: "2026-11-17T11:00:00.000Z",
      grantedBy: "me",
    });
    const next = applyGrant(list, granted);
    expect(next.rows[0]).toEqual(granted);
    expect(next.rows).toHaveLength(2);
    expect(next.counts).toEqual({ pending: 2, granted: 2 });
    expect(next.total).toBe(2);
    // The next page starts after the one row still waiting on the server.
    expect(nextOffset(next)).toBe(1);
    expect(hasMore(next)).toBe(true);
    expect(pagingSummary(next)).toBe("Showing 1 of 2, plus 1 granted just now");
  });

  it("keeps the total under All and changes nothing for a row granted elsewhere", () => {
    const list = listFromPage(
      { filter: "all", q: "" },
      page([signup(1)], { pending: 1, granted: 0 }, 1),
    );
    const next = applyGrant(
      list,
      signup(1, { status: "granted", grantedAt: "2026-11-17T11:00:00.000Z" }),
    );
    expect(next.total).toBe(1);
    expect(next.counts).toEqual({ pending: 0, granted: 1 });
    expect(applyGrant(next, next.rows[0]).counts).toEqual({ pending: 0, granted: 1 });
  });
});

describe("live changes", () => {
  it("says nothing when the counts match, and names new sign-ups", () => {
    expect(
      listChangeNotice({ pending: 2, granted: 1 }, { pending: 2, granted: 1 }),
    ).toBeNull();
    expect(listChangeNotice({ pending: 2, granted: 1 }, { pending: 3, granted: 1 })).toBe(
      "1 new sign-up since this list loaded.",
    );
    expect(listChangeNotice({ pending: 2, granted: 1 }, { pending: 4, granted: 1 })).toBe(
      "2 new sign-ups since this list loaded.",
    );
    expect(listChangeNotice({ pending: 2, granted: 1 }, { pending: 1, granted: 2 })).toBe(
      "Sign-ups changed since this list loaded.",
    );
  });
});

describe("words on screen", () => {
  it("prints Manila time whatever the reader's zone", () => {
    expect(formatManilaDateTime("2026-11-17T16:30:00.000Z")).toMatch(
      /Nov 18, 2026, 12:30\sAM/,
    );
    expect(formatManilaDateTime(null)).toBe("—");
    expect(formatManilaDateTime("not a date")).toBe("—");
  });

  it("names the source and who granted", () => {
    expect(sourceLabel(null)).toBe("Direct");
    expect(sourceLabel("booth")).toBe("booth");
    expect(grantedByLabel("staff-1", "staff-1")).toBe("by you");
    // Staff ids and the support desk's Clerk subjects can both start "user_".
    expect(grantedByLabel("user_2abc", "staff-1")).toBe("by GRIDGO staff");
    expect(grantedByLabel("user_0a1b2c3d4e5f", "staff-1")).toBe("by GRIDGO staff");
    expect(grantedByLabel("staff-2", "staff-1")).toBe("by GRIDGO staff");
    expect(grantedByLabel(null, "staff-1")).toBeNull();
  });

  it("says the same truthful thing for a fresh grant or a repeat of my own", () => {
    const mine = grantToast(
      signup(1, {
        status: "granted",
        grantedAt: "2026-11-17T09:00:00.000Z",
        grantedBy: "staff-1",
      }),
      "staff-1",
    );
    expect(mine.title).toBe("Access granted");
    expect(mine.description).toBe(
      "tester1@example.com has early access. GRIDGO emails the Google Play invite once per sign-up.",
    );
    expect(mine.description).not.toMatch(/emailing|no second email/i);
  });

  it("calls a grant by someone else already granted, whatever its time", () => {
    // Granted a second before this press: no timing guess decides the copy.
    const other = grantToast(
      signup(1, {
        status: "granted",
        grantedAt: new Date().toISOString(),
        grantedBy: "user_0a1b2c3d4e5f",
      }),
      "staff-1",
    );
    expect(other.title).toBe("Already granted");
    expect(other.description).toMatch(/was already granted .*once per sign-up\.$/);
  });

  it("explains failures by kind, never with the API's message", () => {
    expect(grantError(new ApiError(404, { error: "not_found" }))).toMatch(
      /no longer on file/,
    );
    expect(grantError(new Error("offline"))).toMatch(/Access was not granted/);
    expect(listLoadError(new ApiError(403, { error: "forbidden" }))).toMatch(
      /cannot read/,
    );
    expect(listLoadError(new ApiError(400, { error: "invalid_query" }))).toMatch(
      /too long/,
    );
  });
});
