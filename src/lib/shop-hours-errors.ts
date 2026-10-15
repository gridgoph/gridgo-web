/**
 * Plain words for every refusal the shop-hours routes give
 * (gridgo-api `docs/SHOP_HOURS_API.md`), for the shop and for the GRIDGO Team.
 * Branches on `kind` / `code`, never on the API's own message.
 */

import { isApiError } from "@/lib/api/client";
import {
  STALE_SHOP_HOURS_COPY,
  STALE_STAFF_HOURS_COPY,
  type ShopHoursReader,
} from "@/lib/shop-hours";

const SHOP_COPY: Record<string, string> = {
  supplier_profile_stale: STALE_SHOP_HOURS_COPY,
  invalid_shop_hours:
    "GRIDGO could not use those hours. Keep one opening and closing time on the same day, and closure dates that cover 90 dates or fewer.",
  production_day_length_unavailable:
    "Every open day needs the same number of hours for now. Pick one opening and closing time for all your open days.",
  invalid_shop_extension:
    "GRIDGO could not extend today to that time. Pick a time later than your usual close, before midnight, and at least 30 minutes from now.",
  shop_closed: "Your shop is temporarily closed. Reopen it before extending today's hours.",
  supplier_profile_not_found:
    "GRIDGO has no shop details for this account yet. Finish setting up your shop, then come back.",
};

const STAFF_COPY: Record<string, string> = {
  supplier_profile_stale: STALE_STAFF_HOURS_COPY,
  reason_required: "Write a reason of up to 2,000 characters. The shop's record keeps it.",
  supplier_profile_not_found: "GRIDGO has no shop details for this account.",
  forbidden: "Only the shop can change its hours and extensions. The GRIDGO Team can switch Temporarily closed.",
};

export function shopHoursErrorMessage(
  error: unknown,
  reader: ShopHoursReader,
  fallback: string,
): string {
  if (!isApiError(error)) {
    return `${fallback} Check your connection, then try again.`;
  }
  const copy = (reader === "shop" ? SHOP_COPY : STAFF_COPY)[error.code];
  if (copy) return copy;
  if (error.status === 404) {
    return reader === "shop"
      ? "Shop hours are not open on this connection yet. Your jobs keep their usual timing."
      : "Shop hours are not open on this connection yet.";
  }
  if (error.kind === "forbidden") {
    return reader === "shop"
      ? "Shop hours are only available to shop accounts."
      : "Shop hours are only available to the GRIDGO Team.";
  }
  return `${fallback} Try again in a moment.`;
}

/** The route itself is missing (an older API), as opposed to an unknown shop. */
export function shopHoursRouteMissing(error: unknown): boolean {
  return isApiError(error) && error.status === 404 && error.code !== "supplier_profile_not_found";
}
