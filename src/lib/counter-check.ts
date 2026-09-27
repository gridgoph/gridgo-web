/**
 * The counter check: the rider's six checks and piece count at the shop,
 * before the package changes hands. Contract: "Rider pickup checklist and
 * escalation" in gridgo-api docs/OPERATIONAL_MODEL_V2_API.md.
 *
 * A counter check never pays anyone. It is a gate on custody, not a payout
 * stage, so nothing here reads or writes a milestone.
 */

import type {
  Escalation,
  Order,
  PickupCheck,
  PickupCount,
  PickupCountItem,
} from "@/lib/api/types";
import { PICKUP_CHECKS } from "@/lib/order-state";

export type CountVerdict = "match" | "short" | "extra" | "not_recorded";

export type CountLine = {
  key: string;
  itemName: string;
  /** Pieces the order says, or null when the attempt kept no count at all. */
  expected: number | null;
  counted: number | null;
  verdict: CountVerdict;
};

/**
 * One row per order line: what the order says beside what the rider counted.
 *
 * The API sends the label (`pickupCountItems[].itemName`) apart from the count,
 * so rows are matched by `lineItemId`, and `null` (an order from before line
 * items) matches `null`. A check recorded before counting was required has no
 * `counts`: its lines read "Not recorded", never zero.
 */
export function countLines(
  counts: readonly PickupCount[] | null | undefined,
  items: readonly PickupCountItem[] | null | undefined,
  fallbackName: string,
): CountLine[] {
  const nameOf = (lineItemId: string | null, index: number) => {
    const item = items?.find((candidate) => candidate.lineItemId === lineItemId);
    if (item?.itemName) return item.itemName;
    const lines = counts?.length ?? items?.length ?? 0;
    return lines > 1 ? `${fallbackName}, line ${index + 1}` : fallbackName;
  };

  if (!counts) {
    return (items ?? []).map((item, index) => ({
      key: item.lineItemId ?? `line-${index}`,
      itemName: nameOf(item.lineItemId, index),
      expected: item.expectedQuantity,
      counted: null,
      verdict: "not_recorded" as const,
    }));
  }

  return counts.map((count, index) => ({
    key: count.lineItemId ?? `line-${index}`,
    itemName: nameOf(count.lineItemId, index),
    expected: count.expectedQuantity,
    counted: count.countedQuantity,
    verdict:
      count.countedQuantity === count.expectedQuantity
        ? "match"
        : count.countedQuantity < count.expectedQuantity
          ? "short"
          : "extra",
  }));
}

/** The words beside a counted line. Status is never colour alone. */
export function countVerdictLabel(line: CountLine): string {
  if (line.verdict === "not_recorded") return "Not recorded";
  if (line.verdict === "match") return "Matches";
  const gap = Math.abs((line.counted ?? 0) - (line.expected ?? 0));
  return line.verdict === "short"
    ? `${formatPieces(gap)} short`
    : `${formatPieces(gap)} extra`;
}

export function formatPieces(count: number): string {
  return count.toLocaleString("en-PH");
}

export function countsDisagree(lines: readonly CountLine[]): boolean {
  return lines.some((line) => line.verdict === "short" || line.verdict === "extra");
}

export type CheckResult = {
  code: string;
  label: string;
  passed: boolean;
};

/**
 * The six checks in the order the rider works through them, whatever order
 * the record kept. A code this portal does not know yet still shows, last.
 */
export function checkResults(
  checks: readonly PickupCheck[] | null | undefined,
): CheckResult[] {
  if (!checks?.length) return [];
  const known = PICKUP_CHECKS.flatMap((definition) => {
    const check = checks.find((candidate) => candidate.code === definition.code);
    return check
      ? [{ code: definition.code, label: definition.label, passed: check.passed }]
      : [];
  });
  const unknown = checks
    .filter(
      (check) => !PICKUP_CHECKS.some((definition) => definition.code === check.code),
    )
    .map((check) => ({ code: check.code, label: "Pickup check", passed: check.passed }));
  return [...known, ...unknown];
}

