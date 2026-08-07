"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError, creditBalance, listOrders } from "@/lib/api/client";
import type { CreditBalance, Order } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";

type OverviewData = {
  orders: Order[];
  credits: CreditBalance[];
};

function countByState(orders: Order[]): { state: string; count: number }[] {
  const map = new Map<string, number>();
  for (const o of orders) {
    map.set(o.state, (map.get(o.state) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orders = await listOrders();
      const clientIds = [
        ...new Set(orders.map((o) => o.clientId).filter(Boolean)),
      ];
      // Credits endpoint is per-client; no platform-wide credits list exists.
      const credits: CreditBalance[] = [];
      for (const clientId of clientIds) {
        try {
          credits.push(await creditBalance(clientId));
        } catch {
          // Skip clients without a credit ledger.
        }
      }
      setData({ orders, credits });
    } catch (err) {
      setData(null);
      if (err instanceof ApiError) {
        setError(`Could not load platform data (${err.code}).`);
      } else {
        setError(
          "Network error loading overview. Confirm the demo API is running.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const derived = useMemo(() => {
    if (!data) return null;
    const byState = countByState(data.orders);
    const suppliers = new Set(
      data.orders.map((o) => o.supplierId).filter(Boolean) as string[],
    );
    const riders = new Set(
      data.orders.map((o) => o.riderId).filter(Boolean) as string[],
    );
    const clients = new Set(data.orders.map((o) => o.clientId));
    const totalCredit = data.credits.reduce((s, c) => s + c.balanceMinor, 0);
    return {
      byState,
      supplierCount: suppliers.size,
      riderCount: riders.size,
      clientCount: clients.size,
      supplierIds: [...suppliers],
      riderIds: [...riders],
      totalCredit,
    };
  }, [data]);

  if (loading && !data) return <LoadingBlock label="Loading platform overview…" />;
  if (error || !data || !derived) {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Snapshot from live API data: orders, credit balances for clients seen
          on those orders, and supplier/rider IDs referenced by orders. There is
          no platform directory endpoint for users, zones, fees, or Pilot Credit
          grants.
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Orders" value={String(data.orders.length)} />
        <StatCard
          label="Suppliers on orders"
          value={String(derived.supplierCount)}
          hint="Distinct supplierId values"
        />
        <StatCard
          label="Riders on orders"
          value={String(derived.riderCount)}
          hint="Distinct riderId values"
        />
        <StatCard
          label="Pilot Credit balance"
          value={formatPhp(derived.totalCredit)}
          hint={`${data.credits.length} client ledger${data.credits.length === 1 ? "" : "s"}`}
        />
      </div>

      <section className="gg-card" aria-labelledby="states-heading">
        <h2 id="states-heading" className="text-h3 text-text-primary m-0 mb-3">
          Orders by state
        </h2>
        {derived.byState.length === 0 ? (
          <p className="text-body text-text-muted m-0">No orders in the store.</p>
        ) : (
          <>
            {/* Table ≥768 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-outline">
                    <th className="text-caption text-text-muted py-2 pr-4 font-normal">
                      State
                    </th>
                    <th className="text-caption text-text-muted py-2 font-normal">
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {derived.byState.map((row) => {
                    const p = presentOrderState(row.state);
                    return (
                      <tr
                        key={row.state}
                        className="border-b border-outline-subtle last:border-0"
                      >
                        <td className="py-3 pr-4">
                          <StatusChip
                            tone={p.tone}
                            label={p.label}
                            icon={p.icon}
                          />
                        </td>
                        <td className="text-body text-text-primary py-3">
                          {row.count}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Cards &lt;768 */}
            <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
              {derived.byState.map((row) => {
                const p = presentOrderState(row.state);
                return (
                  <li
                    key={row.state}
                    className="flex items-center justify-between gap-3 rounded-field border border-outline px-3 py-3"
                  >
                    <StatusChip tone={p.tone} label={p.label} icon={p.icon} />
                    <span className="text-body text-text-primary">{row.count}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="gg-card" aria-labelledby="credit-heading">
          <h2 id="credit-heading" className="text-h3 text-text-primary m-0 mb-3">
            Pilot Credit positions
          </h2>
          {data.credits.length === 0 ? (
            <p className="text-body text-text-muted m-0">
              No credit ledgers returned for clients on current orders.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {data.credits.map((c) => (
                <li
                  key={c.clientId}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-subtle pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-body text-text-primary m-0">
                      {c.clientId}
                    </p>
                    <p className="text-caption text-text-muted m-0">
                      {c.ledger.length} ledger entr
                      {c.ledger.length === 1 ? "y" : "ies"}
                    </p>
                  </div>
                  <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
                    {formatPhp(c.balanceMinor)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="text-caption text-text-muted m-0 mt-3">
            Granting or adjusting Pilot Credits is not available — the API has no
            grant endpoint for this portal.
          </p>
        </section>

        <section className="gg-card" aria-labelledby="parties-heading">
          <h2 id="parties-heading" className="text-h3 text-text-primary m-0 mb-3">
            Parties seen on orders
          </h2>
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-caption text-text-muted m-0 mb-1">Suppliers</p>
              {derived.supplierIds.length ? (
                <ul className="m-0 list-none p-0 text-body text-text-primary">
                  {derived.supplierIds.map((id) => (
                    <li key={id}>{id}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-body text-text-muted m-0">None assigned</p>
              )}
            </div>
            <div>
              <p className="text-caption text-text-muted m-0 mb-1">Riders</p>
              {derived.riderIds.length ? (
                <ul className="m-0 list-none p-0 text-body text-text-primary">
                  {derived.riderIds.map((id) => (
                    <li key={id}>{id}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-body text-text-muted m-0">None assigned</p>
              )}
            </div>
          </div>
          <p className="text-caption text-text-muted m-0 mt-3">
            Verification, roles, catalogue, zones, and fee configuration screens
            are out of scope — those endpoints do not exist on the demo API.
          </p>
        </section>
      </div>
    </div>
  );
}

function StatCard({
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
