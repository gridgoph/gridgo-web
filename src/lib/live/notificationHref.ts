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

  if (
    (type === "listing_suspended" || type === "listing_restored") &&
    role === "supplier"
  ) {
    return notification.catalogItemId
      ? `/supplier/catalogue/${encodeURIComponent(notification.catalogItemId)}`
      : "/supplier/catalogue";
  }

  // Listing review (gridgo-api#154). The notice names no listing, so staff
  // land on the desk and the shop on its board, where the standing shows.
  if (type === "catalog_review_pending" || type === "catalog_review_decided") {
    if (role === "super_admin") return "/admin/listing-reviews";
    if (role === "ops_admin") return "/ops/listing-reviews";
    if (role === "supplier") {
      return notification.catalogItemId
        ? `/supplier/catalogue/${encodeURIComponent(notification.catalogItemId)}`
        : "/supplier/catalogue";
    }
    return null;
  }

  if (isSupplierServiceDecision(type) && role === "supplier") {
    return "/supplier/catalogue";
  }

  if (isServiceReview(type)) {
    if (role === "super_admin") return "/admin/verification?tab=services";
    if (role === "ops_admin") return "/ops/service-lines";
  }

  // Organization reminders and Operations' own notices name the account.
  if (
    notification.organizationUserId &&
    (role === "super_admin" || role === "ops_admin")
  ) {
    const tree = role === "super_admin" ? "admin" : "ops";
    return `/${tree}/organizations/${encodeURIComponent(notification.organizationUserId)}`;
  }

  // A permit request is a decision on the business application.
  if (type === "client_application_document_requested") {
    if (role === "super_admin") return "/admin/verification";
    return null;
  }

  // Unclaimed pick-ups and paid redelivery requests are worked on the hub desk.
  if (isHub(type)) {
    if (role === "super_admin") return "/admin/hub";
    if (role === "ops_admin") return "/ops/hub";
  }

  // Staff invites and profile changes: Super Admin manages them.
  if (type.startsWith("staff_")) {
    if (role === "super_admin") return "/admin/staff";
    if (role === "ops_admin") return "/ops/overview";
    return null;
  }

  if (isSignup(notification)) {
    if (role === "super_admin") return "/admin/verification";
    return null;
  }

  // A pickup escalation opens its order, where the counter check shows the
  // count, the six checks, the photos and the Resolve action together. Only
  // a notice without an order falls back to the escalations queue.
  if (isEscalation(type)) {
    if (notification.orderId) {
      if (role === "super_admin") return `/admin/orders/${notification.orderId}`;
      if (role === "ops_admin") return `/ops/orders/${notification.orderId}`;
    }
    if (role === "super_admin") return "/admin/escalations";
    if (role === "ops_admin") return "/ops/escalations";
  }

  if (isRoleEvent(type)) {
    if (role === "super_admin") return "/admin/roles";
    if (role === "ops_admin") return "/ops/overview";
    if (role === "supplier") return "/supplier/dashboard";
    return null;
  }

  // Client refund notices name the order, not the request, so staff land on
  // the refund inbox with that order and it opens the request. The shop's copy
  // falls through to its job, where the settled payout shows. A shop
  // settlement payout notice is money for Operations: it goes to the refund
  // too, where that payout is recorded.
  if (isRefund(type) && notification.orderId) {
    const order = encodeURIComponent(notification.orderId);
    if (role === "super_admin") return `/admin/refunds?order=${order}`;
    if (role === "ops_admin") return `/ops/refunds?order=${order}`;
  }

  if (type.includes("credit") && role === "super_admin") {
    return "/admin/overview";
  }

  if (type === "account_deletion_requested" || type === "account_deletion_request_completed") {
    return role === "super_admin" ? "/admin/account-deletion" : role === "ops_admin" ? "/ops/account-deletion" : null;
  }

  if (type === "ops_issue_report_filed") {
    if (role === "super_admin") return "/admin/issue-reports";
    if (role === "ops_admin") return "/ops/issue-reports";
    return null;
  }

  if (type === "ops_support_message") {
    if (role === "super_admin") return "/admin/chat";
    if (role === "ops_admin") return "/ops/chat";
    return null;
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

function isHub(type: string): boolean {
  return (
    type.startsWith("hub_") ||
    type.startsWith("ops_hub_") ||
    type === "handover_escalated"
  );
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

function isRefund(type: string): boolean {
  return type.startsWith("refund_");
}
