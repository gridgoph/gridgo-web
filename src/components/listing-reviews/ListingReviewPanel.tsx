"use client";

import Link from "next/link";
import { useEffect, useId, useState, type RefObject } from "react";
import { ChevronLeft, ImageOff, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusChip } from "@/components/ui/StatusChip";
import { getStaffPublicCatalogItem } from "@/lib/api/client";
import { formatDateTime, formatPhp } from "@/lib/format";
import {
  PHOTO_RULE_CHECKS,
  approveBlocker,
  blockerSentence,
  isRevision,
  listingChanges,
  reviewChip,
  reviewKindLabel,
  type ListingChange,
  type ReviewEntry,
} from "@/lib/listing-review";
import {
  normalizeListing,
  pickLine,
  priceLine,
  printerCapLine,
  readyInLine,
  type Listing,
} from "@/lib/listings";

type Props = {
  entry: ReviewEntry;
  shopName: string;
  typeName: (code: string) => string;
  formatName: (code: string) => string;
  /** Super Admin also gets a link to the listing on Supplier products. */
  tree: "ops" | "admin";
  busy: boolean;
  actionError: string | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onApprove: () => void;
  onSendBack: () => void;
};

/**
 * One listing under review: for a change to a live listing, what changes
 * for clients first; then the photos, large, because the photo rule is the
 * one check only a person can make; then the specs and the price. Approve and Send back stay pinned at the
 * foot of the panel however long the listing is.
 */
