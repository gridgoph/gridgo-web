import { describe, expect, it } from "vitest";

import {
  CATALOG_MIN_ORDER_INVALID,
  CATALOG_MONEY_INVALID,
  CATALOG_MONEY_OVER,
  CATALOG_PACK_INVALID,
  minimumOrderProblem,
  packProblem,
  parseCatalogMoney,
} from "@/lib/catalog-money";
import { pesosToMinor } from "@/lib/format";

/** The largest peso amount whose centavos are still a safe integer. */
const AT_LIMIT = "90071992547409.91";
const OVER_LIMIT = "90071992547409.92";

describe("catalogue money matches the API", () => {
  it("keeps zero, a sub-peso amount, and a price above ₱1,000,000 as exact centavos", () => {
    expect(parseCatalogMoney("0")).toEqual({ ok: true, minor: 0 });
    expect(parseCatalogMoney("0.50")).toEqual({ ok: true, minor: 50 });
    expect(parseCatalogMoney("1000001")).toEqual({ ok: true, minor: 100000100 });
    expect(pesosToMinor("0")).toBe(0);
    expect(pesosToMinor("0.50")).toBe(50);
    expect(pesosToMinor("1000001")).toBe(100000100);
  });

  it("refuses a third decimal and an amount past the safe centavo integer", () => {
    expect(parseCatalogMoney("10.005")).toEqual({ ok: false, error: CATALOG_MONEY_INVALID });
    expect(pesosToMinor("10.005")).toBeNull();
    expect(parseCatalogMoney(OVER_LIMIT)).toEqual({ ok: false, error: CATALOG_MONEY_OVER });
    expect(pesosToMinor(OVER_LIMIT)).toBeNull();
    expect(parseCatalogMoney(AT_LIMIT)).toEqual({
      ok: true,
      minor: Number.MAX_SAFE_INTEGER,
    });
  });

  it("explains a pack below 2 and allows a pack above 5,000", () => {
    expect(packProblem("per_package", 1)).toBe(CATALOG_PACK_INVALID);
    expect(packProblem("per_package", 5001)).toBeNull();
    expect(packProblem("per_unit", 1)).toBeNull();
  });

  it("explains a minimum below 1 and allows a minimum above 1,000", () => {
    expect(minimumOrderProblem("per_unit", -1, true)).toBe(CATALOG_MIN_ORDER_INVALID);
    expect(minimumOrderProblem("per_unit", 1.5, true)).toBe(CATALOG_MIN_ORDER_INVALID);
    expect(minimumOrderProblem("per_unit", 0, true)).toBeNull();
    expect(minimumOrderProblem("per_unit", 1001, true)).toBeNull();
    expect(minimumOrderProblem("whole_job", 1001, false)).toBeNull();
  });
});
