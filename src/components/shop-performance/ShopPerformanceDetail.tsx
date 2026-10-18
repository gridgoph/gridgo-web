"use client";

/**
 * One shop's performance, warnings only (`GET /ops/shops/:supplierId/performance`):
 * the on-time rate and the five counts over the last 30 days with the rule each
 * one feeds, Top Pick and roster review, the warnings in the window, every
 * written late-finish notice, and the full record. Super Admin can mark a late
 * finish no-fault; Operations reads.
 *
 * No money appears anywhere: decision B takes none.
 *
 * One implementation for Operations and Super Admin; links stay in the tree.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { NoFaultDialog } from "@/components/shop-performance/NoFaultDialog";
import {
  orderHref,
  shopPerformanceHref,
  type PerformanceTree,
} from "@/components/shop-performance/paths";
import { useRefreshOnFocus } from "@/components/shop-performance/useRefreshOnFocus";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonLines } from "@/components/ui/loading";
import { StatCard } from "@/components/ui/StatCard";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  getShopPerformance,
  getShopRankings,
  isApiError,
  recordPerformanceNoFault,
} from "@/lib/api/client";
import type { PerformanceEvent, SupplierPerformance } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  PERFORMANCE_WINDOW_DAYS,
  ROSTER_REVIEW_CHIP,
  canMarkNoFault,
  countLines,
  eventChip,
  eventKindLabel,
  hoursLateText,
  onTimeDetail,
  onTimeRateText,
  performanceErrorCopy,
  tierLabel,
  topPickChip,
  warningLabel,
} from "@/lib/supplier-performance";

type Loaded = { performance: SupplierPerformance; shopName: string | null };

export function ShopPerformanceDetail({
  tree,
  supplierId,
}: {
  tree: PerformanceTree;
  supplierId: string;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<PerformanceEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const superAdmin = tree === "admin";

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [performance, board] = await Promise.all([
          getShopPerformance(supplierId),
          getShopRankings().catch(() => null),
        ]);
        setData({
          performance,
          shopName: board?.rows.find((row) => row.supplierId === supplierId)?.shopName ?? null,
        });
      } catch (err) {
        setData(null);
        setError(
          isApiError(err) && err.code === "supplier_not_found"
            ? "There is no shop with this link. Go back to the list and open it from there."
            : opsErrorMessage(err, "Could not load this shop's performance. Retry in a moment."),
        );
      } finally {
        setLoading(false);
      }
    }, [supplierId]),
  );

  useEffect(() => {
    void load();
  }, [load]);
  useLiveReload(["jobs"], load);
  useRefreshOnFocus(load);

  const shopName = data?.shopName || "This shop";

  async function markNoFault(reason: string) {
    if (!target) return;
    setBusy(true);
    setActionError(null);
    try {
      const performance = await recordPerformanceNoFault(target.orderId, {
        reason,
        supplierId,
      });
      setData((current) => (current ? { ...current, performance } : current));
      setTarget(null);
    } catch (err) {
      setActionError(
        (isApiError(err) ? performanceErrorCopy(err.code) : null) ??
          opsErrorMessage(err, "Could not mark it no-fault. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  const eventColumns = useMemo<DataTableColumn<PerformanceEvent>[]>(
    () => [
      {
        id: "what",
        header: "What happened",
        primary: true,
        alwaysVisible: true,
        sortValue: (event) => eventKindLabel(event.kind),
        cell: (event) => (
          <div className="flex min-w-0 flex-col">
            <span className="text-body text-text-primary">{eventKindLabel(event.kind)}</span>
            <span className="text-caption text-text-muted break-words">
              {[tierLabel(event.tier), event.reason].filter(Boolean).join(" · ")}
            </span>
          </div>
        ),
      },
      {
        id: "order",
        header: "Order",
        sortValue: (event) => event.orderId,
        cell: (event) => (
          <Link
            href={orderHref(tree, event.orderId)}
            className="text-body text-text-secondary break-all underline-offset-2 hover:underline"
          >
            {event.orderId}
          </Link>
        ),
      },
      {
        id: "at",
        header: "When",
        sortValue: (event) => event.at,
        cell: (event) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(event.at)}
          </span>
        ),
      },
      {
        id: "status",
        header: "Counts",
        sortValue: (event) => eventChip(event).label,
        cell: (event) => {
          const chip = eventChip(event);
          return <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} />;
        },
      },
    ],
    [tree],
  );

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink tree={tree} />
        <ErrorState
          body={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink tree={tree} />
        <SkeletonLines lines={6} />
      </div>
    );
  }

  const { performance } = data;
  const topPick = topPickChip(performance.topPick);
  const rate = onTimeRateText(performance.onTime);

  return (
    <div className="flex flex-col gap-5">
      <BackLink tree={tree} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-h2 text-text-primary m-0 break-words">{shopName}</h2>
          <div className="flex flex-wrap gap-1.5">
            <StatusChip tone={topPick.tone} label={topPick.label} icon={topPick.icon} />
            {performance.rosterReview ? (
              <StatusChip
                tone={ROSTER_REVIEW_CHIP.tone}
                label={ROSTER_REVIEW_CHIP.label}
                icon={ROSTER_REVIEW_CHIP.icon}
              />
            ) : null}
            <StatusChip tone="neutral" icon="circle-dashed" label="Warnings only" />
          </div>
          <p className="text-caption text-text-muted m-0">
            As of {formatDateTime(performance.asOf)}. Counts cover the last{" "}
            {performance.windowDays} days; a late finish is more than{" "}
            {performance.graceMinutes} shop minutes past the committed ready-by.
          </p>
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {performance.rosterReview ? (
        <p className="rounded-card border border-warning px-4 py-3 text-body text-text-primary m-0" role="status">
          This shop has reached a roster review: three late finishes, or two cancelled
          accepted jobs, in {performance.windowDays} days. It is a flag for a person to look
          at, not a suspension.
        </p>
      ) : null}
      {performance.topPick.hidden ? (
        <p className="text-body text-text-secondary m-0">
          Clients still see this shop among the other choices. It becomes Top Pick only when
          every shop that can take the job is hidden too.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="On time"
          value={rate ?? "No finished work"}
          hint={onTimeDetail(performance.onTime)}
        />
        {countLines(performance.counts).map((line) => (
          <StatCard
            key={line.label}
            label={line.label}
            value={line.value === 0 ? "None" : String(line.value)}
            hint={line.rule}
          />
        ))}
      </div>

      <section aria-labelledby="warnings-heading" className="flex flex-col gap-3">
        <h3 id="warnings-heading" className="text-h3 text-text-primary m-0">
          Warnings in the last {PERFORMANCE_WINDOW_DAYS} days
        </h3>
        {performance.warnings.length === 0 ? (
          <p className="text-body text-text-secondary m-0">No warnings.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {performance.warnings.map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-1 rounded-card border border-outline px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body text-text-primary">
                    {event.warningCodes.map(warningLabel).join(" · ")}
                  </span>
                  <span className="text-caption text-text-muted">{formatDateTime(event.at)}</span>
                </div>
                <span className="text-caption text-text-secondary">
                  {eventKindLabel(event.kind)} on order{" "}
                  <Link
                    href={orderHref(tree, event.orderId)}
                    className="underline underline-offset-2"
                  >
                    {event.orderId}
                  </Link>
                  {event.exempt ? " · exempt, no longer counted" : event.active ? "" : " · no longer counted"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="notices-heading" className="flex flex-col gap-3">
        <div>
          <h3 id="notices-heading" className="text-h3 text-text-primary m-0">
            Late-finish notices
          </h3>
          <p className="text-caption text-text-muted m-0 mt-0.5">
            Every written notice this shop has received, newest first. The text is what the
            shop read.
          </p>
        </div>
        {performance.notices.length === 0 ? (
          <p className="text-body text-text-secondary m-0">No late finishes on record.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {performance.notices.map((notice) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                tree={tree}
                canExempt={superAdmin && canMarkNoFault(notice)}
                onExempt={() => {
                  setActionError(null);
                  setTarget(notice);
                }}
              />
            ))}
          </ul>
        )}
        {!superAdmin && performance.notices.some(canMarkNoFault) ? (
          <p className="text-caption text-text-muted m-0">
            Only Super Admin can mark a late finish no-fault.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="record-heading" className="flex flex-col gap-3">
        <h3 id="record-heading" className="text-h3 text-text-primary m-0">
          Full record
        </h3>
        <DataTable
          caption={`${shopName} performance record`}
          columns={eventColumns}
          data={performance.events}
          getRowId={(event) => event.id}
          itemLabel="events"
          pageSize={10}
          filterPlaceholder="Find an order…"
          empty={
            <p className="text-body text-text-secondary m-0 p-3">
              Nothing recorded yet. Finished jobs, declines and missed acceptance hours show
              here as they happen.
            </p>
          }
          rowActions={(event) => (
            <DataTableRowAction
              label={`Open order ${event.orderId}`}
              icon={ArrowUpRight}
              href={orderHref(tree, event.orderId)}
            />
          )}
        />
      </section>

      <NoFaultDialog
        event={target}
        shopName={shopName}
        busy={busy}
        error={actionError}
        onCancel={() => setTarget(null)}
        onConfirm={(reason) => void markNoFault(reason)}
      />
    </div>
  );
}

function BackLink({ tree }: { tree: PerformanceTree }) {
  return (
    <Link
      href={shopPerformanceHref(tree)}
      className="inline-flex min-h-11 items-center gap-1.5 self-start text-body text-text-secondary underline-offset-4 hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All shops
    </Link>
  );
}

function NoticeCard({
  notice,
  tree,
  canExempt,
  onExempt,
}: {
  notice: PerformanceEvent;
  tree: PerformanceTree;
  canExempt: boolean;
  onExempt: () => void;
}) {
  const chip = eventChip(notice);
  const late = hoursLateText(notice);
  return (
    <li className="flex flex-col gap-2 rounded-card border border-outline p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-body text-text-primary">
            {tierLabel(notice.tier) ?? "Late finish"}
          </span>
          <span className="text-caption text-text-muted">
            Finished {formatDateTime(notice.at)}
            {notice.deadlineAt ? ` · ready-by ${formatDateTime(notice.deadlineAt)}` : ""}
            {late ? ` · ${late}` : ""}
          </span>
        </div>
        <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} />
      </div>
      {notice.message ? (
        <blockquote className="m-0 border-l-2 border-outline pl-3 text-body text-text-secondary break-words">
          {notice.message}
        </blockquote>
      ) : null}
      {notice.exempt && notice.exemptionReason ? (
        <p className="text-caption text-text-muted m-0">
          {notice.exemptionReason === "reviewed_time_correction"
            ? "Exempt: a reviewed production-time correction."
            : `Exempt: ${notice.exemptionReason}`}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={orderHref(tree, notice.orderId)} />}
        >
          Open order
        </Button>
        {canExempt ? (
          <Button variant="outline" size="sm" onClick={onExempt}>
            Mark no-fault
          </Button>
        ) : null}
      </div>
      <p className="text-caption text-text-muted m-0">
        Recorded {formatDate(notice.recordedAt)}
      </p>
    </li>
  );
}
