/**
 * Moving an order to another shop, and what the move costs
 * (gridgo-api#225, SHOP_RECOVERY_API.md "Substitute-shop price rule").
 *
 * - Operations opens a move for a late shop, for a reason on GRIDGO's side, or
 *   because the client asked (`POST /orders/:id/shop-recovery/start`). The shop's
 *   own timeouts, declines and cancellations open one on their own.
 * - When the shop or GRIDGO caused it, a cheaper substitute returns the
 *   difference to the client, and a dearer one is covered by GRIDGO from its
 *   service fee up to `shopMoveCoverBps` of the original fee. Above that, the
 *   client pays the rest, picks another offered shop, or takes a full refund.
 * - A client-caused move keeps the old rule: same price or cheaper, the new
 *   shop paid the original price, no cover.
 *
 * Every figure comes from the API's snapshot on the offer or the move; nothing
 * here prices anything. Pure: no React, no fetch.
 */

import type {
  Order,
  ShopFailureKind,
  ShopMove,
  ShopMovePricing,
  ShopRecovery,
  ShopRecoveryCause,
} from "@/lib/api/types";
import { formatRatePercent } from "@/components/settings/service-fee";
import { formatPhp } from "@/lib/format";
import { signedPhp } from "@/lib/delivery-pin";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

type Presentation = { label: string; tone: StatusTone; icon: StatusIconName };

/** The API's default cover: 50% of the original service fee. */
export const SHOP_MOVE_COVER_DEFAULT_BPS = 5_000;

/** The audited reason Operations writes when it starts a move. */
export const SHOP_MOVE_REASON_MAX = 2000;

// ---------------------------------------------------------------------------
// Starting a move
// ---------------------------------------------------------------------------

export const SHOP_MOVE_CAUSES: readonly {
  cause: ShopRecoveryCause;
  label: string;
  help: string;
}[] = [
  {
    cause: "late",
    label: "The shop is late",
    help: "Only once its ready-by has passed or the job is marked for reassignment. GRIDGO covers a dearer shop.",
  },
  {
    cause: "gridgo",
    label: "GRIDGO is moving it",
    help: "A reason on GRIDGO's side. GRIDGO covers a dearer shop.",
  },
  {
    cause: "client",
    label: "The client asked",
    help: "The old rule: the new shop costs the same or less and gets the original price. No cover, no refund.",
  },
];

/** Where an assigned shop can still be swapped (the API's cancellable shop states). */
const MOVABLE_STATES = new Set([
  "supplier_assigned",
  "awaiting_checkout",
  "awaiting_initial_payment",
  "payment_authorized",
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
]);

/** Lateness is a production-stage reason only. */
const LATE_STATES = new Set(["payment_authorized", "production", "supplier_self_qc"]);

type MoveOrder = Pick<Order, "state" | "supplierId"> &
  Partial<
    Pick<
      Order,
      | "shopRecovery"
      | "rescheduleRequest"
      | "refundHold"
      | "readyBy"
      | "productionReassignmentEligible"
    >
  >;

/**
 * Whether Operations can open a move now. The API has the final word; this
 * only keeps the button off orders it would certainly refuse.
 */
export function canStartShopMove(order: MoveOrder): boolean {
  if (!order.supplierId || !MOVABLE_STATES.has(order.state)) return false;
  const recovery = order.shopRecovery;
  if (recovery && recovery.status !== "accepted") return false;
  if (order.rescheduleRequest?.workHeld) return false;
  if (order.refundHold) return false;
  return true;
}

/** Whether "the shop is late" can be the cause (`409 shop_late_not_eligible` otherwise). */
export function lateCauseAvailable(order: MoveOrder, nowMs: number = Date.now()): boolean {
  if (!LATE_STATES.has(order.state)) return false;
  if (order.productionReassignmentEligible === true) return true;
  const readyBy = order.readyBy ? Date.parse(order.readyBy) : Number.NaN;
  return Number.isFinite(readyBy) && readyBy < nowMs;
}

