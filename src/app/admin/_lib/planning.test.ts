import { describe, expect, it } from "vitest";

import type { Order, SupplierService, User } from "@/lib/api/types";

import {
  buildPlanningSnapshot,
  dateKey,
  promisedDateKey,
  shiftWeek,
  weekContaining,
} from "./planning";

describe("weekContaining", () => {
  it("returns a Monday–Sunday week", () => {
    // 2026-08-05 is a Wednesday
    const week = weekContaining(new Date(2026, 7, 5));
    expect(week.days).toHaveLength(7);
    expect(week.start.getDay()).toBe(1); // Monday
    expect(week.end.getDay()).toBe(0); // Sunday
    expect(dateKey(week.start)).toBe("2026-08-03");
    expect(dateKey(week.end)).toBe("2026-08-09");
  });

  it("shiftWeek moves by 7 days", () => {
    const a = new Date(2026, 7, 5);
    const next = shiftWeek(a, 1);
    expect(dateKey(next)).toBe("2026-08-12");
  });
});

describe("buildPlanningSnapshot", () => {
  it("buckets deliveries by promised date and reports capacity", () => {
    const orders: Order[] = [
      {
        id: "ord1",
        clientId: "c",
        supplierId: "s",
        riderId: null,
        state: "rider_assigned",
        productId: "p",
        title: "Banners",
        quantity: 1,
        size: "A",
        material: "m",
        deadline: null,
        address: "a",
        zone: "davao_central",
        totalMinor: 1000,
        deliveryFeeMinor: 100,
        paymentMethod: "cod",
        paymentStatus: "collected",
        promisedDate: "2026-08-05T10:00:00+08:00",
        artworkName: null,
        createdAt: "",
        updatedAt: "",
        timeline: [],
      },
    ];
    const services: SupplierService[] = [
      {
        id: "svc1",
        supplierId: "s",
        categoryCode: "large_format",
        materialCodes: [],
        finishCodes: [],
        productFamilyIds: [],
        sizeMin: null,
        sizeMax: null,
        qtyMin: null,
        qtyMax: null,
        pricingBasis: "unit",
        referenceRateMinor: 0,
        turnaroundHours: 24,
        capacityDaily: 20,
        capacityWeekly: 100,
        zones: ["davao_central"],
        equipmentNotes: "",
        state: "live",
        verifiedAt: null,
        suspendedAt: null,
        suspendReason: null,
        withdrawnAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ];
    const users: User[] = [
      {
        id: "s",
        email: "s@x",
        name: "S",
        role: "supplier",
        verificationStatus: "approved",
      },
      {
        id: "r",
        email: "r@x",
        name: "R",
        role: "rider",
        verificationStatus: "approved",
      },
    ];

    const snap = buildPlanningSnapshot({
      orders,
      services,
      users,
      anchor: new Date(2026, 7, 5),
      today: new Date(2026, 7, 5),
    });

    expect(snap.liveCapacityDaily).toBe(20);
    expect(snap.liveServiceCount).toBe(1);
    expect(snap.verifiedSupplierCount).toBe(1);
    expect(snap.verifiedRiderCount).toBe(1);
    const wed = snap.days.find((d) => d.key === "2026-08-05");
    expect(wed?.deliveryCount).toBe(1);
    expect(snap.agenda).toHaveLength(1);
    expect(snap.unavailable.riderAvailability).toMatch(/not exposed/i);
    expect(snap.unavailable.zoneBlackouts).toMatch(/not exposed/i);
  });

  it("parses promisedDate keys", () => {
    expect(promisedDateKey("2026-08-10T15:00:00+08:00")).toBe("2026-08-10");
    expect(promisedDateKey(null)).toBeNull();
  });
});
