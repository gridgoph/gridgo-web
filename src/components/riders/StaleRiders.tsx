"use client";

import Link from "next/link";
import { Crosshair } from "lucide-react";

import { RiderContact } from "@/components/riders/RiderContact";
import { VehicleGlyph } from "@/components/riders/VehicleGlyph";
import { Button } from "@/components/ui/button";
import type { RiderLocation } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";
import {
  formatAge,
  formatThreshold,
  type RiderLocationView,
} from "@/lib/rider-tracking";
import { vehicleSummary } from "@/lib/vehicle";

type Entry = { row: RiderLocation; view: RiderLocationView };

type Props = {
  /** Riders to contact, longest silence first (`ridersToContact`). */
  entries: Entry[];
  /** Riders on an active trip, for the all-clear line. */
  activeCount: number;
  staleAfterSeconds: number;
  phoneOf: (riderId: string) => string | null | undefined;
  tree: "ops" | "admin";
  orderHref: (orderId: string) => string;
  /** Pan the map to a rider; omitted where there is no map. */
  onShowOnMap?: (riderId: string) => void;
};

/**
 * The riders whose location has gone quiet, at the top of every live delivery
 * view. A stale rider is still on a trip with somebody's order, and the client
 * is now looking at "Rider location temporarily unavailable": the only fix is a
 * person contacting the rider, so each row leads with how long it has been and
 * carries Call and Message.
 */
export function StaleRiders({
  entries,
  activeCount,
  staleAfterSeconds,
  phoneOf,
  tree,
  orderHref,
  onShowOnMap,
}: Props) {
  const threshold = formatThreshold(staleAfterSeconds);
  if (!entries.length) {
    if (!activeCount) return null;
    return (
      <p className="text-body text-text-secondary m-0" data-testid="stale-riders-clear">
        Every rider on a trip has sent a location in the last {threshold}.
      </p>
    );
  }
  return (
    <section
      className="gg-card flex flex-col gap-0 p-0"
      style={{ borderColor: "var(--color-warning)" }}
      aria-labelledby="stale-riders-heading"
      data-testid="stale-riders"
    >
      <div className="px-4 pt-3 pb-2">
        <h2 id="stale-riders-heading" className="text-h3 text-text-primary m-0">
          {entries.length === 1
            ? "1 rider needs a call"
            : `${entries.length} riders need a call`}
        </h2>
        <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
          No location for more than {threshold}. The client sees &ldquo;Rider location
          temporarily unavailable&rdquo;. The phone may have lost signal, or GRIDGO may
          have been closed or stopped on it.
        </p>
      </div>
      <ul className="m-0 list-none divide-y divide-[var(--color-outline-subtle)] border-t border-[var(--color-outline-subtle)] p-0">
        {entries.map(({ row, view }) => (
          <StaleRiderRow
            key={row.riderId}
            row={row}
            view={view}
            phone={phoneOf(row.riderId)}
            tree={tree}
            orderHref={orderHref}
            onShowOnMap={onShowOnMap}
          />
        ))}
      </ul>
    </section>
  );
}

function StaleRiderRow({
  row,
  view,
  phone,
  tree,
  orderHref,
  onShowOnMap,
}: {
  row: RiderLocation;
  view: RiderLocationView;
  phone: string | null | undefined;
  tree: "ops" | "admin";
  orderHref: (orderId: string) => string;
  onShowOnMap?: (riderId: string) => void;
}) {
  const silent = view.freshness === "silent";
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[auto_minmax(0,1fr)_auto]">
      <span
        className="border-warning text-text-muted row-span-3 flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed md:row-span-2"
        aria-hidden
      >
        <VehicleGlyph vehicleType={row.vehicleType} size={22} />
      </span>
      <div className="min-w-0">
        <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          {row.name}
          <span className="text-text-secondary" style={{ fontFamily: "var(--font-sans)" }}>
            {", "}
            {vehicleSummary(row.vehicleType, row.plateNumber)}
          </span>
        </p>
        <p className="text-caption text-text-muted m-0 mt-0.5">
          {presentOrderState(row.state).label} with{" "}
          <Link
            href={orderHref(row.orderId)}
            className="text-text-secondary underline-offset-2 hover:underline"
          >
            {row.orderTitle ? `${row.orderTitle} (${row.orderId})` : `order ${row.orderId}`}
          </Link>
        </p>
        <p className="text-caption text-text-secondary m-0 mt-0.5">
          {silent
            ? "Has not sent a location since taking this job."
            : `Last location ${formatDateTime(view.lastUpdatedAt)}${
                view.hasPosition ? ", still shown on the map" : ""
              }.`}
        </p>
      </div>
      {/* The silence leads on a phone; on a wide screen it sits at the right edge. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:col-start-3 md:row-span-2 md:row-start-1 md:flex-col md:items-end">
        <p className="text-h3 text-text-primary m-0 tabular-nums md:text-right" data-testid="stale-age">
          {silent ? "No location" : formatAge(view.ageSeconds ?? 0)}
          <span
            className="text-caption text-text-muted block md:text-right"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {silent ? "since assignment" : "since last update"}
          </span>
        </p>
        {onShowOnMap && view.hasPosition ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onShowOnMap(row.riderId)}
            aria-label={`Show ${row.name}'s last position on the map`}
          >
            <Crosshair size={16} aria-hidden />
            Last position
          </Button>
        ) : null}
      </div>
      <div className="md:col-start-2 md:row-start-2">
        <RiderContact riderId={row.riderId} name={row.name} phone={phone} tree={tree} />
      </div>
    </li>
  );
}
