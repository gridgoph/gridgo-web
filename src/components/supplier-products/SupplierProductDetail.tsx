"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

import { SupplierProductFacts } from "@/components/supplier-products/SupplierProductFacts";
import { adminErrorMessage } from "@/app/admin/_lib/errors";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isApiError,
  getStaffCatalogItem,
  getTaxonomy,
  restoreStaffCatalogItem,
  suspendStaffCatalogItem,
} from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  TAKE_DOWN_REASON_MAX,
  normalizeStaffCatalogDetail,
  takenDownLine,
  type StaffCatalogRow,
} from "@/lib/supplier-products";

const RESTORED_NOTICE =
  "Restored. The shop has been told, and the listing stays hidden until the shop puts it back on the board.";

function takeDownErrorMessage(err: unknown): string {
  if (isApiError(err) && err.code === "listing_suspended") {
    return "Someone already took this listing down. Its reason is shown above.";
  }
  if (isApiError(err) && err.code === "reason_too_long") {
    return `Shorten the reason to ${TAKE_DOWN_REASON_MAX.toLocaleString("en-PH")} characters or fewer.`;
  }
  if (isApiError(err) && err.code === "reason_required") {
    return "Enter a reason. The shop sees it on the listing and in a notification.";
  }
  return adminErrorMessage(err, "Could not take this listing down.");
}

export function SupplierProductDetail({ itemId }: { itemId: string }) {
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [row, setRow] = useState<StaffCatalogRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [tax, body] = await Promise.all([getTaxonomy(), getStaffCatalogItem(itemId)]);
        setTaxonomy(tax);
        const detail = normalizeStaffCatalogDetail(body);
        if (!detail) {
          setRow(null);
          setError("That listing did not include its shop.");
          return;
        }
        setRow(detail);
      } catch (err) {
        setRow(null);
        setError(adminErrorMessage(err, "Could not load this listing."));
      } finally {
        setLoading(false);
      }
    }, [itemId]),
  );

  useLiveReload("catalog", load, { matchId: itemId });

  useEffect(() => {
    void load();
  }, [load]);

  async function takeDown(event: FormEvent) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError(true);
      setActionError("Enter a reason. The shop sees it on the listing and in a notification.");
      return;
    }
    setActing(true);
    setActionError(null);
    try {
      await suspendStaffCatalogItem(itemId, trimmed);
      setReason("");
      setNotice(null);
      await load();
    } catch (err) {
      setActionError(takeDownErrorMessage(err));
      if (isApiError(err) && err.kind === "conflict") await load();
    } finally {
      setActing(false);
    }
  }

  async function restore() {
    setActing(true);
    setActionError(null);
    try {
      await restoreStaffCatalogItem(itemId);
      setNotice(RESTORED_NOTICE);
      await load();
    } catch (err) {
      setActionError(
        isApiError(err) && err.code === "listing_not_suspended"
          ? "Someone already restored this listing."
          : adminErrorMessage(err, "Could not restore this listing."),
      );
      if (isApiError(err) && err.kind === "conflict") await load();
    } finally {
      setActing(false);
    }
  }

  if (loading && !row) return <Skeleton className="h-48 w-full" />;
  if (!row) {
    return (
      <ErrorState
        body={error || "That listing did not include its shop."}
        action={
          <Button type="button" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  }

  const listing = row.listing;
  const reasonLeft = TAKE_DOWN_REASON_MAX - reason.length;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/supplier-products"
        className="text-body text-text-secondary self-start underline-offset-4 hover:underline"
      >
        All supplier products
      </Link>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <article className="gg-card flex flex-col gap-3">
          <SupplierProductFacts shop={row.shop} listing={listing} taxonomy={taxonomy} />
          {listing.description ? (
            <p className="text-body text-text-secondary m-0 max-w-prose">
              {listing.description}
            </p>
          ) : null}
        </article>

        {listing.suspendReason ? (
          <section
            className="gg-card border-warning flex flex-col gap-3"
            aria-labelledby="take-down-heading"
          >
            <h2 id="take-down-heading" className="text-h3 text-text-primary m-0">
              {takenDownLine(listing)}
            </h2>
            <div className="flex flex-col gap-1">
              <p className="text-caption text-text-muted m-0">Reason the shop sees</p>
              <p className="text-body text-text-primary m-0 max-w-prose whitespace-pre-line">
                {listing.suspendReason}
              </p>
            </div>
            <p className="text-body text-text-secondary m-0 max-w-prose">
              Clients cannot see this listing. The shop sees it as Taken down by GRIDGO and
              cannot put it back on the board. Restoring lifts the take-down and tells the
              shop; the listing stays hidden until the shop puts it back.
            </p>
            <div>
              <Button
                type="button"
                variant="primary"
                disabled={acting}
                onClick={() => void restore()}
              >
                {acting ? "Restoring" : "Restore listing"}
              </Button>
            </div>
          </section>
        ) : (
          <form
            className="gg-card flex flex-col gap-3"
            aria-labelledby="take-down-heading"
            onSubmit={(event) => void takeDown(event)}
          >
            <h2 id="take-down-heading" className="text-h3 text-text-primary m-0">
              Take this listing down
            </h2>
            <p className="text-body text-text-secondary m-0 max-w-prose">
              Clients stop seeing it straight away. The shop gets a notification with your
              reason, sees it on the listing, and cannot put it back on the board until you
              restore it.
            </p>
            <Field data-invalid={reasonError ? true : undefined}>
              <FieldLabel htmlFor="take-down-reason">Reason the shop will see</FieldLabel>
              <Textarea
                id="take-down-reason"
                rows={3}
                maxLength={TAKE_DOWN_REASON_MAX}
                value={reason}
                aria-invalid={reasonError ? true : undefined}
                aria-describedby="take-down-reason-help"
                onChange={(event) => {
                  setReason(event.target.value);
                  setReasonError(false);
                }}
                placeholder="For example: priced per metre, but the photos show single stickers. Fix the pricing unit."
              />
              <FieldDescription id="take-down-reason-help">
                {reasonLeft <= 200
                  ? `${reasonLeft} characters left.`
                  : "Write it for the shop: what is wrong and what to fix."}
              </FieldDescription>
            </Field>
            <div>
              <Button type="submit" variant="danger" disabled={acting}>
                {acting ? "Taking down" : "Take down"}
              </Button>
            </div>
          </form>
        )}
      </div>
      {notice ? (
        <p className="text-body text-text-secondary m-0" role="status">
          {notice}
        </p>
      ) : null}
      {actionError ? (
        <p className="text-body text-destructive m-0" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
