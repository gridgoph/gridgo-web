import { describe, expect, it } from "vitest";

import {
  bracketDraft,
  bracketRange,
  bracketSchedule,
  effectiveRate,
  feeChange,
  localPreview,
  manilaStart,
  orderFeeBasis,
  parseBracketDraft,
  pesosInputToMinor,
  scheduleInForce,
  scheduleSummary,
  scheduledChange,
  serviceFeeFor,
  SHIPPED_BRACKETS,
  startProblem,
  withBracketAdded,
  withBracketRemoved,
  workingSentence,
} from "@/lib/service-fee-brackets";

const shipped = bracketSchedule(SHIPPED_BRACKETS);

describe("serviceFeeFor", () => {
  // The report's reference examples (SERVICE_FEE_API.md), to the centavo.
  it.each([
    [50_000, 22_500],
    [199_900, 89_955],
    [200_000, 90_000],
    [500_000, 165_000],
    [2_000_000, 540_000],
    [5_000_000, 990_000],
  ])("prices %i centavos at %i", (price, fee) => {
    expect(serviceFeeFor(price, shipped).grossServiceFeeMinor).toBe(fee);
  });

  it("works ₱5,000 out as ₱2,000 × 45% + ₱3,000 × 25%", () => {
    const { serviceFeeWorking } = serviceFeeFor(500_000, shipped);
    expect(serviceFeeWorking).toEqual([
      { fromMinor: 0, upToMinor: 200_000, rateBps: 4_500, taxableMinor: 200_000, amountMinor: 90_000 },
      { fromMinor: 200_000, upToMinor: 2_000_000, rateBps: 2_500, taxableMinor: 300_000, amountMinor: 75_000 },
      { fromMinor: 2_000_000, upToMinor: null, rateBps: 1_500, taxableMinor: 0, amountMinor: 0 },
    ]);
    expect(workingSentence(serviceFeeWorking)).toBe("₱2,000.00 × 45% + ₱3,000.00 × 25%");
  });

  it("rounds once, so the rows always add up to the fee", () => {
    // 33.33% then 16.67% on odd centavos leaves a fraction in every bracket.
    const odd = bracketSchedule([
      { upToMinor: 333, rateBps: 3_333 },
      { upToMinor: null, rateBps: 1_667 },
    ]);
    for (const price of [1, 7, 333, 334, 999, 12_345]) {
      const result = serviceFeeFor(price, odd);
      const sum = result.serviceFeeWorking.reduce((total, row) => total + row.amountMinor, 0);
      expect(sum).toBe(result.grossServiceFeeMinor);
      const exact = Math.min(price, 333) * 3_333 + Math.max(0, price - 333) * 1_667;
      expect(result.grossServiceFeeMinor).toBe(Math.floor((exact + 5_000) / 10_000));
    }
  });

  it("prices a legacy flat rate on the whole price", () => {
    expect(serviceFeeFor(100_000, { version: 1, rateBps: 1_000 }).grossServiceFeeMinor).toBe(10_000);
  });
});

describe("the draft", () => {
  it("round-trips the shipped table", () => {
    const rows = bracketDraft(SHIPPED_BRACKETS);
    expect(rows).toEqual([
      { upTo: "2000", rate: "45" },
      { upTo: "20000", rate: "25" },
      { upTo: "", rate: "15" },
    ]);
    expect(parseBracketDraft(rows)).toEqual({ brackets: SHIPPED_BRACKETS });
  });

  it("reads pesos with commas, a peso sign and centavos", () => {
    expect(pesosInputToMinor("₱2,000")).toBe(200_000);
    expect(pesosInputToMinor("2000.5")).toBe(200_050);
    expect(pesosInputToMinor("2,000.555")).toBeNull();
    expect(pesosInputToMinor("two")).toBeNull();
  });

  it("refuses limits that do not go up", () => {
    const result = parseBracketDraft([
      { upTo: "2000", rate: "45" },
      { upTo: "2000", rate: "25" },
      { upTo: "", rate: "15" },
    ]);
    expect(result).toEqual({
      problem: {
        row: 1,
        field: "upTo",
        message: "Bracket 2 must end above ₱2,000.00, where bracket 1 ends.",
      },
    });
  });

  it("refuses a rate above 100%", () => {
    const result = parseBracketDraft([{ upTo: "", rate: "101" }]);
    expect("problem" in result && result.problem.field).toBe("rate");
  });

  it("adds a bracket above the top limit and keeps the last one open", () => {
    const rows = withBracketAdded(bracketDraft(SHIPPED_BRACKETS));
    expect(rows.map((row) => row.upTo)).toEqual(["2000", "20000", "200000", ""]);
    const removed = withBracketRemoved(rows, 3);
    expect(removed.map((row) => row.upTo)).toEqual(["2000", "20000", ""]);
  });
});

