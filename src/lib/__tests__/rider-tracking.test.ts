import { describe, expect, it } from "vitest";

import type { LocationDiagnostics } from "@/lib/api/types";
import {
  formatAge,
  formatThreshold,
  freshnessLabel,
  parseTrackingSeconds,
  presentRiderLocation,
  REFRESH_SECONDS,
  ridersToContact,
  STALE_SECONDS,
  summarizeDiagnostics,
  telHref,
  trackingSettingsOf,
} from "@/lib/rider-tracking";

const NOW = Date.parse("2026-10-15T08:00:00.000Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe("presentRiderLocation", () => {
  it("trusts the server's stale flag and age over the device clock", () => {
    // The fix looks 10 s old on this desk's clock, but the server says 150 s.
    const view = presentRiderLocation(
      { lat: 7.1, lng: 125.6, at: ago(10), lastUpdatedAt: ago(10), ageSeconds: 150, stale: true },
      120,
      NOW,
      NOW,
    );
    expect(view).toMatchObject({ freshness: "stale", needsContact: true, ageSeconds: 150 });
    expect(freshnessLabel(view)).toBe("No update for 2 min");
  });

  it("counts the age on between reads and flags the rider once it crosses the threshold", () => {
    const row = { lat: 7.1, lng: 125.6, at: ago(100), lastUpdatedAt: ago(100), ageSeconds: 100, stale: false };
    expect(presentRiderLocation(row, 120, NOW, NOW).freshness).toBe("live");
    const later = presentRiderLocation(row, 120, NOW, NOW + 25_000);
    expect(later).toMatchObject({ freshness: "stale", ageSeconds: 125 });
  });

  it("keeps a rider with no fix as a row: silent past the grace period, waiting inside it", () => {
    const none = { lat: null, lng: null, at: null, lastUpdatedAt: null, ageSeconds: null };
    expect(presentRiderLocation({ ...none, stale: true }, 120, NOW, NOW)).toMatchObject({
      freshness: "silent",
      needsContact: true,
      hasPosition: false,
    });
    expect(presentRiderLocation({ ...none, stale: false }, 120, NOW, NOW)).toMatchObject({
      freshness: "waiting",
      needsContact: false,
    });
  });

  it("falls back to the fix time on an API without freshness fields", () => {
    const view = presentRiderLocation({ lat: 7, lng: 125, at: ago(300) }, 120, NOW, NOW);
    expect(view).toMatchObject({ freshness: "stale", ageSeconds: 300 });
  });

  it("is live only for a fix inside the threshold", () => {
    const view = presentRiderLocation(
      { lat: 7, lng: 125, at: ago(30), lastUpdatedAt: ago(30), ageSeconds: 30, stale: false },
      120,
      NOW,
      NOW,
    );
    expect(freshnessLabel(view)).toBe("Location live");
  });
});

it("lists riders to contact, never-sent first, then the longest silence", () => {
  const rows = [
    { id: "fresh", lat: 7, lng: 125, at: ago(10), ageSeconds: 10, stale: false },
    { id: "four", lat: 7, lng: 125, at: ago(240), ageSeconds: 240, stale: true },
    { id: "none", lat: null, lng: null, at: null, ageSeconds: null, stale: true },
    { id: "nine", lat: 7, lng: 125, at: ago(540), ageSeconds: 540, stale: true },
  ];
  const order = ridersToContact(rows, (row) => presentRiderLocation(row, 120, NOW, NOW)).map(
    (entry) => entry.row.id,
  );
  expect(order).toEqual(["none", "nine", "four"]);
});

it("words ages and thresholds in whole units", () => {
  expect(formatAge(45)).toBe("45 s");
  expect(formatAge(125)).toBe("2 min");
  expect(formatAge(3600 + 12 * 60)).toBe("1 h 12 min");
  expect(formatAge(7200)).toBe("2 h");
  expect(formatThreshold(120)).toBe("2 minutes");
  expect(formatThreshold(60)).toBe("1 minute");
  expect(formatThreshold(90)).toBe("90 seconds");
});

it("accepts only whole seconds inside the API's bounds", () => {
  expect(parseTrackingSeconds("20", REFRESH_SECONDS)).toBe(20);
  for (const bad of ["14", "31", "20.5", "", " ", "-20", "twenty"]) {
    expect(parseTrackingSeconds(bad, REFRESH_SECONDS)).toBeNull();
  }
  expect(parseTrackingSeconds("600", STALE_SECONDS)).toBe(600);
  expect(parseTrackingSeconds("29", STALE_SECONDS)).toBeNull();
});

it("uses the API defaults until settings say otherwise", () => {
  expect(trackingSettingsOf(null)).toEqual({ refreshIntervalSeconds: 20, staleAfterSeconds: 120 });
  expect(
    trackingSettingsOf({ riderLocationRefreshIntervalSeconds: 15, riderLocationStaleAfterSeconds: 300 }),
  ).toEqual({ refreshIntervalSeconds: 15, staleAfterSeconds: 300 });
});

it("summarises receive gaps and counts the long ones against the threshold", () => {
  const diagnostics: LocationDiagnostics = {
    orderId: "o",
    riderId: "r",
    lastUpdatedAt: ago(5),
    ageSeconds: 5,
    stale: false,
    sampleLimit: 100,
    sampleCount: 4,
    maxReceiveGapSeconds: 300,
    secondsSinceLastReceived: 4,
    samples: [
      { at: ago(400), receivedAt: ago(399), processedAt: null, receiveGapSeconds: null, sourceDelaySeconds: 1 },
      { at: ago(385), receivedAt: ago(384), processedAt: null, receiveGapSeconds: 15, sourceDelaySeconds: 1 },
      { at: ago(90), receivedAt: ago(84), processedAt: null, receiveGapSeconds: 300, sourceDelaySeconds: 6 },
      { at: ago(6), receivedAt: ago(4), processedAt: null, receiveGapSeconds: 80, sourceDelaySeconds: 2 },
    ],
  };
  const summary = summarizeDiagnostics(diagnostics, 120);
  expect(summary.gaps.map((gap) => gap.seconds)).toEqual([15, 300, 80]);
  expect(summary.longGaps).toBe(1);
  expect(summary.medianSourceDelaySeconds).toBe(1.5);
  expect(summary.maxReceiveGapSeconds).toBe(300);
});

it("dials only a number that looks like one", () => {
  expect(telHref("+63 917 555 0101")).toBe("tel:+639175550101");
  expect(telHref("0917-555-0101")).toBe("tel:09175550101");
  expect(telHref("")).toBeNull();
  expect(telHref(undefined)).toBeNull();
  expect(telHref("n/a")).toBeNull();
});
