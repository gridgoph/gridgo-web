import { describe, expect, it } from "vitest";

import {
  dayFace,
  monthCellLabel,
  selectedDayEmpty,
} from "@/app/supplier/_lib/month-board";
import { nextObligations, nextSetupStep, setupHref } from "@/app/supplier/_lib/home-next";
import type { Order, ShopHours } from "@/lib/api/types";

const hours = {
  week: [{ weekday: 1, opensMinute: 480, closesMinute: 1020 }],
  closures: [{ startDay: "2026-10-22", endDay: "2026-10-22" }],
} as ShopHours;

describe("month schedule", () => {
  it("tells a closure, a closed weekday, and an empty open day apart", () => {
    const closure = dayFace(new Date(2026, 9, 22), hours, 0);
    const sunday = dayFace(new Date(2026, 9, 25), hours, 0);
    const monday = dayFace(new Date(2026, 9, 26), hours, 0);
    expect(monthCellLabel(closure)).toBe("Closure date");
    expect(selectedDayEmpty(closure, 0)).toBe("Closed, and nothing promised.");
    expect(monthCellLabel(sunday)).toBe("Not a working day");
    expect(selectedDayEmpty(sunday, 0)).toBe("Closed, and nothing promised.");
    expect(monthCellLabel(monday)).toBe("Nothing booked");
    expect(selectedDayEmpty(monday, 0)).toBe("Nothing promised.");
  });
});

describe("home next step", () => {
  it("opens a setup step the portal has, and skips one it cannot", () => {
    expect(setupHref("upload_shop_image")).toBeNull();
    expect(setupHref("review_schedule")).toBe("/supplier/capacity");
    expect(setupHref("open_shop")).toBe("/supplier/shop-hours");
    expect(
      nextSetupStep({
        operational: {
          ready: false,
          missing: [
            { code: "photo", message: "Add a shop photo", action: "upload_shop_image" },
            { code: "hours", message: "Set your hours", action: "open_shop" },
          ],
        },
      }),
    ).toEqual({ message: "Set your hours", href: "/supplier/shop-hours" });
  });
});

function job(extra: Partial<Order> = {}): Order {
  return { id: "job1", title: "Flyers", state: "production", ...extra } as Order;
}
describe("actionable obligations", () => {
  it.each([undefined, { ready_for_dispatch: { allowed: true, missing: [] } }])(
    "omits stopped work and disabled packaging with readiness %j",
    (transitionReadiness) => {
      expect(
        nextObligations(
          [
            job({ payoutHold: true }),
            job({ state: "rider_assigned", refundHold: true }),
            job({
              state: "rider_assigned",
              pickupChecklist: { status: "failed_escalated" } as Order["pickupChecklist"],
            }),
            job({ state: "ready_for_dispatch", refundDisposition: "cancelled" }),
            job({
              state: "rider_assigned",
              rescheduleRequest: {
                workHeld: true,
                status: "declined",
                resolution: "rematch_offered",
              } as Order["rescheduleRequest"],
            }),
            job({
              state: "ready_for_dispatch",
              shopRecovery: {
                id: "recovery1",
                status: "ops_review",
              } as Order["shopRecovery"],
            }),
          ].map((row) => ({
            ...row,
            ...(transitionReadiness
              ? {
                  transitionReadiness: row.payoutHold
                    ? {
                        ready_for_dispatch: {
                          allowed: false,
                          missing: [
                            {
                              code: "claim_hold_active",
                              message: "A claim holds payouts.",
                            },
                          ],
                        },
                      }
                    : transitionReadiness,
                }
              : {}),
          })),
        ),
      ).toEqual([]);
    },
  );
  it("keeps unpacked pickup instructions on rider-packs jobs", () => {
    const [next] = nextObligations([
      job({ state: "rider_assigned", handoverFlow: "rider_packs" }),
    ]);
    expect(next.detail).toMatch(/unpacked/i);
    expect(next.detail).not.toMatch(/keep it packed/i);
  });
  it("prioritizes proof, an answer, production, then pickup and links each job", () => {
    const rows = nextObligations([
      job({ id: "pickup", state: "ready_for_dispatch" }),
      job({ id: "produce", state: "payment_authorized" }),
      job({ id: "answer", state: "supplier_assigned" }),
      job({
        id: "proof",
        payoutMilestones: [
          { code: "printing", status: "pending_pof", sharePercent: 35, pofFileIds: [] },
        ],
      }),
    ]);
    expect(rows.map((row) => row.id)).toEqual([
      "proof:proof",
      "answer:decide",
      "produce:produce",
      "pickup:pickup",
    ]);
    expect(rows.map((row) => row.href)).toEqual(
      ["proof", "answer", "produce", "pickup"].map((id) => `/supplier/jobs/${id}`),
    );
  });
});
it("never labels unknown opening hours as open", () => {
  expect(monthCellLabel(dayFace(new Date(2026, 9, 26), null, 0))).toBe(
    "Hours unavailable",
  );
  expect(monthCellLabel(dayFace(new Date(2026, 9, 26), null, 1))).toBe(
    "Jobs due · hours unavailable",
  );
});

it("treats an API-declared unreadable legacy calendar as unknown", () => {
  expect(
    monthCellLabel(
      dayFace(new Date(2026, 9, 26), { ...hours, calendarAvailable: false }, 0),
    ),
  ).toBe("Hours unavailable");
});
