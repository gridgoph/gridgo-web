import { formatDateTime } from "@/lib/format";
import type { Taxonomy } from "@/lib/api/types";
import type { Listing } from "@/lib/listings";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  listingBoardState,
  listingPriceLine,
  shopLabel,
  specSummary,
  type StaffShop,
} from "@/lib/supplier-products";

export function productTypeName(taxonomy: Taxonomy | null, code: string): string {
  const name = taxonomy?.subcategories?.find((job) => job.code === code)?.name;
  return name || code || "Unknown product type";
}

/** The listing as Super Admin reads it on the detail page: shop first, then what clients see. */
export function SupplierProductFacts({
  shop,
  listing,
  taxonomy,
}: {
  shop: StaffShop;
  listing: Listing;
  taxonomy: Taxonomy | null;
}) {
  const board = listingBoardState(listing);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body text-text-secondary m-0" data-testid="listing-shop">
          {shopLabel(shop)}
        </p>
        <h1 className="text-h2 text-text-primary m-0">
          {listing.name || "Untitled listing"}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip tone={board.tone} icon={board.icon} label={board.label} />
          <span className="text-caption text-text-muted">
            Last change {formatDateTime(listing.updatedAt)}
          </span>
        </div>
      </div>
      <dl className="m-0 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
        <dt className="text-caption text-text-muted">Product type</dt>
        <dd className="text-body text-text-primary m-0">
          {productTypeName(taxonomy, listing.subcategoryCode)}
        </dd>
        <dt className="text-caption text-text-muted">Price</dt>
        <dd className="text-body text-text-primary m-0 tabular-nums">
          {listingPriceLine(listing)}
        </dd>
        <dt className="text-caption text-text-muted">Specs</dt>
        <dd className="text-body text-text-primary m-0">{specSummary(listing)}</dd>
      </dl>
      <PhotoStrip listing={listing} />
    </div>
  );
}

function PhotoStrip({ listing }: { listing: Listing }) {
  if (!listing.photos.length) {
    return <p className="text-caption text-text-muted m-0">No sample photos</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Sample photos">
      {listing.photos.map((photo) => (
        <li key={photo.fileId}>
          {photo.downloadUrl ? (
            // Signed, short-lived file URLs: next/image would proxy and cache them.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.downloadUrl}
              alt={photo.altText || listing.name}
              className="border-outline size-24 rounded-md border object-cover"
            />
          ) : (
            <span className="border-outline text-text-muted inline-flex size-24 items-center justify-center rounded-md border text-caption">
              Photo not available
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
