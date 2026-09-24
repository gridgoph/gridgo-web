import { describe, expect, it } from "vitest";

import {
  contextTitleForPath,
  navForRole,
  navGroupsForRole,
  navItemForPath,
  ROLE_NAV,
  ROLE_NAV_GROUPS,
} from "@/lib/nav";

describe("ROLE_NAV", () => {
  it("covers the full supplier surface", () => {
    const hrefs = ROLE_NAV.supplier.map((n) => n.href);
    expect(hrefs).toEqual([
      "/supplier/dashboard",
      "/supplier/jobs",
      "/supplier/catalogue",
      "/supplier/schedule",
      "/supplier/capacity",
      "/supplier/payouts",
      "/supplier/payout-account",
    ]);
  });

  it("covers the full operations surface", () => {
    const hrefs = ROLE_NAV.ops_admin.map((n) => n.href);
    expect(hrefs).toEqual([
      "/ops/overview",
      "/ops/chat",
      "/ops/issue-reports",
      "/ops/orders",
      "/ops/approvals",
      "/ops/dispatch",
      "/ops/riders",
      "/ops/rankings",
      "/ops/escalations",
      "/ops/schedule",
      "/ops/payouts",
      "/ops/claims",
      "/ops/recovery",
      "/ops/settings",
      "/ops/audit",
    ]);
  });

  it("covers the full super-admin surface", () => {
    const hrefs = ROLE_NAV.super_admin.map((n) => n.href);
    expect(hrefs).toEqual([
      "/admin/overview",
      "/admin/chat",
      "/admin/issue-reports",
      "/admin/riders",
      "/admin/verification",
      "/admin/roles",
      "/admin/catalogue",
      "/admin/zones",
      "/admin/finance",
      "/admin/settings",
      "/admin/audit",
      "/admin/planning",
      "/admin/broadcast",
    ]);
  });

  it("marks only existing screens as ready", () => {
    const ready = Object.values(ROLE_NAV)
      .flat()
      .filter((n) => n.ready)
      .map((n) => n.href)
      .sort();
    expect(ready).toEqual([
      "/admin/audit",
      "/admin/broadcast",
      "/admin/catalogue",
      "/admin/chat",
      "/admin/finance",
      "/admin/issue-reports",
      "/admin/overview",
      "/admin/planning",
      "/admin/riders",
      "/admin/roles",
      "/admin/settings",
      "/admin/verification",
      "/admin/zones",
      "/ops/approvals",
      "/ops/audit",
      "/ops/chat",
      "/ops/claims",
      "/ops/dispatch",
      "/ops/escalations",
      "/ops/issue-reports",
      "/ops/orders",
      "/ops/overview",
      "/ops/payouts",
      "/ops/rankings",
      "/ops/recovery",
      "/ops/riders",
      "/ops/schedule",
      "/ops/settings",
      "/supplier/capacity",
      "/supplier/catalogue",
      "/supplier/dashboard",
      "/supplier/jobs",
      "/supplier/payout-account",
      "/supplier/payouts",
      "/supplier/schedule",
    ]);
  });

  it("keeps every href under its role prefix", () => {
    for (const item of ROLE_NAV.supplier) {
      expect(item.href.startsWith("/supplier/")).toBe(true);
    }
    for (const item of ROLE_NAV.ops_admin) {
      expect(item.href.startsWith("/ops/")).toBe(true);
    }
    for (const item of ROLE_NAV.super_admin) {
      expect(item.href.startsWith("/admin/")).toBe(true);
    }
  });

  it("gives each role only its own nav", () => {
    expect(navForRole("supplier").every((n) => n.href.startsWith("/supplier"))).toBe(
      true,
    );
    expect(navForRole("client")).toEqual([]);
    expect(navGroupsForRole("client")).toEqual([]);
  });

  it("keeps group membership as the rail source of truth", () => {
    expect(ROLE_NAV_GROUPS.ops_admin.map((g) => g.label ?? g.id)).toEqual([
      "ops-top",
      "Queue",
      "Field",
      "Money",
      "System",
    ]);
    expect(ROLE_NAV_GROUPS.super_admin.map((g) => g.label ?? g.id)).toEqual([
      "admin-top",
      "People",
      "Catalog",
      "Money",
      "System",
    ]);
    expect(ROLE_NAV_GROUPS.supplier.map((g) => g.label ?? g.id)).toEqual([
      "supplier-top",
      "Shop",
      "Money",
    ]);

    expect(ROLE_NAV_GROUPS.ops_admin[0]?.label).toBeUndefined();
    expect(ROLE_NAV_GROUPS.ops_admin[0]?.items.map((n) => n.href)).toEqual([
      "/ops/overview",
      "/ops/chat",
      "/ops/issue-reports",
    ]);
    expect(
      ROLE_NAV_GROUPS.ops_admin
        .find((g) => g.id === "ops-queue")
        ?.items.map((n) => n.href),
    ).toEqual(["/ops/orders", "/ops/approvals"]);
    expect(
      ROLE_NAV_GROUPS.ops_admin
        .find((g) => g.id === "ops-field")
        ?.items.map((n) => n.href),
    ).toEqual(["/ops/dispatch", "/ops/riders", "/ops/rankings", "/ops/escalations", "/ops/schedule"]);
    expect(
      ROLE_NAV_GROUPS.ops_admin
        .find((g) => g.id === "ops-money")
        ?.items.map((n) => n.href),
    ).toEqual(["/ops/payouts", "/ops/claims", "/ops/recovery"]);
    expect(
      ROLE_NAV_GROUPS.ops_admin
        .find((g) => g.id === "ops-system")
        ?.items.map((n) => n.href),
    ).toEqual(["/ops/settings", "/ops/audit"]);

    expect(
      ROLE_NAV_GROUPS.super_admin
        .find((g) => g.id === "admin-top")
        ?.items.map((n) => n.href),
    ).toEqual(["/admin/overview", "/admin/chat", "/admin/issue-reports", "/admin/riders"]);
    expect(
      ROLE_NAV_GROUPS.super_admin
        .find((g) => g.id === "admin-people")
        ?.items.map((n) => n.href),
    ).toEqual(["/admin/verification", "/admin/roles"]);
    expect(
      ROLE_NAV_GROUPS.super_admin
        .find((g) => g.id === "admin-catalog")
        ?.items.map((n) => n.href),
    ).toEqual(["/admin/catalogue", "/admin/zones"]);
    expect(
      ROLE_NAV_GROUPS.super_admin
        .find((g) => g.id === "admin-money")
        ?.items.map((n) => n.href),
    ).toEqual(["/admin/finance"]);
    expect(
      ROLE_NAV_GROUPS.super_admin
        .find((g) => g.id === "admin-system")
        ?.items.map((n) => n.href),
    ).toEqual(["/admin/settings", "/admin/audit", "/admin/planning", "/admin/broadcast"]);

    expect(
      ROLE_NAV_GROUPS.supplier
        .find((g) => g.id === "supplier-shop")
        ?.items.map((n) => n.href),
    ).toEqual(["/supplier/catalogue", "/supplier/schedule", "/supplier/capacity"]);
    expect(
      ROLE_NAV_GROUPS.supplier
        .find((g) => g.id === "supplier-money")
        ?.items.map((n) => n.href),
    ).toEqual(["/supplier/payouts", "/supplier/payout-account"]);

    const grouped = Object.values(ROLE_NAV_GROUPS).flatMap((groups) =>
      groups.flatMap((group) => group.items.map((item) => item.href)),
    );
    const flat = Object.values(ROLE_NAV).flatMap((items) =>
      items.map((item) => item.href),
    );
    expect(grouped).toEqual(flat);
    expect(new Set(flat).size).toBe(flat.length);
  });
});

