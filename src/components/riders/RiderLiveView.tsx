"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Crosshair } from "lucide-react";

import { RiderMap } from "@/components/riders/RiderMap";
import { StaleRiders } from "@/components/riders/StaleRiders";
import { VehicleGlyph } from "@/components/riders/VehicleGlyph";
import { useRiderLocations } from "@/components/riders/useRiderLocations";
import { useRiderRoutes } from "@/components/riders/useRiderRoutes";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusChip } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/button";
import { listUsers } from "@/lib/api/client";
import type { RiderLocation } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";
import { routeSummaryLabel } from "@/lib/osrm";
import {
  formatThreshold,
  freshnessIcon,
  freshnessLabel,
  freshnessTone,
  ridersToContact,
  type RiderLocationView,
} from "@/lib/rider-tracking";
import { vehicleSummary } from "@/lib/vehicle";

type Props = {
  /** Where "Open order" goes for this role. Super Admin never lands on /ops/*. */
  orderHref: (orderId: string) => string;
  /** Which tree's chat desk "Message" opens. */
  tree: "ops" | "admin";
};

/**
 * Riders on live trips, shared by Operations and Super Admin.
 *
 * Every rider with an assigned, picked-up or out-for-delivery job is here,
 * including one whose phone has never sent a fix. Riders whose location has
 * gone stale lead the page with Call and Message; the map draws everyone with
 * a position, and the roster under it repeats every rider in text so the page
 * reads without the map and in greyscale.
 */
export function RiderLiveView({ orderHref, tree }: Props) {
  const searchParams = useSearchParams();
  const { riders, error, loading, tracking, view, reload } = useRiderLocations();
  const [phones, setPhones] = useState<Record<string, string | undefined>>({});
  const [focusRiderId, setFocusRiderId] = useState<string | null>(() =>
    searchParams.get("rider"),
  );

  // Phone numbers for Call. Best effort: without them Message still works.
  useEffect(() => {
    let cancelled = false;
    void listUsers("rider")
      .then((users) => {
        if (!cancelled) setPhones(Object.fromEntries(users.map((u) => [u.id, u.phone])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const list = useMemo(() => riders ?? [], [riders]);
  const routes = useRiderRoutes(list);
  const views = useMemo(
    () => Object.fromEntries(list.map((rider) => [rider.riderId, view(rider)])),
    [list, view],
  );
  const toContact = useMemo(() => ridersToContact(list, view), [list, view]);
  const threshold = formatThreshold(tracking.staleAfterSeconds);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h2 text-text-primary m-0">Rider locations</h1>
          <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
            Every rider with a job, from acceptance until delivery. Each pin is the
            vehicle on the rider&apos;s profile; the line is the road route to the
            drop-off. Updates every {tracking.refreshIntervalSeconds} seconds.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void reload()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? (
        <ErrorState
          body={riders ? `${error} Showing the last positions read.` : error}
          action={
            <Button variant="secondary" onClick={() => void reload()}>
              Retry
            </Button>
          }
        />
      ) : null}

      <StaleRiders
        entries={toContact}
        activeCount={list.length}
        staleAfterSeconds={tracking.staleAfterSeconds}
        phoneOf={(id) => phones[id]}
        tree={tree}
        orderHref={orderHref}
        onShowOnMap={setFocusRiderId}
      />

      <RiderMap riders={list} routes={routes} focusRiderId={focusRiderId} views={views} />

      {list.length > 0 ? (
        <p className="text-caption text-text-muted m-0">
          Hollow dot: pickup. Solid dot: drop-off. Yellow line: road route. Grey dashed
          line: direct line, shown when the routing service is unavailable. A dashed pin
          is a last known position more than {threshold} old.
        </p>
      ) : null}

      {riders && riders.length === 0 && !loading && !error ? (
        <EmptyState
          title="No riders on a trip"
          body="A rider appears here once they accept a job, and stays until it is delivered."
        />
      ) : null}

      {list.length > 0 ? (
        <ul className="gg-card divide-y divide-[var(--color-outline-subtle)] p-0 m-0 list-none">
          {list.map((rider) => (
            <RosterRow
              key={rider.riderId}
              rider={rider}
              view={views[rider.riderId]!}
              route={routeSummaryLabel(routes[rider.riderId])}
              orderHref={orderHref}
              onShowOnMap={setFocusRiderId}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RosterRow({
  rider,
  view,
  route,
  orderHref,
  onShowOnMap,
}: {
  rider: RiderLocation;
  view: RiderLocationView;
  route: string;
  orderHref: (orderId: string) => string;
  onShowOnMap: (riderId: string) => void;
}) {
  const status = presentOrderState(rider.state);
  const stale = view.freshness !== "live";
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      <span
        className={
          stale
            ? "border-warning text-text-muted flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed"
            : "bg-text-primary text-surface flex size-10 shrink-0 items-center justify-center rounded-full"
        }
        aria-hidden
      >
        <VehicleGlyph vehicleType={rider.vehicleType} size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          {rider.name}
          <span className="text-text-secondary" style={{ fontFamily: "var(--font-sans)" }}>
            {" · "}
            {vehicleSummary(rider.vehicleType, rider.plateNumber)}
          </span>
        </p>
        <p className="text-caption text-text-muted m-0 mt-0.5">
          {status.label} · Order {rider.orderId}
          {rider.orderTitle ? ` · ${rider.orderTitle}` : ""}
        </p>
        {view.hasPosition ? (
          <p className="text-caption text-text-secondary m-0 mt-0.5">
            {route}
            {rider.dropoff?.label ? ` · ${rider.dropoff.label}` : ""}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <StatusChip
            tone={freshnessTone(view.freshness)}
            label={freshnessLabel(view)}
            icon={freshnessIcon(view.freshness)}
          />
          {view.lastUpdatedAt ? (
            <span className="text-caption text-text-muted">
              Last ping {formatDateTime(view.lastUpdatedAt)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {view.hasPosition ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onShowOnMap(rider.riderId)}
            aria-label={`Show ${rider.name} on the map`}
          >
            <Crosshair size={16} aria-hidden />
            Show on map
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={orderHref(rider.orderId)} />}
        >
          Open order
        </Button>
      </div>
    </li>
  );
}
