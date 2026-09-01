import {
  ApiError,
  isApiError,
  listMySupplierServices,
  listSupplierServices,
} from "@/lib/api/client";

export async function loadShopServiceLines(): Promise<unknown> {
  try {
    return await listMySupplierServices();
  } catch (err) {
    if (isApiError(err) && (err.status === 404 || err.status === 405)) {
      return { services: await listSupplierServices() };
    }
    throw err;
  }
}

export function listingErrorMessage(err: unknown, fallback: string): string {
  if (isApiError(err) || err instanceof ApiError) {
    if (err.status === 404 || err.status === 405) {
      return "GRIDGO has not opened your board on this portal yet. Check again shortly.";
    }
    switch (err.code) {
      case "expected_version_required":
      case "catalog_item_stale":
        return "This listing changed on another screen. Refresh and try again.";
      case "invalid_catalog_query":
        return "That hunt is too long. Shorten it to 80 characters.";
      case "invalid_subcategory_code":
        return "Choose a kind of work from the list GRIDGO offers for this category.";
      case "listing_starter_not_found":
        return "That GRIDGO starter is no longer available. Start from a blank listing.";
      case "item_in_use":
        return "Kept for a job already ordered — it is off the board and no client can see it.";
      default:
        if (err.kind === "forbidden") {
          return "Listings are only available to supplier accounts.";
        }
        if (err.kind === "unauthorized") {
          return "Your session expired. Sign in again.";
        }
        if (err.kind === "validation") {
          return `${fallback} Check the fields and try again.`;
        }
        return `${fallback} (${err.code.replace(/_/g, " ")}).`;
    }
  }
  return fallback;
}

export const ARCHIVED_SENTENCE =
  "Kept for a job already ordered — it is off the board and no client can see it.";
