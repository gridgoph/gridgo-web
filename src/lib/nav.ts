/**
 * Single source of truth for portal primary navigation.
 *
 * AppShell renders ROLE_NAV[role] only. Middleware + RoleGate still enforce
 * role path isolation — this list never grants cross-role access.
 *
 * When `ready` is false, the route must serve a Coming Next placeholder so
 * the rail never 404s. Parallel page workers flip `ready` to true when the
 * real screen lands (or leave it false until then — the placeholder stays).
 */

import type { Role } from "@/lib/api/types";

/** Portal roles that have a signed-in surface in this app. */
export type PortalRole = Extract<Role, "supplier" | "ops_admin" | "super_admin">;

/**
 * Stable icon keys — mapped to Lucide components only in AppShell so this
 * module stays free of React for tests.
 */
export type NavIconKey =
  | "jobs"
  | "catalogue"
  | "schedule"
  | "capacity"
  | "payouts"
  | "overview"
  | "qa"
  | "payments"
  | "approvals"
  | "matching"
  | "recovery"
  | "dispatch"
  | "escalations"
  | "claims"
  | "settings"
  | "audit"
  | "verification"
  | "roles"
  | "zones"
  | "credits"
  | "finance"
  | "planning";

export type NavItem = {
  /** Stable id for tests / analytics. */
  id: string;
  href: string;
  /** Short rail label. */
  label: string;
  /** Page heading (header + placeholder title). */
  title: string;
  /** Icon key rendered by AppShell. */
  icon: NavIconKey;
  /**
   * When false, the route is a Coming Next placeholder.
   * Real screens set this true (or leave false until implemented).
   */
  ready: boolean;
  /** Placeholder body — what the screen will do and which client helpers to use. */
  placeholderBody: string;
};

