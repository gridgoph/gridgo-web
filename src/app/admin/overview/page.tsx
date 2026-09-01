"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, Package, Truck, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonLines } from "@/components/ui/loading";
import { StatCard } from "@/components/ui/StatCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError, creditBalance, listOrders, listUsers } from "@/lib/api/client";
import type { CreditBalance, Order, User } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";

type OverviewData = {
  orders: Order[];
  credits: CreditBalance[];
  /** Person id → the name a human would use for them. */
  people: Map<string, string>;
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
      const [orders, suppliers, riders, clients] = await Promise.all([
        listOrders(),
        listUsers("supplier"),
        listUsers("rider"),
        listUsers("client"),
      ]);
      const people = new Map<string, string>();
      for (const u of [...suppliers, ...riders, ...clients] as User[]) {
        people.set(u.id, u.supplierName ?? u.name ?? u.email);
      }

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
      setData({ orders, credits, people });
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          A snapshot from live data: orders, the pilot grant balances of clients
          on those orders, and the suppliers and riders those orders name.
          Accreditation, zones, grants and settings each have their own screen
          on the rail.
        </p>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </div>

      {/* Each figure's label, icon and provenance line are this screen's own
          copy. Only the number waits. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Orders"
          value={String(data?.orders.length ?? 0)}
          hint={
            derived
              ? `For ${derived.clientCount} client${derived.clientCount === 1 ? "" : "s"}`
              : "Across every client on the book"
          }
          icon={Package}
          loading={pending}
        />
        <StatCard
          label="Suppliers working"
          value={String(derived?.supplierCount ?? 0)}
          hint="Named on at least one order"
          icon={Users}
          loading={pending}
        />
        <StatCard
          label="Riders carrying"
          value={String(derived?.riderCount ?? 0)}
          hint="Named on at least one order"
          icon={Truck}
          loading={pending}
        />
        <StatCard
          label="Pilot Credit balance"
          value={formatPhp(derived?.totalCredit ?? 0)}
          hint={
            data
              ? `Across ${data.credits.length} client ledger${data.credits.length === 1 ? "" : "s"}`
              : "Across every client ledger on the book"
          }
          icon={Coins}
          loading={pending}
        />
      </div>

      {pending || !data || !derived ? (
        <>
          <section className="gg-card" aria-labelledby="states-heading">
            <h2
              id="states-heading"
              className="text-h3 text-text-primary m-0 mb-3"
            >
              Orders by state
            </h2>
            <SkeletonLines lines={4} />
          </section>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="gg-card" aria-labelledby="credit-heading">
              <h2
                id="credit-heading"
                className="text-h3 text-text-primary m-0 mb-3"
              >
                Pilot Credit positions
              </h2>
              <SkeletonLines lines={3} />
            </section>
            <section className="gg-card" aria-labelledby="parties-heading">
              <h2
                id="parties-heading"
                className="text-h3 text-text-primary m-0 mb-3"
              >
                Parties seen on orders
              </h2>
              <SkeletonLines lines={3} />
            </section>
          </div>
        </>
      ) : (
        <>
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
                      {data.people.get(c.clientId) ?? "Unnamed client"}
                    </p>
                    <p className="text-caption text-text-muted m-0">
                      {c.ledger.length} grant{c.ledger.length === 1 ? "" : "s"} on
                      record
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
            Credits are a grant ledger. They never pay for an order — issue them
            on Pilot Credits.
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
                    <li key={id}>{data.people.get(id) ?? "Unnamed supplier"}</li>
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
                    <li key={id}>{data.people.get(id) ?? "Unnamed rider"}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-body text-text-muted m-0">None assigned</p>
              )}
            </div>
          </div>
          <p className="text-caption text-text-muted m-0 mt-3">
            Accredit a supplier or rider on Accreditation before they can be
            given work.
          </p>
        </section>
      </div>
        </>
      )}
    </div>
  );
}

