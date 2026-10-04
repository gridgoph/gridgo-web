"use client";

/**
 * One shop's late jobs (gridgo-api#123): each order it marked ready after its
 * ready-by time, how late, the tier, what the shop was told, and where the
 * money stands — any deduction, and what GRIDGO still owes the shop on that
 * job. Every row opens its order.
 *
 * The lapse ledger carries no order details, so the order list is read
 * alongside it for titles, ready times and unpaid payout shares. If that read
 * fails the lapses still show, with their tier bands instead of exact times.
 *
 * One implementation for Operations and Super Admin; links stay in the tree.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, PhoneOff } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { DeductionGate } from "@/components/production-lapses/DeductionGate";
import { LapseMeter } from "@/components/production-lapses/LapseMeter";
import { NoCommunicationDialog } from "@/components/production-lapses/NoCommunicationDialog";
import { orderHref, type LapseTree } from "@/components/production-lapses/paths";
import { formatRatePercent } from "@/components/settings/service-fee";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
  type DataTableFacet,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonLines } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  getSettings,
  getShopRankings,
  listOrders,
  listSupplierProductionLapses,
  recordProductionNoCommunication,
} from "@/lib/api/client";
import type { Order, ProductionLapse, ProductionPenaltyPolicy } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  QUALITY_POINTS_CAP,
  RECENT_LAPSE_DAYS,
  canRecordNoCommunication,
  latenessOf,
  latenessText,
  presentLapseStatus,
  presentTier,
  qualityPointsLost,
  summarizeShop,
  unpaidPayoutMinor,
} from "@/lib/production-penalties";

type Row = { lapse: ProductionLapse; order: Order | undefined };

type Loaded = {
  shopName: string | null;
  rows: Row[];
  /** False when the order list could not be read; times fall back to tier bands. */
  ordersRead: boolean;
  policy: ProductionPenaltyPolicy | null;
  at: number;
};

const ACTIVE_PRODUCTION = new Set([
  "payment_authorized",
  "production",
  "supplier_self_qc",
]);

