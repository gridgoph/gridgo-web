import type {
  Order,
  OrderChangeRequest,
  OrderChangeStatus,
  PayoutMilestone,
  ProductionItem,
} from "@/lib/api/types";
import { isApiError } from "@/lib/api/client";
import { formatPhp } from "@/lib/format";
import type { StatePresentation } from "@/lib/order-state";

/**
 * Special instructions and change requests (gridgo-api
 * `docs/ORDER_CHANGES_API.md`), for the shop's job and the GRIDGO Team's
 * order workspace.
 *
 * A client may write up to 300 characters under each item. GRIDGO masks
 * contact details before storing them, freezes them at checkout, and refuses
 * a shop's acceptance until it ticks that it read them
 * (`specialInstructionsRead: true`); the tick is kept with its time, and a
 * replacement shop ticks again. A note never changes the price.
 *
 * When a note costs more, the shop asks for a change: what it will do
 * differently, the extra for its own shop, and why. Nothing changes until the
 * client approves, and a priced change waits for the client's QR transfer and
 * the GRIDGO Team's check of it. Until then the job is made as ordered. One
 * request may be open at a time, and never beside an open deadline request.
 *
 * The shop's words mirror the shop app (gridgo-supplier `lib/orderChanges.ts`).
 * The shop never receives the client's total, GRIDGO's fee or the payment;
 * `extraPrincipalMinor` is the shop's own extra.
 */

/** GRIDGO's limits, so a refusal is said before anything is sent. */
export const PROPOSED_CHANGE_MAX = 300;
export const CHANGE_REASON_MAX = 2000;

const STATUSES: readonly OrderChangeStatus[] = [
  "pending",
  "pending_payment",
  "pending_confirmation",
  "applied",
  "declined",
  "closed",
];

/** Still waiting on the client or the GRIDGO Team; while one is, no other may be asked. */
const OPEN = new Set<string>(["pending", "pending_payment", "pending_confirmation"]);

