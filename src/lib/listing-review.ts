/**
 * Operations review of shop listings and new product-type requests
 * (gridgoph/gridgo-supplier#97, API gridgo-api#154). Contract: gridgo-api
 * docs/SUPPLIER_CATALOG_API.md#listing-review-and-product-type-picker.
 *
 * Pure on purpose: the desk (`src/components/listing-reviews/`) renders what
 * this module decides. A listing reaches clients only once a reviewer approves
 * it, and approval is an explicit attestation that no photo carries a
 * watermark, logo or shop branding.
 */

import type { ReviewQueueStatus } from "@/lib/api/client";
import { formatPhp } from "@/lib/format";
import { normalizeListing, priceLine, specs, type Listing } from "@/lib/listings";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

export type ReviewEntry = {
  listing: Listing;
  /** `reviewBlockers` codes: what stops an approval right now. */
  blockers: string[];
};

export type ReviewPage = { entries: ReviewEntry[]; nextCursor: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeReviewPage(body: unknown): ReviewPage {
  const raw = isRecord(body) ? body : {};
  const entries = (Array.isArray(raw.items) ? raw.items : []).flatMap((item, index) => {
    const listing = normalizeListing(item, index);
    if (!listing) return [];
    const blockers =
      isRecord(item) && Array.isArray(item.reviewBlockers)
        ? item.reviewBlockers.filter((code): code is string => typeof code === "string")
        : [];
    return [{ listing, blockers }];
  });
  return { entries, nextCursor: text(raw.nextCursor) };
}

/** A change to a listing clients can already see, not a new listing. */
export function isRevision(listing: Pick<Listing, "hasApprovedVersion">): boolean {
  return listing.hasApprovedVersion === true;
}

const BLOCKER_SENTENCE: Record<string, string> = {
  owning_service: "It is not under one of the shop's own service lines.",
  name: "It has no name.",
  base_price: "It has no valid price.",
  subcategory: "It has no product type.",
  printer_max_width_feet: "The printer's maximum width is not set.",
  accepted_file_formats: "It accepts no artwork formats.",
  photo: "It has no fully uploaded sample photo.",
  specs_required: "It has no spec a client picks from, with at least one variant.",
};

/** Plain words for one `reviewBlockers` code. */
export function blockerSentence(code: string, listing?: Listing): string {
  if (code.startsWith("option_group")) {
    const id = code.split(":")[1];
    const group = id ? listing?.groups.find((entry) => entry.id === id) : null;
    return group
      ? `“${group.name}” has no active choice.`
      : "A spec or add-on has no active choice.";
  }
  return BLOCKER_SENTENCE[code] ?? "Something the API checks is still missing.";
}

/**
 * The contractual photo rule, one tick per thing to look for. Every box ticked
 * is what `photosUnbranded: true` attests to; it is never sent otherwise.
 */
export const PHOTO_RULE_CHECKS = [
  {
    id: "watermark",
    label: "No watermark",
    detail: "No stamped name, URL or pattern over the print.",
  },
  {
    id: "logo",
    label: "No logo",
    detail: "No shop logo in a corner, on a sign or on packaging.",
  },
  {
    id: "branding",
    label: "No shop branding",
    detail: "No shop name, phone number, page handle, QR code or address.",
  },
] as const;

export type PhotoRuleCheck = (typeof PHOTO_RULE_CHECKS)[number]["id"];

export function photoRuleComplete(ticked: ReadonlySet<string>): boolean {
  return PHOTO_RULE_CHECKS.every((check) => ticked.has(check.id));
}

/** Why Approve is not pressable yet, or null when it is. */
export function approveBlocker(
  entry: ReviewEntry,
  ticked: ReadonlySet<string>,
): string | null {
  if (entry.listing.reviewStatus !== "pending")
    return "Only a listing waiting for review can be approved.";
  if (entry.blockers.length)
    return "The shop has to finish this listing before it can be approved.";
  if (!photoRuleComplete(ticked)) return "Tick every photo check to approve.";
  return null;
}

/** The API caps a send-back reason at 2,000 characters. */
export const REVIEW_REASON_MAX = 2000;

/**
 * Ready-made reasons, written for the shop to read. A reviewer can pick one
 * and edit it; the shop sees exactly what is sent.
 */
export const SEND_BACK_REASONS = [
  "A sample photo shows a watermark, logo or shop branding. Replace it with a plain photo of the print.",
  "The photos do not show this product. Add a clear photo of the actual print.",
  "Add the specs and variants a client chooses from, like size, paper or finish.",
  "The price does not match the specs or the pricing unit. Check the price and the unit.",
  "The name or description does not say what the client is ordering. Make it specific.",
] as const;

/** Ready-made reasons for a product-type request the desk does not add. */
export const PRODUCT_TYPE_SEND_BACK_REASONS = [
  "GRIDGO already lists this product type. Pick it from the product types when you add a listing.",
  "Tell us more: what the product is, the sizes or materials, and what clients order it for.",
  "GRIDGO does not offer this kind of product yet.",
] as const;

export const REVIEW_STATUS_TABS: readonly { value: ReviewQueueStatus; label: string }[] =
  [
    { value: "pending", label: "Waiting" },
    { value: "needs_revision", label: "Sent back" },
    { value: "approved", label: "Approved" },
  ];

export type ReviewKind = "all" | "new" | "revision";

export const REVIEW_KIND_OPTIONS: readonly { value: ReviewKind; label: string }[] = [
  { value: "all", label: "New and changes" },
  { value: "new", label: "New listings" },
  { value: "revision", label: "Changes to live listings" },
];

export type ReviewFilters = {
  q: string;
  kind: ReviewKind;
  supplierId: string;
  subcategoryCode: string;
};

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = {
  q: "",
  kind: "all",
  supplierId: "",
  subcategoryCode: "",
};

export function reviewFiltersSet(filters: ReviewFilters): boolean {
  return Boolean(
    filters.q.trim() ||
    filters.kind !== "all" ||
    filters.supplierId ||
    filters.subcategoryCode,
  );
}

/**
 * The queue endpoint has no search or shop filter, so the desk reads every
 * page of a state and narrows it here. `shopName` resolves supplier ids.
 */
export function filterReviewEntries(
  entries: readonly ReviewEntry[],
  filters: ReviewFilters,
  shopName: (supplierId: string | null) => string,
  typeName: (code: string) => string,
): ReviewEntry[] {
  const q = filters.q.trim().toLowerCase();
  return entries.filter(({ listing }) => {
    if (filters.kind === "new" && isRevision(listing)) return false;
    if (filters.kind === "revision" && !isRevision(listing)) return false;
    if (filters.supplierId && listing.supplierId !== filters.supplierId) return false;
    if (filters.subcategoryCode && listing.subcategoryCode !== filters.subcategoryCode) {
      return false;
    }
    if (!q) return true;
    return [listing.name, shopName(listing.supplierId), typeName(listing.subcategoryCode)]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

/** Oldest first: the shop that has waited longest is next. */
export function oldestFirst(entries: readonly ReviewEntry[]): ReviewEntry[] {
  return [...entries].sort((a, b) =>
    String(a.listing.updatedAt ?? "").localeCompare(String(b.listing.updatedAt ?? "")),
  );
}

export type ReviewChip = { label: string; tone: StatusTone; icon: StatusIconName };

export function reviewChip(entry: ReviewEntry): ReviewChip {
  const { listing } = entry;
  if (listing.reviewStatus === "needs_revision") {
    return { label: "Sent back", tone: "warning", icon: "square-pen" };
  }
  if (listing.reviewStatus === "approved") {
    return { label: "Approved", tone: "success", icon: "circle-check" };
  }
  if (entry.blockers.length) {
    return { label: "Not finished", tone: "neutral", icon: "circle-dashed" };
  }
  return { label: "Ready to review", tone: "info", icon: "clock" };
}

/** "Change to a live listing" or "New listing". */
export function reviewKindLabel(listing: Pick<Listing, "hasApprovedVersion">): string {
  return isRevision(listing) ? "Change to a live listing" : "New listing";
}

export function reviewCountLine(shown: number, total: number, filtered: boolean): string {
  const noun = total === 1 ? "listing" : "listings";
  if (filtered) return `${shown} of ${total} ${noun}`;
  return `${total} ${noun}`;
}

export type ListingChange = { label: string; before: string; after: string };

function specLines(listing: Listing): Map<string, string> {
  return new Map(
    specs(listing).map((group) => [
      group.name,
      group.options
        .filter((option) => option.active)
        .map((option) =>
          option.priceModifierMinor
            ? `${option.label} (${option.priceModifierMinor > 0 ? "+" : "−"}${formatPhp(Math.abs(option.priceModifierMinor))})`
            : option.label,
        )
        .join(", ") || "No choices",
    ]),
  );
}

/**
 * What a pending change does to the version clients see now. Only the
 * review-sensitive parts (price, product type, specs, formats, photos) and
 * the name; text edits apply without review.
 */
export function listingChanges(
  live: Listing,
  draft: Listing,
  typeName: (code: string) => string = (code) => code,
): ListingChange[] {
  const out: ListingChange[] = [];
  if (live.name !== draft.name)
    out.push({ label: "Name", before: live.name, after: draft.name });
  const beforePrice = priceLine(live);
  const afterPrice = priceLine(draft);
  if (beforePrice !== afterPrice)
    out.push({ label: "Price", before: beforePrice, after: afterPrice });
  if (live.subcategoryCode !== draft.subcategoryCode) {
    out.push({
      label: "Product type",
      before: typeName(live.subcategoryCode),
      after: typeName(draft.subcategoryCode),
    });
  }
  const beforeSpecs = specLines(live);
  const afterSpecs = specLines(draft);
  for (const name of new Set([...beforeSpecs.keys(), ...afterSpecs.keys()])) {
    const before = beforeSpecs.get(name) ?? "Not offered";
    const after = afterSpecs.get(name) ?? "Removed";
    if (before !== after) out.push({ label: name, before, after });
  }
  const livePhotos = new Set(live.photos.map((photo) => photo.fileId));
  const added = draft.photos.filter((photo) => !livePhotos.has(photo.fileId)).length;
  const removed = live.photos.filter(
    (photo) => !draft.photos.some((next) => next.fileId === photo.fileId),
  ).length;
  if (added || removed) {
    out.push({
      label: "Photos",
      before: `${live.photos.length} photo${live.photos.length === 1 ? "" : "s"}`,
      after: [added ? `${added} new` : "", removed ? `${removed} removed` : ""]
        .filter(Boolean)
        .join(", "),
    });
  }
  return out;
}

// ---- Product-type requests ------------------------------------------------

export type ProductTypeRequest = {
  id: string;
  supplierId: string;
  categoryCode: string;
  name: string;
  description: string;
  status: ReviewQueueStatus;
  reason: string | null;
  productTypeCode: string | null;
  version: number;
  createdAt: string | null;
  reviewedAt: string | null;
};

export function normalizeProductTypeRequests(body: unknown): {
  requests: ProductTypeRequest[];
  nextCursor: string | null;
} {
  const raw = isRecord(body) ? body : {};
  const requests = (Array.isArray(raw.requests) ? raw.requests : []).flatMap(
    (entry): ProductTypeRequest[] => {
      if (!isRecord(entry)) return [];
      const id = text(entry.id);
      const name = text(entry.name);
      const status = entry.status;
      if (!id || !name) return [];
      if (status !== "pending" && status !== "approved" && status !== "needs_revision")
        return [];
      return [
        {
          id,
          supplierId: text(entry.supplierId) ?? "",
          categoryCode: text(entry.categoryCode) ?? "",
          name,
          description: typeof entry.description === "string" ? entry.description : "",
          status,
          reason: text(entry.reason),
          productTypeCode: text(entry.productTypeCode),
          version: typeof entry.version === "number" ? entry.version : 1,
          createdAt: text(entry.createdAt),
          reviewedAt: text(entry.reviewedAt),
        },
      ];
    },
  );
  return { requests, nextCursor: text(raw.nextCursor) };
}

/** The API's rule for a new product-type code. */
export const PRODUCT_TYPE_CODE_PATTERN = /^[a-z][a-z0-9_]*$/;
export const PRODUCT_TYPE_CODE_MAX = 100;

/** "Vinyl Stickers (die-cut)" → "vinyl_stickers_die_cut". */
export function suggestProductTypeCode(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9_]+/, "");
  return slug.slice(0, PRODUCT_TYPE_CODE_MAX).replace(/_+$/, "");
}

export function productTypeCodeError(
  code: string,
  existing: ReadonlySet<string>,
): string | null {
  const value = code.trim();
  if (!value) return "Enter a code for the new product type.";
  if (value.length > PRODUCT_TYPE_CODE_MAX) return "Keep the code to 100 characters.";
  if (!PRODUCT_TYPE_CODE_PATTERN.test(value)) {
    return "Use lowercase letters, numbers and underscores, starting with a letter.";
  }
  if (existing.has(value)) return "A product type already uses that code.";
  return null;
}

export function requestChip(request: ProductTypeRequest): ReviewChip {
  if (request.status === "approved")
    return { label: "Added", tone: "success", icon: "circle-check" };
  if (request.status === "needs_revision")
    return { label: "Sent back", tone: "warning", icon: "square-pen" };
  return { label: "Waiting", tone: "info", icon: "clock" };
}

/** Errors the desk explains in its own words; everything else falls through. */
export function reviewErrorMessage(err: unknown): string | null {
  const code = isRecord(err) && typeof err.code === "string" ? err.code : null;
  switch (code) {
    case "catalog_item_stale":
      return "The shop changed this listing while you were reviewing. It has been reloaded; check it again.";
    case "listing_not_pending":
      return "Someone already decided this listing. The queue has been refreshed.";
    case "listing_incomplete":
      return "The shop has not finished this listing yet, so it cannot be approved. Send it back with what is missing.";
    case "photo_review_required":
      return "Tick every photo check to approve.";
    case "reason_required":
      return "Write the reason the shop will read.";
    case "product_type_request_stale":
    case "product_type_request_not_pending":
      return "Someone already decided this request. The list has been refreshed.";
    case "product_type_exists":
      return "A product type already uses that code. Choose another.";
    case "invalid_subcategory_code":
      return "Use lowercase letters, numbers and underscores, starting with a letter.";
    case "category_inactive":
      return "That category is hidden. Turn it back on in Catalogue & taxonomy first.";
    default:
      return null;
  }
}
