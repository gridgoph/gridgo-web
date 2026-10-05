"use client";

import { Clock, SquarePen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { Listing } from "@/lib/listings";

type Props = {
  listing: Listing;
  /** A save is running or waiting; sending now would send an older version. */
  busy: boolean;
  onSend: () => void;
};

/**
 * Where the listing stands with Operations, on the editor. A send-back shows
 * Operations' reason word for word and the one way forward: fix it, then send
 * it again. Changes to price, specs, formats or photos go back for review on
 * their own; a text-only fix needs the button.
 */
export function ListingReviewNotice({ listing, busy, onSend }: Props) {
  if (listing.suspendReason) return null;
  if (listing.reviewStatus === "needs_revision") {
    return (
      <section
        aria-labelledby="listing-review-heading"
        className="rounded-card border-warning bg-surface flex flex-col gap-3 border p-4"
      >
        <div className="flex items-start gap-2">
          <SquarePen
            aria-hidden
            className="mt-0.5 size-4 shrink-0"
            style={{ color: "var(--color-warning)" }}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id="listing-review-heading"
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              Operations sent this back
              {listing.reviewedAt ? (
                <span
                  className="text-caption text-text-muted"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  {" "}
                  on {formatDateTime(listing.reviewedAt)}
                </span>
              ) : null}
            </h2>
            <p className="text-body text-text-primary m-0 max-w-prose whitespace-pre-line">
              {listing.reviewReason ??
                "Open the listing and check its photos, specs and price."}
            </p>
            <p className="text-caption text-text-secondary m-0 max-w-prose">
              {listing.hasApprovedVersion
                ? "Clients still see your last approved version. "
                : "Clients cannot see this listing yet. "}
              Fix what is asked, then send it for review again.
            </p>
          </div>
        </div>
        <div>
          <Button type="button" disabled={busy} onClick={onSend}>
            Send for review
          </Button>
        </div>
      </section>
    );
  }
  if (listing.reviewStatus === "pending") {
    return (
      <p
        className="rounded-card border-outline bg-surface text-body text-text-secondary m-0 flex items-start gap-2 border p-3"
        role="note"
      >
        <Clock
          aria-hidden
          className="mt-0.5 size-4 shrink-0"
          style={{ color: "var(--color-info)" }}
        />
        <span>
          {listing.hasApprovedVersion
            ? "Your changes are waiting for Operations to review. Clients see your last approved version until then."
            : "Waiting for Operations to review. Clients see a new listing only after Operations approves it."}
        </span>
      </p>
    );
  }
  return null;
}
