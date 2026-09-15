"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Crosshair } from "lucide-react";

import { presentLocation } from "@/app/ops/_lib/dispatch";
import { RiderMap } from "@/components/riders/RiderMap";
import { VehicleGlyph } from "@/components/riders/VehicleGlyph";
import { useRiderRoutes } from "@/components/riders/useRiderRoutes";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/button";
import { ApiError, listRiderLocations } from "@/lib/api/client";
import type { RiderLocation } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { presentOrderState } from "@/lib/order-state";
import { routeSummaryLabel } from "@/lib/osrm";
import { vehicleSummary } from "@/lib/vehicle";

/** Staleness is judged against the clock, not only against the last refresh. */
const CLOCK_TICK_MS = 30_000;

type Props = {
  /** Where "Open order" goes for this role. Super Admin never lands on /ops/*. */
  orderHref: (orderId: string) => string;
};

/**
 * Riders on live trips, shared by Operations and Super Admin.
 *
 * Pings only exist while a job is picked up or out for delivery, so an idle
 * rider does not appear. The map is the primary surface; the roster under it
 * repeats every pin in text so the page reads without the map and in greyscale.
 */
export function RiderLiveView({ orderHref }: Props) {
  const searchParams = useSearchParams();
  const [riders, setRiders] = useState<RiderLocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [focusRiderId, setFocusRiderId] = useState<string | null>(() =>
    searchParams.get("rider"),
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        setRiders(await listRiderLocations());
        setNowMs(Date.now());
      } catch (err) {
        setRiders(null);
        setError(
          err instanceof ApiError
            ? `Could not load rider locations (${err.code}).`
            : "Could not reach the API. Check it is running, then retry.",
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload("location", load);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const list = riders ?? [];
  const routes = useRiderRoutes(list);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h2 text-text-primary m-0">Rider locations</h1>
          <p className="text-body text-text-secondary m-0 mt-1">
            Riders appear here only while they are sharing location on a live trip. Each
            pin is the vehicle on the rider&apos;s profile; the line is the road route
            from the rider to the drop-off.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? (
        <ErrorState
          body={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : null}

      <RiderMap riders={list} routes={routes} focusRiderId={focusRiderId} nowMs={nowMs} />

      {list.length > 0 ? (
        <p className="text-caption text-text-muted m-0">
          Hollow dot: pickup. Solid dot: drop-off. Yellow line: road route. Grey dashed
          line: direct line, shown when the routing service is unavailable. A dashed pin
          means the last ping is more than five minutes old.
        </p>
      ) : null}

      {riders && riders.length === 0 && !loading && !error ? (
        <EmptyState
          title="No riders sharing location"
          body="A pin appears when a rider is on a pickup or delivery and the phone is sending its position."
        />
      ) : null}

      {list.length > 0 ? (
        <ul className="gg-card divide-y divide-[var(--color-outline-subtle)] p-0 m-0 list-none">
          {list.map((rider) => {
            const status = presentOrderState(rider.state);
            const freshness = presentLocation(
              {
                id: rider.riderId,
                orderId: rider.orderId,
                riderId: rider.riderId,
                lat: rider.lat,
                lng: rider.lng,
                accuracy: rider.accuracy,
                at: rider.at,
              },
              rider.state,
              nowMs,
            ).freshness;
            const stale = freshness !== "live";
            return (
              <li
                key={rider.riderId}
                className="flex flex-wrap items-start gap-3 px-4 py-3"
              >
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
                  <p
                    className="text-body text-text-primary m-0"
                    style={{ fontFamily: "var(--font-medium)" }}
                  >
                    {rider.name}
                    <span
                      className="text-text-secondary"
                      style={{ fontFamily: "var(--font-sans)" }}
                    >
                      {" · "}
                      {vehicleSummary(rider.vehicleType, rider.plateNumber)}
                    </span>
                  </p>
                  <p className="text-caption text-text-muted m-0 mt-0.5">
                    {status.label} · Order {rider.orderId}
                    {rider.orderTitle ? ` · ${rider.orderTitle}` : ""}
                  </p>
                  <p className="text-caption text-text-secondary m-0 mt-0.5">
                    {routeSummaryLabel(routes[rider.riderId])}
                    {rider.dropoff?.label ? ` · ${rider.dropoff.label}` : ""}
                  </p>
                  <p className="text-caption text-text-muted m-0 mt-0.5">
                    Last ping {formatDateTime(rider.at)}
                    {stale ? " · more than five minutes ago" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFocusRiderId(rider.riderId)}
                    aria-label={`Show ${rider.name} on the map`}
                  >
                    <Crosshair size={16} aria-hidden />
                    Show on map
                  </Button>
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
          })}
        </ul>
      ) : null}
    </div>
  );
}
