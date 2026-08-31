import { describe, expect, it } from "vitest";

import { homeForRole, isForeignRolePath, roleLabel } from "@/lib/routes";

describe("role routing", () => {
  it("maps portal roles to their home paths", () => {
    expect(homeForRole("supplier")).toBe("/supplier/jobs");
    expect(homeForRole("ops_admin")).toBe("/ops/orders");
    expect(homeForRole("super_admin")).toBe("/admin/overview");
  });

  it("detects foreign role paths", () => {
    expect(isForeignRolePath("/ops/orders", "supplier")).toBe(true);
    expect(isForeignRolePath("/admin/overview", "ops_admin")).toBe(true);
    expect(isForeignRolePath("/supplier/jobs", "supplier")).toBe(false);
    expect(isForeignRolePath("/supplier/jobs/ord_1", "supplier")).toBe(false);
  });

  it("exposes plain role labels", () => {
    expect(roleLabel("ops_admin")).toBe("Operations");
    expect(roleLabel("super_admin")).toBe("Super Admin");
    expect(roleLabel("supplier")).not.toMatch(/_/);
  });
});
