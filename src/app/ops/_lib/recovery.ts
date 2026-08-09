/**
 * Quality recovery: exception paths with a next action on every row.
 */

import type { Claim, Issue, Order } from "@/lib/api/types";
import { claimBlocksPayout } from "@/lib/api/constraints";
import { primaryOpsAction } from "@/lib/ops-actions";
import { presentOrderState } from "@/lib/order-state";

export type RecoveryKind =
  | "client_correction"
  | "open_issue"
  | "payout_hold"
  | "failed_path"
  | "issue_window"
  | "stalled_assignment";

export type RecoveryItem = {
  id: string;
  kind: RecoveryKind;
  orderId: string;
  orderTitle: string;
  orderState: string;
  summary: string;
  nextLabel: string;
  nextHref: string;
  /** When the next step is a claim action surface. */
  claimId?: string;
  issueId?: string;
  updatedAt: string;
};

const FAILED_PATH_STATES = new Set([
  "client_correction",
  // Defensive: if API ever surfaces these explicit failures
  "delivery_failed",
  "supplier_declined",
  "cancelled",
  "failed_qc",
]);

const STALL_STATES = new Set(["supplier_assigned"]);

export function buildRecoveryItems(
  orders: Order[],
  claims: Claim[],
  issues: Issue[],
): RecoveryItem[] {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const items: RecoveryItem[] = [];
  const seen = new Set<string>();

  function push(item: RecoveryItem) {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  }

  for (const issue of issues) {
    if (issue.status !== "open") continue;
    const order = byId.get(issue.orderId);
    push({
      id: `issue:${issue.id}`,
      kind: "open_issue",
      orderId: issue.orderId,
      orderTitle: order?.title ?? issue.orderId,
      orderState: order?.state ?? "",
      summary: issue.description,
      nextLabel: "Resolve issue",
      nextHref: "/ops/recovery",
      issueId: issue.id,
      claimId: issue.claimId ?? undefined,
      updatedAt: issue.updatedAt || issue.createdAt,
    });
  }

  for (const claim of claims) {
    if (!claimBlocksPayout(claim.status)) continue;
    const order = byId.get(claim.orderId);
    push({
      id: `claim:${claim.id}`,
      kind: "payout_hold",
      orderId: claim.orderId,
      orderTitle: order?.title ?? claim.orderId,
      orderState: order?.state ?? "",
      summary: claim.holdReason || claim.reason,
      nextLabel:
        claim.status === "open" ? "Hold or release payout" : "Release hold",
      nextHref: "/ops/claims",
      claimId: claim.id,
      updatedAt: claim.updatedAt || claim.createdAt,
    });
  }

  for (const order of orders) {
    if (order.state === "client_correction") {
      push({
        id: `order:${order.id}:correction`,
        kind: "client_correction",
        orderId: order.id,
        orderTitle: order.title,
        orderState: order.state,
        summary:
          "Waiting on the client to correct artwork or specs before QA can continue.",
        nextLabel: "Open workspace",
        nextHref: `/ops/qa/${order.id}`,
        updatedAt: order.updatedAt,
      });
    }

    if (FAILED_PATH_STATES.has(order.state) && order.state !== "client_correction") {
      const action = primaryOpsAction(order.state);
      push({
        id: `order:${order.id}:failed`,
        kind: "failed_path",
        orderId: order.id,
        orderTitle: order.title,
        orderState: order.state,
        summary: presentOrderState(order.state).label,
        nextLabel: action?.label ?? "Open workspace",
        nextHref: `/ops/qa/${order.id}`,
        updatedAt: order.updatedAt,
      });
    }

    if (order.state === "issue_window_open") {
      const held = order.payoutHold || claims.some(
        (c) => c.orderId === order.id && claimBlocksPayout(c.status),
      );
      push({
        id: `order:${order.id}:window`,
        kind: "issue_window",
        orderId: order.id,
        orderTitle: order.title,
        orderState: order.state,
        summary: held
          ? "Issue window open with an active payout hold — release the hold before closing payout."
          : "Issue window open — close as completed when the client has no open issue.",
        nextLabel: held ? "Review claim" : "Close as completed",
        nextHref: held ? "/ops/claims" : `/ops/qa/${order.id}`,
        updatedAt: order.updatedAt,
      });
    }

    if (STALL_STATES.has(order.state)) {
      push({
        id: `order:${order.id}:stall`,
        kind: "stalled_assignment",
        orderId: order.id,
        orderTitle: order.title,
        orderState: order.state,
        summary:
          "Supplier has not accepted yet. Follow up or reassign from the workspace.",
        nextLabel: "Open workspace",
        nextHref: `/ops/qa/${order.id}`,
        updatedAt: order.updatedAt,
      });
    }
  }

  return items.sort((a, b) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || ""),
  );
}

export function presentRecoveryKind(kind: RecoveryKind): string {
  switch (kind) {
    case "client_correction":
      return "Client correction";
    case "open_issue":
      return "Open issue";
    case "payout_hold":
      return "Payout hold";
    case "failed_path":
      return "Failed path";
    case "issue_window":
      return "Issue window";
    case "stalled_assignment":
      return "Awaiting supplier";
    default:
      return "Recovery";
  }
}
