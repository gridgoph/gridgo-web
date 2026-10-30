"use client";

/**
 * Every shop's performance, warnings only (gridgo-api#223 decision B,
 * `GET /ops/shops/performance`): on-time rate and incidents over the last 30
 * days, warnings, Top Pick status and roster review. Shops that need a look
 * come first. No money appears: late work costs a shop a notice, not pesos.
 *
 * The endpoint returns ids only, so names come from the rankings board, as on
 * Late production. A notice opened from the inbox names only its order:
 * `?order=` finds the shop with that order in its history and opens it.
 *
 * One implementation for Operations and Super Admin; links stay in the tree.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import {
  shopPerformanceHref,
  type PerformanceTree,
} from "@/components/shop-performance/paths";
import { useRefreshOnFocus } from "@/components/shop-performance/useRefreshOnFocus";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
  type DataTableFacet,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusChip } from "@/components/ui/StatusChip";
import { getShopRankings, listShopPerformance } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  PERFORMANCE_WINDOW_DAYS,
  ROSTER_REVIEW_CHIP,
  needsAttention,
  onTimeDetail,
  onTimeRateText,
  performanceRow,
  shopForOrder,
  sortPerformanceRows,
  topPickChip,
  type ShopPerformanceRow,
} from "@/lib/supplier-performance";

const FACETS: DataTableFacet[] = [
  {
    columnId: "topPick",
    title: "Top Pick",
    options: [
      { value: "hidden", label: "Hidden" },
      { value: "shown", label: "Can be Top Pick" },
    ],
  },
];

export function ShopPerformanceList({ tree }: { tree: PerformanceTree }) {
  const router = useRouter();
  const orderParam = useSearchParams().get("order");
  const [rows, setRows] = useState<ShopPerformanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [missingOrder, setMissingOrder] = useState(false);

  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useSerializedLoad(
    useCallback(async () => {
      // A serialized refresh may still be queued when this page unmounts.
      if (!mounted.current) return;
      setLoading(true);
      setError(null);
      try {
        const [shops, board] = await Promise.all([
          listShopPerformance(),
          // Names only; without them the list still shows, unnamed.
          getShopRankings().catch(() => null),
        ]);
        if (!mounted.current) return;
        if (orderParam) {
          const supplierId = shopForOrder(shops, orderParam);
          if (supplierId) {
            router.replace(shopPerformanceHref(tree, supplierId));
            return;
          }
          setMissingOrder(true);
        }
        const names = new Map(board?.rows.map((row) => [row.supplierId, row.shopName]));
        setRows(
          sortPerformanceRows(
            shops.map((shop) =>
              performanceRow(shop, names.get(shop.supplierId) || "Unnamed shop"),
            ),
          ),
        );
      } catch (err) {
        if (!mounted.current) return;
        setRows(null);
        setError(
          opsErrorMessage(
            err,
            "Could not load shop performance. Confirm the API is running, then retry.",
          ),
        );
      } finally {
        if (mounted.current) setLoading(false);
      }
    }, [orderParam, router, tree]),
  );

  useEffect(() => {
    void load();
  }, [load]);
  // A notice rides with its order's job ping; the window expires on its own.
  useLiveReload(["jobs"], load);
  useRefreshOnFocus(load);

  const columns = useMemo<DataTableColumn<ShopPerformanceRow>[]>(
    () => [
      {
        id: "shop",
        header: "Shop",
        primary: true,
        alwaysVisible: true,
        sortValue: (row) => row.shopName,
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <Link
              href={shopPerformanceHref(tree, row.supplierId)}
              className="text-body text-text-primary truncate hover:underline underline-offset-4"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {row.shopName}
            </Link>
            <span className="text-caption text-text-muted">
              {row.latestAt ? `Last recorded ${formatDate(row.latestAt)}` : "Nothing recorded yet"}
            </span>
          </div>
        ),
      },
      {
        id: "onTime",
        header: "On time",
        sortValue: (row) => row.performance.onTime.rate ?? -1,
        cell: (row) => (
          <div className="flex flex-col">
            <span className="text-body text-text-primary tabular-nums">
              {onTimeRateText(row.performance.onTime) ?? "No finished work"}
            </span>
            <span className="text-caption text-text-muted">
              {row.performance.onTime.completed
                ? onTimeDetail(row.performance.onTime)
                : `Last ${PERFORMANCE_WINDOW_DAYS} days`}
            </span>
          </div>
        ),
      },
      {
        id: "warnings",
        header: "Warnings",
        sortValue: (row) => row.warnings,
        cell: (row) => (
          <div className="flex flex-col">
            <span className="text-body text-text-primary tabular-nums">
              {row.warnings === 0 ? "None" : row.warnings}
            </span>
            <span className="text-caption text-text-muted">Last {PERFORMANCE_WINDOW_DAYS} days</span>
          </div>
        ),
      },
      {
        id: "late",
        header: "Late finishes",
        sortValue: (row) => row.performance.counts.lateFinishes,
        cell: (row) => (
          <div className="flex flex-col">
            <span className="text-body text-text-primary tabular-nums">
              {row.performance.counts.lateFinishes === 0
                ? "None"
                : row.performance.counts.lateFinishes}
            </span>
            <span className="text-caption text-text-muted tabular-nums">
              {row.performance.notices.length === 1
                ? "1 notice ever"
                : `${row.performance.notices.length} notices ever`}
            </span>
          </div>
        ),
      },
      {
        id: "topPick",
        header: "Top Pick",
        sortValue: (row) => (row.performance.topPick.hidden ? "hidden" : "shown"),
        cell: (row) => {
          const chip = topPickChip(row.performance.topPick);
          return (
            <div className="flex flex-wrap gap-1.5">
              <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} />
              {row.performance.rosterReview ? (
                <StatusChip
                  tone={ROSTER_REVIEW_CHIP.tone}
                  label={ROSTER_REVIEW_CHIP.label}
                  icon={ROSTER_REVIEW_CHIP.icon}
                />
              ) : null}
            </div>
          );
        },
      },
    ],
    [tree],
  );

  if (error) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const attention = rows?.filter(needsAttention).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-2">
          <span className="self-start">
            <StatusChip tone="neutral" icon="circle-dashed" label="Warnings only" />
          </span>
          <p className="text-body text-text-secondary m-0">
            How each shop has kept its commitments over the last {PERFORMANCE_WINDOW_DAYS}{" "}
            days. A job finished more than an hour (in shop hours) after its ready-by gets a
            written notice; repeats add warnings, hide the shop from Top Pick for 7 days, or
            flag it for a roster review. No money is taken.
          </p>
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {missingOrder ? (
        <p className="text-body text-text-secondary m-0" role="status">
          No shop has a performance record for that order yet. Every shop is listed below.
        </p>
      ) : null}

      {rows && rows.length === 0 && !loading ? (
        <EmptyState
          title="No shops yet"
          body="When a shop joins, its on-time rate, warnings and Top Pick status show here."
        />
      ) : (
        <>
          {rows ? (
            <p className="text-caption text-text-muted m-0" data-testid="performance-summary">
              {attention === 0
                ? `No shop has a late finish, warning or missed job in the last ${PERFORMANCE_WINDOW_DAYS} days.`
                : `${attention} of ${rows.length} ${rows.length === 1 ? "shop has" : "shops have"} something recorded in the last ${PERFORMANCE_WINDOW_DAYS} days.`}
            </p>
          ) : null}
          <DataTable
            caption="Shop performance"
            columns={columns}
            data={rows ?? []}
            getRowId={(row) => row.supplierId}
            loading={loading && !rows}
            itemLabel="shops"
            facets={FACETS}
            pageSize={25}
            filterPlaceholder="Find a shop…"
            rowActions={(row) => (
              <DataTableRowAction
                label={`Open ${row.shopName}'s performance`}
                icon={ChevronRight}
                href={shopPerformanceHref(tree, row.supplierId)}
              />
            )}
          />
        </>
      )}
    </div>
  );
}
