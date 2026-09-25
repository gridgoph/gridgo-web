"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useMemo, useState } from "react";

import { adminErrorMessage } from "@/app/admin/_lib/errors";
import {
  orderMoneySplits,
  reconciliationRows,
  rollupFinance,
  type MoneyFigure,
} from "@/app/admin/_lib/finance";
import { presentClaimStatus, presentPaymentStatus } from "@/app/admin/_lib/present";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { listClaims, listOrders } from "@/lib/api/client";
import { orderDeliverySplit } from "@/lib/delivery-split";
import type { Claim, Order } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import {
  presentOrderState,
  presentPaymentProgress,
  presentZone,
} from "@/lib/order-state";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

/**
 * Where each order's money goes. Operations and Super Admin are the only roles
 * the server hands supplier price and the service fee to, so this reconciliation
 * exists on this screen and nowhere else in the portal.
 */
const splitChartConfig = {
  supplierPriceMinor: {
    label: "Supplier earns",
    color: "var(--color-chart-1)",
  },
  commissionMinor: {
    label: "GRIDGO service fee",
    color: "var(--color-chart-2)",
  },
  riderPayoutMinor: {
    label: "Rider payout",
    color: "var(--color-chart-3)",
  },
  platformDeliveryShareMinor: {
    label: "GRIDGO delivery share",
    color: "var(--color-chart-5)",
  },
  // Only an API without the split reports this, and then the whole fee is
  // the rider's, so it wears the rider's colour. (chart-4 is action yellow.)
  unsplitDeliveryMinor: {
    label: "Delivery (not split)",
    color: "var(--color-chart-3)",
  },
} satisfies ChartConfig;

/** Stack order, bottom to top. The top bar carries the rounded cap. */
const DELIVERY_BARS = [
  "riderPayoutMinor",
  "platformDeliveryShareMinor",
  "unsplitDeliveryMinor",
] as const;

function formatFigure(fig: MoneyFigure): { value: string; hint?: string } {
  if (fig.kind === "amount") return { value: formatPhp(fig.minor) };
  return { value: "Unavailable", hint: fig.reason };
}