export function ShopLapses({
  tree,
  supplierId,
}: {
  tree: LapseTree;
  supplierId: string;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attest, setAttest] = useState<Row | null>(null);
  const [attestBusy, setAttestBusy] = useState(false);
  const [attestError, setAttestError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [ledger, orders, settings, board] = await Promise.all([
          listSupplierProductionLapses(supplierId),
          listOrders().catch(() => null),
          getSettings().catch(() => null),
          getShopRankings().catch(() => null),
        ]);
        const byId = new Map((orders ?? []).map((order) => [order.id, order]));
        setData({
          shopName:
            board?.rows.find((row) => row.supplierId === supplierId)?.shopName ?? null,
          rows: ledger.lapses.map((lapse) => ({ lapse, order: byId.get(lapse.orderId) })),
          ordersRead: orders !== null,
          policy: settings?.productionPenalty ?? null,
          at: Date.now(),
        });
      } catch (err) {
        setData(null);
        setError(
          opsErrorMessage(
            err,
            "Could not load this shop's late jobs. Confirm the API is running, then retry.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, [supplierId]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveReload(["orders", "payouts", "settings"], load);

  const deductionsOn = data?.policy ? data.policy.deductionsEnabled : null;
  const now = data?.at ?? 0;

  const columns = useMemo<DataTableColumn<Row>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        alwaysVisible: true,
        sortValue: (row) => row.lapse.deadlineAt,
        filterValue: (row) => `${row.order?.title ?? ""} ${row.lapse.orderId}`,
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <Link
              href={orderHref(tree, row.lapse.orderId)}
              className="text-body text-text-primary truncate hover:underline underline-offset-4"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {row.order?.title || `Order ${row.lapse.orderId.slice(-8)}`}
            </Link>
            <span className="text-caption text-text-muted">
              Ready by {formatDateTime(row.lapse.deadlineAt)}
            </span>
          </div>
        ),
      },
      {
        id: "late",
        header: "How late",
        sortValue: (row) => {
          const lateness = latenessOf(row.lapse, row.order, now);
          return lateness.kind === "unknown" ? null : lateness.lateMs;
        },
        cell: (row) => {
          const lateness = latenessOf(row.lapse, row.order, now);
          return (
            <div className="flex flex-col items-start gap-2">
              <span
                className={
                  lateness.kind === "unknown"
                    ? "text-body text-text-secondary"
                    : "text-body text-text-primary tabular-nums"
                }
              >
                {latenessText(lateness, row.lapse.tier)}
              </span>
              {/* Beside the lateness it escalates, not in the row actions: a
                  second labelled action does not fit a phone card. */}
              {canRecordNoCommunication(row.lapse, row.order, now) ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAttestError(null);
                    setNotice(null);
                    setAttest(row);
                  }}
                >
                  <PhoneOff aria-hidden data-icon="inline-start" />
                  No word from the shop
                </Button>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "tier",
        header: "Tier",
        sortValue: (row) => row.lapse.tier,
        cell: (row) => {
          const tier = presentTier(row.lapse.tier);
          const stillOpen =
            row.order && !row.order.readyAt && ACTIVE_PRODUCTION.has(row.order.state);
          return (
            <div className="flex flex-col items-start gap-1">
              <StatusChip tone={tier.tone} icon={tier.icon} label={tier.label} />
              {row.lapse.reassignmentEligible && stillOpen ? (
                <span className="text-caption text-text-secondary">
                  Can be given to another shop
                </span>
              ) : null}
              {row.order?.productionNoCommunication ? (
                <span className="text-caption text-text-secondary">
                  No word from the shop, recorded
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "warning",
        header: "Warning",
        sortValue: (row) => row.lapse.warnings.at(-1)?.at ?? "",
        filterValue: (row) =>
          row.lapse.warnings.map((warning) => warning.message).join(" "),
        cell: (row) => <WarningCell lapse={row.lapse} />,
      },
      {
        id: "deduction",
        header: "Deduction",
        // The status, so the Status facet can filter on this column.
        sortValue: (row) => row.lapse.status,
        cell: (row) => <DeductionCell lapse={row.lapse} deductionsOn={deductionsOn} />,
      },
      {
        id: "balance",
        header: "Still owed on the job",
        sortValue: (row) => unpaidPayoutMinor(row.order) ?? null,
        cell: (row) => <BalanceCell row={row} />,
      },
    ],
    [tree, now, deductionsOn],
  );

  const facets = useMemo<DataTableFacet[]>(
    () => [
      {
        columnId: "tier",
        title: "Tier",
        options: (["minor", "moderate", "severe"] as const).map((tier) => ({
          value: tier,
          label: presentTier(tier).label,
        })),
      },
      {
        columnId: "deduction",
        title: "Status",
        options: [
          { value: "warning_only", label: "Warning only" },
          {
            value: "warned",
            label: deductionsOn === false ? "Deduction paused" : "Deduction pending",
          },
          { value: "applied", label: "Deducted" },
          { value: "closed", label: "Closed, nothing deducted" },
        ],
      },
    ],
    [deductionsOn],
  );

  async function recordNoWord(reason: string) {
    if (!attest) return;
    setAttestBusy(true);
    setAttestError(null);
    try {
      await recordProductionNoCommunication(attest.lapse.orderId, reason);
      setNotice(
        `Recorded. ${attest.order?.title || "The order"} is now a severe lapse, and the shop has been warned.`,
      );
      setAttest(null);
      await load();
    } catch (err) {
      setAttestError(opsErrorMessage(err, "Could not record that. Try again."));
    } finally {
      setAttestBusy(false);
    }
  }

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

  if (!data) return <SkeletonLines lines={6} />;

  const summary = summarizeShop(
    supplierId,
    data.shopName ?? "",
    data.rows.map((row) => row.lapse),
    data.at,
  );
  const shopLabel = data.shopName ?? "This shop";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h2 className="text-h2 text-text-primary m-0">{shopLabel}</h2>
        {summary.total > 0 ? (
          <div
            className="flex flex-wrap items-center gap-x-6 gap-y-3"
            data-testid="shop-lapse-summary"
          >
            <div className="flex items-center gap-3">
              <LapseMeter recent={summary.recent} />
              <span className="flex flex-col">
                <span className="text-body text-text-primary tabular-nums">
                  {summary.recent.length} late in the last {RECENT_LAPSE_DAYS} days
                </span>
                <span className="text-caption text-text-muted tabular-nums">
                  Quality ranking −{qualityPointsLost(summary.recent.length)} of{" "}
                  {QUALITY_POINTS_CAP} points
                </span>
              </span>
            </div>
            <SummaryFigure
              value={String(summary.total)}
              label={summary.total === 1 ? "late job in all" : "late jobs in all"}
            />
            <SummaryFigure
              value={String(summary.formalWarnings)}
              label={summary.formalWarnings === 1 ? "formal warning" : "formal warnings"}
            />
            <SummaryFigure
              value={
                summary.deductedMinor > 0 ? formatPhp(summary.deductedMinor) : "₱0.00"
              }
              label="deducted"
            />
          </div>
        ) : null}
        <DeductionGate policy={data.policy} tree={tree} />
        {!data.ordersRead ? (
          <p className="text-body text-text-secondary m-0" role="status">
            The order list could not be read, so how late each job was shows as its
            tier&rsquo;s range.
          </p>
        ) : null}
        {notice ? (
          <p className="text-body text-success m-0" role="status">
            {notice}
          </p>
        ) : null}
      </header>

      {data.rows.length === 0 ? (
        <EmptyState
          title="No late jobs"
          body={`${shopLabel} has marked every job ready by its ready-by time. If one runs late, it appears here with the warning the shop was sent.`}
        />
      ) : (
        <DataTable
          caption={`${shopLabel}: late jobs`}
          columns={columns}
          data={data.rows}
          getRowId={(row) => row.lapse.id}
          facets={facets}
          filterPlaceholder="Search orders or warnings"
          itemLabel="late jobs"
          pageSize={20}
          loading={loading && !data}
          rowActions={(row) => (
            <DataTableRowAction
              label="Open the order"
              icon={ArrowUpRight}
              href={orderHref(tree, row.lapse.orderId)}
            />
          )}
        />
      )}

      <NoCommunicationDialog
        open={attest !== null}
        orderTitle={attest?.order?.title || "This order"}
        busy={attestBusy}
        error={attestError}
        onCancel={() => setAttest(null)}
        onConfirm={(reason) => void recordNoWord(reason)}
      />
    </div>
  );
}

function SummaryFigure({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-col">
      <span
        className="text-body text-text-primary tabular-nums"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {value}
      </span>
      <span className="text-caption text-text-muted">{label}</span>
    </span>
  );
}

/** The latest warning, and every warning's exact text a click away. */
function WarningCell({ lapse }: { lapse: ProductionLapse }) {
  const latest = lapse.warnings.at(-1);
  if (!latest) return <span className="text-body text-text-secondary">Not sent yet</span>;
  const formal = lapse.warnings.some((warning) => warning.formal);
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      <span className="text-body text-text-primary">
        {formal ? "Formal warning" : "Warning"}
      </span>
      <span className="text-caption text-text-muted">
        Sent {formatDateTime(latest.at)}
      </span>
      <details className="group max-w-md">
        <summary className="text-caption text-[var(--color-brand)] cursor-pointer underline-offset-4 hover:underline">
          {lapse.warnings.length === 1
            ? "What the shop was told"
            : `What the shop was told (${lapse.warnings.length})`}
        </summary>
        <ol className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
          {lapse.warnings.map((warning) => (
            <li
              key={`${warning.tier}-${warning.at}`}
              className="rounded-field bg-surface-variant p-2"
            >
              <p className="text-caption text-text-muted m-0">
                {presentTier(warning.tier).label}
                {warning.formal ? ", formal" : ""}, {formatDateTime(warning.at)}
              </p>
              <p className="text-caption text-text-primary m-0 mt-1 whitespace-pre-line">
                {warning.message}
              </p>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

/** Where the money stands: the lapse's status, then the amount or why there is none. */
function DeductionCell({
  lapse,
  deductionsOn,
}: {
  lapse: ProductionLapse;
  deductionsOn: boolean | null;
}) {
  const status = presentLapseStatus(lapse, deductionsOn);
  const note =
    lapse.status === "applied"
      ? null
      : lapse.status === "warned"
        ? deductionsOn === false
          ? "Deductions are off now"
          : `${formatRatePercent(lapse.rateBps)} once assessed`
        : lapse.status === "closed"
          ? "A refund or cancellation closed it"
          : "Deductions were off when it began";
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusChip tone={status.tone} icon={status.icon} label={status.label} />
      {lapse.status === "applied" ? (
        <span className="flex flex-col">
          <span
            className="text-body text-text-primary tabular-nums"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            −{formatPhp(lapse.deductionMinor)}
          </span>
          <span className="text-caption text-text-muted tabular-nums">
            {formatRatePercent(lapse.rateBps)} of {formatPhp(lapse.remainingBalanceMinor)}
          </span>
        </span>
      ) : (
        <span className="text-caption text-text-muted">{note}</span>
      )}
    </div>
  );
}

function BalanceCell({ row }: { row: Row }) {
  const unpaid = unpaidPayoutMinor(row.order);
  const applied = row.lapse.status === "applied";
  if (unpaid === null) {
    return applied ? (
      <div className="flex flex-col">
        <span className="text-body text-text-primary tabular-nums">
          {formatPhp(row.lapse.remainingBalanceMinor - row.lapse.deductionMinor)}
        </span>
        <span className="text-caption text-text-muted">Left after the deduction</span>
      </div>
    ) : (
      <span className="text-body text-text-secondary">—</span>
    );
  }
  return (
    <div className="flex flex-col">
      <span className="text-body text-text-primary tabular-nums">
        {formatPhp(unpaid)}
      </span>
      <span className="text-caption text-text-muted">
        {unpaid === 0
          ? "Paid out in full"
          : applied
            ? "Unpaid, after the deduction"
            : "Unpaid shares"}
      </span>
    </div>
  );
}
