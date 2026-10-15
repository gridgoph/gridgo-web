import { describe, expect, it } from "vitest";

import {
  EMPTY_AUDIT_FILTERS,
  auditChange,
  auditActorLine,
  auditChangeSummary,
  auditCsvFilename,
  auditDetailRows,
  auditFieldLabel,
  auditFiltersAreSet,
  auditFiltersFromSearchParams,
  auditOrderIds,
  auditQuery,
  auditSearchFromFilters,
  exportUpperBound,
  isCreation,
  manilaDayEnd,
  manilaDayStart,
  presentAuditAction,
  presentAuditActor,
  presentAuditApp,
  presentAuditDevice,
  presentAuditValue,
} from "@/lib/audit";

describe("filters", () => {
  it("round-trips through the screen's URL and leaves blanks out", () => {
    const filters = { ...EMPTY_AUDIT_FILTERS, person: "Maria", from: "2026-10-01", q: " " };
    const search = auditSearchFromFilters(filters);
    expect(search).toBe("?person=Maria&from=2026-10-01");
    expect(auditFiltersFromSearchParams(new URLSearchParams(search))).toEqual({
      ...EMPTY_AUDIT_FILTERS,
      person: "Maria",
      from: "2026-10-01",
    });
    expect(auditFiltersAreSet(EMPTY_AUDIT_FILTERS)).toBe(false);
    expect(auditFiltersAreSet(filters)).toBe(true);
  });

  it("reads dates as whole Manila days, not UTC days", () => {
    expect(manilaDayStart("2026-10-15")).toBe("2026-10-14T16:00:00.000Z");
    expect(manilaDayEnd("2026-10-15")).toBe("2026-10-15T15:59:59.999Z");
    const result = auditQuery({ ...EMPTY_AUDIT_FILTERS, from: "2026-10-01", to: "2026-10-31", action: "order.transition" });
    expect(result).toEqual({
      query: {
        action: "order.transition",
        from: "2026-09-30T16:00:00.000Z",
        to: "2026-10-31T15:59:59.999Z",
      },
    });
  });

  it("refuses what the API would refuse, before sending", () => {
    expect(auditQuery({ ...EMPTY_AUDIT_FILTERS, from: "2026-10-31", to: "2026-10-01" })).toEqual({
      error: "The From date is after the To date.",
    });
    expect(auditQuery({ ...EMPTY_AUDIT_FILTERS, from: "2026-02-30" })).toHaveProperty("error");
    expect(auditQuery({ ...EMPTY_AUDIT_FILTERS, q: "x".repeat(201) })).toHaveProperty("error");
  });

  it("pins an export to now, or to the end of an earlier To day", () => {
    const now = Date.parse("2026-10-15T04:00:00.000Z");
    expect(exportUpperBound({}, now)).toBe("2026-10-15T04:00:00.000Z");
    expect(exportUpperBound({ to: manilaDayEnd("2026-10-15") }, now)).toBe("2026-10-15T04:00:00.000Z");
    expect(exportUpperBound({ to: manilaDayEnd("2026-10-01") }, now)).toBe("2026-10-01T15:59:59.999Z");
  });

  it("names the CSV by the Manila day and the order", () => {
    const now = Date.parse("2026-10-14T17:00:00.000Z");
    expect(auditCsvFilename(undefined, now)).toBe("gridgo-audit-2026-10-15.csv");
    expect(auditCsvFilename("ord_7", now)).toBe("gridgo-audit-ord_7-2026-10-15.csv");
  });
});

