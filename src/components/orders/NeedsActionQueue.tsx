"use client";

/**
 * The order queue's first view: every order waiting on Operations, grouped by
 * the action owed and oldest first in each group (`needs-action.ts`).
 *
 * The counts sit at the top so the size of each pile reads before any row; the
 * table holds the groups in flow order, each row labelled with its action. A
 * late order that also owes a step keeps that step and carries a Late chip, so
 * nothing ranks lateness against money here.
 *
 * A payment and a rider are decided from the row (gridgo-web#272): Confirm
 * payment opens the workspace's own payment decision in a sheet, proof and
 * all, and Assign rider lists the riders the API accepts. Both send exactly
 * the request the order workspace and the dispatch board send.
 */

import { useEffect, useMemo, useState } from "react";
import { AlarmClock, Bike, Eye, FileSearch, Wallet, type LucideIcon } from "lucide-react";

import {
  NEEDS_ACTIONS,
  buildNeedsActionQueue,
  needsActionCounts,
  needsActionSortKey,
  type NeedsActionId,
  type NeedsActionRow,
} from "@/app/ops/_lib/needs-action";
import { AssignRiderDialog } from "@/components/orders/AssignRiderDialog";
import { ConfirmPaymentSheet } from "@/components/orders/ConfirmPaymentSheet";
import {
  QueueOrderCell,
  queueOrderFilterValue,
} from "@/components/orders/QueueOrderCell";
import { ExpressChip } from "@/components/ui/ExpressChip";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Order } from "@/lib/api/types";
import { basketShopCounts } from "@/lib/baskets";
import { pinDispatchBlocker } from "@/lib/delivery-pin";
import { isExpressOrder } from "@/lib/express";
import { formatWait } from "@/lib/file-check";
import { formatPhp } from "@/lib/format";

const ACTION_ICONS: Record<NeedsActionId, LucideIcon> = {
  payment: Wallet,
  artwork: FileSearch,
  rider: Bike,
  late: AlarmClock,
};

const LABELS = Object.fromEntries(
  NEEDS_ACTIONS.map((entry) => [entry.id, entry.label]),
) as Record<NeedsActionId, string>;

/** How often the waits tick while the page is open. */
const TICK_MS = 30_000;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function waitLabel(row: NeedsActionRow, nowMs: number): string {
  const since = row.since ? Date.parse(row.since) : NaN;
  if (Number.isNaN(since)) return "Not recorded";
  const wait = formatWait(Math.max(0, Math.floor((nowMs - since) / 1000)));
  return row.action === "late" ? `${wait} past its date` : wait;
}

type Props = {
  orders: Order[];
  onRefresh: () => void;
};

export function NeedsActionQueue({ orders, onRefresh }: Props) {
  const now = useNow(TICK_MS);
  const [paying, setPaying] = useState<Order | null>(null);
  const [dispatching, setDispatching] = useState<Order | null>(null);
  const rows = useMemo(() => buildNeedsActionQueue(orders, now), [orders, now]);
  const counts = useMemo(() => needsActionCounts(rows), [rows]);
  // Counted across every order: a basket's groups move independently.
  const shopCounts = useMemo(() => basketShopCounts(orders), [orders]);

  const columns = useMemo<DataTableColumn<NeedsActionRow>[]>(
    () => [
      {
        id: "action",
        header: "Needs",
        sortValue: needsActionSortKey,
        cell: (row) => {
          const Icon = ACTION_ICONS[row.action];
          return (
            <span
              className="text-body text-text-primary inline-flex items-center gap-2 whitespace-nowrap"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              <Icon size={16} strokeWidth={2} aria-hidden />
              {LABELS[row.action]}
            </span>
          );
        },
      },
      {
        id: "order",
        header: "Order",
        primary: true,
        sortValue: (row) => row.order.title ?? "",
        filterValue: (row) =>
          `${LABELS[row.action]} ${queueOrderFilterValue(row.order, shopCounts)}`,
        cell: (row) => <QueueOrderCell order={row.order} shopCounts={shopCounts} />,
      },
      {
        id: "waiting",
        header: "Waiting",
        sortValue: (row) => (row.since ? Date.parse(row.since) || 0 : 0),
        cell: (row) => (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body text-text-secondary whitespace-nowrap tabular-nums">
              {waitLabel(row, now)}
            </span>
            {row.late && row.action !== "late" ? (
              <StatusChip tone="warning" icon="clock" label="Late" />
            ) : null}
          </div>
        ),
      },
      {
        id: "speed",
        header: "Speed",
        hideOnMobile: true,
        sortValue: (row) => (isExpressOrder(row.order) ? 0 : 1),
        cell: (row) =>
          isExpressOrder(row.order) ? (
            <ExpressChip />
          ) : (
            <span className="text-body text-text-muted whitespace-nowrap">Standard</span>
          ),
      },
      {
        id: "value",
        header: "Value",
        hideOnMobile: true,
        sortValue: (row) => row.order.totalMinor ?? -1,
        cell: (row) => (
          <span className="text-body text-text-secondary tabular-nums whitespace-nowrap">
            {row.order.totalMinor != null ? formatPhp(row.order.totalMinor) : "—"}
          </span>
        ),
      },
    ],
    [shopCounts, now],
  );

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Waiting on you"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {NEEDS_ACTIONS.map((entry) => (
          <StatCard
            key={entry.id}
            label={entry.label}
            value={String(counts[entry.id])}
            hint={entry.hint}
            icon={ACTION_ICONS[entry.id]}
          />
        ))}
      </section>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body text-text-secondary m-0">
          Oldest first in each group, in the order the work comes to you.
        </p>
        <Button variant="secondary" onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing is waiting on you"
          body="Payments, artwork checks, riders to assign and late orders appear here as they come in."
          action={
            <Button variant="secondary" onClick={onRefresh}>
              Refresh
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.order.id}
          caption="Orders waiting on you"
          filterPlaceholder="Filter orders…"
          defaultSortId="action"
          pageSize={25}
          itemLabel="orders"
          rowActionsDensity="labeled"
          rowActions={(row) => (
            <>
              {row.action === "payment" && (row.installment || row.order.basketId) ? (
                <DataTableRowAction
                  label="Confirm payment"
                  icon={Wallet}
                  onClick={() => setPaying(row.order)}
                />
              ) : null}
              {row.action === "rider" ? (
                <DataTableRowAction
                  label="Assign rider"
                  icon={Bike}
                  disabled={pinDispatchBlocker(row.order) !== null}
                  onClick={() => setDispatching(row.order)}
                />
              ) : null}
              <DataTableRowAction
                label={row.action === "artwork" ? "Check artwork" : "Open"}
                icon={row.action === "artwork" ? FileSearch : Eye}
                href={`/ops/orders/${row.order.id}`}
              />
            </>
          )}
        />
      )}

      <ConfirmPaymentSheet
        order={paying}
        onClose={() => setPaying(null)}
        onDecided={onRefresh}
      />
      <AssignRiderDialog
        order={dispatching}
        onClose={() => setDispatching(null)}
        onAssigned={onRefresh}
      />
    </div>
  );
}
