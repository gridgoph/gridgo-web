/**
 * The shop's receipt scan before a rider is called (issue report 5B6DA444,
 * gridgo-supplier#64; contract `gridgo-api/docs/SHOP_RECEIPT_SCAN_API.md`).
 *
 * The shop scans or uploads its own invoice or receipt for the order and
 * attaches it, so Operations sees it at once instead of waiting for the
 * monthly paper collection. It is the shop's incoming document: nothing here
 * names, numbers or presents a receipt GRIDGO issues.
 *
 * The Finance switch `settings.shopReceiptScanRequired` (off by default) makes
 * the scan a gate on "Ready for rider pickup". Operations and Super Admin read
 * each order's scans from `order.receiptScan`; the gate itself shows on
 * `transitionReadiness.ready_for_dispatch.receiptScan`. Operations' forced step
 * can still move a job on, and records the missing scan as skipped.
 *
 * Pure functions: no React, no fetch.
 */

import type { ForcedStep, Order, OrderReceiptScan, PlatformSettings } from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import type { ProductionCorrection } from "@/lib/production-progress";

/** The check code the API names for a missing scan, in `missing` and `skippedChecks`. */
export const RECEIPT_SCAN_CHECK = "receipt_scan_required";

/** The one plain line on what the switch does to shops. */
export const RECEIPT_SCAN_SWITCH_HELP =
  "When on, a shop cannot call a rider for an order until it has scanned or uploaded its receipt for that order.";

/** The switch's state, or null on an API that does not have it. */
export function receiptScanSwitch(
  settings: Pick<PlatformSettings, "shopReceiptScanRequired"> | null | undefined,
): boolean | null {
  const value = settings?.shopReceiptScanRequired;
  return typeof value === "boolean" ? value : null;
}

/** The audit reason sent with a change of the switch. */
export function receiptScanSwitchReason(next: boolean, why: string): string {
  return `Finance: receipt scan before calling a rider turned ${next ? "on" : "off"}. ${why.trim()}`;
}

/** The order's scans, cleaned, or null when the API did not send them. */
export function receiptScanOf(
  order: Partial<Pick<Order, "receiptScan">>,
): OrderReceiptScan | null {
  const raw = order.receiptScan;
  if (!raw || typeof raw !== "object") return null;
  const fileIds = Array.isArray(raw.fileIds)
    ? raw.fileIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const latestFileId =
    typeof raw.latestFileId === "string" && raw.latestFileId
      ? raw.latestFileId
      : (fileIds.at(-1) ?? null);
  return {
    attached: raw.attached === true && latestFileId !== null,
    fileIds,
    latestFileId,
    latestUploadedAt:
      typeof raw.latestUploadedAt === "string" && raw.latestUploadedAt
        ? raw.latestUploadedAt
        : null,
  };
}

/** Earlier scans, newest first, without the latest one. */
export function earlierReceiptScans(scan: OrderReceiptScan): string[] {
  return scan.fileIds.filter((id) => id !== scan.latestFileId).reverse();
}

/** States where the shop is making the job and is the one to call a rider. */
const BEFORE_RIDER = new Set(["production", "supplier_self_qc"]);

/** From production on: the shop has the job, so a scan can be on it. */
const WITH_A_SHOP = new Set([
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "awaiting_collection",
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
]);

type GateOrder = Pick<Order, "state"> &
  Partial<Pick<Order, "receiptScan" | "transitionReadiness">>;

/**
 * True when the switch is on and this job cannot be marked ready for rider
 * pickup until the shop attaches its scan. Read from the API's own preflight,
 * so it follows the switch as of this read.
 */
export function receiptScanHoldsDispatch(order: GateOrder): boolean {
  if (!BEFORE_RIDER.has(order.state)) return false;
  const gate = order.transitionReadiness?.ready_for_dispatch?.receiptScan;
  if (!gate || gate.required !== true || gate.attached === true) return false;
  return receiptScanOf(order)?.attached !== true;
}

type SkipSource = Partial<Pick<Order, "forcedSteps">>;

/** The forced step or correction that moved the job on without its scan, if any. */
export function receiptScanSkippedAt(
  order: SkipSource,
  corrections: readonly ProductionCorrection[] = [],
): string | null {
  const steps: ForcedStep[] = Array.isArray(order.forcedSteps) ? order.forcedSteps : [];
  const times = [
    ...steps
      .filter((step) => step?.skippedChecks?.includes(RECEIPT_SCAN_CHECK))
      .map((step) => step.at),
    ...corrections
      .filter(
        (entry) =>
          entry.receiptScanMissing === true || entry.skippedChecks.includes(RECEIPT_SCAN_CHECK),
      )
      .map((entry) => entry.at),
  ].filter((at): at is string => typeof at === "string" && at.length > 0);
  if (!times.length) return null;
  return times.sort().at(-1) ?? null;
}

/** Whether the workspace shows the Receipt scan row for this order. */
export function receiptScanRowVisible(
  order: GateOrder & SkipSource,
  corrections: readonly ProductionCorrection[] = [],
): boolean {
  const scan = receiptScanOf(order);
  if (scan?.attached || scan?.fileIds.length) return true;
  if (receiptScanSkippedAt(order, corrections)) return true;
  // An older API sends no scans at all; nothing to say there.
  return scan !== null && WITH_A_SHOP.has(order.state);
}

export type ReceiptScanRowState = "attached" | "holding" | "skipped" | "missing";

/** The row's one state, most pressing first after an attached scan. */
export function receiptScanRowState(
  order: GateOrder & SkipSource,
  corrections: readonly ProductionCorrection[] = [],
): ReceiptScanRowState {
  if (receiptScanOf(order)?.attached) return "attached";
  if (receiptScanHoldsDispatch(order)) return "holding";
  if (receiptScanSkippedAt(order, corrections)) return "skipped";
  return "missing";
}

/** The collapsed row's one line. */
export function receiptScanSummary(
  state: ReceiptScanRowState,
  scan: OrderReceiptScan | null,
  formatWhen: (iso: string) => string,
): string {
  switch (state) {
    case "attached": {
      const count = scan?.fileIds.length ?? 1;
      const when = scan?.latestUploadedAt ? `, sent ${formatWhen(scan.latestUploadedAt)}` : "";
      return count > 1 ? `Attached${when}. ${count} scans on the order.` : `Attached${when}.`;
    }
    case "holding":
      return "Missing. The shop cannot call a rider until it sends one.";
    case "skipped":
      return "Skipped. GRIDGO moved the job on without one.";
    default:
      return "Not sent.";
  }
}

export type ReceiptScanMarkSpec = {
  tone: StatusTone;
  icon: StatusIconName;
  label: string;
};

/**
 * The order list's small marker, or null before a shop has the job (nothing
 * is owed yet) and on an API without scans.
 */
export function receiptScanMark(order: GateOrder): ReceiptScanMarkSpec | null {
  const scan = receiptScanOf(order);
  if (!scan) return null;
  if (scan.attached) return { tone: "success", icon: "circle-check", label: "Attached" };
  if (!WITH_A_SHOP.has(order.state)) return null;
  if (receiptScanHoldsDispatch(order)) {
    return { tone: "warning", icon: "triangle-alert", label: "Missing" };
  }
  return { tone: "neutral", icon: "circle-dashed", label: "Missing" };
}

/** Sort and filter value for the list marker column. */
export function receiptScanMarkValue(order: GateOrder): string {
  return receiptScanMark(order)?.label ?? "";
}