/** States a change may be asked in, before the job is first marked ready. */
const WINDOW_STATES = new Set([
  "supplier_assigned",
  "supplier_accepted",
  "payment_authorized",
  "production",
  "supplier_self_qc",
]);
const PAST_READY = new Set([
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "delivered",
  "completed",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function minor(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** Every readable request on the order, oldest first, as GRIDGO keeps them. */
export function changeRequestsOf(
  order: Pick<Order, "changeRequests"> | null | undefined,
): OrderChangeRequest[] {
  const rows = order?.changeRequests;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (row): row is OrderChangeRequest =>
      Boolean(row) &&
      typeof row === "object" &&
      Boolean(text(row.id)) &&
      STATUSES.includes(row.status as OrderChangeStatus),
  );
}

export function isOpenChange(request: Pick<OrderChangeRequest, "status">): boolean {
  return OPEN.has(request.status);
}

/** The request the order is about now: the open one, else the latest. */
export function currentChangeRequest(
  order: Pick<Order, "changeRequests"> | null | undefined,
): OrderChangeRequest | null {
  const all = changeRequestsOf(order);
  return all.find(isOpenChange) ?? all.at(-1) ?? null;
}

/** True while a change request is waiting, which keeps a deadline request off the job. */
export function hasOpenChange(order: Pick<Order, "changeRequests">): boolean {
  return changeRequestsOf(order).some(isOpenChange);
}

// ---------------------------------------------------------------------------
// The notes
// ---------------------------------------------------------------------------

export type ItemInstructions = {
  /** Empty for an older order's single note. */
  lineItemId: string;
  itemName: string;
  text: string;
  /** The latest change the client agreed to for this item, if any. */
  agreedChange: string | null;
  agreedAt: string | null;
};

type InstructionsOrder = Pick<
  Order,
  "title" | "productionItems" | "specialInstructions" | "specialInstructionLines"
>;

/** One item's own note and agreed change. */
export function itemNote(
  item: Pick<ProductionItem, "specialInstructions" | "agreedChange">,
): { text: string; agreedChange: string | null; agreedAt: string | null } {
  return {
    text: text(item.specialInstructions),
    agreedChange: text(item.agreedChange?.proposedSpec) || null,
    agreedAt: text(item.agreedChange?.appliedAt) || null,
  };
}

/**
 * Each item's note, in the order's item order. A note GRIDGO sent only in
 * `specialInstructionLines` still counts, and an older order's single note
 * stands for the whole job.
 */
export function itemInstructions(order: InstructionsOrder): ItemInstructions[] {
  const items = Array.isArray(order.productionItems) ? order.productionItems : [];
  const fromLines = new Map(
    (Array.isArray(order.specialInstructionLines) ? order.specialInstructionLines : [])
      .filter((line) => line && typeof line === "object")
      .map((line) => [text(line.lineItemId), text(line.text)] as const),
  );
  const notes = items
    .map((item) => {
      const own = itemNote(item);
      return {
        lineItemId: item.id,
        itemName: text(item.itemName) || "Item",
        text: own.text || fromLines.get(item.id) || "",
        agreedChange: own.agreedChange,
        agreedAt: own.agreedAt,
      };
    })
    .filter((note) => note.text || note.agreedChange);
  // A line note whose item is not in the docket (an older projection) still shows.
  for (const [lineItemId, note] of fromLines) {
    if (note && !items.some((item) => item.id === lineItemId)) {
      notes.push({
        lineItemId,
        itemName: "Item",
        text: note,
        agreedChange: null,
        agreedAt: null,
      });
    }
  }
  const legacy = text(order.specialInstructions);
  if (!notes.length && legacy) {
    return [
      {
        lineItemId: "",
        itemName: order.title || "This job",
        text: legacy,
        agreedChange: null,
        agreedAt: null,
      },
    ];
  }
  return notes;
}

/** True when the order carries any note the shop must read. */
export function hasSpecialInstructions(order: InstructionsOrder): boolean {
  return itemInstructions(order).some((note) => note.text);
}

/**
 * When this shop ticked that it read the notes, or null. A tick from another
 * shop (the one the job was taken from) is not this shop's, and an offer has
 * no tick yet.
 */
export function instructionsReadAt(
  order: Pick<Order, "supplierId" | "state" | "specialInstructionsAcknowledgement">,
): string | null {
  const ack = order.specialInstructionsAcknowledgement;
  if (!ack || typeof ack !== "object" || order.state === "supplier_assigned") return null;
  if (ack.supplierId && order.supplierId && ack.supplierId !== order.supplierId) return null;
  return text(ack.at) || null;
}

/**
 * The tick as the GRIDGO Team reads it: when, and whether it was the shop on
 * the order now or one it was taken from.
 */
export function acknowledgementFor(
  order: Pick<Order, "supplierId" | "specialInstructionsAcknowledgement">,
): { at: string; supplierId: string | null; currentShop: boolean } | null {
  const ack = order.specialInstructionsAcknowledgement;
  const at = ack && typeof ack === "object" ? text(ack.at) : "";
  if (!at) return null;
  const supplierId = text(ack?.supplierId) || null;
  return {
    at,
    supplierId,
    currentShop: !supplierId || !order.supplierId || supplierId === order.supplierId,
  };
}

/** "Flyers", or "Item 2 · Flyers" when the order has several items. */
export function itemLabel(
  order: Pick<Order, "productionItems">,
  lineItemId: string | null | undefined,
): string | null {
  if (!lineItemId) return null;
  const items = Array.isArray(order.productionItems) ? order.productionItems : [];
  const index = items.findIndex((item) => item.id === lineItemId);
  if (index < 0) return null;
  const name = text(items[index].itemName) || "Item";
  return items.length > 1 ? `Item ${index + 1} · ${name}` : name;
}

// ---------------------------------------------------------------------------
// When a change may be asked for (the shop)
// ---------------------------------------------------------------------------

/**
 * From the offer until the job is first marked ready: the stretch in which
 * the notes sit in front of the work and a change may still be asked for.
 */
export function changeWindowOpen(order: Pick<Order, "state" | "timeline">): boolean {
  if (!WINDOW_STATES.has(order.state)) return false;
  return !(order.timeline ?? []).some((entry) => PAST_READY.has(entry.state));
}

/** Whether "Request a change" belongs on this job right now. */
export function canRequestChange(
  order: Pick<
    Order,
    | "state"
    | "timeline"
    | "changeRequests"
    | "rescheduleRequest"
    | "shopRecovery"
    | "refundHold"
    | "refundDisposition"
  >,
): boolean {
  if (!changeWindowOpen(order)) return false;
  if (hasOpenChange(order)) return false;
  if (order.rescheduleRequest?.status === "pending") return false;
  if (order.shopRecovery && order.shopRecovery.status !== "accepted") return false;
  return !order.refundHold && !order.refundDisposition;
}

export function proposedChangeError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Say what you will do differently.";
  if ([...trimmed].length > PROPOSED_CHANGE_MAX) {
    return `Keep the change under ${PROPOSED_CHANGE_MAX} characters.`;
  }
  return null;
}

export function changeReasonError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Tell the client why the job needs this change.";
  if ([...trimmed].length > CHANGE_REASON_MAX) return "Keep the reason under 2,000 characters.";
  return null;
}

