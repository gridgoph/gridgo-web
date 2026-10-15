/**
 * The production-finished delivery pin, as Operations reads it.
 *
 * Contract: gridgo-api `docs/DELIVERY_PIN_API.md` (report 6C8DE953). When the
 * shop finishes a door-delivery order the client is asked "Will you be at this
 * pin?". They may say yes (with notes and a receiver), change the pin once
 * before the first rider assignment, or say nothing, in which case the rider
 * uses the checkout pin with a "not confirmed" badge.
 *
 * Three things are easy to say wrongly here, and every word on the dashboard
 * goes through this module so none of them is:
 *
 * - **Confirming is not changing.** A confirmation attests presence; it does
 *   not use the one change, deliver anything or move money.
 * - **A dearer pin is a proposal until Operations verifies the transfer.** The
 *   original pin stays in use. A *submitted* transfer holds dispatch; an
 *   unpaid proposal does not.
 * - **A cheaper pin is a credit, never a cancellation.** The difference is
 *   reserved at once as a `delivery_pin` refund request and paid by hand
 *   through the refund case (destination, review, reserve, record). It is
 *   never settled, rejected or withdrawn, and it holds nothing.
 *
 * There is no service-area limit beyond Out of Zone: never invent one.
 */

import type {
  DeliveryCreditSnapshot,
  DeliveryPin,
  DeliveryPinChange,
  MapPoint,
  Order,
  RefundRequest,
  RefundSettlement,
} from "@/lib/api/types";
import { DELIVERY_ZONES, km } from "@/lib/delivery-zones";
import { formatDateTime, formatPhp } from "@/lib/format";
import type { StatePresentation } from "@/lib/order-state";
import { presentRefundState } from "@/lib/refunds";

/** The rider-assignment states: once an order reaches one, the pin cannot change. */
const DISPATCHED_STATES = new Set([
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
]);

/** The pin record, or null on a pick-up order, a legacy trip or an older API. */
export function deliveryPinOf(
  order: Pick<Order, "deliveryPin"> | null | undefined,
): DeliveryPin | null {
  return order?.deliveryPin ?? null;
}

export function pinChangeOf(
  order: Pick<Order, "deliveryPin"> | null | undefined,
): DeliveryPinChange | null {
  return deliveryPinOf(order)?.change ?? null;
}

/** The change that moved the pin, once applied. */
export function appliedPinChange(
  order: Pick<Order, "deliveryPin"> | null | undefined,
): DeliveryPinChange | null {
  const change = pinChangeOf(order);
  return change?.status === "applied" ? change : null;
}

/**
 * A client's surcharge transfer is waiting on Operations. Until someone
 * verifies or rejects it the API refuses every rider assignment
 * (`409 delivery_pin_payment_pending`), so it is Operations' call.
 */
export function pinPaymentAwaitingOperations(
  order: Pick<Order, "deliveryPin"> | null | undefined,
): boolean {
  return pinChangeOf(order)?.status === "pending_confirmation";
}

/** Why "Assign rider" is unavailable on this order, or null when the pin allows it. */
export function pinDispatchBlocker(
  order: Pick<Order, "deliveryPin"> | null | undefined,
): string | null {
  return pinPaymentAwaitingOperations(order)
    ? "Verify or reject the client's pin payment first. A rider cannot be assigned while it waits."
    : null;
}

/** "Nearby", from the same fixed zones that price delivery. */
export function pinZoneLabel(zone: string | null | undefined): string {
  if (!zone) return "Zone not given";
  return DELIVERY_ZONES.find((entry) => entry.zone === zone)?.label ?? "Zone not given";
}

/** The confirmation chip: whether the client said they will be there. */
export function presentPinConfirmation(
  pin: Pick<DeliveryPin, "status">,
): StatePresentation {
  return pin.status === "confirmed"
    ? { label: "Client confirmed", tone: "success", icon: "circle-check" }
    : { label: "Not confirmed yet", tone: "neutral", icon: "clock" };
}

/** "Confirmed Oct 15, 3:20 PM" / "Asked Oct 15, 2:05 PM. No answer yet." */
export function pinConfirmationLine(
  pin: Pick<DeliveryPin, "status" | "confirmedAt" | "requestedAt">,
): string {
  if (pin.status === "confirmed" && pin.confirmedAt) {
    return `Confirmed ${formatDateTime(pin.confirmedAt)}.`;
  }
  return `Asked ${formatDateTime(pin.requestedAt)}. No answer yet, so the rider uses this pin as it is.`;
}