/** What went wrong at the counter, in a few words, for a closed row. */
export function failureHeadline(
  checks: readonly PickupCheck[] | null | undefined,
  lines: readonly CountLine[],
): string {
  const off = lines.filter(
    (line) => line.verdict === "short" || line.verdict === "extra",
  );
  const parts: string[] = [];
  if (off.length === 1) {
    const [line] = off;
    parts.push(
      lines.length === 1
        ? `counted ${countVerdictLabel(line)}`
        : `${line.itemName} counted ${countVerdictLabel(line)}`,
    );
  } else if (off.length > 1) {
    parts.push(`${off.length} lines counted wrong`);
  }
  const failed = checkResults(checks).filter(
    // A count mismatch already explains a failed quantity check.
    (check) => !check.passed && !(check.code === "quantity_match" && off.length > 0),
  );
  if (failed.length === 1) parts.push(failed[0].label.toLowerCase());
  else if (failed.length > 1) parts.push(`${failed.length} checks failed`);
  return parts.length ? parts.join(", ") : "a check failed";
}

export type CounterStep = "done" | "current" | "locked";

/** States from which the package is already with the rider or beyond. */
const AFTER_PICKUP = new Set([
  "picked_up",
  "out_for_delivery",
  "awaiting_collection",
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
]);

/**
 * Where the counter check sits for this order: done once custody moved,
 * current while a rider is assigned (at the counter, blocked, or rechecking),
 * locked before that.
 */
export function counterStep(
  order: Pick<Order, "state" | "pickupChecklist">,
): CounterStep {
  if (order.pickupChecklist?.status === "passed" || AFTER_PICKUP.has(order.state))
    return "done";
  if (order.state === "rider_assigned") return "current";
  return "locked";
}

/** True while a rider is blocked at the counter waiting on Operations. */
export function counterBlocked(
  order: Pick<Order, "pickupChecklist">,
  escalations: readonly Escalation[] = [],
): boolean {
  return (
    order.pickupChecklist?.status === "failed_escalated" ||
    escalations.some((escalation) => escalation.status === "open")
  );
}

export type CounterRow = {
  summary: string;
  /** Short state word on the right of the closed row. */
  trailing: string;
  marker: "success" | "current" | "muted-lock" | "muted";
};

/**
 * What the closed "Counter check" row says. Written for Operations: the
 * outcome once custody moved, the wait while a rider is there, the ask when
 * the rider is blocked.
 */
export function counterRow(
  order: Pick<Order, "state" | "pickupChecklist" | "pickupCountItems" | "title">,
  escalations: readonly Escalation[],
  formatWhen: (iso: string) => string,
): CounterRow {
  const checklist = order.pickupChecklist;
  const step = counterStep(order);
  const lines = countLines(
    checklist?.counts,
    order.pickupCountItems,
    order.title || "This order",
  );

  if (counterBlocked(order, escalations)) {
    return {
      summary: `Blocked: ${failureHeadline(checklist?.checks, lines)}. The rider is waiting for you.`,
      trailing: "Your call",
      marker: "current",
    };
  }
  if (checklist?.status === "escalation_resolved") {
    return {
      summary: "Instruction sent. Waiting for the rider to check and count again.",
      trailing: "Rechecking",
      marker: "current",
    };
  }
  if (checklist?.status === "passed") {
    const when = checklist.completedAt ? ` ${formatWhen(checklist.completedAt)}` : "";
    const retries =
      escalations.length === 0
        ? ""
        : escalations.length === 1
          ? " One earlier attempt failed."
          : ` ${escalations.length} earlier attempts failed.`;
    return {
      summary:
        (checklist.counts
          ? `All six checks passed and every line counted right,${when}.`
          : `All six checks passed${when}. The count was not recorded.`) + retries,
      trailing: "Done",
      marker: "success",
    };
  }
  if (step === "done") {
    return {
      summary: "No counter check on record.",
      trailing: "Not recorded",
      marker: "muted",
    };
  }
  if (step === "current") {
    return {
      summary:
        order.pickupCountItems === null
          ? "Nothing to count against. Review the order's quantities before the rider arrives."
          : "Rider on the way. They check and count everything at the shop.",
      trailing: "At the counter",
      marker: "current",
    };
  }
  return {
    summary: "Happens at the shop when a rider collects.",
    trailing: "Locked",
    marker: "muted-lock",
  };
}
