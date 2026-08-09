"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { adminErrorMessage } from "@/app/admin/_lib/errors";
import {
  codReconciliationRows,
  rollupFinance,
  type MoneyFigure,
} from "@/app/admin/_lib/finance";
import {
  presentClaimStatus,
  presentPaymentMethod,
  presentPaymentStatus,
} from "@/app/admin/_lib/present";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { listClaims, listOrders } from "@/lib/api/client";
import type { Claim, Order } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";

function formatFigure(fig: MoneyFigure): { value: string; hint?: string } {
  if (fig.kind === "amount") return { value: formatPhp(fig.minor) };
  return { value: "Unavailable", hint: fig.reason };
}

export default function AdminFinancePage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rollup = useMemo(() => {
    if (!orders || !claims) return null;
    return rollupFinance(orders, claims);
  }, [orders, claims]);

  const codRows = useMemo(
    () => (orders ? codReconciliationRows(orders) : []),
    [orders],
  );

  const codColumns = useMemo<DataTableColumn<Order>[]>(
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
              {o.zone.replace(/_/g, " ")}
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
        sortValue: (o) => presentPaymentStatus(o.paymentStatus).label,
        cell: (o) => {
          const p = presentPaymentStatus(o.paymentStatus);
          return <StatusChip tone={p.tone} label={p.label} icon={p.icon} />;
        },
      },
      {
        id: "total",
        header: "Order total",
        sortValue: (o) => o.totalMinor,
        cell: (o) => (
          <span
            className="text-body text-text-primary"
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
              Order {c.orderId}
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

  if (loading && !orders) {
    return <LoadingBlock label="Loading finance snapshot…" />;
  }
  if (error || !orders || !claims || !rollup) {
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

  const authorised = formatFigure(rollup.authorised);
  const collected = formatFigure(rollup.collected);
  const unpaid = formatFigure(rollup.unpaid);
  const held = formatFigure(rollup.heldOnOrders);
  const released = formatFigure(rollup.payoutReleased);
  const codCollected = formatFigure(rollup.codCollected);
  const codOutstanding = formatFigure(rollup.codOutstanding);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Money picture across orders: authorised, collected, held, released,
          and outstanding. Figures are composed from order payment fields and
          claims — where the demo ledger cannot supply a number, it is labelled
          unavailable rather than invented.
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <FigureCard
          label="Authorised"
          value={authorised.value}
          hint={`${rollup.orderCount} orders in view`}
        />
        <FigureCard label="Collected" value={collected.value} />
        <FigureCard label="Unpaid / outstanding" value={unpaid.value} />
        <FigureCard
          label="Held on orders"
          value={held.value}
          hint={`${rollup.activeHoldClaims} active claim hold${rollup.activeHoldClaims === 1 ? "" : "s"}`}
        />
        <FigureCard
          label="Payout released"
          value={released.value}
          hint={released.hint}
        />
        <FigureCard
          label="COD collected"
          value={codCollected.value}
          hint={`${rollup.codOrderCount} cash-on-delivery order${rollup.codOrderCount === 1 ? "" : "s"}`}
        />
      </div>

      <section className="gg-card" aria-labelledby="cod-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="cod-heading" className="text-h3 text-text-primary m-0">
              Cash-on-delivery reconciliation
            </h2>
            <p className="text-body text-text-secondary m-0 mt-1">
              Outstanding COD total:{" "}
              <strong className="text-text-primary font-medium">
                {codOutstanding.value}
              </strong>
              . Method and status come from each order — not a separate cash
              drawer endpoint.
            </p>
          </div>
        </div>

        {!codRows.length ? (
          <EmptyState
            title="No cash-on-delivery orders"
            body="COD orders appear here when clients choose cash on delivery. Until then, nothing to reconcile."
          />
        ) : (
          <DataTable
            columns={codColumns}
            data={codRows}
            getRowId={(o) => o.id}
            caption="Cash-on-delivery orders"
            filterPlaceholder="Filter COD orders…"
          />
        )}
      </section>

      <section className="gg-card" aria-labelledby="claims-heading">
        <h2 id="claims-heading" className="text-h3 text-text-primary m-0 mb-1">
          Claims affecting payout
        </h2>
        <p className="text-body text-text-secondary m-0 mb-3">
          Active holds block payout release. Released holds are historical.
        </p>
        {!claims.length ? (
          <EmptyState
            title="No claims"
            body="Claims appear when Operations or a client issue raises a payout hold."
          />
        ) : (
          <DataTable
            columns={claimColumns}
            data={claims}
            getRowId={(c) => c.id}
            caption="Claims and holds"
            filterPlaceholder="Filter claims…"
          />
        )}
      </section>

      <section className="gg-card" aria-labelledby="method-heading">
        <h2 id="method-heading" className="text-h3 text-text-primary m-0 mb-3">
          Payment method mix
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {summariseMethods(orders).map((row) => (
            <li
              key={row.method}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-subtle pb-2 last:border-0 last:pb-0"
            >
              <span className="text-body text-text-primary">{row.label}</span>
              <span className="text-body text-text-secondary">
                {row.count} · {formatPhp(row.totalMinor)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function FigureCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="gg-card">
      <p className="text-caption text-text-muted m-0">{label}</p>
      <p className="text-h2 text-text-primary m-0 mt-1">{value}</p>
      {hint ? (
        <p className="text-caption text-text-muted m-0 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

function summariseMethods(orders: Order[]) {
  const map = new Map<string, { label: string; count: number; totalMinor: number }>();
  for (const o of orders) {
    const key = o.paymentMethod ?? "none";
    const existing = map.get(key) ?? {
      label: presentPaymentMethod(o.paymentMethod),
      count: 0,
      totalMinor: 0,
    };
    existing.count += 1;
    existing.totalMinor += o.totalMinor;
    map.set(key, existing);
  }
  return [...map.entries()]
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}