// ---------------------------------------------------------------------------
// Why it moved
// ---------------------------------------------------------------------------

/** The cause in a few words, for a fact row or a log line. */
export function presentMoveCause(kind: ShopFailureKind | string | null | undefined): string | null {
  switch (kind) {
    case "late":
      return "The shop was late";
    case "gridgo":
      return "Moved by GRIDGO";
    case "client":
      return "The client asked";
    case "timed_out":
      return "The shop did not answer in time";
    case "declined":
      return "The shop declined";
    case "cancelled":
      return "The shop cancelled";
    default:
      return null;
  }
}

/** Whether a recovery was opened by Operations rather than by the shop. */
export function startedByOperations(kind: ShopFailureKind | string | null | undefined): boolean {
  return kind === "late" || kind === "gridgo" || kind === "client";
}

// ---------------------------------------------------------------------------
// The price rule
// ---------------------------------------------------------------------------

/**
 * One sentence for what the offer or move does with the difference. An offer
 * above the cover lists the client's three choices; a move already made says
 * what the client pays.
 */
export function priceRuleLine(pricing: ShopMovePricing, made = false): string {
  if (!pricing.ruleApplies) {
    return "Client-caused: no cover and no refund. The new shop gets the original price.";
  }
  const difference = Math.abs(pricing.differenceMinor);
  switch (pricing.rule) {
    case "cheaper":
      return `Cheaper by ${formatPhp(difference)}. The client gets ${formatPhp(pricing.refundMinor)} back.`;
    case "same":
      return "Same price. Nothing to settle.";
    case "covered":
      return `Dearer by ${formatPhp(difference)}. GRIDGO covers all of it from its fee.`;
    case "above_cap":
      if (made) {
        return `Dearer by ${formatPhp(difference)}. GRIDGO covers ${formatPhp(pricing.gridgoCoverMinor)}; the client pays the remaining ${formatPhp(pricing.clientPaysMinor)}.`;
      }
      return `Dearer by ${formatPhp(difference)}. GRIDGO covers ${formatPhp(pricing.gridgoCoverMinor)}; the client pays ${formatPhp(pricing.clientPaysMinor)}, picks another shop, or takes a full refund.`;
    default:
      return `New price ${formatPhp(pricing.newPriceMinor)}.`;
  }
}

export type PriceFact = { term: string; value: string };

/** The figures behind the rule, leaving out the ones that are zero. */
export function priceFacts(pricing: ShopMovePricing): PriceFact[] {
  const facts: PriceFact[] = [
    { term: "Original price", value: formatPhp(pricing.originalPriceMinor) },
    { term: "New price", value: formatPhp(pricing.newPriceMinor) },
  ];
  if (pricing.ruleApplies && pricing.differenceMinor !== 0) {
    facts.push({ term: "Difference", value: signedPhp(pricing.differenceMinor) });
  }
  if (pricing.gridgoCoverMinor > 0) {
    facts.push({ term: "GRIDGO covers", value: formatPhp(pricing.gridgoCoverMinor) });
  }
  if (pricing.clientPaysMinor > 0) {
    facts.push({ term: "Client pays the rest", value: formatPhp(pricing.clientPaysMinor) });
  }
  if (pricing.refundMinor > 0) {
    facts.push({ term: "Back to the client", value: formatPhp(pricing.refundMinor) });
  }
  return facts;
}

/**
 * GRIDGO's limit on this order, from the snapshot. Null for a client-caused
 * move or an API that leaves the cap out.
 */
