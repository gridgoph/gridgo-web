import type { Notification, Role } from "@/lib/api/types";

/**
 * Where the inbox row should land.
 *
 * Super Admin stays inside `/admin` — RoleGate bounces `/ops/*` — so order,
 * escalation, and other operational slips have admin counterparts. Operations
 * keeps its existing `/ops/orders/:id` (and related) links.
 *
 * Unknown `ops_*` / `privileged_*` types still open a screen that role may use,
 * so a new API event is never a dead click while the portal catches up.
 */
export function notificationHref(role: Role, notification: Notification): string | null {
  const type = notification.type ?? "";

  if (isSupplierServiceDecision(type) && role === "supplier") {
    return "/supplier/catalogue";
  }

  if (isServiceReview(type)) {
    if (role === "super_admin") return "/admin/verification?tab=services";
    if (role === "ops_admin") return "/ops/approvals?tab=services";
  }

  if (isSignup(notification)) {
    if (role === "super_admin") return "/admin/verification";
    if (role === "ops_admin") return "/ops/approvals";
    return null;
  }

  if (isEscalation(type)) {
    if (role === "super_admin") return "/admin/escalations";
    if (role === "ops_admin") return "/ops/escalations";
  }

  if (isRoleEvent(type)) {
    if (role === "super_admin") return "/admin/roles";
    if (role === "ops_admin") return "/ops/overview";
    if (role === "supplier") return "/supplier/dashboard";
    return null;
  }

  if (type.includes("credit") && role === "super_admin") {
    return "/admin/overview";
  }

  // Money lands on the payout desk, where the release control is; the order
  // workspace is one link away from there. Super Admin has no payout tree, so
  // its copy still opens the order.
  if (notification.orderId && isPayout(type) && role === "ops_admin") {
    return `/ops/payouts/${notification.orderId}`;
  }

  if (notification.orderId) {
    if (role === "supplier") return `/supplier/jobs/${notification.orderId}`;
    if (role === "ops_admin") return `/ops/orders/${notification.orderId}`;
    if (role === "super_admin") return `/admin/orders/${notification.orderId}`;
    return null;
  }

  if (type.startsWith("ops_") || type.startsWith("privileged_")) {
    if (role === "ops_admin") return "/ops/overview";
    if (role === "super_admin") return "/admin/overview";
  }

  return null;
}

function isPayout(type: string): boolean {
  return type.includes("payout");
}

function isSignup(notification: Notification): boolean {
  const type = notification.type ?? "";
  return (
    Boolean(notification.approvalCaseId) ||
    type === "ops_signup_submitted" ||
    type.startsWith("approval_") ||
    type.includes("signup")
  );
}

function isServiceReview(type: string): boolean {
  return (
    type === "ops_service_submitted" ||
    type.startsWith("ops_service") ||
    type === "supplier_service_decision" ||
    type === "service_verified" ||
    type === "service_suspended"
  );
}

function isSupplierServiceDecision(type: string): boolean {
  return (
    type === "supplier_service_decision" ||
    type === "service_verified" ||
    type === "service_suspended"
  );
}

function isEscalation(type: string): boolean {
  return (
    type === "pickup_check_escalation" ||
    type === "pickup_escalation_resolved" ||
    type.includes("escalation")
  );
}

function isRoleEvent(type: string): boolean {
  return (
    type === "privileged_role_changed" ||
    type === "role_changed" ||
    type.startsWith("privileged_role")
  );
}
