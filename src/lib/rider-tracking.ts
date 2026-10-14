/**
 * Rider location freshness for Operations (contract "Rider location" in
 * gridgo-api/docs/OPERATIONAL_MODEL_V2_API.md, gridgo-api#229).
 *
 * The API decides staleness from the fix's source GPS time against the live
 * `riderLocationStaleAfterSeconds` setting, and sends `ageSeconds` with each
 * row. Between reads the age keeps counting from the server's figure, so a
 * desk with a wrong clock still counts correctly. Riders who have never sent
 * a fix are rows too: they are the ones Operations most needs to call.
 */

import type {
  LocationDiagnostics,
  PlatformSettings,
  RiderLocation,
} from "@/lib/api/types";

/** Every state in which a rider's phone should be sending its position. */
export const ACTIVE_TRACKING_STATES = new Set([
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
]);

/** API defaults and bounds; the settings carry the values in force. */
export const REFRESH_SECONDS = { default: 20, min: 15, max: 30 } as const;
export const STALE_SECONDS = { default: 120, min: 30, max: 600 } as const;

/** Rider apps since gridgo-rider#120 post a fix about this often. */
export const RIDER_APP_PING_SECONDS = 15;

export type TrackingSettings = {
  refreshIntervalSeconds: number;
  staleAfterSeconds: number;
};

export function trackingSettingsOf(
  settings: Pick<
    PlatformSettings,
    "riderLocationRefreshIntervalSeconds" | "riderLocationStaleAfterSeconds"
  > | null | undefined,
): TrackingSettings {
  return {
    refreshIntervalSeconds:
      settings?.riderLocationRefreshIntervalSeconds ?? REFRESH_SECONDS.default,
    staleAfterSeconds: settings?.riderLocationStaleAfterSeconds ?? STALE_SECONDS.default,
  };
}

/** A whole number of seconds inside the API's bounds, or null. */
export function parseTrackingSeconds(
  value: string,
  bounds: { min: number; max: number },
): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const seconds = Number(trimmed);
  return Number.isSafeInteger(seconds) && seconds >= bounds.min && seconds <= bounds.max
    ? seconds
    : null;
}

/**
 * `live`: a fix inside the threshold. `stale`: a fix older than it.
 * `silent`: no fix since assignment, past the grace period. `waiting`: no
 * fix yet, still inside the grace period.
 */
export type RiderFreshness = "live" | "stale" | "silent" | "waiting";

export type RiderLocationView = {
  freshness: RiderFreshness;
  /** True for `stale` and `silent`: Operations should contact the rider. */
  needsContact: boolean;
  /** Seconds since the last fix, counted on from the server's figure. */
  ageSeconds: number | null;
  lastUpdatedAt: string | null;
  hasPosition: boolean;
};

type FreshnessFields = Pick<
  RiderLocation,
  "lat" | "lng" | "at" | "lastUpdatedAt" | "ageSeconds" | "stale"
>;

/**
 * Read one row at `nowMs`, given when it was fetched. An API from before
 * gridgo-api#229 sends no `stale`/`ageSeconds`; age then comes from `at`.
 */
export function presentRiderLocation(
  row: FreshnessFields,
  staleAfterSeconds: number,
  fetchedAtMs: number,
  nowMs: number,
): RiderLocationView {
  const lastUpdatedAt = row.lastUpdatedAt ?? row.at ?? null;
  const hasPosition =
    row.lat != null && row.lng != null && Number.isFinite(row.lat) && Number.isFinite(row.lng);
  const elapsed = Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000));
  let ageSeconds: number | null = null;
  if (typeof row.ageSeconds === "number") {
    ageSeconds = row.ageSeconds + elapsed;
  } else if (lastUpdatedAt) {
    const at = Date.parse(lastUpdatedAt);
    ageSeconds = Number.isNaN(at) ? null : Math.max(0, Math.floor((nowMs - at) / 1000));
  }
  if (!lastUpdatedAt) {
    // With no fix, only the API knows when the grace period started.
    const silent = row.stale === true;
    return {
      freshness: silent ? "silent" : "waiting",
      needsContact: silent,
      ageSeconds: null,
      lastUpdatedAt: null,
      hasPosition: false,
    };
  }
  const stale =
    row.stale === true || ageSeconds === null || ageSeconds >= staleAfterSeconds;
  return {
    freshness: stale ? "stale" : "live",
    needsContact: stale,
    ageSeconds,
    lastUpdatedAt,
    hasPosition,
  };
}