describe("before and after", () => {
  it("leads with the changed fields of a whole-record snapshot", () => {
    const change = auditChange({
      before: { id: "ord_1", state: "production", updatedAt: "2026-10-15T01:00:00.000Z", totalMinor: 1000 },
      after: { id: "ord_1", state: "ready_for_dispatch", updatedAt: "2026-10-15T02:00:00.000Z", totalMinor: 1000 },
    });
    expect(change.kind).toBe("changed");
    if (change.kind !== "changed") return;
    expect(change.changed.map((row) => row.path)).toEqual(["state", "updatedAt"]);
    expect(change.unchanged.map((row) => row.path)).toEqual(["id", "totalMinor"]);
  });

  it("keys array items by their code so a stage reads by name", () => {
    const change = auditChange({
      before: { payoutMilestones: [{ code: "delivered", status: "pending_pof" }, { code: "issue_window", status: "pending_pof" }] },
      after: { payoutMilestones: [{ code: "delivered", status: "released" }, { code: "issue_window", status: "pending_pof" }] },
    });
    if (change.kind !== "changed") throw new Error(change.kind);
    expect(change.changed).toHaveLength(1);
    expect(auditFieldLabel(change.changed[0])).toBe("Payout stages › Delivered › Status");
    expect(presentAuditValue(change.changed[0].key, change.changed[0].after)).toBe("Released");
  });

  it("tells creation, removal and nothing recorded apart", () => {
    expect(auditChange({ before: null, after: { state: "draft" } }).kind).toBe("created");
    expect(auditChange({ before: { name: "Shop A" }, after: null }).kind).toBe("removed");
    expect(auditChange({ before: null, after: null }).kind).toBe("none");
    expect(auditChange({}).kind).toBe("none");
  });

  it("reads a field the item gained as going from none", () => {
    const change = auditChange({ before: { accountStatus: "active" }, after: { accountStatus: "suspended", accountStatusReason: "Late" } });
    if (change.kind !== "changed") throw new Error(change.kind);
    const added = change.changed.find((row) => row.key === "accountStatusReason")!;
    expect(presentAuditValue(added.key, added.before)).toBe("None");
    expect(presentAuditValue("accountStatus", "suspended")).toBe("Suspended");
  });

  it("leaves out an empty placeholder whose fields carry the change", () => {
    const change = auditChange({
      before: { state: "supplier_assigned", shopRecovery: null },
      after: { state: "supplier_assigned", shopRecovery: { id: "shop_event_1", stage: "supplier_assigned" } },
    });
    if (change.kind !== "changed") throw new Error(change.kind);
    expect(change.changed.map((row) => row.path)).toEqual(["shopRecovery.id", "shopRecovery.stage"]);
    expect(change.unchanged.map((row) => row.path)).toEqual(["state"]);
  });

  it("summarises the real change, not the bookkeeping", () => {
    const summary = auditChangeSummary({
      action: "order.production_override",
      before: { state: "production", updatedAt: "2026-10-15T01:00:00.000Z", version: 3 },
      after: { state: "ready_for_dispatch", updatedAt: "2026-10-15T02:00:00.000Z", version: 4 },
    });
    expect(summary.rows.map((row) => row.key)).toEqual(["state"]);
    expect(summary.more).toBe(0);
    expect(auditChangeSummary({ action: "staff.sign_in", before: null, after: { id: "u" } }).line).toBe("Values recorded");
    expect(auditChangeSummary({ action: "order.created", before: null, after: { id: "o" } }).line).toBe("New record");
    expect(auditChangeSummary({ action: "order.transition_refused", before: { s: 1 }, after: { s: 1 } }).line).toBe(
      "No values changed",
    );
  });

  it("keeps detail that is not already the before, after or reason", () => {
    const rows = auditDetailRows({ previous: { a: 1 }, current: { a: 2 }, reason: "x", amountMinor: 50000 });
    expect(rows.map((row) => row.path)).toEqual(["amountMinor"]);
    expect(auditDetailRows(null)).toEqual([]);
  });
});

describe("values in words", () => {
  it("formats money, rates, steps, times and names", () => {
    expect(presentAuditValue("balanceMinor", 50000)).toBe("₱500.00");
    expect(presentAuditValue("serviceFeeRateBps", 1200)).toBe("12%");
    expect(presentAuditValue("downpaymentPercent", 75)).toBe("75%");
    expect(presentAuditValue("state", "ready_for_dispatch")).toBe("Ready for dispatch");
    expect(presentAuditValue("opensMinute", 480)).toBe("08:00");
    expect(presentAuditValue("payoutHold", false)).toBe("No");
    expect(presentAuditValue("riderId", null)).toBe("None");
    expect(presentAuditValue("supplierId", "user_a", { user_a: "Shop A" })).toBe("Shop A (user_a)");
    expect(presentAuditValue("releasedAt", "2026-10-15T04:00:00.000Z")).toMatch(/Oct 15, 2026/);
    expect(presentAuditValue("role", "ops_admin")).toBe("Operations");
  });

  it("reads codes as words but keeps IDs exact", () => {
    expect(presentAuditValue("stage", "supplier_assigned")).toBe("Awaiting supplier decision");
    expect(presentAuditValue("state", "some_new_step")).toBe("Some new step");
    expect(presentAuditValue("kind", "timed_out")).toBe("Timed out");
    expect(presentAuditValue("clientId", "user_markdavid_client")).toBe("user_markdavid_client");
    expect(presentAuditValue("id", "shop_event_0cd6c16dd693")).toBe("shop_event_0cd6c16dd693");
    expect(presentAuditValue("reference", "DEV-2-INIT")).toBe("DEV-2-INIT");
  });
});

