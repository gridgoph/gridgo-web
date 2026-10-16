import { describe, expect, it } from "vitest";

import {
  expressFactLine,
  expressStateLine,
  isExpressOrder,
  ORDER_SPEED_OPTIONS,
  orderSpeed,
} from "@/lib/express";
import { normalizeListing } from "@/lib/listings";

describe("Express orders", () => {
  it("reads only an explicit true as Express; an older order without the field is not", () => {
    expect(isExpressOrder({ express: true })).toBe(true);
    expect(isExpressOrder({ express: false })).toBe(false);
    expect(isExpressOrder({})).toBe(false);
    expect(isExpressOrder(null)).toBe(false);
  });

  it("gives every order one Speed value that the queue's filter offers", () => {
    const values = ORDER_SPEED_OPTIONS.map((option) => option.value);
    expect(orderSpeed({ express: true })).toBe("Express");
    expect(orderSpeed({})).toBe("Standard");
    expect(values).toEqual(["Express", "Standard"]);
  });
});

describe("Express listings", () => {
  const base = { id: "sci_1", name: "Flyers" };

  it("reads the shop's switch, and null from an API that predates it", () => {
    expect(normalizeListing({ item: { ...base, express: true } })?.express).toBe(true);
    expect(normalizeListing({ item: { ...base, express: false } })?.express).toBe(false);
    expect(normalizeListing({ item: base })?.express).toBeNull();
  });

  it("says in plain words what the switch does", () => {
    expect(expressStateLine(true)).toBe(
      "Express is on. Clients can choose today as their deadline.",
    );
    expect(expressStateLine(false)).toMatch(/follow your production time/);
    expect(expressFactLine(true)).toMatch(/any deadline from today/);
    expect(expressFactLine(false)).toBe("Off");
  });
});