/**
 * The extra as typed, in centavos. Empty means no extra; anything else must
 * be a peso amount with at most two decimals.
 */
export function parseExtra(value: string): { ok: true; minor: number } | { ok: false; error: string } {
  const cleaned = value.replace(/[₱,\s]/g, "");
  if (!cleaned) return { ok: true, minor: 0 };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, error: "Enter the extra in pesos, like 150 or 150.50." };
  }
  const [whole, cents = ""] = cleaned.split(".");
  const amount = Number(whole) * 100 + Number(cents.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount)) return { ok: false, error: "That amount is too large." };
  return { ok: true, minor: amount };
}

// ---------------------------------------------------------------------------
// Where a request stands, in the shop's words
// ---------------------------------------------------------------------------

export type ShopChangeNotice = {
  chip: StatePresentation;
  title: string;
  body: string;
  /** What the extra means for the shop's money, when there is one. */
  money: string | null;
};

function shopExtraLine(request: OrderChangeRequest): string | null {
  const extraMinor = minor(request.extraPrincipalMinor);
  if (!extraMinor) return null;
  const extra = formatPhp(extraMinor);
  switch (request.status) {
    case "pending":
    case "pending_payment":
    case "pending_confirmation":
      return `${extra} extra for your shop if the client pays for the change.`;
    case "applied":
      if (request.payout?.status === "released") {
        return `${extra} extra was released with your last payout part.`;
      }
      if (request.payout?.status === "superseded") {
        return `${extra} extra was replaced by the refund settlement.`;
      }
      return `${extra} extra for your shop, paid with your last payout part.`;
    default:
      return `${extra} extra was not agreed. Nothing changes in what you are paid.`;
  }
}

/** Where a request stands, as the shop reads it on its job. */
export function shopChangeNotice(request: OrderChangeRequest): ShopChangeNotice {
  const money = shopExtraLine(request);
  switch (request.status) {
    case "pending":
      return {
        chip: { label: "Waiting for the client", tone: "info", icon: "clock" },
        title: "You asked for a change",
        body: "The client approves or declines it. Until they approve, make the job as ordered.",
        money,
      };
    case "pending_payment":
      return {
        chip: { label: "Approved, waiting for payment", tone: "info", icon: "clock" },
        title: "The client approved the change",
        body: "They still have to pay for it. Keep making the job as ordered until GRIDGO confirms their payment.",
        money,
      };
    case "pending_confirmation":
      return {
        chip: { label: "Payment being checked", tone: "info", icon: "clock" },
        title: "The client paid for the change",
        body: "GRIDGO is checking the payment. Keep making the job as ordered until it is confirmed.",
        money,
      };
    case "applied":
      return {
        chip: { label: "Approved", tone: "success", icon: "circle-check" },
        title: "The change is agreed",
        body: "Make the job with this change. It is now part of what you agreed to make.",
        money,
      };
    case "declined":
      return {
        chip: { label: "Declined", tone: "warning", icon: "circle-x" },
        title: "The client declined the change",
        body: "Keep making the job as ordered. If you cannot, contact the GRIDGO Team.",
        money,
      };
    default:
      return {
        chip: { label: "Closed", tone: "neutral", icon: "circle-x" },
        title: "This request closed without a change",
        body: "The job moved on before it was settled. Make it as ordered.",
        money,
      };
  }
}

// ---------------------------------------------------------------------------
// Where a request stands, for the GRIDGO Team
// ---------------------------------------------------------------------------

