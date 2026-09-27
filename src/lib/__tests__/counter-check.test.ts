import { describe, expect, it } from "vitest";

import type { Escalation, Order, PickupCheck } from "@/lib/api/types";
import {
  checkResults,
  counterRow,
  counterStep,
  countLines,
  countVerdictLabel,
  failureHeadline,
} from "@/lib/counter-check";

const ALL_PASSED: PickupCheck[] = [
  { code: "supplier_sign_off", passed: true },
  { code: "quantity_match", passed: true },
  { code: "specification_match", passed: true },
  { code: "visible_defects", passed: true },
  { code: "packaging_integrity", passed: true },
  { code: "documentation", passed: true },
];

const ITEMS = [
  { lineItemId: "cline_cards", itemName: "Business cards", expectedQuantity: 200 },
  { lineItemId: "cline_flyers", itemName: "A5 flyers", expectedQuantity: 100 },
];

const when = (iso: string) => `at ${iso}`;

function order(partial: Partial<Order>): Order {
  return {
    id: "ord_1",
    state: "rider_assigned",
    title: "Launch kit",
    timeline: [],
    ...partial,
  } as Order;
}

describe("countLines", () => {
  it("labels each counted line by its item and says how far off it is", () => {
    const lines = countLines(
      [
        { lineItemId: "cline_cards", expectedQuantity: 200, countedQuantity: 188 },
        { lineItemId: "cline_flyers", expectedQuantity: 100, countedQuantity: 100 },
      ],
      ITEMS,
      "Launch kit",
    );
    expect(lines.map((line) => [line.itemName, countVerdictLabel(line)])).toEqual([
      ["Business cards", "12 short"],
      ["A5 flyers", "Matches"],
    ]);
  });

  it("names an excess as extra, not as a pass", () => {
    const [line] = countLines(
      [{ lineItemId: "cline_flyers", expectedQuantity: 100, countedQuantity: 1_250 }],
      ITEMS,
      "Launch kit",
    );
    expect(countVerdictLabel(line)).toBe("1,150 extra");
  });

  it("keeps a legacy null line id and falls back to the order title", () => {
    const [line] = countLines(
      [{ lineItemId: null, expectedQuantity: 50, countedQuantity: 50 }],
      null,
      "Old flyers",
    );
    expect(line).toMatchObject({ itemName: "Old flyers", verdict: "match" });
  });

  it("reads a check without counts as not recorded, never as zero", () => {
    const lines = countLines(undefined, ITEMS, "Launch kit");
    expect(lines.map((line) => [line.counted, countVerdictLabel(line)])).toEqual([
      [null, "Not recorded"],
      [null, "Not recorded"],
    ]);
  });
});

describe("checkResults", () => {
  it("lists the six checks in the rider's order, whatever order the record kept", () => {
    expect(checkResults(ALL_PASSED).map((check) => check.label)).toEqual([
      "Quantity match",
      "Specification match",
      "Visible defects",
      "Packaging integrity",
      "Documentation",
      "Supplier sign-off",
    ]);
  });
});

describe("failureHeadline", () => {
  it("leads with the count and does not repeat the quantity check it forced", () => {
    const checks = ALL_PASSED.map((check) =>
      check.code === "quantity_match" ? { ...check, passed: false } : check,
    );
    const lines = countLines(
      [{ lineItemId: null, expectedQuantity: 200, countedQuantity: 188 }],
      null,
      "Cards",
    );
    expect(failureHeadline(checks, lines)).toBe("counted 12 short");
  });

  it("names a single failed check when the count matched", () => {
    const checks = ALL_PASSED.map((check) =>
      check.code === "visible_defects" ? { ...check, passed: false } : check,
    );
    expect(failureHeadline(checks, [])).toBe("visible defects");
  });
});

describe("counterRow", () => {
  it("is locked before a rider is assigned", () => {
    const row = counterRow(order({ state: "production" }), [], when);
    expect(row).toMatchObject({ trailing: "Locked", marker: "muted-lock" });
  });

  it("asks Operations to answer while the rider is blocked", () => {
    const blocked = order({
      pickupChecklist: {
        status: "failed_escalated",
        checks: ALL_PASSED.map((check) =>
          check.code === "quantity_match" ? { ...check, passed: false } : check,
        ),
        counts: [
          { lineItemId: "cline_cards", expectedQuantity: 200, countedQuantity: 188 },
        ],
        evidenceFileIds: ["file_1"],
        failureNote: "One bundle missing.",
        completedAt: "2026-09-27T06:00:00.000Z",
        completedBy: "rider_1",
        escalationId: "esc_1",
      },
      pickupCountItems: ITEMS.slice(0, 1),
    });
    expect(counterRow(blocked, [], when)).toEqual({
      summary: "Blocked: counted 12 short. The rider is waiting for you.",
      trailing: "Your call",
      marker: "current",
    });
  });

  it("says a passed check without counts was not counted", () => {
    const passed = order({
      state: "delivered",
      pickupChecklist: {
        status: "passed",
        checks: ALL_PASSED,
        evidenceFileIds: [],
        failureNote: null,
        completedAt: "2026-09-01T06:00:00.000Z",
        completedBy: "rider_1",
        escalationId: null,
      },
    });
    expect(counterRow(passed, [], when).summary).toBe(
      "All six checks passed at 2026-09-01T06:00:00.000Z. The count was not recorded.",
    );
    expect(counterStep(passed)).toBe("done");
  });

  it("waits on the rider after an instruction, and an open escalation still blocks", () => {
    const resolved = order({
      pickupChecklist: {
        status: "escalation_resolved",
        checks: ALL_PASSED,
        evidenceFileIds: [],
        failureNote: null,
        completedAt: "2026-09-27T06:00:00.000Z",
        completedBy: "rider_1",
        escalationId: "esc_1",
      },
    });
    expect(counterRow(resolved, [], when).trailing).toBe("Rechecking");
    const open = { id: "esc_2", status: "open" } as Escalation;
    expect(counterRow(resolved, [open], when).trailing).toBe("Your call");
  });

  it("warns when the order has nothing to count against", () => {
    const row = counterRow(order({ pickupCountItems: null }), [], when);
    expect(row.summary).toMatch(/Nothing to count against/);
  });
});
