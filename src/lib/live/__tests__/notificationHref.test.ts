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
  it("deep-links supplier jobs and ops orders", () => {
    const row = note({ orderId: "ord_9" });
    expect(notificationHref("supplier", row)).toBe("/supplier/jobs/ord_9");
    expect(notificationHref("ops_admin", row)).toBe("/ops/orders/ord_9");
    expect(notificationHref("super_admin", row)).toBeNull();
  });

  it("sends signup rows to the role's approval surface", () => {
    const row = note({ type: "ops_signup_submitted", approvalCaseId: "case_1" });
    expect(notificationHref("ops_admin", row)).toBe("/ops/approvals");
    expect(notificationHref("super_admin", row)).toBe("/admin/verification");
    expect(notificationHref("supplier", row)).toBeNull();
  });
});

it("opens the authorized service review queue from its action alert", () => {
  expect(notificationHref("ops_admin", note({type:"ops_service_submitted"}))).toBe("/ops/approvals?tab=services");
  expect(notificationHref("super_admin", note({type:"ops_service_submitted"}))).toBe("/admin/verification?tab=services");
  expect(notificationHref("supplier", note({type:"service_verified"}))).toBe("/supplier/catalogue");
});
