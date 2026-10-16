"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { RiderContact } from "@/components/riders/RiderContact";
import { AGE_TICK_MS } from "@/components/riders/useRiderLocations";
import { StatusChip } from "@/components/ui/StatusChip";
import { getLocationDiagnostics, getSettings, getUser } from "@/lib/api/client";
import type { LocationDiagnostics, Order, User } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  ACTIVE_TRACKING_STATES,
  formatAge,
  formatThreshold,
  freshnessIcon,
  freshnessLabel,
  freshnessTone,
  presentRiderLocation,
  summarizeDiagnostics,
  trackingSettingsOf,
  type DiagnosticsSummary,
  type RiderLocationView,
  type TrackingSettings,
} from "@/lib/rider-tracking";
import { cn } from "@/lib/utils";

export type OrderRiderTracking = {
  /** The order has a rider whose location this row is about. */
  shown: boolean;
  /** A rider is on the job now; the location should be arriving. */
  active: boolean;
  diagnostics: LocationDiagnostics | null;
  error: string | null;
  tracking: TrackingSettings;
  view: RiderLocationView | null;
  rider: User | null;
  /** Seconds since the diagnostics were read, so on-screen silences count on. */
  elapsedSeconds: number;
};

/**
 * The current assignment's location freshness and ping gaps, read from
 * `GET /ops/orders/:id/location-diagnostics`. While the rider is on the job it
 * is re-read at the refresh interval Super Admin set; after delivery it is
 * read once, for looking back at the gaps.
 */
export function useOrderRiderTracking(order: Order | null): OrderRiderTracking {
  const orderId = order?.id ?? null;
  const riderId = order?.riderId ?? null;
  const active = Boolean(order && riderId && ACTIVE_TRACKING_STATES.has(order.state));
  const [diagnostics, setDiagnostics] = useState<LocationDiagnostics | null>(null);
  const [fetchedAtMs, setFetchedAtMs] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<TrackingSettings>(() => trackingSettingsOf(null));
  const [rider, setRider] = useState<User | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      if (!orderId || !riderId) return;
      try {
        const next = await getLocationDiagnostics(orderId);
        if (!Array.isArray(next?.samples)) throw new Error("unexpected diagnostics body");
        const at = Date.now();
        setDiagnostics(next);
        setFetchedAtMs(at);
        setNowMs(at);
        setError(null);
      } catch {
        setError(
          "The rider's location could not be read. It is tried again on the next refresh.",
        );
      }
    }, [orderId, riderId]),
  );

  useEffect(() => {
    setDiagnostics(null);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!riderId) return;
    let cancelled = false;
    void getSettings()
      .then((settings) => !cancelled && setTracking(trackingSettingsOf(settings)))
      .catch(() => {});
    void getUser(riderId)
      .then((user) => !cancelled && setRider(user))
      .catch(() => !cancelled && setRider(null));
    return () => {
      cancelled = true;
    };
  }, [riderId]);

  const intervalMs = tracking.refreshIntervalSeconds * 1000;
  useEffect(() => {
    if (!active) return;
    const poll = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, intervalMs);
    const tick = window.setInterval(() => setNowMs(Date.now()), AGE_TICK_MS);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [active, intervalMs, load]);

  const view = useMemo(
    () =>
      diagnostics && active
        ? presentRiderLocation(
            {
              lat: null,
              lng: null,
              at: diagnostics.lastUpdatedAt,
              lastUpdatedAt: diagnostics.lastUpdatedAt,
              ageSeconds: diagnostics.ageSeconds,
              stale: diagnostics.stale,
            },
            tracking.staleAfterSeconds,
            fetchedAtMs,
            nowMs,
          )
        : null,
    [diagnostics, active, tracking.staleAfterSeconds, fetchedAtMs, nowMs],
  );

  return {
    shown: Boolean(riderId),
    active,
    diagnostics,
    error,
    tracking,
    view,
    rider,
    elapsedSeconds: Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000)),
  };
}

/** The row's closed line. */
export function riderLocationSummary(state: OrderRiderTracking): string {
  if (!state.active) {
    const count = state.diagnostics?.sampleCount ?? 0;
    const longest = state.diagnostics?.maxReceiveGapSeconds;
    if (!state.diagnostics) return "Tracking has ended for this order.";
    return count
      ? `Tracking ended. ${count} location${count === 1 ? "" : "s"} received${
          longest != null ? `, longest gap ${formatAge(longest)}` : ""
        }.`
      : "Tracking ended. No location reached GRIDGO for this rider.";
  }
  const view = state.view;
  if (!view) return state.error ?? "Reading the rider's location…";
  switch (view.freshness) {
    case "live":
      return `Live, last update ${formatDateTime(view.lastUpdatedAt)}.`;
    case "stale":
      return `No update for ${formatAge(view.ageSeconds ?? 0)}. Contact the rider.`;
    case "silent":
      return "No location sent since the rider took this job. Contact the rider.";
    case "waiting":
      return "Waiting for the rider's first location.";
  }
}

export function riderLocationNeedsContact(state: OrderRiderTracking): boolean {
  return Boolean(state.active && state.view?.needsContact);
}