export function ListingReviewPanel({
  entry,
  shopName,
  typeName,
  formatName,
  tree,
  busy,
  actionError,
  headingRef,
  onBack,
  onApprove,
  onSendBack,
}: Props) {
  const { listing } = entry;
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const ruleId = useId();
  const chip = reviewChip(entry);
  const blocked = approveBlocker(entry, ticked);
  const pending = listing.reviewStatus === "pending";

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2 border-b border-outline px-4 pt-3 pb-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 self-start lg:hidden"
          onClick={onBack}
        >
          <ChevronLeft aria-hidden="true" />
          All listings
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-h3 text-text-primary m-0 break-words outline-offset-4"
            >
              {listing.name || "Untitled listing"}
            </h2>
            <p className="text-body text-text-secondary m-0 mt-1">
              {shopName} · {typeName(listing.subcategoryCode)}
            </p>
            <p className="text-caption text-text-muted m-0 mt-1">
              {reviewKindLabel(listing)}
              {listing.updatedAt
                ? ` · last changed ${formatDateTime(listing.updatedAt)}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={chip.tone} icon={chip.icon} label={chip.label} />
            {listing.suspendReason ? (
              <StatusChip tone="error" icon="ban" label="Taken down" />
            ) : null}
          </div>
        </div>
      </div>

      <div
        key={listing.id}
        role="region"
        aria-label={`${listing.name || "Listing"} details`}
        tabIndex={0}
        className="flex flex-col gap-5 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"
      >
        {entry.blockers.length && pending ? (
          <div
            className="rounded-[var(--radius-field)] border border-warning flex gap-2 p-3"
            role="note"
          >
            <TriangleAlert
              aria-hidden
              className="mt-0.5 size-4 shrink-0"
              style={{ color: "var(--color-warning)" }}
            />
            <div className="flex min-w-0 flex-col gap-1">
              <p
                className="text-body text-text-primary m-0"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                Not finished, so it cannot be approved yet
              </p>
              <ul className="text-body text-text-secondary m-0 flex flex-col gap-0.5 pl-5">
                {entry.blockers.map((code) => (
                  <li key={code}>{blockerSentence(code, listing)}</li>
                ))}
              </ul>
              <p className="text-caption text-text-muted m-0">
                Send it back with what is missing, or leave it until the shop finishes it.
              </p>
            </div>
          </div>
        ) : null}

        {/* A change to a live listing: what moves for clients comes first. */}
        {isRevision(listing) && pending ? (
          <LiveComparison listing={listing} typeName={typeName} />
        ) : null}

        <PhotoBench listing={listing} />

        <ListingFacts
          listing={listing}
          formatName={formatName}
          noFormats={entry.blockers.includes("accepted_file_formats")}
        />

        {listing.description ? (
          <section aria-labelledby={`${ruleId}-about`} className="flex flex-col gap-1">
            <h3
              id={`${ruleId}-about`}
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              Description
            </h3>
            <p className="text-body text-text-secondary m-0 max-w-[72ch] whitespace-pre-line break-words">
              {listing.description}
            </p>
          </section>
        ) : null}

        {tree === "admin" ? (
          <Link
            href={`/admin/supplier-products/${encodeURIComponent(listing.id)}`}
            className="text-body text-text-secondary self-start underline underline-offset-4"
          >
            Open on Supplier products
          </Link>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-t border-outline bg-surface p-4">
        {pending ? (
          <>
            <fieldset className="m-0 flex flex-col gap-1 border-0 p-0" disabled={busy}>
              <legend
                className="text-body text-text-primary mb-1 p-0"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {listing.photos.length === 1
                  ? "Check the photo for"
                  : listing.photos.length > 1
                    ? `Check all ${listing.photos.length} photos for`
                    : "Check every photo for"}
              </legend>
              <div className="grid gap-x-4 sm:grid-cols-3">
                {PHOTO_RULE_CHECKS.map((check) => {
                  const id = `${ruleId}-${check.id}`;
                  return (
                    <label
                      key={check.id}
                      htmlFor={id}
                      className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5"
                    >
                      <Checkbox
                        id={id}
                        className="mt-1"
                        checked={ticked.has(check.id)}
                        onCheckedChange={(value) =>
                          setTicked((current) => {
                            const next = new Set(current);
                            if (value === true) next.add(check.id);
                            else next.delete(check.id);
                            return next;
                          })
                        }
                      />
                      <span className="flex flex-col">
                        <span className="text-body text-text-primary">{check.label}</span>
                        <span className="text-caption text-text-muted">
                          {check.detail}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                disabled={busy || blocked != null}
                aria-describedby={blocked ? `${ruleId}-blocked` : undefined}
                onClick={onApprove}
              >
                {busy ? "Saving" : "Approve listing"}
              </Button>
              <Button disabled={busy} onClick={onSendBack}>
                Send back
              </Button>
              {blocked ? (
                <p id={`${ruleId}-blocked`} className="text-caption text-text-muted m-0">
                  {blocked}
                </p>
              ) : null}
            </div>
          </>
        ) : listing.reviewStatus === "needs_revision" ? (
          <div className="flex flex-col gap-1">
            <p className="text-caption text-text-muted m-0">
              Sent back
              {listing.reviewedAt ? ` ${formatDateTime(listing.reviewedAt)}` : ""}. The
              shop reads:
            </p>
            <p className="text-body text-text-primary m-0 max-w-[72ch] whitespace-pre-line">
              {listing.reviewReason ?? "No reason on file."}
            </p>
            <p className="text-caption text-text-muted m-0">
              It comes back to Waiting when the shop changes it or sends it again.
            </p>
          </div>
        ) : (
          <p className="text-body text-text-secondary m-0">
            Approved{listing.reviewedAt ? ` ${formatDateTime(listing.reviewedAt)}` : ""}.
            A later change to its price, specs, formats or photos comes back to Waiting.
          </p>
        )}
        {actionError ? (
          <p role="alert" className="text-body text-destructive m-0">
            {actionError}
          </p>
        ) : null}
      </div>
    </>
  );
}

/** Every sample, large, on a neutral plate; the cover is the first. */
function PhotoBench({ listing }: { listing: Listing }) {
  if (!listing.photos.length) {
    return (
      <p className="text-body text-text-secondary m-0 flex items-center gap-2">
        <ImageOff aria-hidden className="size-4" /> No sample photos yet.
      </p>
    );
  }
  return (
    <section aria-label="Sample photos" className="flex flex-col gap-2">
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
        {listing.photos.map((photo, index) => (
          <li key={photo.fileId} className="flex min-w-0 flex-col gap-1">
            {photo.downloadUrl ? (
              <a
                href={photo.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-muted block overflow-hidden rounded-[var(--radius-field)] border border-border"
              >
                {/* Signed, short-lived file URLs: next/image would proxy and cache them. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.downloadUrl}
                  alt={
                    photo.altText ||
                    `Sample photo ${index + 1} of ${listing.name || "this listing"}`
                  }
                  className="aspect-square w-full object-contain"
                />
              </a>
            ) : (
              <span className="bg-muted text-caption text-text-muted flex aspect-square items-center justify-center rounded-[var(--radius-field)] border border-border p-2 text-center">
                Photo not available. Refresh for a new link.
              </span>
            )}
            <span className="text-caption text-text-muted">
              {index === 0 ? "Cover photo" : `Photo ${index + 1}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-caption text-text-muted m-0">
        Open a photo to see it full size. Links expire after a few minutes; press Refresh
        for new ones.
      </p>
    </section>
  );
}