/** Who meets the rider. An empty receiver is the client. */
export function pinReceiverLine(pin: Pick<DeliveryPin, "receiverName">): string {
  const name = pin.receiverName?.trim();
  return name ? name : "The client";
}

export function pinNotesLine(pin: Pick<DeliveryPin, "notes">): string {
  const notes = pin.notes?.trim();
  return notes ? notes : "None";
}

/** The change, by where it stands. */
export function presentPinChange(
  change: Pick<DeliveryPinChange, "status">,
): StatePresentation {
  switch (change.status) {
    case "pending_payment":
      return { label: "Waiting on the client's payment", tone: "neutral", icon: "clock" };
    case "pending_confirmation":
      return { label: "Payment to verify", tone: "warning", icon: "triangle-alert" };
    case "applied":
      return { label: "New pin in use", tone: "success", icon: "circle-check" };
    default:
      return { label: "Unknown change status", tone: "neutral", icon: "circle-help" };
  }
}

/** The signed difference, from GRIDGO's side of the desk. */
export function pinFeeDifferenceLine(differenceMinor: number): string {
  if (differenceMinor > 0) return `${formatPhp(differenceMinor)} more, paid by the client by QR`;
  if (differenceMinor < 0) return `${formatPhp(-differenceMinor)} back to the client as a credit`;
  return "Same delivery fee";
}

/** A signed amount for a ledger line: "+₱60.00", "−₱40.00", "₱0.00". */
export function signedPhp(minor: number): string {
  if (minor > 0) return `+${formatPhp(minor)}`;
  if (minor < 0) return `−${formatPhp(-minor)}`;
  return formatPhp(0);
}

/** "3.2 km from the shop, Away". */
export function pinDistanceLine(change: Pick<DeliveryPinChange, "distanceMeters" | "zone">): string {
  return `${km(change.distanceMeters)} km from the shop, ${pinZoneLabel(change.zone)}`;
}

/** The one-change allowance, in one line. */
export function pinChangeAllowanceLine(
  order: Pick<Order, "deliveryPin" | "state" | "riderId">,
): string {
  const pin = deliveryPinOf(order);
  if (!pin) return "";
  const change = pin.change;
  if (pin.changeUsed) return "Used. The pin cannot move again.";
  if (change?.status === "pending_confirmation") {
    return "A change is waiting on its payment check. It is not saved until you verify it.";
  }
  if (change?.status === "pending_payment") {
    return pin.canChange
      ? "A change is proposed and unpaid. It is not saved, and the client may still replace it."
      : "A proposed change was never paid before a rider was assigned, so it lapsed.";
  }
  if (pin.canChange) return "Not used. The client can change the pin once, until a rider is assigned.";
  if (order.riderId || DISPATCHED_STATES.has(order.state)) {
    return "Not used, and closed: a rider was assigned.";
  }
  return "Not available now.";
}

/**
 * The points the workspace map draws: the shop, the checkout pin, and the
 * pin the change moved to (in use once applied, proposed before that).
 */
export type PinMapPoint = {
  kind: "shop" | "original" | "final" | "proposed";
  point: MapPoint;
  label: string;
};

export function pinMapPoints(
  order: Pick<Order, "deliveryPin" | "pickup">,
): PinMapPoint[] {
  const pin = deliveryPinOf(order);
  if (!pin) return [];
  const points: PinMapPoint[] = [];
  if (validPoint(order.pickup)) points.push({ kind: "shop", point: order.pickup, label: "Shop" });
  const change = pin.change;
  const original = pin.original ?? pin.point;
  if (change?.status === "applied" && validPoint(change.point)) {
    if (validPoint(original)) points.push({ kind: "original", point: original, label: "Checkout pin" });
    points.push({ kind: "final", point: change.point, label: "Delivery pin now" });
  } else {
    if (validPoint(original)) points.push({ kind: "final", point: original, label: "Delivery pin" });
    if (change && validPoint(change.point)) {
      points.push({ kind: "proposed", point: change.point, label: "Proposed pin, not saved" });
    }
  }
  return points;
}

