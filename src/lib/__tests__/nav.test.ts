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
  it("gives every page in a rail its own icon", () => {
    for (const items of Object.values(ROLE_NAV)) {
      const icons = items.map((item) => item.icon);
      expect(new Set(icons).size).toBe(icons.length);
    }
    const products = ROLE_NAV.super_admin.find(
      (item) => item.href === "/admin/supplier-products",
    );
    const catalogue = ROLE_NAV.super_admin.find(
      (item) => item.href === "/admin/catalogue",
    );
    expect(products?.icon).not.toBe(catalogue?.icon);
  });

  it("covers the full supplier surface", () => {
    const hrefs = ROLE_NAV.supplier.map((n) => n.href);
    expect(hrefs).toEqual([
      "/supplier/dashboard",
      "/supplier/jobs",
      "/supplier/chat",
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
      "/ops/listing-reviews",
      "/ops/dispatch",
      "/ops/riders",
      "/ops/rankings",
      "/ops/late-production",
      "/ops/shop-changes",
      "/ops/escalations",
      "/ops/schedule",
      "/ops/payouts",
      "/ops/refunds",
      "/ops/organizations",
      "/ops/claims",
      "/ops/recovery",
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
      "/admin/supplier-products",
      "/admin/catalogue",
      "/admin/listing-reviews",
      "/admin/zones",
      "/admin/finance",
      "/admin/refunds",
      "/admin/organizations",
      "/admin/late-production",
      "/admin/shop-changes",
      "/admin/settings",
      "/admin/audit",
      "/admin/planning",
      "/admin/season-windows",
      "/admin/tracker",
      "/admin/file-retention",
      "/admin/broadcast",
    ]);
  });

  it("keeps File retention off the Operations and supplier rails", () => {
    for (const role of ["ops_admin", "supplier"] as const) {
      expect(ROLE_NAV[role].some((n) => n.href.includes("file-retention"))).toBe(false);
    }
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
      "/admin/file-retention",
      "/admin/finance",
      "/admin/issue-reports",
      "/admin/late-production",
      "/admin/listing-reviews",
      "/admin/organizations",
      "/admin/overview",
      "/admin/planning",
      "/admin/refunds",
      "/admin/riders",
      "/admin/roles",
      "/admin/season-windows",
      "/admin/settings",
      "/admin/shop-changes",
      "/admin/supplier-products",
      "/admin/tracker",
      "/admin/verification",
      "/admin/zones",
      "/ops/approvals",
      "/ops/chat",
      "/ops/claims",
      "/ops/dispatch",
      "/ops/escalations",
      "/ops/issue-reports",
      "/ops/late-production",
      "/ops/listing-reviews",
      "/ops/orders",
      "/ops/organizations",
      "/ops/overview",
      "/ops/payouts",
      "/ops/rankings",
      "/ops/recovery",
      "/ops/refunds",
      "/ops/riders",
      "/ops/schedule",
      "/ops/shop-changes",
      "/supplier/capacity",
      "/supplier/catalogue",
      "/supplier/chat",
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
    ).toEqual(["/ops/orders", "/ops/approvals", "/ops/listing-reviews"]);
    expect(
      ROLE_NAV_GROUPS.ops_admin
        .find((g) => g.id === "ops-field")
        ?.items.map((n) => n.href),
    ).toEqual([
      "/ops/dispatch",
      "/ops/riders",
      "/ops/rankings",
      "/ops/late-production",
      "/ops/shop-changes",
      "/ops/escalations",
      "/ops/schedule",
    ]);
    expect(
      ROLE_NAV_GROUPS.ops_admin
        .find((g) => g.id === "ops-money")
        ?.items.map((n) => n.href),
    ).toEqual([
      "/ops/payouts",
      "/ops/refunds",
      "/ops/organizations",
      "/ops/claims",
      "/ops/recovery",
    ]);

    expect(
      ROLE_NAV_GROUPS.super_admin
        .find((g) => g.id === "admin-top")
        ?.items.map((n) => n.href),
    ).toEqual([
      "/admin/overview",
      "/admin/chat",
      "/admin/issue-reports",
      "/admin/riders",
    ]);
    expect(
      ROLE_NAV_GROUPS.super_admin
        .find((g) => g.id === "admin-people")
        ?.items.map((n) => n.href),
    ).toEqual(["/admin/verification", "/admin/roles", "/admin/supplier-products"]);
    expect(
      ROLE_NAV_GROUPS.super_admin
        .find((g) => g.id === "admin-catalog")
        ?.items.map((n) => n.href),
    ).toEqual(["/admin/catalogue", "/admin/listing-reviews", "/admin/zones"]);
    expect(
      ROLE_NAV_GROUPS.super_admin
        .find((g) => g.id === "admin-money")
        ?.items.map((n) => n.href),
    ).toEqual([
      "/admin/finance",
      "/admin/refunds",
      "/admin/organizations",
      "/admin/late-production",
      "/admin/shop-changes",
    ]);
    expect(
      ROLE_NAV_GROUPS.super_admin
        .find((g) => g.id === "admin-system")
        ?.items.map((n) => n.href),
    ).toEqual([
      "/admin/settings",
      "/admin/audit",
      "/admin/planning",
      "/admin/season-windows",
      "/admin/tracker",
      "/admin/file-retention",
      "/admin/broadcast",
    ]);

    expect(
      ROLE_NAV_GROUPS.supplier
        .find((g) => g.id === "supplier-top")
        ?.items.map((n) => n.href),
    ).toEqual(["/supplier/dashboard", "/supplier/jobs", "/supplier/chat"]);
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

describe("Operational settings and audit", () => {
  it("keeps both on the Super Admin menu only", () => {
    const admin = navForRole("super_admin");
    expect(admin.find((n) => n.href === "/admin/settings")).toMatchObject({
      label: "Operational settings",
      ready: true,
    });
    expect(admin.find((n) => n.href === "/admin/audit")).toMatchObject({
      label: "Audit",
      ready: true,
    });
    const system = navGroupsForRole("super_admin").find((g) => g.id === "admin-system");
    expect(system?.items.map((n) => n.href)).toEqual(
      expect.arrayContaining(["/admin/settings", "/admin/audit"]),
    );

    for (const role of ["ops_admin", "supplier", "client", "rider"] as const) {
      const hrefs = navForRole(role).map((n) => n.href);
      expect(
        hrefs.some((href) => href.endsWith("/settings") || href.endsWith("/audit")),
      ).toBe(false);
    }
    expect(contextTitleForPath("/ops/settings", "ops_admin")).toBe("Super Admin only");
    expect(contextTitleForPath("/ops/audit", "ops_admin")).toBe("Super Admin only");
    expect(contextTitleForPath("/admin/settings", "super_admin")).toBe(
      "Operational settings",
    );
    expect(contextTitleForPath("/admin/audit", "super_admin")).toBe("Audit log");
  });
});

describe("Tracker visibility", () => {
  it("shows the Tracker to Super Admin only, under Platform › System, counting decisions", () => {
    const tracker = navForRole("super_admin").find((n) => n.href === "/admin/tracker");
    expect(tracker).toMatchObject({
      label: "Tracker",
      ready: true,
      count: "tracker-needs-decision",
    });
    const system = navGroupsForRole("super_admin").find((g) => g.id === "admin-system");
    expect(system?.section).toBe("Platform");
    expect(system?.items.some((n) => n.href === "/admin/tracker")).toBe(true);

    for (const role of ["ops_admin", "supplier", "client", "rider"] as const) {
      expect(navForRole(role).some((n) => n.href.includes("tracker"))).toBe(false);
      expect(navItemForPath("/admin/tracker", role)).toBeNull();
    }
    expect(contextTitleForPath("/admin/tracker", "super_admin")).toBe("Tracker");
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
    expect(contextTitleForPath("/admin/supplier-products", "super_admin")).toBe(
      "Supplier products",
    );
    expect(
      contextTitleForPath("/admin/supplier-products/sci_sticker", "super_admin"),
    ).toBe("Supplier product");
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
