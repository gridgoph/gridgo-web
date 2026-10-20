import type { Order, PickupCheck } from "@/lib/api/types";

/**
 * The rider's check at the counter, as the shop reads it.
 *
 * The rider owns the six checks and the piece count. This portal only reads
 * them back. A failed check keeps the package with the shop. Nothing here is
 * a rider action, a staff action, or a payout.
 */

const CHECKS: { code: string; label: string }[] = [
  { code: "quantity_match", label: "Count against the order" },
  { code: "specification_match", label: "Item against the spec" },
  { code: "visible_defects", label: "Free of visible defects" },
  { code: "packaging_integrity", label: "Packing" },
  { code: "documentation", label: "Paperwork" },
  { code: "supplier_sign_off", label: "Your sign-off" },
];

const RESOLVED_NOTE = "Pickup escalation resolved; repeat all six checks:";

export type SupplierCountRow = {
  key: string;
  name: string;
  expected: number;
  counted: number;
  difference: string;
  matches: boolean;
};

export type SupplierCounterView = {
  stage: "blocked" | "recheck" | "passed";
  headline: string;
  /** Where the package is. A failed check never says it left the shop. */
  detail: string;
  checkedAt: string | null;
  failed: string[];
  passed: string[];
  /** Null when this check kept no count: "Not recorded", never zero. */
  counts: SupplierCountRow[] | null;
  riderNote: string | null;
  operationsNote: string | null;
  signedBy: string | null;
};

function checkLabel(code: string): string {
  return CHECKS.find((check) => check.code === code)?.label ?? "Another check";
}

function difference(expected: number, counted: number): string {
  if (counted === expected) return "Matches";
  const gap = Math.abs(counted - expected);
  return counted < expected ? `${gap} short` : `${gap} extra`;
}

function lineName(
  order: Pick<Order, "title" | "pickupCountItems">,
  lineItemId: string | null,
): string {
  const item = order.pickupCountItems?.find((candidate) => candidate.lineItemId === lineItemId);
  return item?.itemName?.trim() || order.title || "This job";
}

function resolution(order: Pick<Order, "timeline">, after: string | null): string | null {
  const entry = [...(order.timeline ?? [])]
    .reverse()
    .find((row) => row.note?.startsWith(RESOLVED_NOTE) && (!after || row.at >= after));
  const text = entry?.note?.slice(RESOLVED_NOTE.length).trim();
  return text || null;
}

function failedLabels(checks: readonly PickupCheck[]): string[] {
  const failed = CHECKS.filter((check) =>
    checks.some((row) => row.code === check.code && !row.passed),
  ).map((check) => check.label);
  for (const row of checks) {
    if (!row.passed && !CHECKS.some((check) => check.code === row.code)) {
      failed.push(checkLabel(row.code));
    }
  }
  return failed;
}

/**
 * The counter check to draw on a shop job, or null when no rider has checked it.
 * `blocked` keeps the package at the shop. `recheck` means the rider counts
 * again. `passed` is the record of the handoff.
 */
export function supplierCounterCheck(
  order: Pick<Order, "title" | "timeline" | "pickupChecklist" | "pickupCountItems">,
): SupplierCounterView | null {
  const checklist = order.pickupChecklist;
  if (!checklist) return null;

  const checks = checklist.checks ?? [];
  const counts = Array.isArray(checklist.counts)
    ? checklist.counts.map((row, index) => ({
        key: row.lineItemId ?? `line-${index}`,
        name: lineName(order, row.lineItemId),
        expected: row.expectedQuantity,
        counted: row.countedQuantity,
        difference: difference(row.expectedQuantity, row.countedQuantity),
        matches: row.countedQuantity === row.expectedQuantity,
      }))
    : null;

  const base = {
    checkedAt: checklist.completedAt ?? null,
    failed: failedLabels(checks),
    passed: CHECKS.filter((check) =>
      checks.some((row) => row.code === check.code && row.passed),
    ).map((check) => check.label),
    counts,
    riderNote: checklist.failureNote?.trim() || null,
    operationsNote: null as string | null,
    signedBy: checklist.handoffSignature?.signerName ?? null,
  };

  switch (checklist.status) {
    case "failed_escalated":
      return {
        ...base,
        stage: "blocked",
        headline: "Fix it with Operations; the rider will check again",
        detail:
          "The rider stopped the pickup at the counter. The package stays with you until Operations clears it and the rider checks it again.",
      };
    case "escalation_resolved":
      return {
        ...base,
        stage: "recheck",
        headline: "Operations cleared it. The rider will check again",
        detail:
          "Keep the package at the counter. The rider repeats all six checks and the count, and you sign for the handoff again.",
        operationsNote: resolution(order, base.checkedAt),
      };
    case "passed":
      return {
        ...base,
        stage: "passed",
        headline: "All six checks passed",
        detail: base.signedBy
          ? `${base.signedBy} signed for the handoff.`
          : "The rider recorded the handoff.",
      };
    default:
      return null;
  }
}
