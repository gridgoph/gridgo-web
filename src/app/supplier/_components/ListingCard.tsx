"use client";

import Link from "next/link";

import { SamplePhoto } from "@/app/supplier/_components/SamplePhoto";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  boardContextFor,
  boardStanding,
  LISTING_STANDING_LABEL,
  priceLine,
  printerCapLine,
  readyInLine,
  subcategoryName,
  type BoardStanding,
  type Listing,
  type ListingReadiness,
  type ServiceLine,
} from "@/lib/listings";
import type { Taxonomy } from "@/lib/api/types";

type Props = {
  listing: Listing;
  taxonomy: Taxonomy | null;
  services: ServiceLine[];
  shopApproved: boolean;
  /** This listing's entry from `GET /me/supplier-readiness`, when it loaded. */
  readiness?: ListingReadiness | null;
  layout?: "tile" | "row";
  /**
   * Draw the tile without its link — the editor shows the shop what a client
   * will see, fed from the unsaved draft, and that picture must not navigate.
   */
  preview?: boolean;
};

export function ListingCard({
  listing,
  taxonomy,
  services,
  shopApproved,
  readiness,
  layout = "tile",
  preview = false,
}: Props) {
  const context = boardContextFor(listing, services);
  const standing = boardStanding(listing, context, shopApproved, readiness);
  const first = listing.photos[0];
  const hours =
    listing.turnaroundMode === "override"
      ? listing.turnaroundHours
      : context.inheritedTurnaroundHours;
  const cap = printerCapLine(listing.printerMaxWidthFeet);

  const photo = (
    <SamplePhoto
      fileId={first?.fileId}
      alt={first?.altText ?? listing.name}
      emptyLabel={layout === "row" ? "No sample" : "No sample yet"}
      className={
        layout === "row" ? "aspect-auto size-[5.5rem] shrink-0 md:size-[6.5rem]" : undefined
      }
    />
  );

  const copy = (
    <>
      {layout === "row" ? (
        <>
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
            {preview && standing.kind === "live" ? null : (
              <StandingChips standing={standing} align="end" />
            )}
          </div>
        </>
      ) : (
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
          {preview && standing.kind === "live" ? null : <StandingChips standing={standing} />}
          {standing.note && (standing.kind !== "live" || standing.secondary) ? (
            <p className="text-caption text-text-secondary m-0 line-clamp-2">{standing.note}</p>
          ) : null}
        </div>
      )}
    </>
  );

  if (layout === "row") {
    return (
      <div className="rounded-card border-outline bg-surface grid grid-cols-[5.5rem_minmax(0,1fr)] items-center overflow-hidden border md:grid-cols-[6.5rem_minmax(0,1fr)]">
        {photo}
        {preview ? (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
            {copy}
          </div>
        ) : (
          <Link
            href={`/supplier/catalogue/${listing.id}`}
            className="hover:bg-overlay-hover grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-2 no-underline transition-colors md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
          >
            {copy}
          </Link>
        )}
      </div>
    );
  }

  if (preview) {
    return (
      <div
        data-testid="listing-preview"
        className="rounded-card border-outline bg-surface flex flex-col overflow-hidden border"
      >
        {photo}
        {copy}
      </div>
    );
  }

  return (
    <div className="rounded-card border-outline bg-surface flex flex-col overflow-hidden border">
      {photo}
      <Link
        href={`/supplier/catalogue/${listing.id}`}
        className="hover:bg-overlay-hover no-underline transition-colors"
      >
        {copy}
      </Link>
    </div>
  );
}

/**
 * The standing chip on every tile and row, Live included, so a shop can tell
 * at a glance which listings clients see. A live listing with an edit under
 * review, or sent back, carries that state as a second chip.
 */
function StandingChips({
  standing,
  align = "start",
}: {
  standing: BoardStanding;
  align?: "start" | "end";
}) {
  return (
    <div
      className={
        align === "end"
          ? "flex flex-wrap items-center justify-end gap-1.5"
          : "flex flex-wrap items-center gap-1.5"
      }
    >
      <StatusChip tone={standing.tone} label={standing.label} icon={standing.icon} />
      {standing.secondary === "pending_review" ? (
        <StatusChip tone="info" label="Changes in review" icon="clock" />
      ) : standing.secondary === "needs_changes" ? (
        <StatusChip tone="warning" label={LISTING_STANDING_LABEL.needs_changes} icon="square-pen" />
      ) : null}
    </div>
  );
}
