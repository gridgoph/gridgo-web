import { describe, expect, it } from "vitest";

import type { Notification } from "@/lib/api/types";
import { notificationHref } from "@/lib/live/notificationHref";

function note(partial: Partial<Notification>): Notification {
  return {
    id: "ntf_1",
    userId: "user_1",
    title: "Hello",
    body: "Body",
    read: false,
    at: "2026-09-03T00:00:00.000Z",
    ...partial,
  };
}

describe("notificationHref", () => {
  it("deep-links supplier jobs and ops/admin orders", () => {
    const row = note({ orderId: "ord_9" });
    expect(notificationHref("supplier", row)).toBe("/supplier/jobs/ord_9");
    expect(notificationHref("ops_admin", row)).toBe("/ops/orders/ord_9");
    expect(notificationHref("super_admin", row)).toBe("/admin/orders/ord_9");
  });

  it("opens the order workspace from an Operations progress ping", () => {
    const row = note({ type: "ops_order_progress", orderId: "ord_9" });
    expect(notificationHref("ops_admin", row)).toBe("/ops/orders/ord_9");
    expect(notificationHref("super_admin", row)).toBe("/admin/orders/ord_9");
  });

  it("sends signup rows to the role's approval surface", () => {
    const row = note({ type: "ops_signup_submitted", approvalCaseId: "case_1" });
    expect(notificationHref("ops_admin", row)).toBe("/ops/approvals");
    expect(notificationHref("super_admin", row)).toBe("/admin/verification");
    expect(notificationHref("supplier", row)).toBeNull();
  });

  it("opens the authorized service review queue from its action alert", () => {
    const submitted = note({ type: "ops_service_submitted" });
    expect(notificationHref("ops_admin", submitted)).toBe("/ops/approvals?tab=services");
    expect(notificationHref("super_admin", submitted)).toBe(
      "/admin/verification?tab=services",
    );
    expect(notificationHref("supplier", note({ type: "service_verified" }))).toBe(
      "/supplier/catalogue",
    );
  });

  it("opens pickup escalations on a screen that role may use", () => {
    const row = note({ type: "pickup_check_escalation", orderId: "ord_9" });
    expect(notificationHref("ops_admin", row)).toBe("/ops/escalations");
    expect(notificationHref("super_admin", row)).toBe("/admin/escalations");
    expect(notificationHref("supplier", row)).toBe("/supplier/jobs/ord_9");
  });

  it("opens role events on the Super Admin roles desk", () => {
    const privileged = note({ type: "privileged_role_changed" });
    expect(notificationHref("super_admin", privileged)).toBe("/admin/roles");
    expect(notificationHref("ops_admin", note({ type: "role_changed" }))).toBe(
      "/ops/overview",
    );
  });
});
