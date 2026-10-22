import { describe, expect, it } from "vitest";

import { dayFace, monthCellLabel, selectedDayEmpty } from "@/app/supplier/_lib/month-board";
import { nextSetupStep, setupHref } from "@/app/supplier/_lib/home-next";
import type { ShopHours } from "@/lib/api/types";

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
