"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

import { SupplierProductFacts } from "@/components/supplier-products/SupplierProductFacts";
import { adminErrorMessage } from "@/app/admin/_lib/errors";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getStaffCatalogItem,
  getTaxonomy,
  restoreStaffCatalogItem,
  suspendStaffCatalogItem,
} from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { normalizeStaffCatalogDetail, type StaffCatalogRow } from "@/lib/supplier-products";

export function SupplierProductDetail({ itemId }: { itemId: string }) {
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [row, setRow] = useState<StaffCatalogRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
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
      setActionError("Enter a reason. The shop sees it on the listing and in a notification.");
      return;
    }
    setActing(true);
    setActionError(null);
    try {
      await suspendStaffCatalogItem(itemId, trimmed);
      setReason("");
      await load();
    } catch (err) {
      setActionError(adminErrorMessage(err, "Could not take this listing down."));
    } finally {
      setActing(false);
    }
  }

  async function restore() {
    setActing(true);
    setActionError(null);
    try {
      await restoreStaffCatalogItem(itemId);
      await load();
    } catch (err) {
      setActionError(adminErrorMessage(err, "Could not restore this listing."));
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

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/supplier-products" className="text-body text-text-secondary">
        All supplier products
      </Link>
      <article className="rounded-card border border-outline bg-surface p-4">
        <SupplierProductFacts shop={row.shop} listing={row.listing} taxonomy={taxonomy} heading="page" />
        {row.listing.description ? (
          <p className="mt-3 mb-0 max-w-prose text-body text-text-secondary">{row.listing.description}</p>
        ) : null}
      </article>
      {row.listing.suspendReason ? (
        <Button type="button" variant="primary" disabled={acting} onClick={() => void restore()}>
          {acting ? "Restoring" : "Restore"}
        </Button>
      ) : (
        <form className="flex max-w-xl flex-col gap-3" onSubmit={(event) => void takeDown(event)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="take-down-reason">Reason the shop will see</Label>
            <Input
              id="take-down-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="What should the shop read?"
            />
          </div>
          <div>
            <Button type="submit" variant="danger" disabled={acting}>
              {acting ? "Taking down" : "Take down"}
            </Button>
          </div>
        </form>
      )}
      {actionError ? (
        <p className="m-0 text-body text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
