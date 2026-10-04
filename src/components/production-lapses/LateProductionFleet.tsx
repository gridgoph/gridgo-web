"use client";

/**
 * Late production across every shop, problem shops first (gridgo-api#123).
 *
 * The API reads lapses one shop at a time (`GET /users/:id/production-lapses`),
 * so this lists every shop from the rankings board and reads each, a few at a
 * time. A shop that fails to read is named in a notice, never shown as clean.
 * Only shops with a late job get a row; the rest are one line underneath.
 *
 * One implementation for Operations and Super Admin; links stay in the tree.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { DeductionGate } from "@/components/production-lapses/DeductionGate";
import { LapseMeter } from "@/components/production-lapses/LapseMeter";
import { lateProductionHref, type LapseTree } from "@/components/production-lapses/paths";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableRowAction, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { getSettings, getShopRankings, listSupplierProductionLapses } from "@/lib/api/client";
import type { ProductionPenaltyPolicy } from "@/lib/api/types";
import { formatDate, formatPhp } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  QUALITY_POINTS_CAP,
  RECENT_LAPSE_DAYS,
  qualityPointsLost,
  sortFleet,
  summarizeShop,
  type ShopLapseSummary,
} from "@/lib/production-penalties";

/** Shops read at once. Enough to be quick, few enough to stay polite to the API. */
const READ_CONCURRENCY = 4;

type Loaded = {
  rows: ShopLapseSummary[];
  cleanShops: number;
  failedShops: string[];
  policy: ProductionPenaltyPolicy | null;
};

async function mapWithLimit<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function LateProductionFleet({ tree }: { tree: LapseTree }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [board, settings] = await Promise.all([
          getShopRankings(),
          getSettings().catch(() => null),
        ]);
        const now = Date.now();
        const read = await mapWithLimit(board.rows, READ_CONCURRENCY, async (shop) => {
          try {
            const { lapses } = await listSupplierProductionLapses(shop.supplierId);
            return { shop, summary: summarizeShop(shop.supplierId, shop.shopName, lapses, now) };
          } catch {
            return { shop, summary: null };
          }
        });
        const rows = read.flatMap((entry) => (entry.summary && entry.summary.total > 0 ? [entry.summary] : []));
        setData({
          rows: sortFleet(rows),
          cleanShops: read.filter((entry) => entry.summary && entry.summary.total === 0).length,
          failedShops: read.filter((entry) => !entry.summary).map((entry) => entry.shop.shopName),
          policy: settings?.productionPenalty ?? null,
        });
      } catch (err) {
        setData(null);
        setError(
          opsErrorMessage(err, "Could not load late production. Confirm the API is running, then retry."),
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveReload(["orders", "settings"], load);

  const recentShops = data?.rows.filter((row) => row.recent.length > 0).length ?? 0;
  const recentJobs = data?.rows.reduce((sum, row) => sum + row.recent.length, 0) ?? 0;

  const columns = useMemo<DataTableColumn<ShopLapseSummary>[]>(
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
              href={lateProductionHref(tree, row.supplierId)}
              className="text-body text-text-primary truncate hover:underline underline-offset-4"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {row.shopName}
            </Link>
            <span className="text-caption text-text-muted">
              Last missed {formatDate(row.latestDeadlineAt)}
            </span>
          </div>
        ),
      },
      {
        id: "recent",
        header: `Last ${RECENT_LAPSE_DAYS} days`,
        sortValue: (row) => row.recent.length,
        cell: (row) => (
          <div className="flex items-center gap-3">
            <LapseMeter recent={row.recent} />
            <span className="flex flex-col">
              <span className="text-body text-text-primary tabular-nums">
                {row.recent.length === 0 ? "None" : `${row.recent.length} late`}
              </span>
              <span className="text-caption text-text-muted tabular-nums">
                {row.recent.length === 0
                  ? "Ranking unaffected"
                  : `−${qualityPointsLost(row.recent.length)} of ${QUALITY_POINTS_CAP} quality`}
              </span>
            </span>
          </div>
        ),
      },
      {
        id: "total",
        header: "All late jobs",
        sortValue: (row) => row.total,
        cell: (row) => (
          <div className="flex flex-col">
            <span className="text-body text-text-primary tabular-nums">{row.total}</span>
            <span className="text-caption text-text-muted tabular-nums">{tierBreakdown(row)}</span>
          </div>
        ),
      },
      {
        id: "formal",
        header: "Formal warnings",
        sortValue: (row) => row.formalWarnings,
        cell: (row) => (
          <span className="text-body tabular-nums">{row.formalWarnings === 0 ? "None" : row.formalWarnings}</span>
        ),
      },
      {
        id: "deducted",
        header: "Deducted",
        sortValue: (row) => row.deductedMinor,
        cell: (row) => (
          <div className="flex flex-col">
            <span className="text-body text-text-primary tabular-nums">
              {row.deductedMinor > 0 ? formatPhp(row.deductedMinor) : "None"}
            </span>
            {row.pending > 0 ? (
              <span className="text-caption text-text-muted tabular-nums">{row.pending} pending</span>
            ) : null}
          </div>
        ),
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Shops that marked a job ready after its ready-by time. Each late job sends the shop a
          warning, and every one in the last {RECENT_LAPSE_DAYS} days costs it 2 quality points in
          matching, {QUALITY_POINTS_CAP} at most. Shops with the most recent late jobs come first.
        </p>
        <DeductionGate policy={data?.policy ?? null} tree={tree} />
      </div>

      {data && data.failedShops.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-warning px-4 py-3" role="alert">
          <p className="text-body text-text-primary m-0 max-w-prose">
            Could not read late jobs for {data.failedShops.length === 1 ? "1 shop" : `${data.failedShops.length} shops`}:{" "}
            {data.failedShops.join(", ")}. They are left out below, not counted as on time.
          </p>
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}

      {data && data.rows.length === 0 && !loading ? (
        <EmptyState
          title="No late jobs on record"
          body={
            data.failedShops.length > 0
              ? "None of the shops that could be read has missed a ready-by time. Retry above for the rest."
              : "Every shop has marked its jobs ready on time so far. When one is late, it appears here with its warning and any deduction."
          }
        />
      ) : (
        <>
          {data ? (
            <p className="text-caption text-text-muted m-0" data-testid="fleet-summary">
              {recentShops === 0
                ? `No shop has been late in the last ${RECENT_LAPSE_DAYS} days.`
                : `${recentShops} ${recentShops === 1 ? "shop" : "shops"} late ${recentJobs} ${recentJobs === 1 ? "time" : "times"} in the last ${RECENT_LAPSE_DAYS} days.`}
            </p>
          ) : null}
          <DataTable
            caption="Shops with late jobs"
            columns={columns}
            data={data?.rows ?? []}
            getRowId={(row) => row.supplierId}
            loading={loading && !data}
            itemLabel="shops"
            pageSize={25}
            rowActions={(row) => (
              <DataTableRowAction
                label={`Open ${row.shopName}'s late jobs`}
                icon={ChevronRight}
                href={lateProductionHref(tree, row.supplierId)}
              />
            )}
          />
          {data && data.cleanShops > 0 ? (
            <p className="text-caption text-text-muted m-0">
              {data.cleanShops === 1 ? "1 other shop has" : `${data.cleanShops} other shops have`} no late jobs on
              record.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function tierBreakdown(row: ShopLapseSummary): string {
  const parts = (["severe", "moderate", "minor"] as const)
    .filter((tier) => row.byTier[tier] > 0)
    .map((tier) => `${row.byTier[tier]} ${tier}`);
  return parts.join(", ");
}
