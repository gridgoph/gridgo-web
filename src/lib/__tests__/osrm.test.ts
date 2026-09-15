import { describe, expect, it, vi } from "vitest";

import {
  fallbackRoute,
  fetchRoute,
  formatDistanceMetres,
  formatDurationSeconds,
  haversineMetres,
  parseOsrmResponse,
  routeSummaryLabel,
} from "@/lib/osrm";

const from = { lat: 7.0731, lng: 125.6128 };
const to = { lat: 7.0923, lng: 125.6165 };

describe("parseOsrmResponse", () => {
  it("returns a road route from an Ok body", () => {
    const route = parseOsrmResponse({
      code: "Ok",
      routes: [
        {
          distance: 2500,
          duration: 480,
          geometry: {
            type: "LineString",
            coordinates: [
              [125.6128, 7.0731],
              [125.6165, 7.0923],
            ],
          },
        },
      ],
    });
    expect(route).toMatchObject({
      routed: true,
      distanceMetres: 2500,
      durationSeconds: 480,
    });
    expect(route?.coordinates).toHaveLength(2);
  });

  it("refuses bodies that are not usable", () => {
    expect(parseOsrmResponse({ code: "NoRoute" })).toBeNull();
    expect(parseOsrmResponse({ code: "Ok", routes: [] })).toBeNull();
    expect(
      parseOsrmResponse({
        code: "Ok",
        routes: [{ distance: 1, duration: 1, geometry: { coordinates: [[1, 1]] } }],
      }),
    ).toBeNull();
  });
});

describe("fetchRoute", () => {
  it("asks the router in lon,lat order and parses the answer", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("/route/v1/driving/125.6128,7.0731;125.6165,7.0923?");
      return new Response(
        JSON.stringify({
          code: "Ok",
          routes: [
            {
              distance: 2500,
              duration: 480,
              geometry: {
                coordinates: [
                  [125.6128, 7.0731],
                  [125.6165, 7.0923],
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const route = await fetchRoute(from, to, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(route.routed).toBe(true);
    expect(route.durationSeconds).toBe(480);
  });

  it("falls back to a direct line without inventing a travel time", async () => {
    const fetchImpl = vi.fn(async () => new Response("rate limited", { status: 429 }));
    const route = await fetchRoute(from, to, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(route.routed).toBe(false);
    expect(route.durationSeconds).toBeNull();
    expect(route.coordinates).toEqual([
      [from.lng, from.lat],
      [to.lng, to.lat],
    ]);
    expect(route.distanceMetres).toBeCloseTo(haversineMetres(from, to), 6);
  });

  it("falls back when the network throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const route = await fetchRoute(from, to, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(route).toEqual(fallbackRoute(from, to));
  });
});

describe("labels", () => {
  it("formats distance and time for the roster", () => {
    expect(formatDistanceMetres(420)).toBe("420 m");
    expect(formatDistanceMetres(4200)).toBe("4.2 km");
    expect(formatDistanceMetres(12_400)).toBe("12 km");
    expect(formatDurationSeconds(90)).toBe("2 min");
    expect(formatDurationSeconds(3900)).toBe("1 h 5 min");
  });

  it("never lets a direct line borrow the road-route shape", () => {
    expect(routeSummaryLabel(undefined)).toBe("Finding the road route…");
    expect(routeSummaryLabel(null)).toBe("No drop-off on file");
    expect(routeSummaryLabel(fallbackRoute(from, to))).toMatch(
      /direct · road route unavailable$/,
    );
    expect(
      routeSummaryLabel({
        routed: true,
        distanceMetres: 4200,
        durationSeconds: 840,
        coordinates: [],
      }),
    ).toBe("4.2 km · 14 min to drop-off");
  });
});