export default function AdminFinancePage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [o, c] = await Promise.all([listOrders(), listClaims()]);
        setOrders(o);
        setClaims(c);
      } catch (err) {
        setOrders(null);
        setClaims(null);
        setError(
          adminErrorMessage(
            err,
            "Could not load finance data. Confirm the demo API is running.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload(["orders", "claims", "payouts", "credits"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const rollup = useMemo(() => {
    if (!orders || !claims) return null;
    return rollupFinance(orders, claims);
  }, [orders, claims]);

  const rows = useMemo(() => (orders ? reconciliationRows(orders) : []), [orders]);
  const splits = useMemo(() => (orders ? orderMoneySplits(orders) : []), [orders]);
  // Only the delivery parts some order actually has get a bar and a legend entry.
  const deliveryBars = DELIVERY_BARS.filter((key) =>
    splits.some((split) => split[key] > 0),
  );

  const orderColumns = useMemo<DataTableColumn<Order>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        sortValue: (o) => o.title,
        filterValue: (o) => `${o.title} ${o.id} ${o.zone}`,
        cell: (o) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {o.title}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {presentZone(o.zone)}
            </p>
          </div>
        ),
      },
      {
        id: "state",
        header: "Order status",
        sortValue: (o) => presentOrderState(o.state).label,
        cell: (o) => {
          const p = presentOrderState(o.state);
          return <StatusChip tone={p.tone} label={p.label} icon={p.icon} />;
        },
      },
      {
        id: "payment",
        header: "Payment",
        sortValue: (o) =>
          o.payments
            ? presentPaymentProgress(o).label
            : presentPaymentStatus(o.paymentStatus).label,
        cell: (o) => {
          const p = o.payments
            ? presentPaymentProgress(o)
            : presentPaymentStatus(o.paymentStatus);
          return <StatusChip tone={p.tone} label={p.label} icon={p.icon} />;
        },
      },
      {
        id: "supplier",
        header: "Supplier earns",
        sortValue: (o) => o.supplierPriceMinor ?? -1,
        cell: (o) => (
          <span className="text-body text-text-secondary tabular-nums whitespace-nowrap">
            {o.supplierPriceMinor !== undefined
              ? formatPhp(o.supplierPriceMinor)
              : "Not priced yet"}
          </span>
        ),
      },
      {
        id: "commission",
        header: "Service fee",
        sortValue: (o) => o.serviceFeeMinor ?? -1,
        cell: (o) => (
          <span className="text-body text-text-secondary tabular-nums whitespace-nowrap">
            {o.serviceFeeMinor !== undefined ? formatPhp(o.serviceFeeMinor) : "—"}
          </span>
        ),
      },
      {
        id: "delivery",
        header: "Delivery",
        sortValue: (o) => o.deliveryFeeMinor,
        cell: (o) => {
          const split = orderDeliverySplit(o);
          return (
            <span className="flex flex-col">
              <span className="text-body text-text-secondary tabular-nums whitespace-nowrap">
                {formatPhp(o.deliveryFeeMinor)}
              </span>
              {split ? (
                <span className="text-caption text-text-muted tabular-nums whitespace-nowrap">
                  Rider {formatPhp(split.riderPayoutMinor)}, GRIDGO{" "}
                  {formatPhp(split.platformDeliveryShareMinor)}
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: "total",
        header: "Client total",
        sortValue: (o) => o.totalMinor,
        cell: (o) => (
          <span
            className="text-body text-text-primary tabular-nums whitespace-nowrap"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {formatPhp(o.totalMinor)}
          </span>
        ),
      },
      {
        id: "hold",
        header: "Payout hold",
        sortValue: (o) => (o.payoutHold ? 1 : 0),
        cell: (o) =>
          o.payoutHold ? (
            <StatusChip tone="error" label="Held" icon="triangle-alert" />
          ) : (
            <StatusChip tone="neutral" label="Not held" icon="circle-check" />
          ),
      },
    ],
    [],
  );

  const claimColumns = useMemo<DataTableColumn<Claim>[]>(
    () => [
      {
        id: "claim",
        header: "Claim",
        primary: true,
        sortValue: (c) => c.reason,
        filterValue: (c) => `${c.reason} ${c.orderId} ${c.status}`,
        cell: (c) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {c.reason}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {c.holdReason ?? "No hold reason recorded"}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (c) => presentClaimStatus(c.status).label,
        cell: (c) => {
          const p = presentClaimStatus(c.status);
          return <StatusChip tone={p.tone} label={p.label} icon={p.icon} />;
        },
      },
      {
        id: "updated",
        header: "Updated",
        sortValue: (c) => c.updatedAt || "",
        cell: (c) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(c.updatedAt)}
          </span>
        ),
      },
    ],
    [],
  );

  const pending = loading && !orders;

  if (!pending && (error || !orders || !claims || !rollup)) {
    return (
      <ErrorState
        body={error ?? "No data."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  // Figures are only rendered when `rollup` exists; while it does not, every
  // card is in its reserved state and these values are never read.
  const blank = formatFigure({ kind: "amount", minor: 0 });
  const confirmedIn = rollup ? formatFigure(rollup.confirmedIn) : blank;
  const awaiting = rollup ? formatFigure(rollup.awaitingConfirmation) : blank;
  const outstanding = rollup ? formatFigure(rollup.outstanding) : blank;
  const commission = rollup ? formatFigure(rollup.commissionEarned) : blank;
  const deliveryShare = rollup ? formatFigure(rollup.deliveryShareEarned) : blank;
  const riderPayout = rollup ? formatFigure(rollup.riderDeliveryPayout) : blank;
  const released = rollup ? formatFigure(rollup.supplierReleased) : blank;
  const owed = rollup ? formatFigure(rollup.supplierOutstanding) : blank;
  const held = rollup ? formatFigure(rollup.heldOnOrders) : blank;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          What clients have paid, what GRIDGO has earned, and what suppliers are still
          owed. Every order is paid in two digital installments and every supplier in four
          milestones, so both sides are counted separately.
        </p>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <section aria-labelledby="in-heading" className="flex flex-col gap-3">
        <h2 id="in-heading" className="text-h3 text-text-primary m-0">
          Money in from clients
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FigureCard
            label="Confirmed"
            value={confirmedIn.value}
            hint={
              rollup
                ? `${rollup.orderCount} live order${rollup.orderCount === 1 ? "" : "s"}`
                : "Across every live order"
            }
            loading={pending}
          />
          <FigureCard
            label="Waiting on Operations"
            value={awaiting.value}
            hint="Submitted by a client, not yet confirmed"
            loading={pending}
          />
          <FigureCard
            label="Not sent yet"
            value={outstanding.value}
            hint="Billed but the client has not transferred"
            loading={pending}
          />
        </div>
      </section>

      <section aria-labelledby="out-heading" className="flex flex-col gap-3">
        <h2 id="out-heading" className="text-h3 text-text-primary m-0">
          GRIDGO and supplier earnings
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <FigureCard
            label="Service fee earned"
            value={commission.value}
            hint={
              commission.hint ??
              (rollup?.unpricedOrderCount
                ? `${rollup.unpricedOrderCount} order${rollup.unpricedOrderCount === 1 ? "" : "s"} not priced yet`
                : "At the rate each order was priced at, on top of the supplier price")
            }
            loading={pending}
          />
          <FigureCard
            label="GRIDGO delivery share"
            value={deliveryShare.value}
            hint={
              deliveryShare.hint ??
              (rollup?.riderDeliveryPayout.kind === "amount"
                ? `Riders keep ${riderPayout.value} of the same delivery fees`
                : undefined)
            }
            loading={pending}
          />
          <FigureCard
            label="Paid to suppliers"
            value={released.value}
            hint="Milestones already released"
            loading={pending}
          />
          <FigureCard
            label="Still owed to suppliers"
            value={owed.value}
            hint="Milestones awaiting proof or release"
            loading={pending}
          />
          <FigureCard
            label="Held by claims"
            value={held.value}
            hint={
              rollup
                ? `${rollup.activeHoldClaims} active hold${rollup.activeHoldClaims === 1 ? "" : "s"}`
                : "Claims that block a release"
            }
            loading={pending}
          />
        </div>
      </section>

      <section className="gg-card" aria-labelledby="split-heading">
        <h2 id="split-heading" className="text-h3 text-text-primary m-0 mb-1">
          Where each order&rsquo;s money goes
        </h2>
        <p className="text-body text-text-secondary m-0 mb-3 max-w-prose">
          The client total, part by part. The supplier keeps its asking price in full; the
          service fee sits on top of it, and delivery on top of that &mdash; cut between
          the rider and GRIDGO at the rate each order was priced at.
        </p>
        {pending ? (
          <Skeleton className="h-72 w-full rounded-card" aria-hidden />
        ) : !splits.length ? (
          <EmptyState
            title="Nothing priced yet"
            body="An order only has a real split once a supplier accepts and names its price. Until then the client has an estimate."
          />
        ) : (
          <ChartContainer
            config={splitChartConfig}
            className="h-72 w-full"
            aria-label="Client total split into supplier earnings, service fee, rider payout and GRIDGO delivery share"
          >
            <BarChart data={splits} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value: string) =>
                  value.length > 18 ? `${value.slice(0, 17)}…` : value
                }
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatPhp(Number(value))}
                width={92}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent formatter={(value) => formatPhp(Number(value))} />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="supplierPriceMinor"
                stackId="money"
                fill="var(--color-supplierPriceMinor)"
                radius={[0, 0, 8, 8]}
              />
              <Bar
                dataKey="commissionMinor"
                stackId="money"
                fill="var(--color-commissionMinor)"
              />
              {deliveryBars.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="money"
                  fill={`var(--color-${key})`}
                  radius={index === deliveryBars.length - 1 ? [8, 8, 0, 0] : undefined}
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </section>

      <section className="gg-card" aria-labelledby="orders-heading">
        <h2 id="orders-heading" className="text-h3 text-text-primary m-0 mb-1">
          Order by order
        </h2>
        <p className="text-body text-text-secondary m-0 mb-3">
          Supplier price and service fee are shown here because Operations and Super Admin
          are the only roles allowed to see them.
        </p>
        {!pending && !rows.length ? (
          <EmptyState
            title="No live orders"
            body="Orders appear here as soon as a client submits one."
          />
        ) : (
          <DataTable
            columns={orderColumns}
            data={rows}
            loading={pending}
            getRowId={(o) => o.id}
            caption="Order money reconciliation"
            filterPlaceholder="Filter orders…"
          />
        )}
      </section>

      <section className="gg-card" aria-labelledby="claims-heading">
        <h2 id="claims-heading" className="text-h3 text-text-primary m-0 mb-1">
          Claims holding payout
        </h2>
        <p className="text-body text-text-secondary m-0 mb-3">
          An active hold stops every remaining milestone on that order. Released holds are
          history.
        </p>
        {!pending && !claims?.length ? (
          <EmptyState
            title="No claims"
            body="Claims appear when Operations raises one, or when a client reports an issue inside the issue window."
          />
        ) : (
          <DataTable
            columns={claimColumns}
            data={claims ?? []}
            loading={pending}
            getRowId={(c) => c.id}
            caption="Claims and holds"
            filterPlaceholder="Filter claims…"
          />
        )}
      </section>
    </div>
  );
}

function FigureCard({
  label,
  value,
  hint,
  loading = false,
}: {
  label: string;
  value: string;
  hint?: string;
  /** The figure is still being totalled; its label and provenance are not. */
  loading?: boolean;
}) {
  return (
    <div className="gg-card" aria-busy={loading || undefined}>
      <p className="text-caption text-text-muted m-0">{label}</p>
      {loading ? (
        // 30px is the `text-h2` line box the figure will occupy.
        <div className="mt-1 flex h-[30px] items-center">
          <Skeleton className="h-6 w-24" aria-hidden />
          <span className="sr-only">Still totalling</span>
        </div>
      ) : (
        <p className="text-h2 text-text-primary m-0 mt-1 tabular-nums">{value}</p>
      )}
      {hint ? <p className="text-caption text-text-muted m-0 mt-1">{hint}</p> : null}
    </div>
  );
}
