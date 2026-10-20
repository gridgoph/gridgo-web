"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableRowAction, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { listStaffCatalogItems } from "@/lib/api/client";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  choiceLine,
  reviewReasonStaffLine,
} from "@/lib/production-time-choice";
import {
  listingCountLine,
  normalizeStaffCatalogPage,
  shopLabel,
  type StaffCatalogRow,
} from "@/lib/supplier-products";

const PAGE = 50;

/** Where a listing opens in the caller's own tree. */
export function staffListingHref(tree: "ops" | "admin", itemId: string): string {
  return `/${tree}/supplier-products/${encodeURIComponent(itemId)}`;
}

/**
 * Listings whose shop is asked to "Check your production time"
 * (gridgo-api#292 release 2): rounded up to one working day on 7 Oct, or an
 * Express listing with no hours. Read from
 * `GET /ops/catalog-items?productionTimeReview=required`. Operations follows
 * up with the shop; only the shop can clear it, by saving a production time.
 */
export function ProductionTimeChecks({
  tree,
  refreshSignal = 0,
}: {
  tree: "ops" | "admin";
  /** Bumped by the desk's Refresh. */
  refreshSignal?: number;
}) {
  const [rows, setRows] = useState<StaffCatalogRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useSerializedLoad(
    useCallback(async () => {
      setError(null);
      try {
        const page = normalizeStaffCatalogPage(
          await listStaffCatalogItems({ productionTimeReview: "required", limit: PAGE }),
        );
        setRows(page.rows);
        setTotal(page.total);
        setCursor(page.nextCursor);
      } catch (err) {
        setError(opsErrorMessage(err, "Could not load the listings to check."));
      }
    }, []),
  );

  useLiveReload("catalog", load);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = normalizeStaffCatalogPage(
        await listStaffCatalogItems({ productionTimeReview: "required", limit: PAGE, cursor }),
      );
      setRows((current) => [...(current ?? []), ...page.rows]);
      setTotal(page.total);
      setCursor(page.nextCursor);
    } catch (err) {
      setMoreError(opsErrorMessage(err, "Could not load more listings."));
    } finally {
      setLoadingMore(false);
    }
  }

  if (error && !rows) {
    return (
      <ErrorState body={error} action={<Button onClick={() => void load()}>Try again</Button>} />
    );
  }

  const columns: DataTableColumn<StaffCatalogRow>[] = [
    {
      id: "listing",
      header: "Listing",
      primary: true,
      alwaysVisible: true,
      sortValue: (row) => row.listing.name,
      cell: (row) => (
        <Link
          href={staffListingHref(tree, row.listing.id)}
          className="text-text-primary underline-offset-4 hover:underline"
        >
          {row.listing.name || "Untitled listing"}
        </Link>
      ),
    },
    {
      id: "shop",
      header: "Shop",
      sortValue: (row) => shopLabel(row.shop),
      cell: (row) => shopLabel(row.shop),
    },
    {
      id: "reason",
      header: "Why",
      sortValue: (row) =>
        (row.listing.productionTimeReview?.reasons ?? []).map(reviewReasonStaffLine).join(", "),
      cell: (row) => {
        const reasons = row.listing.productionTimeReview?.reasons ?? [];
        return reasons.length ? (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {reasons.map((reason) => (
              <li key={reason}>{reviewReasonStaffLine(reason)}</li>
            ))}
          </ul>
        ) : (
          "Asked to check"
        );
      },
    },
    {
      id: "time",
      header: "Production time now",
      sortValue: (row) => choiceLine(row.listing.productionTime),
      cell: (row) => choiceLine(row.listing.productionTime),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Shops see Check your production time on these listings until they save one. GRIDGO
        rounded some up to 1 working day on 7 Oct, and Express listings with no hours could
        not become Same day on their own. Follow up with the shop if a listing waits here.
      </p>
      <DataTable
        caption="Listings to check"
        columns={columns}
        data={rows ?? []}
        getRowId={(row) => row.listing.id}
        loading={!rows}
        itemLabel="listings"
        pageSize={Math.max(PAGE, rows?.length ?? 0)}
        toolbar={
          rows ? (
            <p className="text-body text-text-secondary m-0 tabular-nums" role="status">
              {listingCountLine(rows.length, total, false)}
            </p>
          ) : null
        }
        rowActions={(row) => (
          <DataTableRowAction
            label="Open listing"
            icon={ChevronRight}
            href={staffListingHref(tree, row.listing.id)}
          />
        )}
        empty={
          <EmptyState
            title="Nothing to check"
            body="Every shop has confirmed its production times."
          />
        }
      />
      {cursor ? (
        <div className="flex flex-col items-start gap-1">
          <Button disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Show more listings"}
          </Button>
          {moreError ? (
            <p className="text-caption text-destructive m-0" role="alert">
              {moreError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
