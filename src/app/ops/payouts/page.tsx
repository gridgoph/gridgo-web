"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { listClaims, listOrders } from "@/lib/api/client";
import type { Claim, Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";
import {
  PAYOUT_QUEUE_GROUPS,
  activeHolds,
  payoutProgress,
  payoutQueueGroup,
  payoutSummary,
  type PayoutQueueGroup,
} from "@/lib/payouts";
import { cn } from "@/lib/utils";

type Loaded = {
  orders: Order[];
  claims: Claim[];
};

type Row = {
  order: Order;
  holds: Claim[];
  group: PayoutQueueGroup;
};

/** Orders far enough along that a payout milestone can be in play. */
const PAYOUT_STATES = new Set([
  "payment_authorized",
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "awaiting_collection",
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
]);

/**
 * The payout desk, as a queue rather than a ledger.
 *
 * Every order used to arrive here with all of its shares unrolled, so
 * the one job waiting on a decision sat somewhere inside a wall of rows that
 * were waiting on a shop, a rider or a clock. Now each order is one line that
 * says what it is waiting for, sorted into the four questions Operations
 * actually asks — can I release something, is it held, who am I waiting on,
 * is it done — and the proof and the release button live on the order's own
 * review page, where the picture can be large enough to check.
 */
export default function OpsPayoutsPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [orders, claims] = await Promise.all([listOrders(), listClaims()]);
        setData({ orders, claims });
      } catch (err) {
        setData(null);
        setError(
          opsErrorMessage(
            err,
            "Could not load payouts. Confirm the demo API is running, then retry.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload(["payouts", "orders", "claims"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    return (
      data.orders
        .filter(
          (order) => PAYOUT_STATES.has(order.state) && order.payoutMilestones?.length,
        )
        .map((order) => {
          const holds = activeHolds(order, data.claims);
          return { order, holds, group: payoutQueueGroup(order, holds) };
        })
        /*
         Longest wait first, within each group.

         A shop can sit unpaid because nobody opened this screen, so the one
         that has been waiting three days leads the four fresh ones.
        */
        .sort((a, b) => (a.order.updatedAt || "").localeCompare(b.order.updatedAt || ""))
    );
  }, [data]);

  const grouped = useMemo(() => {
    const byGroup = new Map<PayoutQueueGroup, Row[]>();
    for (const definition of PAYOUT_QUEUE_GROUPS) byGroup.set(definition.id, []);
    for (const row of rows) byGroup.get(row.group)?.push(row);
    return byGroup;
  }, [rows]);

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

  const pending = loading && !data;
  const readyCount = grouped.get("ready")?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          A supplier is paid in shares of what it earns, and only you release them: on
          newer orders, one on the shop&rsquo;s start-of-production proof, one on the
          rider&rsquo;s delivery photo, and the last once the complaint window closes with
          no claim open. Older orders keep their four shares. Open an order to check what
          a share waits on and release it. The commission and the delivery fee sit outside
          these shares.
        </p>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {pending ? (
        <SkeletonCards count={3} lines={2} label="Loading payouts" className="gap-3" />
      ) : !rows.length ? (
        <EmptyState
          title="No payouts in play"
          body="Shares appear once a supplier has accepted an order and production begins. Nothing has reached that point yet."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
      ) : (
        PAYOUT_QUEUE_GROUPS.map((definition) => {
          const members = grouped.get(definition.id) ?? [];
          // An empty "ready" group is the one empty group worth saying out
          // loud: it is the answer to the question this desk opens with.
          if (members.length === 0 && definition.id !== "ready") return null;
          return (
            <section
              key={definition.id}
              aria-labelledby={`payout-group-${definition.id}`}
              className="flex flex-col gap-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2
                  id={`payout-group-${definition.id}`}
                  className="text-h3 text-text-primary m-0"
                >
                  {definition.label}
                  <span className="text-text-muted tabular-nums"> {members.length}</span>
                </h2>
                <p className="text-caption text-text-muted m-0">{definition.hint}</p>
              </div>
              {members.length === 0 ? (
                <p className="text-body text-text-secondary m-0 rounded-card border border-dashed border-outline px-4 py-3">
                  Nothing to release right now
                  {readyCount === 0 && rows.length > 0
                    ? ". Everything below is waiting on someone else, or already paid."
                    : "."}
                </p>
              ) : (
                <ul className="gg-card-flush m-0 flex list-none flex-col p-0">
                  {members.map(({ order, holds }) => (
                    <PayoutRow key={order.id} order={order} holds={holds} />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

/**
 * One order on the desk. Title and state on the left, money on the right, and
 * between them the one sentence that says what happens next. The whole row is
 * the link, because the only thing to do with a row is open it.
 */
function PayoutRow({ order, holds }: { order: Order; holds: Claim[] }) {
  const status = presentOrderState(order.state, order);
  const progress = payoutProgress(order);
  const percent =
    progress.totalMinor && progress.releasedMinor !== null
      ? Math.round((progress.releasedMinor / progress.totalMinor) * 100)
      : Math.round((progress.releasedCount / Math.max(1, progress.count)) * 100);

  return (
    <li className="border-b border-outline-subtle last:border-b-0">
      <Link
        href={`/ops/payouts/${order.id}`}
        className={cn(
          "group flex min-h-11 items-center gap-3 px-4 py-3 text-text-primary",
          "hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-action-yellow",
        )}
        aria-label={`Review the payout on ${order.title || "this order"}`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p
              className="text-body text-text-primary m-0 truncate"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {order.title || "Untitled order"}
            </p>
            <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
          </div>
          <p className="text-body text-text-secondary m-0">
            {payoutSummary(order, holds)}
          </p>
          <div className="flex items-center gap-3">
            <span
              className="bg-surface-variant relative h-1 w-32 max-w-full overflow-hidden rounded-pill"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="Share of the supplier's earnings released"
            >
              <span
                className="bg-success absolute inset-y-0 left-0 rounded-pill"
                style={{ width: `${percent}%` }}
              />
            </span>
            <span className="text-caption text-text-muted tabular-nums">
              {progress.releasedMinor !== null && progress.totalMinor !== null
                ? `${formatPhp(progress.releasedMinor)} of ${formatPhp(progress.totalMinor)} released`
                : `${progress.releasedCount} of ${progress.count} shares released`}
            </span>
          </div>
        </div>
        <ChevronRight
          size={16}
          strokeWidth={2}
          aria-hidden
          className="shrink-0 text-text-muted transition-transform duration-150 motion-reduce:transition-none group-hover:translate-x-0.5"
        />
      </Link>
    </li>
  );
}
