import { describe, expect, it } from "vitest";

import type { HubWaitingOrder } from "@/lib/api/types";
import {
  mergeHandouts,
  missedDaysLabel,
  rankStaffTotals,
  sortWaiting,
  waitingFor,
  waitingStep,
} from "@/lib/hub-desk";

const order = (patch: Partial<HubWaitingOrder>): HubWaitingOrder => ({
  orderId: "o",
  state: "awaiting_collection",
  readyAt: "2026-10-01T02:00:00.000Z",
  missedDays: 0,
  operationsRequired: false,
  redeliveryRequest: null,
  ...patch,
});

describe("waitingStep", () => {
  it("climbs from waiting to reminder, warning, then Operations", () => {
    expect(waitingStep(order({})).label).toBe("Waiting for the client");
    expect(waitingStep(order({ missedDays: 1 })).label).toBe("Reminder sent");
    expect(waitingStep(order({ missedDays: 2 })).label).toBe("Final warning sent");
    const third = waitingStep(order({ missedDays: 3, operationsRequired: true }));
    expect(third).toMatchObject({
      label: "Needs Operations",
      tone: "error",
      forOperations: true,
    });
    expect(third.next).toMatch(/not forfeited/);
  });

  it("puts a paid redelivery request first in words", () => {
    const step = waitingStep(
      order({
        missedDays: 3,
        operationsRequired: true,
        redeliveryRequest: {
          status: "pending_operations",
          costAccepted: true,
          at: "x",
          by: "u",
        },
      }),
    );
    expect(step.label).toBe("Redelivery requested");
    expect(step.next).toMatch(/own cost/);
  });
});

it("sorts Operations' work first, then most missed, then longest waiting", () => {
  const sorted = sortWaiting([
    order({ orderId: "fresh", readyAt: "2026-10-05T00:00:00.000Z" }),
    order({ orderId: "older", readyAt: "2026-10-02T00:00:00.000Z" }),
    order({ orderId: "two", missedDays: 2 }),
    order({ orderId: "ops", missedDays: 3, operationsRequired: true }),
  ]);
  expect(sorted.map((row) => row.orderId)).toEqual(["ops", "two", "older", "fresh"]);
});

it("words missed days", () => {
  expect(missedDaysLabel(0)).toBe("No hub day missed");
  expect(missedDaysLabel(1)).toBe("1 hub day missed");
  expect(missedDaysLabel(4)).toBe("4 hub days missed");
});

it("ranks staff by handovers and appends older pages without repeats", () => {
  expect(
    rankStaffTotals([
      { staffId: "b", name: "Bea", count: 2 },
      { staffId: "a", name: "Abe", count: 2 },
      { staffId: "c", name: "Cy", count: 5 },
    ]).map((row) => row.staffId),
  ).toEqual(["c", "a", "b"]);
  const h = (id: string) => ({
    id,
    orderId: id,
    staffId: "s",
    staffName: "S",
    hubId: "primary",
    at: id,
  });
  expect(mergeHandouts([h("3"), h("2")], [h("2"), h("1")]).map((row) => row.id)).toEqual([
    "3",
    "2",
    "1",
  ]);
});

it("says how long an order has waited", () => {
  const now = Date.parse("2026-10-06T12:00:00.000Z");
  expect(waitingFor("2026-10-06T11:30:00.000Z", now)).toBe("Ready under an hour");
  expect(waitingFor("2026-10-06T05:00:00.000Z", now)).toBe("Waiting 7 hours");
  expect(waitingFor("2026-10-03T12:00:00.000Z", now)).toBe("Waiting 3 days");
});
