/**
 * The client's name on staff order lists (gridgoph/gridgo-web#253).
 *
 * `clientName` is on the Operations and Super Admin projections only; a
 * shop's or rider's never carries it, so supplier screens must not use this.
 *
 * Pure: no React, no fetch.
 */

import type { Order } from "@/lib/api/types";

/** The client's name, or an explicit gap when the staff projection has none. */
export function clientLabel(order: Pick<Order, "clientName">): string {
  const name = order.clientName?.trim() ?? "";
  return name || "Unavailable";
}
