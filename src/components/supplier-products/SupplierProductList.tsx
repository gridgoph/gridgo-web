"use client";

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, SlidersHorizontal } from "lucide-react";

import { productTypeName } from "@/components/supplier-products/SupplierProductFacts";
import { adminErrorMessage } from "@/app/admin/_lib/errors";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip } from "@/components/ui/StatusChip";
import { getTaxonomy, listStaffCatalogItems } from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { useLiveReload } from "@/lib/live/useLiveReload";
import {
  filtersAreSet,
  filtersFromSearchParams,
  listingBoardState,
  listingCountLine,
  listingPriceLine,
  normalizeStaffCatalogPage,
  searchFromFilters,
  shopLabel,
  specSummary,
  staffCatalogRequest,
  type StaffCatalogFilters,
  type StaffCatalogRow,
  type StaffShop,
} from "@/lib/supplier-products";
import { cn } from "@/lib/utils";

/** Select value for "no filter"; Base UI needs a non-empty item value. */
const ANY = "any";

type Loaded = {
  rows: StaffCatalogRow[];
  shops: StaffShop[];
  total: number;
  nextCursor: string | null;
};

function detailHref(row: StaffCatalogRow): string {
  return `/admin/supplier-products/${encodeURIComponent(row.listing.id)}`;
}

/** Filters other than the search box, which stays visible on a phone. */
function narrowingCount(filters: StaffCatalogFilters): number {
  return [
    filters.subcategoryCode,
    filters.supplierId,
    filters.minPesos.trim(),
    filters.maxPesos.trim(),
  ].filter(Boolean).length;
}

