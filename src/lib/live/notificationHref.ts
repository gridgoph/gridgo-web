import type { Notification, Role } from "@/lib/api/types";

/**
 * Where the inbox row should land. Super Admin stays inside /admin — RoleGate
 * will bounce /ops/orders/:id — so order rows have no admin destination.
 */
export function notificationHref(
  role: Role,
  notification: Notification,
): string | null {
  const type = notification.type ?? "";
  const approval =
    Boolean(notification.approvalCaseId) ||
    type === "ops_signup_submitted" ||
    type.startsWith("approval_");
  if (approval) {
    if (role === "super_admin") return "/admin/verification";
    if (role === "ops_admin") return "/ops/approvals";
    return null;
  }
  if (
    (type === "pickup_check_escalation" || type === "pickup_escalation_resolved") &&
    role === "ops_admin"
  ) {
    return "/ops/escalations";
  }
  if (!notification.orderId) return null;
  if (role === "supplier") return `/supplier/jobs/${notification.orderId}`;
  if (role === "ops_admin") return `/ops/orders/${notification.orderId}`;
  return null;
}