/** The chip on the order workspace. Only a submitted transfer is the team's to decide. */
export function presentChangeForStaff(
  request: Pick<OrderChangeRequest, "status" | "totalMinor">,
): StatePresentation {
  switch (request.status) {
    case "pending":
      return { label: "Waiting for the client", tone: "info", icon: "clock" };
    case "pending_payment":
      return { label: "Approved, waiting for payment", tone: "info", icon: "clock" };
    case "pending_confirmation":
      return { label: "Payment to check", tone: "warning", icon: "triangle-alert" };
    case "applied":
      return { label: "Agreed", tone: "success", icon: "circle-check" };
    case "declined":
      return { label: "Declined by the client", tone: "neutral", icon: "circle-x" };
    default:
      return { label: "Closed", tone: "neutral", icon: "circle-x" };
  }
}

/** One sentence under the chip: what is happening and what still applies. */
export function staffChangeLine(request: OrderChangeRequest): string {
  switch (request.status) {
    case "pending":
      return "The client approves or declines it. The shop makes the job as ordered meanwhile.";
    case "pending_payment":
      return request.rejectionReason
        ? "The client's last transfer was rejected. They can send a new screenshot; the job is made as ordered meanwhile."
        : "The client approved it and still has to pay. Approval is not payment: the job is made as ordered meanwhile.";
    case "pending_confirmation":
      return "The client sent the transfer. Verify the exact amount or reject it; the change applies only once verified.";
    case "applied":
      return "Part of what the shop agreed to make.";
    case "declined":
      return "The original order stands.";
    default:
      return request.closureReason
        ? `${request.closureReason}`
        : "Closed before it was settled. The original order stands.";
  }
}

/** A client's transfer for a change is waiting on the GRIDGO Team. */
export function changePaymentAwaitingStaff(
  order: Pick<Order, "changeRequests"> | null | undefined,
): boolean {
  return changeRequestsOf(order).some((request) => request.status === "pending_confirmation");
}

/** The row's summary on the workspace. */
export function instructionsRowSummary(order: Order): string {
  const notes = itemInstructions(order).filter((note) => note.text).length;
  const requests = changeRequestsOf(order);
  const current = currentChangeRequest(order);
  const parts: string[] = [];
  if (notes) parts.push(notes === 1 ? "1 note" : `${notes} notes`);
  if (notes) {
    const ack = acknowledgementFor(order);
    parts.push(ack?.currentShop ? "ticked by the shop" : "not ticked yet");
  }
  if (current) {
    parts.push(
      `${requests.length === 1 ? "change request" : `${requests.length} change requests`}: ${presentChangeForStaff(current).label.toLowerCase()}`,
    );
  }
  return parts.join(", ") || "No notes";
}

/** Whether the workspace shows the row at all. */
export function instructionsRowVisible(order: Order): boolean {
  return itemInstructions(order).length > 0 || changeRequestsOf(order).length > 0;
}

// ---------------------------------------------------------------------------
// The shop's extra on the final payout stage
// ---------------------------------------------------------------------------

/** The final stage, which carries every paid change's extra. */
export function finalPayoutStageCode(order: Pick<Order, "payoutPlanVersion">): string {
  return order.payoutPlanVersion === 2 ? "issue_window" : "retention";
}

/** Paid extras not yet released to the shop, in centavos. */
export function pendingChangeExtrasMinor(order: Pick<Order, "changeRequests">): number {
  return changeRequestsOf(order).reduce(
    (sum, request) =>
      request.status === "applied" && request.payout?.status === "pending"
        ? sum + minor(request.payout.amountMinor ?? request.extraPrincipalMinor)
        : sum,
    0,
  );
}

/**
 * What releasing this stage also pays: the unreleased change extras when the
 * stage is the final one, else zero. A non-zero answer means the release must
 * carry the combined `amountMinor`, a reference and the receipt.
 */
export function changeExtrasOnStage(
  order: Pick<Order, "payoutPlanVersion" | "changeRequests">,
  milestone: Pick<PayoutMilestone, "code">,
): number {
  if (milestone.code !== finalPayoutStageCode(order)) return 0;
  return pendingChangeExtrasMinor(order);
}

// ---------------------------------------------------------------------------
// Declining an offer
// ---------------------------------------------------------------------------

