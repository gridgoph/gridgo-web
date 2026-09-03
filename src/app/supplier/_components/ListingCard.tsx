"use client";

import Link from "next/link";

import { SamplePhoto } from "@/app/supplier/_components/SamplePhoto";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  boardContextFor,
  boardStanding,
  priceLine,
  printerCapLine,
  readyInLine,
  subcategoryName,
  type Listing,
  type ServiceLine,
} from "@/lib/listings";
import type { Taxonomy } from "@/lib/api/types";

type Props = {
  listing: Listing;
  taxonomy: Taxonomy | null;
  services: ServiceLine[];
  shopApproved: boolean;
  layout?: "tile" | "row";
};

export function ListingCard({
  listing,
  taxonomy,
  services,
  shopApproved,
  layout = "tile",
}: Props) {
  const context = boardContextFor(listing, services);
  const standing = boardStanding(listing, context, shopApproved);
  const first = listing.photos[0];
  const hours =
    listing.turnaroundMode === "override"
      ? listing.turnaroundHours
      : context.inheritedTurnaroundHours;
  const cap = printerCapLine(listing.printerMaxWidthFeet);
  const showChip = standing.label !== "On the board" || standing.note;

  if (layout === "row") {
    return (
      <Link
        href={`/supplier/catalogue/${listing.id}`}
        className="rounded-card border-outline bg-surface hover:bg-overlay-hover grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-4 overflow-hidden border p-2 no-underline transition-colors md:grid-cols-[6.5rem_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
      >
        <SamplePhoto
          fileId={first?.fileId}
          alt={first?.altText ?? listing.name}
          emptyLabel="No sample"
          className="aspect-auto size-[5.5rem] shrink-0 md:size-[6.5rem]"
        />
        <div className="min-w-0">
          <p
            className="text-body text-text-primary m-0 truncate"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {listing.name || "Untitled listing"}
          </p>
          <p className="text-caption text-text-muted m-0 truncate">
            {subcategoryName(taxonomy, listing.subcategoryCode)}
          </p>
        </div>
        <div className="hidden min-w-0 md:block">
          <p className="text-body text-text-primary m-0">{priceLine(listing)}</p>
          {cap ? <p className="text-caption text-text-secondary m-0">{cap}</p> : null}
          <p className="text-caption text-text-secondary m-0">{readyInLine(hours)}</p>
        </div>
        <div className="flex flex-col items-end gap-1 pr-2">
          <p className="text-body text-text-primary m-0 md:hidden">{priceLine(listing)}</p>
          {showChip ? (
            <StatusChip tone={standing.tone} label={standing.label} icon={standing.icon} />
          ) : (
            <p className="text-caption text-text-muted m-0 hidden md:block">{readyInLine(hours)}</p>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/supplier/catalogue/${listing.id}`}
      className="rounded-card border-outline bg-surface hover:bg-overlay-hover flex flex-col overflow-hidden border no-underline transition-colors"
    >
      <SamplePhoto
        fileId={first?.fileId}
        alt={first?.altText ?? listing.name}
        emptyLabel="No sample yet"
      />
      <div className="flex flex-col gap-1 p-3">
        <p
          className="text-body text-text-primary m-0 truncate"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {listing.name || "Untitled listing"}
        </p>
        <p className="text-caption text-text-muted m-0 truncate">
          {subcategoryName(taxonomy, listing.subcategoryCode)}
        </p>
        <p className="text-body text-text-primary m-0">{priceLine(listing)}</p>
        {cap ? <p className="text-caption text-text-secondary m-0">{cap}</p> : null}
        <p className="text-caption text-text-secondary m-0">{readyInLine(hours)}</p>
        {showChip ? (
          <StatusChip tone={standing.tone} label={standing.label} icon={standing.icon} />
        ) : null}
      </div>
    </Link>
  );
}
