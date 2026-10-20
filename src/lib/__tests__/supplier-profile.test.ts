import { describe, expect, it } from "vitest";

import type { SupplierProfile } from "@/lib/api/client";
import { shopDetailPatch, shopDetailProblems } from "@/lib/supplier-profile";

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
});
