import { describe, expect, it } from "vitest";

import {
  portalRolesFromMemberships,
  preferredPortalRole,
} from "@/lib/auth/portal-access";

describe("multi-membership portal landing", () => {
  it("keeps every assigned portal membership available", () => {
    expect(
      portalRolesFromMemberships([
        { role: "client" },
        { role: "supplier" },
        { role: "ops_admin" },
      ]),
    ).toEqual(["ops_admin", "supplier"]);
  });

  it("uses a stable landing without treating the legacy user role as authority", () => {
    expect(
      preferredPortalRole([
        { role: "supplier" },
        { role: "super_admin" },
        { role: "ops_admin" },
      ]),
    ).toBe("super_admin");
    expect(preferredPortalRole([{ role: "client" }])).toBeNull();
  });
});
