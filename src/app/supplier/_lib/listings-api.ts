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
      case "listing_suspended":
        return "GRIDGO took this listing down, so it cannot go back on the board. Refresh to read why.";
      case "listing_incomplete":
        return "This listing is not finished yet. Fix the steps listed under Finalize your product, then send it again.";
      case "listing_already_approved":
        return "Operations already approved this listing. Edit it to send a change.";
      case "invalid_colour_pricing":
        return "GRIDGO could not read your colour prices. Name each paper size once, like A3 or 20x30, and enter prices in pesos or leave a tier blank.";
      case "colour_pricing_requires_per_page":
        return "Pricing by colour works per page only. Set the pricing unit to per page first.";
      case "colour_pricing_requires_print_layout":
        return "Pricing by colour needs at least one print layout, so GRIDGO knows how each page sits on the paper. Mark one on the Artwork step.";
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