describe("nav helpers", () => {
  it("resolves nested job and QA titles", () => {
    expect(contextTitleForPath("/supplier/jobs/ord_1", "supplier")).toBe(
      "Order workspace",
    );
    expect(contextTitleForPath("/ops/orders/ord_1", "ops_admin")).toBe("Order workspace");
    expect(contextTitleForPath("/admin/orders/ord_1", "super_admin")).toBe(
      "Order workspace",
    );
    expect(contextTitleForPath("/admin/escalations", "super_admin")).toBe(
      "Pickup escalations",
    );
    expect(contextTitleForPath("/admin/zones", "super_admin")).toBe("Delivery zones");
    expect(contextTitleForPath("/admin/catalogue/jobs/new", "super_admin")).toBe(
      "Add print job",
    );
    expect(contextTitleForPath("/admin/catalogue/jobs/flyers", "super_admin")).toBe(
      "Print job",
    );
    expect(contextTitleForPath("/admin/catalogue/categories/new", "super_admin")).toBe(
      "Add category",
    );
    expect(
      contextTitleForPath(
        "/admin/catalogue/categories/marketing_collateral",
        "super_admin",
      ),
    ).toBe("Category");
  });

  it("finds the longest matching nav item", () => {
    const item = navItemForPath("/ops/orders/ord_1", "ops_admin");
    expect(item?.href).toBe("/ops/orders");
  });
});