export const ROLE_NAV: Record<PortalRole, readonly NavItem[]> = {
  supplier: [
    {
      id: "supplier-jobs",
      href: "/supplier/jobs",
      label: "Jobs",
      title: "Assigned jobs",
      icon: "jobs",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "supplier-catalogue",
      href: "/supplier/catalogue",
      label: "Service catalogue",
      title: "Service catalogue",
      icon: "catalogue",
      ready: true,
      placeholderBody:
        "Manage taxonomy-backed services through draft → verification → live. Use listSupplierServices, createSupplierService, submitSupplierService, withdrawSupplierService, and getTaxonomy.",
    },
    {
      id: "supplier-schedule",
      href: "/supplier/schedule",
      label: "Schedule",
      title: "Schedule",
      icon: "schedule",
      ready: true,
      placeholderBody:
        "Show promised dates and capacity commitments for accepted jobs. Built on listJobs / getOrder — no separate schedule endpoint.",
    },
    {
      id: "supplier-capacity",
      href: "/supplier/capacity",
      label: "Capacity",
      title: "Capacity",
      icon: "capacity",
      ready: true,
      placeholderBody:
        "Edit daily/weekly capacity and turnaround on live service lines via updateSupplierService. Capability expansion re-enters verification.",
    },
    {
      id: "supplier-payouts",
      href: "/supplier/payouts",
      label: "Payouts",
      title: "Payouts",
      icon: "payouts",
      ready: true,
      placeholderBody:
        "Track completed jobs and payout holds. Use listJobs with payoutHold on Order, plus listClaims / listIssues scoped to your orders. Active holds block payout_released.",
    },
  ],

  ops_admin: [
    {
      id: "ops-overview",
      href: "/ops/overview",
      label: "Overview",
      title: "Operations overview",
      icon: "overview",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "ops-qa",
      href: "/ops/qa",
      label: "QA queue",
      title: "QA queue",
      icon: "qa",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "ops-payments",
      href: "/ops/payments",
      label: "Payments",
      title: "Payment confirmations",
      icon: "payments",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "ops-matching",
      href: "/ops/matching",
      label: "Matching",
      title: "Supplier matching",
      icon: "matching",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "ops-approvals",
      href: "/ops/approvals",
      label: "Sign-up approvals",
      title: "Sign-up approvals",
      icon: "approvals",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "ops-dispatch",
      href: "/ops/dispatch",
      label: "Dispatch",
      title: "Dispatch",
      icon: "dispatch",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "ops-escalations",
      href: "/ops/escalations",
      label: "Escalations",
      title: "Pickup escalations",
      icon: "escalations",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "ops-payouts",
      href: "/ops/payouts",
      label: "Supplier payouts",
      title: "Supplier payouts",
      icon: "payouts",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "ops-claims",
      href: "/ops/claims",
      label: "Claims & holds",
      title: "Claims & payout holds",
      icon: "claims",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "ops-recovery",
      href: "/ops/recovery",
      label: "Recovery",
      title: "Recovery",
      icon: "recovery",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "ops-schedule",
      href: "/ops/schedule",
      label: "Schedule",
      title: "Schedule",
      icon: "schedule",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "ops-settings",
      href: "/ops/settings",
      label: "Operational settings",
      title: "Operational settings",
      icon: "settings",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "ops-audit",
      href: "/ops/audit",
      label: "Audit",
      title: "Audit log",
      icon: "audit",
      ready: true,
      placeholderBody: "",
    },
  ],

  super_admin: [
    {
      id: "admin-overview",
      href: "/admin/overview",
      label: "Overview",
      title: "Platform overview",
      icon: "overview",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "admin-verification",
      href: "/admin/verification",
      label: "Accreditation",
      title: "Accreditation",
      icon: "verification",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "admin-roles",
      href: "/admin/roles",
      label: "Roles",
      title: "Roles",
      icon: "roles",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "admin-catalogue",
      href: "/admin/catalogue",
      label: "Catalogue & taxonomy",
      title: "Catalogue & taxonomy",
      icon: "catalogue",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "admin-zones",
      href: "/admin/zones",
      label: "Delivery zones",
      title: "Delivery zones",
      icon: "zones",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "admin-settings",
      href: "/admin/settings",
      label: "Operational settings",
      title: "Operational settings",
      icon: "settings",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "admin-credits",
      href: "/admin/credits",
      label: "Pilot Credits",
      title: "Pilot Credits",
      icon: "credits",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "admin-finance",
      href: "/admin/finance",
      label: "Finance",
      title: "Finance",
      icon: "finance",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "admin-audit",
      href: "/admin/audit",
      label: "Audit",
      title: "Audit log",
      icon: "audit",
      ready: true,
      placeholderBody: "",
    },
    {
      id: "admin-planning",
      href: "/admin/planning",
      label: "Planning calendar",
      title: "Planning calendar",
      icon: "planning",
      ready: true,
      placeholderBody: "",
    },
  ],
} as const;

export function isPortalRole(role: Role | string): role is PortalRole {
  return role === "supplier" || role === "ops_admin" || role === "super_admin";
}

export function navForRole(role: Role | string): readonly NavItem[] {
  if (!isPortalRole(role)) return [];
  return ROLE_NAV[role];
}

/** Best matching nav item for a pathname (longest href prefix wins). */
export function navItemForPath(
  pathname: string,
  role?: Role | string | null,
): NavItem | null {
  const pools: readonly NavItem[] = role
    ? navForRole(role)
    : Object.values(ROLE_NAV).flat();

  let best: NavItem | null = null;
  for (const item of pools) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best;
}

export function contextTitleForPath(
  pathname: string,
  role?: Role | string | null,
): string {
  // Nested workspaces that share a list parent
  if (pathname.startsWith("/supplier/jobs/")) return "Order workspace";
  if (pathname.startsWith("/ops/qa/")) return "QA workspace";
  if (pathname.startsWith("/ops/payments/")) return "Payment review";
  if (pathname.startsWith("/ops/payouts/")) return "Payout review";

  const item = navItemForPath(pathname, role);
  if (item) return item.title;
  return "GRIDGO";
}
