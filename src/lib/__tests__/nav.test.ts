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
      "/ops/matching",
      "/ops/recovery",
      "/ops/dispatch",
      "/ops/claims",
      "/ops/schedule",
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
      "/admin/credits",
      "/admin/finance",
      "/admin/audit",
      "/admin/planning",
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
      "/admin/catalogue",
      "/admin/credits",
      "/admin/finance",
      "/admin/overview",
      "/admin/planning",
      "/admin/roles",
      "/admin/verification",
      "/admin/zones",
      "/ops/qa",
      "/supplier/jobs",
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
      "Zones & fees",
    );
  });

  it("finds the longest matching nav item", () => {
    const item = navItemForPath("/ops/qa/ord_1", "ops_admin");
    expect(item?.href).toBe("/ops/qa");
  });
});
