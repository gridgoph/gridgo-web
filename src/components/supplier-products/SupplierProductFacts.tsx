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

export function SupplierProductFacts({
  shop,
  listing,
  taxonomy,
  heading,
}: {
  shop: StaffShop;
  listing: Listing;
  taxonomy: Taxonomy | null;
  /** Detail uses a page heading. A row uses a smaller line. */
  heading?: "page" | "row";
}) {
  const shopName = shopLabel(shop);
  const board = listingBoardState(listing);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="m-0 text-caption text-text-secondary" data-testid="listing-shop">
        {shopName}
      </p>
      {heading === "page" ? (
        <h1 className="m-0 text-h2 text-text-primary">{listing.name}</h1>
      ) : (
        <p className="m-0 text-body font-medium text-text-primary">{listing.name}</p>
      )}
      <p className="m-0 text-body text-text-secondary">
        {productTypeName(taxonomy, listing.subcategoryCode)}
      </p>
      <p className="m-0 text-body text-text-primary">{listingPriceLine(listing)}</p>
      <p className="m-0 text-body text-text-secondary">{specSummary(listing)}</p>
      <PhotoStrip listing={listing} />
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip tone={board.tone} icon={board.icon} label={board.label} />
        {listing.suspendReason ? (
          <p className="m-0 text-body text-text-secondary">
            Reason the shop sees: {listing.suspendReason}
          </p>
        ) : null}
        <p className="m-0 text-caption text-text-secondary">
          Last change {formatDateTime(listing.updatedAt)}
        </p>
      </div>
    </div>
  );
}

function PhotoStrip({ listing }: { listing: Listing }) {
  if (!listing.photos.length) {
    return <p className="m-0 text-caption text-text-secondary">No photos</p>;
  }
  const shown = listing.photos.slice(0, 4);
  return (
    <div className="flex items-center gap-2">
      {shown.map((photo) =>
        photo.downloadUrl ? (
          <img
            key={photo.fileId}
            src={photo.downloadUrl}
            alt={photo.altText || listing.name}
            className="size-12 rounded-md border border-outline object-cover"
          />
        ) : (
          <span
            key={photo.fileId}
            className="inline-flex size-12 items-center justify-center rounded-md border border-outline text-caption text-text-secondary"
          >
            Photo
          </span>
        ),
      )}
      <p className="m-0 text-caption text-text-secondary">
        {listing.photos.length} {listing.photos.length === 1 ? "photo" : "photos"}
      </p>
    </div>
  );
}