export type DeclineReasonId =
  | "capacity_full"
  | "outside_capability"
  | "deadline_unachievable"
  | "spec_not_printable"
  | "price_too_low"
  | "shop_closed"
  | "special_instructions";

/**
 * Why a shop declines, as a fixed choice: the GRIDGO Team needs to know, so
 * it is never an empty free-text box. The same list as the shop app.
 */
export const DECLINE_REASONS: readonly { id: DeclineReasonId; label: string; reason: string }[] = [
  {
    id: "capacity_full",
    label: "Capacity is full for this date",
    reason: "Declined — shop capacity is full for the requested date",
  },
  {
    id: "outside_capability",
    label: "Material or size is outside what we print",
    reason: "Declined — material or size is outside this shop's capability",
  },
  {
    id: "deadline_unachievable",
    label: "We cannot finish by the deadline",
    reason: "Declined — deadline cannot be met",
  },
  {
    id: "spec_not_printable",
    label: "Artwork or spec is not printable as supplied",
    reason: "Declined — artwork or spec is not printable as supplied",
  },
  {
    id: "price_too_low",
    label: "Price does not cover this job",
    reason: "Declined — quoted price does not cover this job",
  },
  {
    id: "shop_closed",
    label: "Shop is closed on that date",
    reason: "Declined — shop is closed on the requested date",
  },
  {
    id: "special_instructions",
    label: "The special instructions are not possible",
    // GRIDGO's own wording for this reason (docs/ORDER_CHANGES_API.md).
    reason: "Special instructions not possible",
  },
];

/** The reason GRIDGO records, with the shop's own words after it when given. */
export function declineReasonText(id: DeclineReasonId, detail: string): string {
  const base = DECLINE_REASONS.find((reason) => reason.id === id)?.reason ?? "Declined by the shop";
  const trimmed = detail.trim();
  return trimmed ? `${base}. ${trimmed}`.slice(0, CHANGE_REASON_MAX) : base;
}

// ---------------------------------------------------------------------------
// Refusals, in the shop's words
// ---------------------------------------------------------------------------

const SHOP_ERRORS: Record<string, string> = {
  special_instructions_acknowledgement_required:
    "Read the special instructions and tick that you read them, then accept.",
  change_request_already_open:
    "This job already has a change request waiting. Where it stands is on the job.",
  reschedule_request_pending:
    "This job has a deadline request waiting. Ask for a change once the client has answered it.",
  change_request_window_closed:
    "A change can only be asked for before the job is marked ready. Refresh the job to see where it stands.",
  change_request_requires_committed_order:
    "This job is not paid for yet, so a change cannot be asked for. Refresh the job and try again.",
  change_request_multi_shop_legacy:
    "This job is shared with another shop, so the GRIDGO Team handles changes to it.",
  change_request_limit:
    "This job has had as many change requests as GRIDGO keeps. Contact the GRIDGO Team.",
  change_terms_required: "Say what you will do differently.",
  invalid_change_request: "Say what you will do differently and why, in the space given.",
  invalid_special_instructions: "Keep the change under 300 characters.",
  invalid_change_line: "That item is no longer on this job. Refresh the job and pick it again.",
  invalid_change_amount: "Enter the extra as an amount in pesos, or leave it empty for no extra.",
  change_request_idempotency_conflict:
    "This request was already sent with different details. Refresh the job and check it.",
  change_deadline_operations_required:
    "A late-production deduction already applies to this job, so the GRIDGO Team handles changes to it.",
  refund_fulfillment_stopped:
    "This job is stopped by a refund, so a change cannot be asked for.",
  decline_not_available: "This job is no longer an offer, so it cannot be declined. Refresh to see where it stands.",
  shop_cancel_reason_required: "Choose why you are declining, then try again.",
  shop_acceptance_expired:
    "The hour to answer this offer has passed, so it went back to GRIDGO.",
  reschedule_fulfillment_stopped:
    "The client declined your new deadline, so this job is paused while the GRIDGO Team sorts out the next step.",
  shop_recovery_pending: "The GRIDGO Team is already finding another shop for this job.",
};

/** A change, accept or decline refusal in the shop's words, or null when it is not one of these. */
export function shopChangeErrorMessage(err: unknown): string | null {
  if (!isApiError(err)) return null;
  return SHOP_ERRORS[err.code] ?? null;
}
