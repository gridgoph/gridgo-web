import { listingErrorMessage } from "@/app/supplier/_lib/listings-api";
import { isApiError } from "@/lib/api/client";

/**
 * What a template refusal means for the shop, as the fix. Codes from
 * gridgo-api `docs/PRODUCT_TEMPLATES_API.md`; anything else falls back to the
 * board's own wording.
 */
export function templateErrorMessage(err: unknown, fallback: string): string {
  if (isApiError(err)) {
    switch (err.code) {
      case "template_already_added":
        return "You already have this product. Open it from Products to change its prices.";
      case "template_service_required":
        return "Add this kind of work to the services you offer first, then add the product.";
      case "template_price_required":
        return "Every ticked option needs a full price above ₱0.";
      case "printer_cap_required":
        return "Enter how wide your printer prints, in whole feet from 1 to 20.";
      case "invalid_ready_time":
        return "Choose when it is ready.";
      case "invalid_template_options":
        return "GRIDGO changed this product's options. Reload the page and price it again.";
      case "product_template_not_found":
        return "GRIDGO no longer offers this product. Choose another, or ask GRIDGO to add it.";
      case "template_change_not_allowed":
        return "Add a separate product for a different GRIDGO product.";
      case "template_manual_conversion_required":
        return "This product is priced by colour, so keep changing it in the full product builder until the GRIDGO team moves it over.";
      case "product_merged":
        return "This product was merged into another one. Change the product it was merged into.";
      case "catalog_item_stale":
      case "expected_version_required":
        return "This product changed on another screen. This page now shows the latest; check it and try again.";
      case "listing_suspended":
        return "The GRIDGO team took this product down, so it cannot change. Message them to ask why.";
      case "shop_confirmation_required":
        return "Confirm the prices the GRIDGO team prepared first.";
      case "already_confirmed":
        return "These prices are already confirmed.";
      case "template_formats_unavailable":
        return "GRIDGO cannot take files for this product yet. Message the GRIDGO team.";
      case "invalid_setup_file":
        return "One of the files did not finish sending. Remove it and add it again.";
      case "invalid_template_request":
        return "Fill in what is asked and try again.";
      default:
        break;
    }
  }
  return listingErrorMessage(err, fallback);
}
