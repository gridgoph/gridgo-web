/**
 * Express (gridgo-api#224, contract `gridgo-api/docs/EXPRESS_API.md`).
 *
 * A shop switches Express on per listing. While it is on, clients can pick
 * any deadline from today, today included, and GRIDGO promises it for that
 * listing even where ordinary production time would miss it. No extra charge.
 * The switch applies at once and never enters listing review.
 *
 * Checkout tags the order `express: true` when it promised the order that
 * way. The tag never changes afterwards, so an order stays Express even if
 * the shop later switches its listing off.
 */
import type { Order } from "@/lib/api/types";

export const EXPRESS_LABEL = "Express";

/** Orders placed before Express carry no field; that reads as not Express. */
export function isExpressOrder(order: Pick<Order, "express"> | null | undefined): boolean {
  return order?.express === true;
}

/** The Orders queue's Speed filter: one value per order, matching the facet. */
export type OrderSpeed = "Express" | "Standard";

export function orderSpeed(order: Pick<Order, "express">): OrderSpeed {
  return isExpressOrder(order) ? "Express" : "Standard";
}

export const ORDER_SPEED_OPTIONS: { value: OrderSpeed; label: string }[] = [
  { value: "Express", label: "Express" },
  { value: "Standard", label: "Standard" },
];

/** The listing editor's explanation beside the switch. */
export const EXPRESS_SWITCH_HELP =
  "Clients can pick any deadline from today, the same day included, and GRIDGO promises same-day work for this listing even when your production time is longer. There is no extra charge.";

/** What turning it on asks of the shop. */
export const EXPRESS_SWITCH_CAUTION =
  "Turn it on only if you can finish an order the day it comes in. It changes at once, with no review.";

export function expressStateLine(on: boolean): string {
  return on
    ? "Express is on. Clients can choose today as their deadline."
    : "Express is off. Deadlines follow your production time.";
}

/** The shop's job page: what an Express order promised. */
export const EXPRESS_JOB_NOTE =
  "GRIDGO promised this order for the client's deadline under Express, even if that is today.";

/** Staff listing facts: the switch as one plain line. */
export function expressFactLine(on: boolean): string {
  return on ? "On. Clients can pick any deadline from today." : "Off";
}
