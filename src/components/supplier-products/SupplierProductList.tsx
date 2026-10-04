"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { SupplierProductFacts } from "@/components/supplier-products/SupplierProductFacts";
import { adminErrorMessage } from "@/app/admin/_lib/errors";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getTaxonomy, listStaffCatalogItems } from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { useLiveReload } from "@/lib/live/useLiveReload";
import {
  filtersAreSet,
  filtersFromSearchParams,
  normalizeStaffCatalogPage,
  searchFromFilters,
  shopLabel,
  staffCatalogRequest,
  type StaffCatalogFilters,
  type StaffCatalogPage,
} from "@/lib/supplier-products";

const fieldClass =
  "h-12 w-full min-w-0 rounded-[var(--radius-field)] border border-input bg-card px-3 text-body text-foreground";

export function SupplierProductList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const applied = filtersFromSearchParams(searchParams);
  const [draft, setDraft] = useState<StaffCatalogFilters>(applied);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [page, setPage] = useState<StaffCatalogPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDraft(filtersFromSearchParams(new URLSearchParams(search)));
  }, [search]);

  const load = useSerializedLoad(
    useCallback(async () => {
      const filters = filtersFromSearchParams(new URLSearchParams(search));
      const requested = staffCatalogRequest(filters);
      if ("error" in requested) {
        setPage(null);
        setError(requested.error);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [tax, body] = await Promise.all([
          getTaxonomy(),
          listStaffCatalogItems(requested.query),
        ]);
        setTaxonomy(tax);
        setPage(normalizeStaffCatalogPage(body));
      } catch (err) {
        setPage(null);
        setError(adminErrorMessage(err, "Could not load supplier products."));
      } finally {
        setLoading(false);
      }
    }, [search]),
  );

  useLiveReload("catalog", load);

  useEffect(() => {
    void load();
  }, [load]);

  function apply(event: FormEvent) {
    event.preventDefault();
    const requested = staffCatalogRequest(draft);
    if ("error" in requested) {
      setFormError(requested.error);
      return;
    }
    setFormError(null);
    router.push(`/admin/supplier-products${searchFromFilters(draft)}`);
  }

  const shops = page?.shops ?? [];
  const productTypes = [...(taxonomy?.subcategories ?? [])].sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  return (
    <div className="flex flex-col gap-4">
      <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" onSubmit={apply}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supplier-products-q">Search</Label>
          <Input
            id="supplier-products-q"
            value={draft.q}
            onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
            placeholder="Shop, product, or spec"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supplier-products-type">Product type</Label>
          <select
            id="supplier-products-type"
            className={fieldClass}
            value={draft.subcategoryCode}
            onChange={(event) =>
              setDraft((current) => ({ ...current, subcategoryCode: event.target.value }))
            }
          >
            <option value="">Every product type</option>
            {productTypes.map((job) => (
              <option key={job.code} value={job.code}>
                {job.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supplier-products-shop">Shop</Label>
          <select
            id="supplier-products-shop"
            className={fieldClass}
            value={draft.supplierId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, supplierId: event.target.value }))
            }
          >
            <option value="">Every shop</option>
            {shops.map((shop) => (
              <option key={shop.supplierId} value={shop.supplierId}>
                {shopLabel(shop)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supplier-products-min">Lowest price (₱)</Label>
          <Input
            id="supplier-products-min"
            inputMode="decimal"
            value={draft.minPesos}
            onChange={(event) =>
              setDraft((current) => ({ ...current, minPesos: event.target.value }))
            }
            placeholder="0.00"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supplier-products-max">Highest price (₱)</Label>
          <Input
            id="supplier-products-max"
            inputMode="decimal"
            value={draft.maxPesos}
            onChange={(event) =>
              setDraft((current) => ({ ...current, maxPesos: event.target.value }))
            }
            placeholder="0.00"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" variant="primary">
            Apply
          </Button>
          {filtersAreSet(applied) ? (
            <Button type="button" onClick={() => router.push("/admin/supplier-products")}>
              Clear
            </Button>
          ) : null}
        </div>
      </form>
      {formError ? (
        <p className="m-0 text-body text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      {loading && !page ? <Skeleton className="h-40 w-full" /> : null}
      {!loading && error ? (
        <ErrorState
          body={error}
          action={
            <Button type="button" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : null}
      {!loading && !error && page && page.rows.length === 0 ? (
        <EmptyState
          title={filtersAreSet(applied) ? "No listings match" : "No shop listings yet"}
          body={
            filtersAreSet(applied)
              ? "Clear a filter or search for a different shop, product type, or price."
              : "When a shop publishes a listing, it shows up here with that shop's name."
          }
        />
      ) : null}
      {page && page.rows.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {page.rows.map((row) => (
            <li key={row.listing.id}>
              <Link
                href={`/admin/supplier-products/${encodeURIComponent(row.listing.id)}`}
                className="block rounded-card border border-outline bg-surface p-4 text-inherit no-underline hover:bg-overlay-hover"
              >
                <SupplierProductFacts shop={row.shop} listing={row.listing} taxonomy={taxonomy} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {page?.nextCursor ? (
        <MoreListings key={search} cursor={page.nextCursor} applied={applied} taxonomy={taxonomy} />
      ) : null}
    </div>
  );
}

function MoreListings({
  cursor,
  applied,
  taxonomy,
}: {
  cursor: string;
  applied: StaffCatalogFilters;
  taxonomy: Taxonomy | null;
}) {
  const [rows, setRows] = useState<StaffCatalogPage["rows"]>([]);
  const [next, setNext] = useState<string | null>(cursor);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRows([]);
    setNext(cursor);
    setError(null);
  }, [cursor]);

  async function showMore() {
    if (!next) return;
    const requested = staffCatalogRequest(applied, { cursor: next });
    if ("error" in requested) {
      setError(requested.error);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await listStaffCatalogItems(requested.query);
      const page = normalizeStaffCatalogPage(body);
      setRows((current) => [...current, ...page.rows]);
      setNext(page.nextCursor);
    } catch (err) {
      setError(adminErrorMessage(err, "Could not load more listings."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((row) => (
            <li key={row.listing.id}>
              <Link
                href={`/admin/supplier-products/${encodeURIComponent(row.listing.id)}`}
                className="block rounded-card border border-outline bg-surface p-4 text-inherit no-underline hover:bg-overlay-hover"
              >
                <SupplierProductFacts shop={row.shop} listing={row.listing} taxonomy={taxonomy} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="m-0 text-body text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {next ? (
        <Button type="button" onClick={() => void showMore()} disabled={loading}>
          {loading ? "Loading" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}