export function coverCapLine(pricing: ShopMovePricing): string | null {
  if (!pricing.ruleApplies || pricing.capMinor == null) return null;
  const rate =
    pricing.capBps != null && pricing.serviceFeeMinor != null
      ? ` (${formatRatePercent(pricing.capBps)} of the ${formatPhp(pricing.serviceFeeMinor)} service fee)`
      : "";
  const collected = pricing.capLimitedByCollection
    ? ", lowered to the fee actually collected"
    : "";
  return `GRIDGO covers up to ${formatPhp(pricing.capMinor)}${rate}${collected}.`;
}

// ---------------------------------------------------------------------------
// Moves already made
// ---------------------------------------------------------------------------

export function presentMoveStatus(move: Pick<ShopMove, "status">): Presentation {
  switch (move.status) {
    case "awaiting_payment":
      return { label: "Waiting for the client's payment", tone: "warning", icon: "clock" };
    case "refund_requested":
      return { label: "Client chose a full refund", tone: "info", icon: "clock" };
    case "applied":
      return { label: "Moved", tone: "success", icon: "circle-check" };
    default:
      return { label: "Move recorded", tone: "neutral", icon: "circle-help" };
  }
}

/** What the client chose, in their words. */
export function moveChoiceLine(move: Pick<ShopMove, "choice" | "paysDifference">): string {
  const shop =
    move.choice === "alternative" ? "Picked another offered shop" : "Took the offered shop";
  return move.paysDifference ? `${shop} and pays the rest` : shop;
}

/** Where the difference owed to the client stands. Null when nothing is owed. */
export function moveRefundLine(move: ShopMove): string | null {
  const amount = move.refundMinor ?? move.pricing?.refundMinor ?? 0;
  if (!amount) return null;
  if (move.refundStatus === "reconciliation_required") {
    return `${formatPhp(amount)} is owed to the client but could not be set aside as a refund. Reconcile it by hand.`;
  }
  return `${formatPhp(amount)} goes back to the client through Refunds.`;
}

/** The newest move belongs to the current recovery when their ids match. */
export function currentMove(
  order: Pick<Order, "shopMoves" | "shopRecovery">,
): ShopMove | null {
  const id = order.shopRecovery?.id;
  return (order.shopMoves ?? []).find((move) => move.recoveryId === id) ?? null;
}

/** The client's top-up change request, while the recovery waits on it. */
export function awaitedTopUpId(recovery: ShopRecovery | null | undefined): string | null {
  return recovery?.status === "awaiting_payment" ? (recovery.topUp?.changeRequestId ?? null) : null;
}

// ---------------------------------------------------------------------------
// The money panel
// ---------------------------------------------------------------------------

export type ShopMoveMoney = {
  /** Signed: what the substitute's own price did to the shop's stages. */
  priceAdjustmentMinor: number | null;
  coverMinor: number | null;
  clientRefundMinor: number | null;
  clientTopUpMinor: number | null;
  /** GRIDGO's fee after the cover, from `platformRevenue`. */
  netServiceFeeMinor: number | null;
};

const num = (value: unknown): number | null => (typeof value === "number" ? value : null);

/**
 * The move's money lines, or null on an order that never moved (the API then
 * sends none of the four fields, and the panel stays as it was).
 */
export function shopMoveMoney(
  order: Partial<Pick<Order, "supplierSettlement" | "platformRevenue">>,
): ShopMoveMoney | null {
  const settlement = order.supplierSettlement;
  const revenue = order.platformRevenue;
  const money: ShopMoveMoney = {
    priceAdjustmentMinor: num(settlement?.shopMovePriceAdjustmentMinor),
    coverMinor: num(revenue?.shopMoveCoverMinor),
    clientRefundMinor: num(revenue?.shopMoveClientRefundMinor),
    clientTopUpMinor: num(revenue?.shopMoveClientTopUpMinor),
    netServiceFeeMinor: num(revenue?.netServiceFeeMinor),
  };
  const moved =
    money.priceAdjustmentMinor !== null ||
    money.coverMinor !== null ||
    money.clientRefundMinor !== null ||
    money.clientTopUpMinor !== null;
  return moved ? money : null;
}