function ListingFacts({
  listing,
  formatName,
  noFormats,
}: {
  listing: Listing;
  formatName: (code: string) => string;
  /** The API reports no artwork format at all, so there is no fallback to name. */
  noFormats: boolean;
}) {
  const cap = printerCapLine(listing.printerMaxWidthFeet);
  const groups = [...listing.groups].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <section aria-label="Price and specs" className="flex flex-col gap-4">
      <dl className="m-0 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="text-caption text-text-muted">Shop price</dt>
        <dd className="text-body text-text-primary m-0 tabular-nums">
          {priceLine(listing)}
        </dd>
        {listing.priceTiers.length ? (
          <>
            <dt className="text-caption text-text-muted">Quantity prices</dt>
            <dd className="text-body text-text-primary m-0 tabular-nums">
              {listing.priceTiers
                .map(
                  (tier) => `${tier.minQuantity}+ at ${formatPhp(tier.unitPriceMinor)}`,
                )
                .join(", ")}
            </dd>
          </>
        ) : null}
        {listing.minimumOrderQuantity ? (
          <>
            <dt className="text-caption text-text-muted">Smallest order</dt>
            <dd className="text-body text-text-primary m-0 tabular-nums">
              {listing.minimumOrderQuantity}
            </dd>
          </>
        ) : null}
        <dt className="text-caption text-text-muted">Ready in</dt>
        <dd className="text-body text-text-primary m-0">
          {listing.turnaroundMode === "override"
            ? readyInLine(listing.turnaroundHours)
            : "The shop's usual time"}
        </dd>
        {cap ? (
          <>
            <dt className="text-caption text-text-muted">Printer</dt>
            <dd className="text-body text-text-primary m-0">{cap}</dd>
          </>
        ) : null}
        {noFormats ? null : (
          <>
            <dt className="text-caption text-text-muted">Artwork accepted</dt>
            <dd className="text-body text-text-primary m-0">
              {listing.formatCodes.length
                ? listing.formatCodes.map(formatName).join(", ")
                : "The service line's formats"}
            </dd>
          </>
        )}
      </dl>

      <div className="flex flex-col gap-2">
        <h3
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          Specs and add-ons
        </h3>
        {groups.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {groups.map((group) => {
              const options = group.options.filter((option) => option.active);
              return (
                <li
                  key={group.id}
                  className="border-outline flex flex-col gap-1 rounded-[var(--radius-field)] border p-3"
                >
                  <p className="text-body text-text-primary m-0 flex flex-wrap items-baseline gap-x-2">
                    <span style={{ fontFamily: "var(--font-medium)" }}>{group.name}</span>
                    <span className="text-caption text-text-muted">
                      {group.kind === "addon"
                        ? "Add-on, optional"
                        : `Spec, ${pickLine(group).toLowerCase()}`}
                    </span>
                  </p>
                  {options.length ? (
                    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                      {options.map((option) => (
                        <li
                          key={option.id}
                          className="text-caption text-text-primary bg-muted rounded-full px-2.5 py-1 tabular-nums"
                        >
                          {option.label}
                          {option.priceModifierMinor
                            ? ` ${option.priceModifierMinor > 0 ? "+" : "−"}${formatPhp(Math.abs(option.priceModifierMinor))}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-caption text-warning m-0">No active choice</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-body text-text-secondary m-0">No specs yet.</p>
        )}
      </div>
    </section>
  );
}

/**
 * A change to a listing clients already see: the approved version against
 * this draft, only where they differ.
 */
function LiveComparison({
  listing,
  typeName,
}: {
  listing: Listing;
  typeName: (code: string) => string;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; changes: ListingChange[] }
    | { kind: "unavailable" }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getStaffPublicCatalogItem(listing.id)
      .then((body) => {
        const live = normalizeListing(body);
        if (cancelled) return;
        setState(
          live
            ? { kind: "ready", changes: listingChanges(live, listing, typeName) }
            : { kind: "unavailable" },
        );
      })
      .catch(() => {
        // 404 when the approved version is not public right now (hidden, say).
        if (!cancelled) setState({ kind: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
    // The draft's version is what changes; a new version re-reads the live one.
  }, [listing.id, listing.version]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-label="What changes for clients" className="flex flex-col gap-2">
      <h3
        className="text-body text-text-primary m-0"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        What changes for clients
      </h3>
      {state.kind === "loading" ? (
        <p className="text-caption text-text-muted m-0">
          Reading the version clients see now…
        </p>
      ) : state.kind === "unavailable" ? (
        <p className="text-body text-text-secondary m-0">
          Clients cannot see the approved version right now (the shop may have it off the
          board), so there is nothing to compare. Review the listing as it is.
        </p>
      ) : state.changes.length === 0 ? (
        <p className="text-body text-text-secondary m-0">
          Price, specs and photos match what clients see now. The change may be to its
          artwork formats.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-outline border-b">
                <th
                  scope="col"
                  className="text-caption text-text-muted py-1.5 pr-3 font-normal"
                >
                  &nbsp;
                </th>
                <th
                  scope="col"
                  className="text-caption text-text-muted py-1.5 pr-3 font-normal"
                >
                  Clients see now
                </th>
                <th
                  scope="col"
                  className="text-caption text-text-muted py-1.5 font-normal"
                >
                  After approval
                </th>
              </tr>
            </thead>
            <tbody>
              {state.changes.map((change) => (
                <tr
                  key={change.label}
                  className="border-outline border-b align-top last:border-0"
                >
                  <th
                    scope="row"
                    className="text-body text-text-secondary py-2 pr-3 font-normal"
                  >
                    {change.label}
                  </th>
                  <td className="text-body text-text-secondary py-2 pr-3 tabular-nums">
                    {change.before}
                  </td>
                  <td
                    className="text-body text-text-primary py-2 tabular-nums"
                    style={{ fontFamily: "var(--font-medium)" }}
                  >
                    {change.after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
