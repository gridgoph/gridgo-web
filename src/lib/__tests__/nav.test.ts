import { describe, expect, it } from "vitest";

import {
  contextTitleForPath,
  navForRole,
  navItemForPath,
  ROLE_NAV,
} from "@/lib/nav";

describe("ROLE_NAV", () => {
  it("covers the full supplier surface", () => {
    const hrefs = ROLE_NAV.supplier.map((n) => n.href);
    expect(hrefs).toEqual([
      "/supplier/jobs",
      "/supplier/catalogue",
      "/supplier/schedule",
      "/supplier/capacity",
      "/supplier/payouts",
    ]);
  });

  it("covers the full operations surface", () => {
    const hrefs = ROLE_NAV.ops_admin.map((n) => n.href);
    expect(hrefs).toEqual([
      "/ops/overview",
      "/ops/qa",
      "/ops/payments",
      "/ops/matching",
      "/ops/approvals",
      "/ops/dispatch",
      "/ops/escalations",
      "/ops/payouts",
      "/ops/claims",
      "/ops/recovery",
      "/ops/schedule",
      "/ops/settings",
      "/ops/audit",
    ]);
  });

  it("covers the full super-admin surface", () => {
    const hrefs = ROLE_NAV.super_admin.map((n) => n.href);
    expect(hrefs).toEqual([
      "/admin/overview",
      "/admin/verification",
      "/admin/roles",
      "/admin/catalogue",
      "/admin/zones",
      "/admin/settings",
      "/admin/credits",
      "/admin/finance",
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
      "/admin/credits",
      "/admin/finance",
      "/admin/overview",
      "/admin/planning",
      "/admin/roles",
      "/admin/settings",
      "/admin/verification",
      "/admin/zones",
      "/ops/approvals",
      "/ops/audit",
      "/ops/claims",
      "/ops/dispatch",
      "/ops/escalations",
      "/ops/matching",
      "/ops/overview",
      "/ops/payments",
      "/ops/payouts",
      "/ops/qa",
      "/ops/recovery",
      "/ops/schedule",
      "/ops/settings",
      "/supplier/capacity",
      "/supplier/catalogue",
      "/supplier/jobs",
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
  });
});

describe("nav helpers", () => {
  it("resolves nested job and QA titles", () => {
    expect(contextTitleForPath("/supplier/jobs/ord_1", "supplier")).toBe(
      "Order workspace",
    );
    expect(contextTitleForPath("/ops/qa/ord_1", "ops_admin")).toBe(
      "QA workspace",
    );
    expect(contextTitleForPath("/admin/zones", "super_admin")).toBe(
      "Delivery zones",
    );
    expect(contextTitleForPath("/ops/payments/ord_1", "ops_admin")).toBe(
      "Payment review",
    );
  });

  it("finds the longest matching nav item", () => {
    const item = navItemForPath("/ops/qa/ord_1", "ops_admin");
    expect(item?.href).toBe("/ops/qa");
  });
});