describe("which table is in force", () => {
  const scheduled = {
    ...bracketSchedule([{ upToMinor: null, rateBps: 3_000 }]),
    effectiveFrom: "2026-12-01T00:00:00.000Z",
  };
  const settings = { serviceFeeRateBps: 1_000, serviceFeeSchedule: shipped, scheduledServiceFee: scheduled };

  it("keeps today's table until the scheduled date", () => {
    const before = new Date("2026-11-30T23:59:00Z");
    expect(scheduleInForce(settings, before)).toBe(shipped);
    expect(scheduledChange(settings, before)).toBe(scheduled);
  });

  it("prices with the scheduled table once its date arrives", () => {
    const after = new Date("2026-12-01T00:00:00Z");
    expect(scheduleInForce(settings, after)).toBe(scheduled);
    expect(scheduledChange(settings, after)).toBeNull();
  });

  it("reads an API from before brackets as its flat rate", () => {
    expect(scheduleInForce({ serviceFeeRateBps: 1_000 })).toEqual({ version: 1, rateBps: 1_000 });
  });
});

describe("words", () => {
  it("names ranges and tables", () => {
    expect(bracketRange(0, 200_000)).toBe("First ₱2,000");
    expect(bracketRange(200_000, 2_000_000)).toBe("₱2,000 to ₱20,000");
    expect(bracketRange(2_000_000, null)).toBe("Above ₱20,000");
    expect(bracketRange(0, null)).toBe("Every peso");
    expect(scheduleSummary(shipped)).toBe("45% to ₱2,000, 25% to ₱20,000, 15% above");
    expect(scheduleSummary({ version: 1, rateBps: 1_000 })).toBe("10% flat");
  });

  it("shows the cliff gone as an effective rate that only falls", () => {
    const rates = localPreview(shipped, shipped).map((row) =>
      effectiveRate(row.shopPriceMinor, row.next.grossServiceFeeMinor),
    );
    expect(rates).toEqual(["45%", "45%", "45%", "33%", "27%", "19.8%"]);
  });

  it("signs a change", () => {
    expect(feeChange(100, 250)).toBe("+₱1.50");
    expect(feeChange(250, 100)).toBe("−₱1.50");
    expect(feeChange(100, 100)).toBe("No change");
  });
});

describe("when it starts", () => {
  it("sends Manila time with its offset", () => {
    expect(manilaStart("2026-12-01", "00:00")).toBe("2026-12-01T00:00:00+08:00");
    expect(manilaStart("", "00:00")).toBeNull();
  });

  it("refuses a start that has passed", () => {
    const now = new Date("2026-10-15T00:00:00Z");
    expect(startProblem("2026-10-14T00:00:00+08:00", now)).toMatch(/passed/);
    expect(startProblem("2026-12-01T00:00:00+08:00", now)).toBeNull();
    expect(startProblem(null, now)).toMatch(/Pick the date/);
  });
});

describe("orderFeeBasis", () => {
  it("reads a bracket snapshot with its working", () => {
    const working = serviceFeeFor(500_000, shipped).serviceFeeWorking;
    expect(
      orderFeeBasis({ serviceFeeSchedule: shipped, serviceFeeWorking: working, serviceFeeRateBps: null }),
    ).toEqual({ kind: "brackets", schedule: shipped, working });
  });

  it("works the brackets out when the API sent the table but not the working", () => {
    const basis = orderFeeBasis({ serviceFeeSchedule: shipped, supplierSubtotalMinor: 500_000 });
    expect(basis.kind === "brackets" && workingSentence(basis.working)).toBe(
      "₱2,000.00 × 45% + ₱3,000.00 × 25%",
    );
  });

  it("reads a legacy order as its flat rate", () => {
    expect(orderFeeBasis({ serviceFeeRateBps: 1_000 })).toEqual({ kind: "flat", rateBps: 1_000 });
    expect(orderFeeBasis({ serviceFeeSchedule: { version: 1, rateBps: 1_200 } })).toEqual({
      kind: "flat",
      rateBps: 1_200,
    });
    expect(orderFeeBasis({})).toEqual({ kind: "unknown" });
  });
});
