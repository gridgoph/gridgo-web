import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import {
  applyZoneDraft,
  chargedKilometres,
  draftLimits,
  isPlaceholder,
  isZonedTable,
  limitsMoved,
  mergeZoneDrafts,
  outOfZoneExample,
  outOfZoneExampleMeters,
  outOfZoneFeeMinor,
  pesosShort,
  previewBands,
  readKm,
  zoneChanges,
  zoneDraft,
  zoneLimitErrorMessage,
  zoneLimitProblem,
  zoneRange,
  zoneSummary,
} from "@/lib/delivery-zones";
import { deliveryZones } from "@/test/delivery-zones";

describe("the fixed zone table", () => {
  it("recognises the four zones the API sends, at any valid limits", () => {
    expect(isZonedTable(deliveryZones())).toBe(true);
    expect(isZonedTable(deliveryZones({}, { nearby: 3000, away: 8000, long_distance: 20000 }))).toBe(
      true,
    );
    expect(isZonedTable(deliveryZones({}, { nearby: 1, away: 2, long_distance: 100_000 }))).toBe(
      true,
    );
  });

  it("refuses an older API's unnamed bands and any reshaped table", () => {
    expect(isZonedTable([{ maxDistanceMeters: null, feeMinor: 2500 }])).toBe(false);
    expect(isZonedTable(deliveryZones().slice(0, 3))).toBe(false);
    expect(isZonedTable([...deliveryZones()].reverse())).toBe(false);
  });

  it("refuses limits the API would never hold", () => {
    expect(isZonedTable(deliveryZones({}, { nearby: 0 }))).toBe(false);
    expect(isZonedTable(deliveryZones({}, { long_distance: 100_001 }))).toBe(false);
    expect(isZonedTable(deliveryZones({}, { away: 5000 }))).toBe(false);
    expect(isZonedTable(deliveryZones({}, { nearby: 4999.5 }))).toBe(false);
  });

  it("names each zone's range from the limits", () => {
    const limits = [5000, 10000, 15000] as const;
    expect(zoneRange("nearby", limits)).toBe("0–5 km");
    expect(zoneRange("away", limits)).toBe("5–10 km");
    expect(zoneRange("long_distance", limits)).toBe("10–15 km");
    expect(zoneRange("out_of_zone", limits)).toBe("Over 15 km");
    const moved = [3500, 8000, 20250] as const;
    expect(zoneRange("away", moved)).toBe("3.5–8 km");
    expect(zoneRange("out_of_zone", moved)).toBe("Over 20.25 km");
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

  it("puts the example just past the Long Distance limit", () => {
    expect(outOfZoneExampleMeters(15_000)).toBe(16_200);
    expect(outOfZoneExampleMeters(20_000)).toBe(21_200);
    expect(outOfZoneExampleMeters(15_500)).toBe(17_200);
  });

  it("drops .00 only from whole pesos", () => {
    expect(pesosShort(7_500)).toBe("₱75");
    expect(pesosShort(1_250)).toBe("₱12.50");
    expect(pesosShort(150_000)).toBe("₱1,500");
  });
});

describe("reading a typed limit", () => {
  it.each([
    ["5", 5000],
    ["3.5", 3500],
    [" 12.345 ", 12345],
    ["7.", 7000],
    ["0.001", 1],
  ] as const)("reads %j as %i m", (typed, meters) => {
    expect(readKm(typed)).toBe(meters);
  });

  it.each(["", "-5", "five", "1e3", "1,000", "4.0001"])("refuses %j", (typed) => {
    expect(readKm(typed)).toBeNull();
  });
});

describe("checking limits as the API does", () => {
  const draft = zoneDraft(deliveryZones());

  it("accepts increasing limits from 1 m to 100 km", () => {
    expect(draftLimits(draft)).toEqual([5000, 10000, 15000]);
    expect(draftLimits({ ...draft, nearbyKm: "0.001", longDistanceKm: "100" })).toEqual([
      1, 10000, 100000,
    ]);
  });

  it.each([
    ["nearbyKm", "", "Nearby needs an upper limit in kilometres, like 5."],
    ["awayKm", "ten", "Away needs an upper limit in kilometres, like 10."],
    ["nearbyKm", "0", "Nearby has to end above 0 km."],
    ["longDistanceKm", "100.001", "Long Distance can reach at most 100 km."],
    ["nearbyKm", "4.7505", "Nearby goes to the metre at most: use up to three decimals, like 4.75."],
    ["awayKm", "5", "Away has to end beyond Nearby's 5 km."],
    ["longDistanceKm", "9.5", "Long Distance has to end beyond Away's 10 km."],
  ] as const)("refuses %s = %j", (field, typed, problem) => {
    const next = { ...draft, [field]: typed };
    expect(zoneLimitProblem(field, next)).toBe(problem);
    expect(draftLimits(next)).toBeNull();
    expect(applyZoneDraft(deliveryZones(), next)).toEqual({ problem });
  });

  it("does not hold an unreadable earlier limit against the next one", () => {
    expect(zoneLimitProblem("awayKm", { ...draft, nearbyKm: "x" })).toBeNull();
  });

  it("re-checks a later limit when an earlier one moves past it", () => {
    expect(zoneLimitProblem("awayKm", { ...draft, nearbyKm: "12" })).toBe(
      "Away has to end beyond Nearby's 12 km.",
    );
  });
});

describe("saving limits and prices", () => {
  it("puts typed limits and prices into the stored table and changes nothing else", () => {
    const stored = deliveryZones();
    const draft = {
      ...zoneDraft(stored),
      nearbyKm: "3",
      awayKm: "8.25",
      longDistanceKm: "20",
      nearby: "30",
      away: "60.50",
      long_distance: "1,000",
      outOfZoneBase: "80",
      outOfZonePerKm: "12.5",
    };
    expect(applyZoneDraft(stored, draft)).toEqual({
      bands: deliveryZones(
        {
          nearby: 3_000,
          away: 6_050,
          long_distance: 100_000,
          baseFeeMinor: 8_000,
          perKmMinor: 1_250,
        },
        { nearby: 3_000, away: 8_250, long_distance: 20_000 },
      ),
    });
  });

  it.each([
    ["nearby", "", "Nearby needs a fee in pesos, like 89.00."],
    ["away", "-5", "Away needs a fee in pesos, like 149.00."],
    ["long_distance", "7.555", "Long Distance needs a fee in pesos, like 229.00."],
    ["outOfZoneBase", "seventy", "Out of Zone needs a base fee in pesos, like 40.00."],
    ["outOfZonePerKm", "1e3", "Out of Zone needs a fee per kilometre in pesos, like 15.00."],
    ["nearby", "999999999999999999", "Nearby needs a fee in pesos, like 89.00."],
  ] as const)("refuses %s = %j", (field, typed, problem) => {
    const stored = deliveryZones();
    expect(applyZoneDraft(stored, { ...zoneDraft(stored), [field]: typed })).toEqual({
      problem,
    });
  });

  it("names each limit and price that moved for the audit line", () => {
    expect(
      zoneChanges(
        deliveryZones(),
        deliveryZones({ away: 6_000, perKmMinor: 1_200 }, { nearby: 3_000, long_distance: 20_500 }),
      ),
    ).toEqual([
      "Nearby limit 5 km to 3 km",
      "Away ₱50.00 to ₱60.00",
      "Long Distance limit 15 km to 20.5 km",
      "Out of Zone ₱75.00 + ₱10.00 per km to ₱75.00 + ₱12.00 per km",
    ]);
    expect(zoneChanges(deliveryZones(), deliveryZones())).toEqual([]);
  });

  it("tells when the limits moved", () => {
    expect(limitsMoved(deliveryZones(), deliveryZones({ nearby: 9_000 }))).toBe(false);
    expect(limitsMoved(deliveryZones(), deliveryZones({}, { away: 9_000 }))).toBe(true);
  });
});

describe("the preview", () => {
  it("shows the bands the draft would save, in words", () => {
    const stored = deliveryZones({ nearby: 8_900, away: 14_900, long_distance: 22_900, baseFeeMinor: 4_000, perKmMinor: 1_500 });
    const preview = previewBands(stored, { ...zoneDraft(stored), nearbyKm: "3", longDistanceKm: "20" });
    expect(zoneSummary(preview!)).toEqual([
      { zone: "nearby", label: "Nearby", range: "0–3 km", price: "₱89" },
      { zone: "away", label: "Away", range: "3–10 km", price: "₱149" },
      { zone: "long_distance", label: "Long Distance", range: "10–20 km", price: "₱229" },
      { zone: "out_of_zone", label: "Out of Zone", range: "Over 20 km", price: "₱40 + ₱15 per km" },
    ]);
  });

  it("is withheld while a limit cannot be saved, and keeps the price in force for an unreadable price", () => {
    const stored = deliveryZones();
    expect(previewBands(stored, { ...zoneDraft(stored), awayKm: "2" })).toBeNull();
    const preview = previewBands(stored, { ...zoneDraft(stored), nearby: "abc" });
    expect(preview![0]).toEqual(stored[0]);
  });
});

describe("the API's refusals", () => {
  it("names the zone the API refused", () => {
    expect(
      zoneLimitErrorMessage(
        new ApiError(400, {
          error: "delivery_zone_limits_not_increasing",
          field: "deliveryFeeBands[2].maxDistanceMeters",
        }),
      ),
    ).toBe("The API refused the limits: Long Distance has to end beyond Away.");
    expect(
      zoneLimitErrorMessage(
        new ApiError(400, {
          error: "invalid_delivery_zone_limit",
          field: "deliveryFeeBands[0].maxDistanceMeters",
        }),
      ),
    ).toBe(
      "The API refused the Nearby limit: each limit has to be more than 0 km and at most 100 km, to the metre.",
    );
  });

  it("still explains a refusal without a field, and ignores other errors", () => {
    expect(
      zoneLimitErrorMessage(new ApiError(400, { error: "delivery_zone_limits_not_increasing" })),
    ).toBe(
      "The API refused the limits: Nearby, Away and Long Distance each have to end beyond the zone before.",
    );
    expect(zoneLimitErrorMessage(new ApiError(400, { error: "invalid_money" }))).toBeNull();
    expect(zoneLimitErrorMessage(new Error("boom"))).toBeNull();
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
  it("keeps what was typed and takes every untouched field from the API", () => {
    const previous = zoneDraft(deliveryZones());
    const next = zoneDraft(deliveryZones({ nearby: 3_500, away: 6_500 }, { away: 12_000 }));
    const current = { ...previous, nearby: "30", nearbyKm: "4" };
    expect(mergeZoneDrafts(current, previous, next)).toEqual({ ...next, nearby: "30", nearbyKm: "4" });
    expect(next.awayKm).toBe("12");
  });

  it("takes the API's table whole when there is no draft or no zones", () => {
    const next = zoneDraft(deliveryZones());
    expect(mergeZoneDrafts(null, next, next)).toBe(next);
    expect(mergeZoneDrafts(next, null, next)).toBe(next);
    expect(mergeZoneDrafts(next, next, null)).toBeNull();
  });
});
