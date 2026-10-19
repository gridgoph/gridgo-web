import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acceptsReviewData,
  readShowTestOrders,
  SHOW_TEST_ORDERS_STORAGE_KEY,
  withReviewData,
  writeShowTestOrders,
} from "@/lib/review-data";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("acceptsReviewData", () => {
  it("names the collection reads the API widens with the flag", () => {
    for (const path of [
      "/orders",
      "/jobs",
      "/baskets",
      "/claims",
      "/issues",
      "/escalations?status=open",
      "/refund-requests",
      "/ops/riders/locations",
      "/ops/colour-price-checks",
      "/ops/shop-failures",
      "/ops/hub/waiting",
      "/ops/shops/performance",
      "/ops/shops/usr_1/performance",
      "/admin/shop-rankings",
      "/audit?action=order.production_override",
      "/orders/ord_1/audit",
    ]) {
      expect(acceptsReviewData(path), path).toBe(true);
    }
  });

  it("leaves single records, money and other reads alone", () => {
    for (const path of [
      "/orders/ord_1",
      "/baskets/bsk_1",
      "/settings",
      "/admin/finance",
      "/ops/organizations",
      "/users",
      "/notifications",
    ]) {
      expect(acceptsReviewData(path), path).toBe(false);
    }
  });
});

describe("withReviewData", () => {
  it("adds the flag once and keeps the query", () => {
    expect(withReviewData("/orders")).toBe("/orders?includeReviewData=1");
    expect(withReviewData("/escalations?status=open")).toBe(
      "/escalations?status=open&includeReviewData=1",
    );
    expect(withReviewData("/orders?includeReviewData=1")).toBe(
      "/orders?includeReviewData=1",
    );
  });
});

describe("Show test orders, per browser", () => {
  function stubStorage() {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
    return store;
  }

  it("is off until this browser turns it on, and forgets when turned off", () => {
    const store = stubStorage();
    expect(readShowTestOrders()).toBe(false);
    writeShowTestOrders(true);
    expect(store.get(SHOW_TEST_ORDERS_STORAGE_KEY)).toBe("true");
    expect(readShowTestOrders()).toBe(true);
    writeShowTestOrders(false);
    expect(store.has(SHOW_TEST_ORDERS_STORAGE_KEY)).toBe(false);
    expect(readShowTestOrders()).toBe(false);
  });

  it("stays off when storage is blocked", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readShowTestOrders()).toBe(false);
    expect(() => writeShowTestOrders(true)).not.toThrow();
  });
});
