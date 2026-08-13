"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { adminErrorMessage } from "@/app/admin/_lib/errors";
import {
  buildPlanningSnapshot,
  formatDayLabel,
  formatWeekHeading,
  shiftWeek,
  type PlanningSnapshot,
} from "@/app/admin/_lib/planning";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import {
  listOrders,
  listSupplierServices,
  listUsers,
} from "@/lib/api/client";
import type { Order, SupplierService, User } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentOrderState,
  presentZone,
} from "@/lib/order-state";
import { StatusChip } from "@/components/ui/StatusChip";

export default function AdminPlanningPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [services, setServices] = useState<SupplierService[] | null>(null);
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [anchor, setAnchor] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, s, u] = await Promise.all([
        listOrders(),
        listSupplierServices(),
        listUsers(),
      ]);
      setOrders(o);
      setServices(s);
      setUsers(u);
    } catch (err) {
      setOrders(null);
      setServices(null);
      setUsers(null);
      setError(
        adminErrorMessage(
          err,
          "Could not load planning data. Confirm the demo API is running.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const snapshot: PlanningSnapshot | null = useMemo(() => {
    if (!orders || !services || !users) return null;
    return buildPlanningSnapshot({
      orders,
      services,
      users,
      anchor,
    });
  }, [orders, services, users, anchor]);

  if (loading && !snapshot) {
    return <LoadingBlock label="Loading planning calendar…" />;
  }
  if (error || !snapshot) {
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Week view of promised deliveries composed from live orders, plus
          verified capacity signals from supplier service lines. Rider shift
          calendars and zone blackouts are not on the demo API — those rows stay
          explicitly unavailable.
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Live daily capacity"
          value={
            snapshot.liveCapacityDaily != null
              ? String(snapshot.liveCapacityDaily)
              : "Unavailable"
          }
          hint={
            snapshot.liveCapacityDaily != null
              ? `Across ${snapshot.liveServiceCount} live service line${snapshot.liveServiceCount === 1 ? "" : "s"}`
              : "No live services report daily capacity"
          }
        />
        <Stat
          label="Live weekly capacity"
          value={
            snapshot.liveCapacityWeekly != null
              ? String(snapshot.liveCapacityWeekly)
              : "Unavailable"
          }
        />
        <Stat
          label="Verified suppliers"
          value={String(snapshot.verifiedSupplierCount)}
        />
        <Stat
          label="Verified riders"
          value={String(snapshot.verifiedRiderCount)}
        />
      </div>

      <div
        className="rounded-field border border-outline bg-surface-variant px-3 py-3"
        role="note"
      >
        <p className="text-body text-text-secondary m-0">
          {snapshot.unavailable.riderAvailability}
        </p>
        <p className="text-body text-text-secondary m-0 mt-1">
          {snapshot.unavailable.zoneBlackouts}
        </p>
      </div>

      <section className="gg-card" aria-labelledby="week-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="week-heading" className="text-h3 text-text-primary m-0">
              Delivery week
            </h2>
            <p className="text-body text-text-secondary m-0 mt-1">
              {formatWeekHeading(snapshot.week)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setAnchor((a) => shiftWeek(a, -1))}
              aria-label="Previous week"
            >
              Previous
            </Button>
            {/* Yellow is for the action a page exists to take. Planning is a
                read-only view, and "Today" is a navigation convenience. */}
            <Button variant="secondary" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
            <Button
              variant="secondary"
              onClick={() => setAnchor((a) => shiftWeek(a, 1))}
              aria-label="Next week"
            >
              Next
            </Button>
          </div>
        </div>

        {/* Week grid ≥768 */}
        <div className="hidden md:grid md:grid-cols-7 md:gap-2">
          {snapshot.days.map((day) => (
            <div
              key={day.key}
              className={`flex min-h-36 flex-col rounded-field border px-2 py-2 ${
                day.isToday
                  ? "border-text-primary bg-surface"
                  : "border-outline bg-surface"
              }`}
            >
              <p
                className="text-caption text-text-muted m-0"
                style={
                  day.isToday
                    ? { fontFamily: "var(--font-bold)", color: "var(--color-text-primary)" }
                    : undefined
                }
              >
                {formatDayLabel(day.date)}
                {day.isToday ? " · Today" : ""}
              </p>
              <p className="text-body text-text-primary m-0 mt-1">
                {day.deliveryCount} deliver
                {day.deliveryCount === 1 ? "y" : "ies"}
              </p>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                {day.deliveries.slice(0, 3).map((o) => (
                  <li
                    key={o.id}
                    className="text-caption text-text-secondary truncate"
                    title={o.title}
                  >
                    {o.title}
                  </li>
                ))}
                {day.deliveries.length > 3 ? (
                  <li className="text-caption text-text-muted">
                    +{day.deliveries.length - 3} more
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>

        {/* Agenda <768 */}
        <div className="md:hidden">
          <h3 className="text-h3 text-text-primary m-0 mb-3">Agenda</h3>
          {!snapshot.agenda.length ? (
            <EmptyState
              title="No promised deliveries this week"
              body="Orders with a promised date in this week appear here. Use Previous / Next to move weeks, or Today to jump back."
            />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {snapshot.agenda.map((item) => {
                const order = orders?.find((o) => o.id === item.id);
                const status = order
                  ? presentOrderState(order.state)
                  : null;
                return (
                  <li
                    key={item.id}
                    className="rounded-field border border-outline px-3 py-3"
                  >
                    <p className="text-caption text-text-muted m-0">
                      {formatDateTime(item.at)}
                    </p>
                    <p
                      className="text-body text-text-primary m-0 mt-1"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {item.title}
                    </p>
                    <p className="text-caption text-text-secondary m-0 mt-0.5">
                      {presentZone(item.zone)}
                      {order
                        ? ` · ${formatPhp(order.totalMinor)}`
                        : ""}
                    </p>
                    {status ? (
                      <div className="mt-2">
                        <StatusChip
                          tone={status.tone}
                          label={status.label}
                          icon={status.icon}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Desktop empty note when week has no deliveries */}
        {snapshot.agenda.length === 0 ? (
          <p className="text-body text-text-muted m-0 mt-4 hidden md:block">
            No promised deliveries in this week. Adjacent weeks may still have
            volume — use Previous or Next.
          </p>
        ) : null}
      </section>

      {/* Desktop detail list for the week */}
      {snapshot.agenda.length > 0 ? (
        <section
          className="gg-card hidden md:block"
          aria-labelledby="detail-heading"
        >
          <h2 id="detail-heading" className="text-h3 text-text-primary m-0 mb-3">
            This week’s promised deliveries
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {snapshot.agenda.map((item) => {
              const order = orders?.find((o) => o.id === item.id);
              const status = order ? presentOrderState(order.state) : null;
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-subtle pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p
                      className="text-body text-text-primary m-0"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {item.title}
                    </p>
                    <p className="text-caption text-text-muted m-0 mt-0.5">
                      {formatDateTime(item.at)} ·{" "}
                      {presentZone(item.zone)}
                    </p>
                  </div>
                  {status ? (
                    <StatusChip
                      tone={status.tone}
                      label={status.label}
                      icon={status.icon}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({
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
