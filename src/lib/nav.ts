/**
 * Single source of truth for portal primary navigation.
 *
 * Group membership lives here (`ROLE_NAV_GROUPS`). AppShell renders
 * `navGroupsForRole(role)` only. Middleware + RoleGate still enforce
 * role path isolation — this list never grants cross-role access.
 *
 * `ROLE_NAV` is the flattened item list (titles, Coming Next, tests).
 * Do not maintain a second nav array in the shell.
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
  | "dashboard"
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
  | "riders"
  | "escalations"
  | "claims"
  | "settings"
  | "audit"
  | "verification"
  | "roles"
  | "zones"
  | "credits"
  | "finance"
  | "planning"
  | "broadcast";

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

/**
 * One rail section. A missing `label` is a top-level cluster (Overview / Jobs).
 * Labeled groups are always open: quiet static label + items, no per-group collapse.
 */
export type NavGroup = {
  id: string;
  label?: string;
  items: readonly NavItem[];
};

export const ROLE_NAV_GROUPS: Record<PortalRole, readonly NavGroup[]> = {
  supplier: [
    {
      id: "supplier-top",
      items: [
        {
          id: "supplier-dashboard",
          href: "/supplier/dashboard",
          label: "Dashboard",
          title: "Shop dashboard",
          icon: "dashboard",
          ready: true,
          placeholderBody: "",
        },
        {
          id: "supplier-jobs",
          href: "/supplier/jobs",
          label: "Jobs",
          title: "Assigned jobs",
          icon: "jobs",
          ready: true,
          placeholderBody: "",
        },
      ],
    },
    {
      id: "supplier-shop",
      label: "Shop",
      items: [
        {
          id: "supplier-catalogue",
          href: "/supplier/catalogue",
          label: "Catalogues",
          title: "Catalogues",
          icon: "catalogue",
          ready: true,
          placeholderBody:
            "The shop board: listings clients pick from. Hunt, filter, and open a listing page. Uses GET/POST /me/catalog-items.",
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
      ],
    },
    {
      id: "supplier-money",
      label: "Money",
      items: [
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
        {
          id: "supplier-payout-account",
          href: "/supplier/payout-account",
          label: "Where you get paid",
          title: "Where you get paid",
          icon: "payments",
          ready: true,
          placeholderBody:
            "The receiving QR and account Operations pays your jobs to. getMyPayoutAccount / updateMyPayoutAccount / uploadPayoutQr.",
        },
      ],
    },
  ],

  ops_admin: [
    {
      id: "ops-top",
      items: [
        {
          id: "ops-overview",
          href: "/ops/overview",
          label: "Overview",
          title: "Operations overview",
          icon: "overview",
          ready: true,
          placeholderBody: "",
        },
      ],
    },
    {
      id: "ops-queue",
      label: "Queue",
      items: [
        {
          // One queue. Payments and QA were the same order at two moments of the
          // same job, and matching is gone -- GRIDGO chooses the press.
          id: "ops-orders",
          href: "/ops/orders",
          label: "Orders",
          title: "Orders",
          icon: "qa",
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
      ],
    },
    {
      id: "ops-field",
      label: "Field",
      items: [
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
          id: "ops-riders",
          href: "/ops/riders",
          label: "Riders",
          title: "Rider locations",
          icon: "riders",
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
          id: "ops-schedule",
          href: "/ops/schedule",
          label: "Schedule",
          title: "Schedule",
          icon: "schedule",
          ready: true,
          placeholderBody: "",
        },
      ],
    },
    {
      id: "ops-money",
      label: "Money",
      items: [
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
      ],
    },
    {
      id: "ops-system",
      label: "System",
      items: [
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
    },
  ],

  super_admin: [
    {
      id: "admin-top",
      items: [
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
          id: "admin-riders",
          href: "/admin/riders",
          label: "Riders",
          title: "Rider locations",
          icon: "riders",
          ready: true,
          placeholderBody: "",
        },
      ],
    },
    {
      id: "admin-people",
      label: "People",
      items: [
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
      ],
    },
    {
      id: "admin-catalog",
      label: "Catalog",
      items: [
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
      ],
    },
    {
      id: "admin-money",
      label: "Money",
      items: [
        {
          id: "admin-finance",
          href: "/admin/finance",
          label: "Finance",
          title: "Finance",
          icon: "finance",
          ready: true,
          placeholderBody: "",
        },
      ],
    },
    {
      id: "admin-system",
      label: "System",
      items: [
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
        // Last on purpose. This is the one control here that reaches outside the
        // platform onto people's phones, and it cannot be undone — it should take
        // a deliberate trip down the rail, not sit under the cursor.
        {
          id: "admin-broadcast",
          href: "/admin/broadcast",
          label: "Broadcast",
          title: "Push broadcast",
          icon: "broadcast",
          ready: true,
          placeholderBody: "",
        },
      ],
    },
  ],
};

function flattenNavGroups(groups: readonly NavGroup[]): readonly NavItem[] {
  return groups.flatMap((group) => group.items);
}

/** Flat item list derived from `ROLE_NAV_GROUPS` — titles, helpers, tests. */
export const ROLE_NAV: Record<PortalRole, readonly NavItem[]> = {
  supplier: flattenNavGroups(ROLE_NAV_GROUPS.supplier),
  ops_admin: flattenNavGroups(ROLE_NAV_GROUPS.ops_admin),
  super_admin: flattenNavGroups(ROLE_NAV_GROUPS.super_admin),
};

export function isPortalRole(role: Role | string): role is PortalRole {
  return role === "supplier" || role === "ops_admin" || role === "super_admin";
}

export function navGroupsForRole(role: Role | string): readonly NavGroup[] {
  if (!isPortalRole(role)) return [];
  return ROLE_NAV_GROUPS[role];
}

export function navForRole(role: Role | string): readonly NavItem[] {
  return flattenNavGroups(navGroupsForRole(role));
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
  if (pathname === "/supplier/catalogue/new") return "New listing";
  if (pathname.startsWith("/supplier/catalogue/")) return "Listing";
  if (pathname === "/admin/catalogue/jobs/new") return "Add print job";
  if (pathname.startsWith("/admin/catalogue/jobs/")) return "Print job";
  if (pathname === "/admin/catalogue/categories/new") return "Add category";
  if (pathname.startsWith("/admin/catalogue/categories/")) return "Category";
  if (pathname.startsWith("/ops/orders/")) return "Order workspace";
  if (pathname.startsWith("/ops/payouts/")) return "Payout review";
  if (pathname.startsWith("/admin/orders/")) return "Order workspace";
  if (pathname === "/admin/escalations" || pathname.startsWith("/admin/escalations/")) {
    return "Pickup escalations";
  }

  const item = navItemForPath(pathname, role);
  if (item) return item.title;
  return "GRIDGO";
}