describe("who, where and what", () => {
  it("never shows a raw action code", () => {
    expect(presentAuditAction("order.production_override")).toBe("Moved job on for the shop");
    expect(presentAuditAction("refund.something_new")).toBe("Refund something new");
    expect(presentAuditAction("order.shop_timed_out")).toBe("Shop did not accept in time");
  });

  it("keeps the recorded name and calls automatic work System", () => {
    expect(presentAuditActor({ actorId: "u1", actorName: "Maria", actorRole: "supplier" })).toEqual({
      name: "Maria",
      role: "Shop",
    });
    expect(presentAuditActor({ actorId: null, actorName: "System", actorRole: "system" })).toEqual({
      name: "System",
      role: "Automatic",
    });
    expect(presentAuditActor({ actorId: "u2", actorName: null, actorRole: "ops_admin" }).name).toBe("u2");
  });

  it("says Automatic once for automatic work", () => {
    expect(auditActorLine({ actorId: null, actorName: "System", actorRole: "system", app: "system" })).toBe("Automatic");
    expect(auditActorLine({ actorId: "u1", actorName: "Maria", actorRole: "supplier", app: "supplier" })).toBe(
      "Shop, Supplier app",
    );
    expect(auditActorLine({ actorId: "u3", actorName: "Super Admin", actorRole: "super_admin", app: "api" })).toBe(
      "Direct to the API",
    );
  });

  it("names the app and shortens the device", () => {
    expect(presentAuditApp("dashboard")).toBe("Dashboard");
    expect(presentAuditApp("https://gridgo-dash.talasora.com")).toBe("Dashboard");
    expect(presentAuditApp("http://localhost:8082")).toBe("localhost:8082");
    expect(presentAuditApp("system")).toBe("Automatic, no app");
    expect(presentAuditApp(null)).toBe("Not recorded");
    expect(presentAuditDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toBe(
      "Chrome on macOS",
    );
    expect(presentAuditDevice("GRIDGO Supplier/1.0")).toBe("GRIDGO Supplier/1.0");
    expect(presentAuditDevice(null)).toBeNull();
  });

  it("reads a service fee bracket change in words", () => {
    const table = (middle: number) => ({
      version: 2,
      rounding: "half_up_once",
      brackets: [
        { upToMinor: 200000, rateBps: 4500 },
        { upToMinor: 2000000, rateBps: middle },
        { upToMinor: null, rateBps: 1500 },
      ],
    });
    const change = auditChange({
      before: { serviceFeeSchedule: table(2500) },
      after: { serviceFeeSchedule: table(2000) },
    });
    if (change.kind !== "changed") throw new Error(change.kind);
    expect(change.changed).toHaveLength(1);
    const [row] = change.changed;
    expect(auditFieldLabel(row)).toBe("Service fee brackets › Bracket › #2 › Rate");
    expect(presentAuditValue(row.key, row.before)).toBe("25%");
    expect(presentAuditValue(row.key, row.after)).toBe("20%");
    expect(presentAuditValue("upToMinor", null)).toBe("No limit");
    expect(presentAuditValue("upToMinor", 200000)).toBe("₱2,000.00");
  });

  it("lists every order a shared record belongs to once", () => {
    expect(auditOrderIds({ orderId: "a", orderIds: ["a", "b"] })).toEqual(["a", "b"]);
    expect(auditOrderIds({ orderId: null })).toEqual([]);
  });

  it("knows a creation from a record of the item as it stood", () => {
    expect(isCreation("order.created")).toBe(true);
    expect(isCreation("voucher.campaign_create")).toBe(true);
    expect(isCreation("staff.sign_in")).toBe(false);
    expect(isCreation("artwork.download_authorized")).toBe(false);
  });
});
