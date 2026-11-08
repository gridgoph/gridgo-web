import { isApiError } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";

/** The API's limit on the trimmed reason. */
export const ORDER_REMOVAL_REASON_MAX = 2_000;

export function reasonTooLong(reason: string): boolean {
  return reason.trim().length > ORDER_REMOVAL_REASON_MAX;
}

/**
 * Why this order cannot be removed, from the API's own eligibility projection,
 * or null when it can (or when an older API sent no projection: then the
 * server's refusal on submit is the only word).
 */
export function orderRemovalBlockedReason(order: Order): string | null {
  const removal = order.removal;
  if (!removal || removal.allowed) return null;
  const reason = removal.blockedReason?.trim();
  return reason || "This order cannot be removed.";
}

/**
 * Remove order rules (contract `POST /ops/orders/:id/remove`). The email is
 * compared exactly, capitals and spaces included, as the API compares it and as
 * Remove account compares a target's email on Roles.
 */
export function orderRemovalReady(input: {
  reason: string;
  typedEmail: string;
  clientEmail: string | null | undefined;
}): boolean {
  if (!input.clientEmail) return false;
  const reason = input.reason.trim();
  return (
    reason.length > 0 &&
    reason.length <= ORDER_REMOVAL_REASON_MAX &&
    input.typedEmail === input.clientEmail
  );
}

/** Every refusal as one plain sentence. The blocked reason is the API's own. */
export function orderRemovalErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    switch (err.code) {
      case "forbidden":
        return "Only a Super Admin can remove an order.";
      case "order_not_found":
        return "This order is no longer on the platform. Go back to the overview.";
      case "order_already_removed":
        return "This order was already removed. Go back to the overview.";
      case "reason_required":
        return "Write why this order is being removed, in 2,000 characters or fewer.";
      case "confirm_email_mismatch":
        return "That email does not match the client on this order. Type it exactly as shown.";
      case "order_removal_blocked": {
        const message = err.detail<unknown>("message");
        return typeof message === "string" && message.trim()
          ? message
          : "This order cannot be removed because money records depend on it.";
      }
    }
    if (err.kind === "unauthorized") {
      return "Your session expired. Sign in again, then remove the order.";
    }
    if (err.kind === "forbidden") return "Only a Super Admin can remove an order.";
  }
  return "The order was not removed. Check your connection and try again.";
}
