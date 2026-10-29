import { describe, expect, it } from "vitest";

import type { SupplierProfile } from "@/lib/api/client";
import {
  draftFromProfile,
  shopDetailPatch,
  shopDetailProblems,
  supplierContactName,
} from "@/lib/supplier-profile";

const profile: SupplierProfile = {
  userId: "shop",
  shopName: "Ana Prints",
  contactName: "Ana",
  phone: "+639171234567",
  email: "ana@example.com",
  shop: { lat: 14.6, lng: 121.0, label: "Counter" },
  version: 2,
};

describe("shop detail draft", () => {
  it("sends only the fields that moved, against the loaded version's shape", () => {
    const patch = shopDetailPatch(profile, {
      shopName: "Ana Prints",
      contactName: "Ana Reyes",
      phone: "09171234567",
      pinLabel: "Counter",
      lat: "14.6",
      lng: "121",
    });
    expect(patch).toEqual({ contactName: "Ana Reyes", phone: "09171234567" });
    expect(patch).not.toHaveProperty("email");
  });

  it("refuses a blank name and a phone that is not a Philippine mobile", () => {
    const problems = shopDetailProblems({
      shopName: " ",
      contactName: "Ana",
      phone: "123",
      pinLabel: "Counter",
      lat: "14.6",
      lng: "121",
    });
    expect(problems.shopName).toBeTruthy();
    expect(problems.phone).toMatch(/0917/);
  });

  it.each([
    ["both", { lat: "", lng: "" }],
    ["latitude", { lat: "  " }],
    ["longitude", { lng: "" }],
  ])("refuses a blank %s instead of moving the pin to 0", (_axis, blank) => {
    const draft = { ...draftFromProfile(profile), ...blank };
    const problems = shopDetailProblems(draft);
    expect(problems.lat ?? problems.lng).toMatch(/between/);
    expect(shopDetailPatch(profile, draft)).not.toHaveProperty("shop");
  });

  it("keeps a typed 0 as a real coordinate", () => {
    const draft = { ...draftFromProfile(profile), lat: "0", lng: "0" };
    expect(shopDetailProblems(draft)).toEqual({});
    expect(shopDetailPatch(profile, draft).shop).toEqual({ lat: 0, lng: 0, label: "Counter" });
  });
});

describe("supplierContactName", () => {
  it("names the contact person from the shop details, not the sign-up name", () => {
    expect(supplierContactName({ name: "Ana Cruz", contactName: "Bea Lim" })).toBe("Bea Lim");
  });

  it("falls back to the account holder when no contact person is saved", () => {
    expect(supplierContactName({ name: "Ana Cruz" })).toBe("Ana Cruz");
    expect(supplierContactName({ name: "Ana Cruz", contactName: null })).toBe("Ana Cruz");
    expect(supplierContactName({ name: "Ana Cruz", contactName: "  " })).toBe("Ana Cruz");
  });
});
