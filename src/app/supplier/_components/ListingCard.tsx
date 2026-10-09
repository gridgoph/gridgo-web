"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Pencil } from "lucide-react";

import { SamplePhoto } from "@/app/supplier/_components/SamplePhoto";
import { ListingPreviewBody } from "@/app/supplier/_components/ListingPreviewBody";
import { listingErrorMessage } from "@/app/supplier/_lib/listings-api";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusChip, StatusMark } from "@/components/ui/StatusChip";
import {
  listAcceptedFileFormats,
  listCatalogItemPrepSteps,
  updateCatalogItem,
} from "@/lib/api/client";
import {
  boardContextFor,
  boardStanding,
  CHANGES_IN_REVIEW_NOTE,
  normalizeListing,
  normalizePrepSteps,
  priceLine,
  printerCapLine,
  readyInLine,
  subcategoryName,
  type BoardStanding,
  type Listing,
  type ListingReadiness,
  type PrepStep,
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
  /** The board replaces this listing after Hide, then rereads readiness. */
  onSaved?: (listing: Listing) => void | Promise<void>;
};

type ClientFormats = Awaited<ReturnType<typeof listAcceptedFileFormats>>;

export function ListingCard({
  listing,
  taxonomy,
  services,
  shopApproved,
  readiness,
  layout = "tile",
  preview = false,
  onSaved,
}: Props) {
  const context = boardContextFor(listing, services);
  const standing = boardStanding(listing, context, shopApproved, readiness);
  const first = listing.photos[0];
  const hours =
    listing.turnaroundMode === "override"
      ? listing.turnaroundHours
      : context.inheritedTurnaroundHours;
  const cap = printerCapLine(listing.printerMaxWidthFeet);
  const takenDown = Boolean(listing.suspendReason);
  const hideLabel = takenDown || listing.onTheBoard ? "Hide" : "Put it back";
  const hideHintId = useId();
  const [hiding, setHiding] = useState(false);
  const [hideError, setHideError] = useState<string | null>(null);
  const [clientOpen, setClientOpen] = useState(false);
  const [clientSteps, setClientSteps] = useState<PrepStep[] | null>(null);
  const [clientFormats, setClientFormats] = useState<ClientFormats | null>(null);

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

  const name = listing.name || "Untitled listing";
  const title = (
    <p
      className="text-body text-text-primary m-0 truncate"
      style={{ fontFamily: "var(--font-medium)" }}
    >
      {preview ? (
        name
      ) : (
        <Link
          href={`/supplier/catalogue/${listing.id}`}
          className="text-text-primary no-underline hover:underline"
        >
          {name}
        </Link>
      )}
    </p>
  );

  const identity = (
    <>
      {title}
      <p className="text-caption text-text-muted m-0 truncate">
        {subcategoryName(taxonomy, listing.subcategoryCode)}
      </p>
    </>
  );
  const quote = (
    <>
      <p className="text-body text-text-primary m-0">{priceLine(listing)}</p>
      {cap ? <p className="text-caption text-text-secondary m-0">{cap}</p> : null}
      <p className="text-caption text-text-secondary m-0">{readyInLine(hours)}</p>
    </>
  );
  const status = preview && standing.kind === "live" ? null : <CardStatus standing={standing} />;

  /**
   * The editor's board switch: PATCH `active` only. That field does not open
   * a review. A GRIDGO take-down is not a hide, so this does not send
   * `active: true` while `suspendReason` is set.
   */
  async function hide() {
    if (takenDown || hiding) return;
    setHiding(true);
    setHideError(null);
    try {
      const saved = normalizeListing(
        await updateCatalogItem(listing.id, listing.version, {
          active: !listing.onTheBoard,
        }),
      );
      if (!saved) throw new Error("unreadable");
      await onSaved?.(saved);
    } catch (err) {
      setHideError(listingErrorMessage(err, "Could not update this listing."));
    } finally {
      setHiding(false);
    }
  }

  async function openClientView() {
    setClientOpen(true);
    if (clientSteps && clientFormats) return;
    const [stepsBody, formatList] = await Promise.all([
      listCatalogItemPrepSteps(listing.id).catch(() => ({ prepSteps: [] })),
      listAcceptedFileFormats().catch(() => []),
    ]);
    setClientSteps(normalizePrepSteps(stepsBody));
    setClientFormats(formatList);
  }

  const actions = preview ? null : (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/supplier/catalogue/${listing.id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <Pencil data-icon="inline-start" aria-hidden />
          Edit
        </Link>
        <Button
          size="sm"
          type="button"
          disabled={takenDown || hiding}
          aria-describedby={takenDown ? hideHintId : undefined}
          onClick={() => void hide()}
        >
          {listing.onTheBoard && !takenDown ? (
            <EyeOff data-icon="inline-start" aria-hidden />
          ) : (
            <Eye data-icon="inline-start" aria-hidden />
          )}
          {hideLabel}
        </Button>
        <Button size="sm" type="button" onClick={() => void openClientView()}>
          <Eye data-icon="inline-start" aria-hidden />
          View as client
        </Button>
      </div>
      {takenDown ? (
        <p id={hideHintId} className="text-caption text-text-secondary m-0">
          Only GRIDGO can put this back on the board.
        </p>
      ) : null}
      {hideError ? (
        <p className="text-caption text-destructive m-0" role="alert">
          {hideError}
        </p>
      ) : null}
    </div>
  );

  const clientDialog = preview ? null : (
    <Dialog open={clientOpen} onOpenChange={setClientOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-overline text-text-muted uppercase">
            What clients see
          </DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        {clientSteps && clientFormats ? (
          <ListingPreviewBody
            listing={listing}
            taxonomy={taxonomy}
            services={services}
            prepSteps={clientSteps}
            formats={clientFormats}
          />
        ) : (
          <p className="text-body text-text-secondary m-0">Opening what clients see.</p>
        )}
      </DialogContent>
    </Dialog>
  );

  if (layout === "row") {
    return (
      <div className="rounded-card border-outline bg-surface grid grid-cols-[5.5rem_minmax(0,1fr)] items-start overflow-hidden border md:grid-cols-[6.5rem_minmax(0,1fr)]">
        {photo}
        <div className="flex min-w-0 flex-col gap-2 p-2">
          <div className="grid min-w-0 items-start gap-x-4 gap-y-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-1">
              {identity}
              {status}
            </div>
            <div className="flex min-w-0 flex-col gap-1">{quote}</div>
          </div>
          {actions}
        </div>
        {clientDialog}
      </div>
    );
  }

  return (
    <div
      data-testid={preview ? "listing-preview" : undefined}
      className="rounded-card border-outline bg-surface flex flex-col overflow-hidden border"
    >
      {photo}
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-col gap-1">
          {identity}
          {status}
          {quote}
        </div>
        {actions}
      </div>
      {clientDialog}
    </div>
  );
}

/**
 * One status. A live listing whose edit is in review stays Live, and the
 * same line carries `CHANGES_IN_REVIEW_NOTE` — clients still see the approved
 * version. No second chip, and no new standing.
 */
function CardStatus({ standing }: { standing: BoardStanding }) {
  if (standing.kind === "live" && standing.secondary === "pending_review") {
    return (
      <p
        data-status-line
        role="status"
        className="text-caption m-0 flex flex-wrap items-baseline gap-x-1.5"
      >
        <StatusMark tone="success" label={standing.label} icon="circle-check" />
        <span className="text-text-secondary">{CHANGES_IN_REVIEW_NOTE}</span>
      </p>
    );
  }

  if (standing.kind === "live" && standing.secondary === "needs_changes") {
    return (
      <p
        data-status-line
        role="status"
        className="text-caption m-0 flex flex-wrap items-baseline gap-x-1.5"
      >
        <StatusMark tone="success" label="Live" icon="circle-check" />
        <span className="text-text-secondary">
          {standing.note ? `Needs changes. ${standing.note}` : "Needs changes."}
        </span>
      </p>
    );
  }

  return (
    <div data-status-line className="flex flex-col gap-1">
      <StatusChip tone={standing.tone} label={standing.label} icon={standing.icon} />
      {standing.note ? (
        <p className="text-caption text-text-secondary m-0 line-clamp-2">{standing.note}</p>
      ) : null}
    </div>
  );
}