export function SupplierProductList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const applied = useMemo(
    () => filtersFromSearchParams(new URLSearchParams(search)),
    [search],
  );
  const filtered = filtersAreSet(applied);
  const narrowed = narrowingCount(applied);
  const [draft, setDraft] = useState<StaffCatalogFilters>(applied);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(narrowed > 0);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const moreFiltersId = useId();

  useEffect(() => {
    setDraft(applied);
  }, [applied]);

  const load = useSerializedLoad(
    useCallback(async () => {
      const requested = staffCatalogRequest(filtersFromSearchParams(new URLSearchParams(search)));
      if ("error" in requested) {
        setData(null);
        setError(requested.error);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setMoreError(null);
      try {
        const [tax, body] = await Promise.all([
          getTaxonomy(),
          listStaffCatalogItems(requested.query),
        ]);
        setTaxonomy(tax);
        setData(normalizeStaffCatalogPage(body));
      } catch (err) {
        setData(null);
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

  async function showMore() {
    if (!data?.nextCursor) return;
    const requested = staffCatalogRequest(applied, { cursor: data.nextCursor });
    if ("error" in requested) {
      setMoreError(requested.error);
      return;
    }
    setLoadingMore(true);
    setMoreError(null);
    try {
      const next = normalizeStaffCatalogPage(await listStaffCatalogItems(requested.query));
      setData((current) =>
        current
          ? {
              ...current,
              rows: [...current.rows, ...next.rows],
              total: next.total,
              nextCursor: next.nextCursor,
            }
          : current,
      );
    } catch (err) {
      setMoreError(adminErrorMessage(err, "Could not load more listings."));
    } finally {
      setLoadingMore(false);
    }
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    const requested = staffCatalogRequest(draft);
    if ("error" in requested) {
      setFormError(requested.error);
      setMoreFiltersOpen(true);
      return;
    }
    setFormError(null);
    router.push(`/admin/supplier-products${searchFromFilters(draft)}`);
  }

  const shops = data?.shops ?? [];
  const productTypes = useMemo(
    () =>
      [...(taxonomy?.subcategories ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    [taxonomy],
  );

  const columns = useMemo<DataTableColumn<StaffCatalogRow>[]>(
    () => [
      {
        id: "listing",
        header: "Listing",
        primary: true,
        alwaysVisible: true,
        sortValue: (row) => row.listing.name,
        filterValue: (row) => `${row.listing.name} ${specSummary(row.listing)}`,
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-3">
            <ListingThumb row={row} />
            <div className="flex min-w-0 flex-col">
              <Link
                href={detailHref(row)}
                className="text-body text-text-primary truncate underline-offset-4 hover:underline"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {row.listing.name || "Untitled listing"}
              </Link>
              <span className="text-caption text-text-muted max-w-[22rem] truncate">
                {specSummary(row.listing)}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: "shop",
        header: "Shop",
        sortValue: (row) => shopLabel(row.shop),
        cell: (row) => (
          <span className="text-body text-text-primary" data-testid="listing-shop">
            {shopLabel(row.shop)}
          </span>
        ),
      },
      {
        id: "type",
        header: "Product type",
        sortValue: (row) => productTypeName(taxonomy, row.listing.subcategoryCode),
        cell: (row) => (
          <span className="text-body text-text-secondary">
            {productTypeName(taxonomy, row.listing.subcategoryCode)}
          </span>
        ),
      },
      {
        id: "price",
        header: "Price",
        sortValue: (row) => row.listing.basePriceMinor,
        cell: (row) => (
          <span className="text-body text-text-primary tabular-nums whitespace-nowrap">
            {listingPriceLine(row.listing)}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => listingBoardState(row.listing).label,
        cell: (row) => {
          const board = listingBoardState(row.listing);
          return <StatusChip tone={board.tone} icon={board.icon} label={board.label} />;
        },
      },
      {
        id: "updated",
        header: "Last change",
        sortValue: (row) => row.listing.updatedAt ?? "",
        cell: (row) => (
          <span className="text-body text-text-secondary tabular-nums whitespace-nowrap">
            {formatDate(row.listing.updatedAt)}
          </span>
        ),
      },
    ],
    [taxonomy],
  );

  const rows = data?.rows ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Every shop&rsquo;s listings, with the shop beside each one. Open a listing to see its
        photos and specs, or to take it off the board for clients.
      </p>

      <form
        className="gg-card flex flex-col gap-3"
        onSubmit={apply}
        aria-label="Filter supplier products"
      >
        <div className="grid gap-3 lg:grid-cols-12">
          <Field className="lg:col-span-6">
            <FieldLabel htmlFor="supplier-products-q">Search</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="supplier-products-q"
                type="search"
                value={draft.q}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, q: event.target.value }))
                }
                placeholder="Shop, product, or spec"
              />
              <Button
                type="button"
                className="md:hidden"
                aria-expanded={moreFiltersOpen}
                aria-controls={moreFiltersId}
                onClick={() => setMoreFiltersOpen((open) => !open)}
              >
                <SlidersHorizontal aria-hidden />
                {narrowed > 0 ? `Filters (${narrowed})` : "Filters"}
              </Button>
            </div>
          </Field>
          <div
            id={moreFiltersId}
            className={cn(
              "gap-3 md:grid md:grid-cols-2 lg:col-span-6",
              moreFiltersOpen ? "grid" : "hidden",
            )}
          >
            <Field>
              <FieldLabel htmlFor="supplier-products-type">Product type</FieldLabel>
              <Select
                value={draft.subcategoryCode || ANY}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    subcategoryCode: !value || value === ANY ? "" : String(value),
                  }))
                }
              >
                <SelectTrigger id="supplier-products-type" className="min-h-11 w-full">
                  <SelectValue>
                    {(value) =>
                      !value || value === ANY
                        ? "Every product type"
                        : productTypeName(taxonomy, String(value))
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Every product type</SelectItem>
                  {productTypes.map((job) => (
                    <SelectItem key={job.code} value={job.code}>
                      {job.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-products-shop">Shop</FieldLabel>
              <Select
                value={draft.supplierId || ANY}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    supplierId: !value || value === ANY ? "" : String(value),
                  }))
                }
              >
                <SelectTrigger id="supplier-products-shop" className="min-h-11 w-full">
                  <SelectValue>
                    {(value) => {
                      if (!value || value === ANY) return "Every shop";
                      const shop = shops.find((entry) => entry.supplierId === value);
                      return shop ? shopLabel(shop) : String(value);
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Every shop</SelectItem>
                  {shops.map((shop) => (
                    <SelectItem key={shop.supplierId} value={shop.supplierId}>
                      {shopLabel(shop)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-products-min">Lowest price (₱)</FieldLabel>
              <Input
                id="supplier-products-min"
                inputMode="decimal"
                value={draft.minPesos}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, minPesos: event.target.value }))
                }
                placeholder="0.00"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-products-max">Highest price (₱)</FieldLabel>
              <Input
                id="supplier-products-max"
                inputMode="decimal"
                value={draft.maxPesos}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, maxPesos: event.target.value }))
                }
                placeholder="0.00"
              />
            </Field>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary">
            Apply filters
          </Button>
          {filtered ? (
            <Button type="button" onClick={() => router.push("/admin/supplier-products")}>
              Clear filters
            </Button>
          ) : null}
          {formError ? (
            <p className="text-body text-destructive m-0" role="alert">
              {formError}
            </p>
          ) : null}
        </div>
      </form>

      {error && !loading ? (
        <ErrorState
          body={error}
          action={
            <Button type="button" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : (
        <>
          {data ? (
            <p
              className="text-caption text-text-muted m-0 tabular-nums"
              role="status"
              data-testid="listing-count"
            >
              {listingCountLine(rows.length, data.total, filtered)}
            </p>
          ) : null}
          <DataTable
            caption="Supplier products"
            columns={columns}
            data={rows}
            getRowId={(row) => row.listing.id}
            loading={loading && !data}
            itemLabel="listings"
            pageSize={Math.max(50, rows.length)}
            rowActions={(row) => (
              <DataTableRowAction
                label={`Open ${row.listing.name || "listing"}`}
                icon={ChevronRight}
                href={detailHref(row)}
              />
            )}
            empty={
              <EmptyState
                title={filtered ? "No listings match" : "No shop listings yet"}
                body={
                  filtered
                    ? "Clear a filter or search for a different shop, product type, or price."
                    : "When a shop publishes a listing, it shows up here with that shop's name."
                }
                action={
                  filtered ? (
                    <Button
                      type="button"
                      onClick={() => router.push("/admin/supplier-products")}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            }
          />
          {moreError ? (
            <p className="text-body text-destructive m-0" role="alert">
              {moreError}
            </p>
          ) : null}
          {data?.nextCursor ? (
            <div>
              <Button type="button" onClick={() => void showMore()} disabled={loadingMore}>
                {loadingMore ? "Loading more listings" : "Show more listings"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ListingThumb({ row }: { row: StaffCatalogRow }) {
  const photo = row.listing.photos[0];
  if (!photo?.downloadUrl) {
    return (
      <span
        aria-hidden
        className="border-outline text-text-muted bg-surface-variant inline-flex size-10 shrink-0 items-center justify-center rounded-md border text-caption"
      >
        {row.listing.photos.length ? "Photo" : "None"}
      </span>
    );
  }
  return (
    // Signed, short-lived file URLs: next/image would proxy and cache them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.downloadUrl}
      alt={photo.altText || row.listing.name}
      className="border-outline size-10 shrink-0 rounded-md border object-cover"
    />
  );
}