/** "45 s", "4 min", "1 h 12 min". Whole units, never a decimal. */
export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s} s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** The threshold in words, for copy: 120 → "2 minutes", 90 → "90 seconds". */
export function formatThreshold(seconds: number): string {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }
  return `${seconds} seconds`;
}

/** The chip's word for each state. Never "live" for anything but a fresh fix. */
export function freshnessLabel(view: RiderLocationView): string {
  switch (view.freshness) {
    case "live":
      return "Location live";
    case "stale":
      return `No update for ${formatAge(view.ageSeconds ?? 0)}`;
    case "silent":
      return "No location sent";
    case "waiting":
      return "Waiting for first location";
  }
}

export function freshnessTone(
  freshness: RiderFreshness,
): "success" | "warning" | "error" | "neutral" {
  switch (freshness) {
    case "live":
      return "success";
    case "stale":
      return "warning";
    case "silent":
      return "error";
    case "waiting":
      return "neutral";
  }
}

export function freshnessIcon(
  freshness: RiderFreshness,
): "circle-check" | "triangle-alert" | "circle-x" | "clock" {
  switch (freshness) {
    case "live":
      return "circle-check";
    case "stale":
      return "triangle-alert";
    case "silent":
      return "circle-x";
    case "waiting":
      return "clock";
  }
}

/**
 * Riders Operations should contact, longest silence first. A rider who has
 * never sent a fix has been silent since assignment, so they lead.
 */
export function ridersToContact<T extends FreshnessFields>(
  rows: T[],
  view: (row: T) => RiderLocationView,
): { row: T; view: RiderLocationView }[] {
  return rows
    .map((row) => ({ row, view: view(row) }))
    .filter((entry) => entry.view.needsContact)
    .sort((a, b) => {
      const aAge = a.view.freshness === "silent" ? Infinity : (a.view.ageSeconds ?? Infinity);
      const bAge = b.view.freshness === "silent" ? Infinity : (b.view.ageSeconds ?? Infinity);
      return bAge - aAge;
    });
}

export type DiagnosticsSummary = {
  sampleCount: number;
  sampleLimit: number;
  /** Longest completed gap between two received fixes, seconds. */
  maxReceiveGapSeconds: number | null;
  /** The current silence since the last received fix, seconds. */
  secondsSinceLastReceived: number | null;
  /** Completed gaps at or over the stale threshold. */
  longGaps: number;
  /** Median delay from GPS fix to server receipt, seconds. */
  medianSourceDelaySeconds: number | null;
  /** Each completed gap, oldest first, for the strip. */
  gaps: { receivedAt: string; seconds: number; long: boolean }[];
};

export function summarizeDiagnostics(
  diagnostics: LocationDiagnostics,
  staleAfterSeconds: number,
): DiagnosticsSummary {
  const gaps = diagnostics.samples
    .filter((sample) => sample.receiveGapSeconds != null)
    .map((sample) => ({
      receivedAt: sample.receivedAt,
      seconds: sample.receiveGapSeconds as number,
      long: (sample.receiveGapSeconds as number) >= staleAfterSeconds,
    }));
  const delays = diagnostics.samples
    .map((sample) => sample.sourceDelaySeconds)
    .filter((delay): delay is number => typeof delay === "number" && Number.isFinite(delay))
    .sort((a, b) => a - b);
  const mid = Math.floor(delays.length / 2);
  const median = delays.length
    ? delays.length % 2
      ? delays[mid]!
      : (delays[mid - 1]! + delays[mid]!) / 2
    : null;
  return {
    sampleCount: diagnostics.sampleCount,
    sampleLimit: diagnostics.sampleLimit,
    maxReceiveGapSeconds: diagnostics.maxReceiveGapSeconds,
    secondsSinceLastReceived: diagnostics.secondsSinceLastReceived,
    longGaps: gaps.filter((gap) => gap.long).length,
    medianSourceDelaySeconds: median,
    gaps,
  };
}

/** `tel:` href for a stored phone number, or null when it is not dialable. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  return /\d{6,}/.test(digits) ? `tel:${digits}` : null;
}
