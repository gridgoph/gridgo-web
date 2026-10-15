import { describe, expect, it } from "vitest";

import { auditCsv, itemOf, whereOf } from "@/lib/audit-csv";
import type { AuditEntry } from "@/lib/api/types";

const rows: AuditEntry[] = [
  {
    id: "aud_1",
    at: "2026-10-01T00:00:00.000Z",
    actorId: "user_ops",
    actorName: "Amina Cruz",
    actorRole: "ops_admin",
    source: { app: "ops_admin", device: "Browser" },
    action: "order.cancelled",
    entityType: "order",
    entityId: "order_1",
    orderId: "order_1",
    previous: "needs_qa",
    current: "cancelled",
    detail: null,
    reason: "Client asked to stop",
  },
  {
    id: "aud_2",
    at: "2026-10-20T00:00:00.000Z",
    actorId: "user_ben",
    actorName: "Ben Santos",
    actorRole: "super_admin",
    source: null,
    action: "settings.operational_update",
    entityType: "settings",
    entityId: "operational",
    orderId: null,
    previous: { serviceFeeRateBps: 1000 },
    current: { serviceFeeRateBps: 800 },
    detail: null,
    reason: "Fee change",
  },
];

function shown(filters: { actor?: string; action?: string; orderId?: string; from?: string; to?: string }) {
  return rows.filter((entry) => {
    if (filters.actor && !(entry.actorName || "").toLowerCase().includes(filters.actor.toLowerCase())) return false;
    if (filters.action && !entry.action.toLowerCase().includes(filters.action.toLowerCase())) return false;
    if (filters.orderId && entry.orderId !== filters.orderId) return false;
    if (filters.from && entry.at < filters.from) return false;
    if (filters.to && entry.at > filters.to) return false;
    return true;
  });
}

describe("audit CSV", () => {
  it("matches the filtered page, including who, old, and new", () => {
    const filtered = shown({
      actor: "amina",
      action: "cancel",
      orderId: "order_1",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-02T00:00:00.000Z",
    });
    const csv = auditCsv(filtered);
    expect(filtered).toHaveLength(1);
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain("Amina Cruz");
    expect(csv).toContain("order.cancelled");
    expect(csv).toContain("needs_qa");
    expect(csv).toContain("cancelled");
    expect(csv).toContain("Client asked to stop");
    expect(csv).toContain(whereOf(filtered[0]));
    expect(csv).toContain(itemOf(filtered[0]));
    expect(csv).not.toContain("Ben Santos");
  });
});
