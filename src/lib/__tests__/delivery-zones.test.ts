import { describe, expect, it } from "vitest";

import {
  applyZonePrices,
  chargedKilometres,
  isPlaceholder,
  isZonedTable,
  mergeZoneDrafts,
  outOfZoneExample,
  outOfZoneFeeMinor,
  pesosShort,
  zonePriceChanges,
  zonePriceDraft,
  zoneRange,
} from "@/lib/delivery-zones";
import { deliveryZones } from "@/test/delivery-zones";

describe("the fixed zone table", () => {
  it("recognises the four zones the API sends", () => {
    expect(isZonedTable(deliveryZones())).toBe(true);
  });

  it("refuses an older API's unnamed bands and any reshaped table", () => {
    expect(isZonedTable([{ maxDistanceMeters: null, feeMinor: 2500 }])).toBe(false);
    expect(isZonedTable(deliveryZones().slice(0, 3))).toBe(false);
    const [, ...rest] = deliveryZones();
    const nearby = { zone: "nearby", label: "Nearby", maxDistanceMeters: 4999, feeMinor: 2500 } as const;
    expect(isZonedTable([nearby, ...rest])).toBe(false);
    expect(isZonedTable([...deliveryZones()].reverse())).toBe(false);
  });

  it("names each zone's range in kilometres", () => {
    expect(zoneRange("nearby")).toBe("0–5 km");
    expect(zoneRange("away")).toBe("5–10 km");
    expect(zoneRange("long_distance")).toBe("10–15 km");
    expect(zoneRange("out_of_zone")).toBe("Over 15 km");
  });
});

describe("Out of Zone pricing", () => {
  it("charges the whole distance rounded up to the next kilometre", () => {
    // The API's own edges: 15,001 m and 16,000 m cost ₱235; 16,001 m costs ₱245.
    expect(chargedKilometres(15_001)).toBe(16);
    expect(outOfZoneFeeMinor(15_001, 7_500, 1_000)).toBe(23_500);
    expect(outOfZoneFeeMinor(16_000, 7_500, 1_000)).toBe(23_500);
    expect(outOfZoneFeeMinor(16_001, 7_500, 1_000)).toBe(24_500);
  });

  it("writes the worked example as a sum", () => {
    expect(outOfZoneExample(7_500, 1_000)).toBe("16.2 km counts as 17 km: ₱75 + 17 × ₱10 = ₱245");
    expect(outOfZoneExample(8_000, 1_250, 16_000)).toBe(
      "16.0 km counts as 16 km: ₱80 + 16 × ₱12.50 = ₱280",
    );
  });

  it("drops .00 only from whole pesos", () => {
    expect(pesosShort(7_500)).toBe("₱75");
    expect(pesosShort(1_250)).toBe("₱12.50");
    expect(pesosShort(150_000)).toBe("₱1,500");
  });
});

describe("saving prices", () => {
  it("puts typed prices into the stored table and changes nothing else", () => {
    const stored = deliveryZones();
    const draft = {
      ...zonePriceDraft(stored),
      nearby: "30",
      away: "60.50",
      long_distance: "1,000",
      outOfZoneBase: "80",
      outOfZonePerKm: "12.5",
    };
    expect(applyZonePrices(stored, draft)).toEqual({
      bands: deliveryZones({
        nearby: 3_000,
        away: 6_050,
        long_distance: 100_000,
        baseFeeMinor: 8_000,
        perKmMinor: 1_250,
      }),
    });
  });

  it.each([
    ["nearby", "", "Nearby needs a fee in pesos, like 25.00."],
    ["away", "-5", "Away needs a fee in pesos, like 50.00."],
    ["long_distance", "7.555", "Long Distance needs a fee in pesos, like 75.00."],
    ["outOfZoneBase", "seventy", "Out of Zone needs a base fee in pesos, like 75.00."],
    ["outOfZonePerKm", "1e3", "Out of Zone needs a fee per kilometre in pesos, like 10.00."],
    ["nearby", "999999999999999999", "Nearby needs a fee in pesos, like 25.00."],
  ] as const)("refuses %s = %j", (field, typed, problem) => {
    const stored = deliveryZones();
    expect(applyZonePrices(stored, { ...zonePriceDraft(stored), [field]: typed })).toEqual({
      problem,
    });
  });

  it("names each price that moved for the audit line", () => {
    expect(
      zonePriceChanges(deliveryZones(), deliveryZones({ away: 6_000, perKmMinor: 1_200 })),
    ).toEqual(["Away ₱50.00 to ₱60.00", "Out of Zone ₱75.00 + ₱10.00 per km to ₱75.00 + ₱12.00 per km"]);
    expect(zonePriceChanges(deliveryZones(), deliveryZones())).toEqual([]);
  });
});

describe("placeholder prices", () => {
  it("marks a zone until its shipped price is changed", () => {
    const [nearby, , , outOfZone] = deliveryZones();
    expect(isPlaceholder(nearby)).toBe(true);
    expect(isPlaceholder(outOfZone)).toBe(true);
    const set = deliveryZones({ nearby: 3_000, baseFeeMinor: 9_000, perKmMinor: 1_500 });
    expect(isPlaceholder(set[0])).toBe(false);
    expect(isPlaceholder(set[3])).toBe(false);
  });

  it("keeps Out of Zone a placeholder until both of its prices are set", () => {
    expect(isPlaceholder(deliveryZones({ baseFeeMinor: 9_000 })[3])).toBe(true);
    expect(isPlaceholder(deliveryZones({ perKmMinor: 1_500 })[3])).toBe(true);
  });
});

describe("reloading under a draft", () => {
  it("keeps what was typed and takes every untouched price from the API", () => {
    const previous = zonePriceDraft(deliveryZones());
    const next = zonePriceDraft(deliveryZones({ nearby: 3_500, away: 6_500 }));
    const current = { ...previous, nearby: "30" };
    expect(mergeZoneDrafts(current, previous, next)).toEqual({ ...next, nearby: "30" });
  });

  it("takes the API's table whole when there is no draft or no zones", () => {
    const next = zonePriceDraft(deliveryZones());
    expect(mergeZoneDrafts(null, next, next)).toBe(next);
    expect(mergeZoneDrafts(next, null, next)).toBe(next);
    expect(mergeZoneDrafts(next, next, null)).toBeNull();
  });
});