function validPoint(point: MapPoint | null | undefined): point is MapPoint {
  return Boolean(
    point && Number.isFinite(point.lat) && Number.isFinite(point.lng),
  );
}

/** "7.13000, 125.60000": enough to find the spot, in a copyable form. */
export function coordinatesLine(point: Pick<MapPoint, "lat" | "lng">): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

/** The workspace row's closed line. */
export function pinRowSummary(order: Pick<Order, "deliveryPin">): string {
  const pin = deliveryPinOf(order);
  if (!pin) return "";
  const change = pin.change;
  if (change?.status === "pending_confirmation") {
    return `The client sent ${formatPhp(change.feeDifferenceMinor)} for a new pin. Verify it before dispatch.`;
  }
  const confirmed =
    pin.status === "confirmed" && pin.confirmedAt
      ? `Confirmed ${formatDateTime(pin.confirmedAt)}`
      : "Not confirmed yet";
  if (change?.status === "applied") {
    const diff = change.feeDifferenceMinor;
    if (diff > 0) return `${confirmed}. Pin changed once, ${formatPhp(diff)} more paid by QR.`;
    if (diff < 0) return `${confirmed}. Pin changed once, ${formatPhp(-diff)} back to the client as a credit.`;
    return `${confirmed}. Pin changed once, same delivery fee.`;
  }
  if (change?.status === "pending_payment" && pin.canChange) {
    return `${confirmed}. A new pin waits on the client's payment of ${formatPhp(change.feeDifferenceMinor)}.`;
  }
  return `${confirmed}.`;
}

/** What the client paid by QR for a dearer pin, once Operations verified it. */
export function pinPaymentCollectedMinor(
  order: Pick<Order, "deliveryPin"> | null | undefined,
): number | null {
  const change = appliedPinChange(order);
  if (!change || change.feeDifferenceMinor <= 0) return null;
  return change.payment?.amountMinor ?? null;
}

/** What the dispatch board's Pin cell says. */
export function presentPinForDispatch(
  order: Pick<Order, "deliveryPin">,
): StatePresentation | null {
  const pin = deliveryPinOf(order);
  if (!pin) return null;
  if (pinPaymentAwaitingOperations(order)) return presentPinChange({ status: "pending_confirmation" });
  return presentPinConfirmation(pin);
}

// ---------------------------------------------------------------------------
// The delivery-fee credit (a `delivery_pin` refund request)
// ---------------------------------------------------------------------------

export function isDeliveryCredit(refund: Pick<RefundRequest, "kind">): boolean {
  return refund.kind === "delivery_pin";
}

/** The frozen working of a credit's settlement, or null on any other settlement. */
export function deliveryCreditSnapshot(
  settlement: Pick<RefundSettlement, "disposition" | "snapshot"> | null | undefined,
): DeliveryCreditSnapshot | null {
  if (settlement?.disposition !== "delivery_adjustment") return null;
  const snapshot = settlement.snapshot as unknown as Partial<DeliveryCreditSnapshot> | undefined;
  if (
    !snapshot ||
    typeof snapshot.originalFeeMinor !== "number" ||
    typeof snapshot.deliveryFeeMinor !== "number"
  ) {
    return null;
  }
  return {
    changeId: String(snapshot.changeId ?? ""),
    originalFeeMinor: snapshot.originalFeeMinor,
    deliveryFeeMinor: snapshot.deliveryFeeMinor,
  };
}

/**
 * Where a cheaper pin's credit stands, from the refund request it opened.
 * Null refunds means they could not be read.
 */
export function pinCreditLine(
  change: Pick<DeliveryPinChange, "refundRequestId" | "feeDifferenceMinor">,
  refunds: readonly RefundRequest[] | null,
): string {
  const amount = formatPhp(-change.feeDifferenceMinor);
  if (!change.refundRequestId) return `${amount} credit to the client.`;
  const credit = refunds?.find((refund) => refund.id === change.refundRequestId);
  if (!credit) {
    return refunds === null
      ? `${amount} credit to the client. Its refund case could not be loaded here.`
      : `${amount} credit to the client.`;
  }
  if (credit.status === "paid" && credit.payment) {
    return `${formatPhp(credit.payment.amountMinor)} credit paid ${formatDateTime(credit.payment.paidAt)}, reference ${credit.payment.reference}.`;
  }
  return `${amount} credit. ${presentRefundState(credit).label}.`;
}