/** The open row: where the rider stands, how to reach them, and the gaps. */
export function RiderLocationPanel({
  state,
  tree,
}: {
  state: OrderRiderTracking;
  tree: "ops" | "admin";
}) {
  const { view, diagnostics, rider, tracking, active } = state;
  const summary = useMemo(
    () => (diagnostics ? summarizeDiagnostics(diagnostics, tracking.staleAfterSeconds) : null),
    [diagnostics, tracking.staleAfterSeconds],
  );
  const name = rider?.name ?? "the rider";

  return (
    <div className="flex flex-col gap-4">
      {active ? (
        <div className="flex flex-col gap-2">
          {view ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                tone={freshnessTone(view.freshness)}
                label={freshnessLabel(view)}
                icon={freshnessIcon(view.freshness)}
              />
              <span className="text-caption text-text-muted">
                {view.lastUpdatedAt
                  ? `Last update ${formatDateTime(view.lastUpdatedAt)}`
                  : "No location since assignment"}
              </span>
            </div>
          ) : null}
          {view?.needsContact ? (
            <p className="text-body text-text-primary m-0 max-w-prose">
              The client now sees &ldquo;Rider location temporarily unavailable&rdquo;. Ask{" "}
              {name} to open GRIDGO and check that location is on.
            </p>
          ) : null}
          {rider ? (
            <RiderContact riderId={rider.id} name={rider.name} phone={rider.phone} tree={tree} />
          ) : null}
        </div>
      ) : null}

      {state.error ? (
        <p className="text-body text-error m-0" role="alert">
          {state.error}
        </p>
      ) : null}

      {summary ? (
        <PingGaps
          summary={summary}
          staleAfterSeconds={tracking.staleAfterSeconds}
          active={active}
          elapsedSeconds={state.elapsedSeconds}
        />
      ) : null}
    </div>
  );
}

function PingGaps({
  summary,
  staleAfterSeconds,
  active,
  elapsedSeconds,
}: {
  summary: DiagnosticsSummary;
  staleAfterSeconds: number;
  active: boolean;
  elapsedSeconds: number;
}) {
  const threshold = formatThreshold(staleAfterSeconds);
  return (
    <section aria-labelledby="ping-gaps-heading" className="flex flex-col gap-3">
      <div>
        <h3 id="ping-gaps-heading" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          Location gaps
        </h3>
        <p className="text-caption text-text-muted m-0 mt-0.5 max-w-prose">
          The wait between locations reaching GRIDGO on this trip, from the last{" "}
          {summary.sampleLimit}. A gap alone does not say whether the phone stopped
          sending, lost signal, or was refused.
        </p>
      </div>

      {summary.sampleCount === 0 ? (
        <p className="text-body text-text-secondary m-0">
          No location has reached GRIDGO from this rider for this order.
        </p>
      ) : (
        <>
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Stat label="Received" value={String(summary.sampleCount)} />
            <Stat
              label="Longest gap"
              value={summary.maxReceiveGapSeconds != null ? formatAge(summary.maxReceiveGapSeconds) : "None yet"}
            />
            <Stat
              label={`Gaps over ${threshold}`}
              value={String(summary.longGaps)}
            />
            {active ? (
              <Stat
                label="Since the last one"
                value={
                  summary.secondsSinceLastReceived != null
                    ? formatAge(summary.secondsSinceLastReceived + elapsedSeconds)
                    : "None"
                }
              />
            ) : (
              <Stat
                label="Typical delay"
                value={
                  summary.medianSourceDelaySeconds != null
                    ? formatAge(summary.medianSourceDelaySeconds)
                    : "Unknown"
                }
              />
            )}
          </dl>
          {summary.gaps.length ? (
            <GapStrip gaps={summary.gaps} staleAfterSeconds={staleAfterSeconds} />
          ) : null}
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-muted m-0">{label}</dt>
      <dd className="text-body text-text-primary m-0 tabular-nums" style={{ fontFamily: "var(--font-medium)" }}>
        {value}
      </dd>
    </div>
  );
}

/**
 * One bar per gap, oldest on the left. Heights share one scale up to the
 * longer of the longest gap and twice the threshold; a gap at or over the
 * threshold rises past the dashed line and is drawn in the warning colour, so
 * it reads in greyscale too.
 */
function GapStrip({
  gaps,
  staleAfterSeconds,
}: {
  gaps: DiagnosticsSummary["gaps"];
  staleAfterSeconds: number;
}) {
  const ceiling = Math.max(staleAfterSeconds * 2, ...gaps.map((gap) => gap.seconds));
  const linePercent = (staleAfterSeconds / ceiling) * 100;
  const long = gaps.filter((gap) => gap.long).length;
  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <div
        className="border-outline-subtle relative flex h-20 items-end gap-px border-b"
        role="img"
        aria-label={`${gaps.length} gaps between received locations, ${long} at or over ${formatThreshold(staleAfterSeconds)}.`}
        data-testid="gap-strip"
      >
        <div
          aria-hidden
          className="border-warning pointer-events-none absolute inset-x-0 border-t border-dashed"
          style={{ bottom: `${linePercent}%` }}
        />
        {gaps.map((gap) => (
          <div
            key={gap.receivedAt}
            title={`${formatAge(gap.seconds)} before ${formatDateTime(gap.receivedAt)}`}
            className={cn(
              "min-w-px flex-1 rounded-t-[2px]",
              gap.long
                ? "bg-warning"
                : "bg-text-muted/60",
            )}
            style={{ height: `${Math.max(3, (gap.seconds / ceiling) * 100)}%` }}
          />
        ))}
      </div>
      <figcaption className="text-caption text-text-muted flex flex-wrap justify-between gap-2">
        <span>Oldest</span>
        <span>Dashed line: stale after {formatThreshold(staleAfterSeconds)}</span>
        <span>Latest</span>
      </figcaption>
    </figure>
  );
}
