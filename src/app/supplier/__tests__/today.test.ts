import { describe, expect, it } from "vitest";

import type { Order } from "@/lib/api/types";
import { afterThat, dueToday, earnedToday, expressQueue, greeting } from "@/app/supplier/_lib/today";

const NOW = new Date(2026, 10, 22, 10, 0, 0);

function job(over: Partial<Order> & Pick<Order, "id" | "state">): Order {
  return { title: "Job", ...over } as Order;
}

function expressJob(id: string, state: string, deadline: string, acceptance = "pending"): Order {
  return job({
    id,
    state,
    orderType: "express",
    expressOrder: { printSettings: [] },
    shopAcceptance: {
      supplierId: "s",
      assignedAt: deadline,
      deadlineAt: deadline,
      workingMinutes: 5,
      status: acceptance as "pending",
    },
  });
}

describe("Today", () => {
  it("puts Express offers first, then the counter, then the press, soonest clock first", () => {
    const queue = expressQueue([
      expressJob("working", "payment_authorized", "2026-11-22T02:00:00Z", "accepted"),
      expressJob("offer_late", "supplier_assigned", "2026-11-22T02:05:00Z"),
      expressJob("counter", "ready_for_dispatch", "2026-11-22T01:00:00Z", "accepted"),
      expressJob("offer_soon", "supplier_assigned", "2026-11-22T02:01:00Z"),
      job({ id: "regular", state: "production" }),
    ]);
    expect(queue.map((order) => order.id)).toEqual(["offer_soon", "offer_late", "counter", "working"]);
  });

  it("leaves Express jobs out of After that", () => {
    const rows = afterThat(
      [expressJob("x", "supplier_assigned", "2026-11-22T02:00:00Z"), job({ id: "r", state: "supplier_assigned" })],
      NOW,
    );
    expect(rows.some((row) => row.href.endsWith("/x"))).toBe(false);
    expect(rows.some((row) => row.href.endsWith("/r"))).toBe(true);
  });

  it("lists only open work due today, earliest first", () => {
    const due = dueToday(
      [
        job({ id: "late", state: "production", readyBy: new Date(2026, 10, 22, 16).toISOString() }),
        job({ id: "soon", state: "production", readyBy: new Date(2026, 10, 22, 12).toISOString() }),
        job({ id: "tomorrow", state: "production", readyBy: new Date(2026, 10, 23, 12).toISOString() }),
        job({ id: "done", state: "completed", readyBy: new Date(2026, 10, 22, 12).toISOString() }),
      ],
      NOW,
    );
    expect(due.map((order) => order.id)).toEqual(["soon", "late"]);
  });

  it("adds what today's finished work pays, counting Express", () => {
    const today = new Date(2026, 10, 22, 9).toISOString();
    expect(
      earnedToday(
        [
          { ...expressJob("e", "completed", today, "accepted"), readyAt: today, supplierPriceMinor: 12_000 },
          job({ id: "r", state: "completed", readyAt: today, supplierPriceMinor: 30_000 }),
          job({ id: "y", state: "completed", readyAt: new Date(2026, 10, 21).toISOString(), supplierPriceMinor: 99 }),
        ],
        NOW,
      ),
    ).toEqual({ minor: 42_000, jobs: 2, express: 1 });
  });

  it("greets by the clock with the first name", () => {
    expect(greeting(NOW, "Ana Reyes")).toBe("Magandang umaga, Ana!");
    expect(greeting(new Date(2026, 10, 22, 19), null)).toBe("Magandang gabi!");
  });
});
