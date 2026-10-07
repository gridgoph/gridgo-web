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
  it("opens the taken-down listing for the shop", () => {
    expect(
      notificationHref(
        "supplier",
        note({ type: "listing_suspended", catalogItemId: "sci_sticker" }),
      ),
    ).toBe("/supplier/catalogue/sci_sticker");
  });

  it("lands a listing-review notice on each role's own desk or board", () => {
    for (const type of ["catalog_review_pending", "catalog_review_decided"]) {
      expect(notificationHref("ops_admin", note({ type }))).toBe("/ops/listing-reviews");
      expect(notificationHref("super_admin", note({ type }))).toBe("/admin/listing-reviews");
      expect(notificationHref("supplier", note({ type }))).toBe("/supplier/catalogue");
      expect(
        notificationHref("supplier", note({ type, catalogItemId: "sci_sticker" })),
      ).toBe("/supplier/catalogue/sci_sticker");
      expect(notificationHref("rider", note({ type }))).toBeNull();
    }
  });

  it("opens the restored listing for the shop, and nothing for staff", () => {
    expect(
      notificationHref(
        "supplier",
        note({ type: "listing_restored", catalogItemId: "sci_sticker" }),
      ),
    ).toBe("/supplier/catalogue/sci_sticker");
    expect(notificationHref("supplier", note({ type: "listing_restored" }))).toBe(
      "/supplier/catalogue",
    );
  });

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

  it("opens a new file check, a shop dropout and a deadline request on the order, in each tree", () => {
    for (const type of [
      "ops_job_needs_qa",
      "shop_recovery",
      "order_reschedule_requested",
      "order_reschedule_operations_required",
      "order_reschedule_refund_requested",
    ]) {
      const row = note({ type, orderId: "ord_9" });
      expect(notificationHref("ops_admin", row)).toBe("/ops/orders/ord_9");
      expect(notificationHref("super_admin", row)).toBe("/admin/orders/ord_9");
    }
  });

  it("lands payout releases on the Operations payout desk", () => {
    const row = note({ type: "ops_payout_released", orderId: "ord_9" });
    expect(notificationHref("ops_admin", row)).toBe("/ops/payouts/ord_9");
    expect(notificationHref("super_admin", row)).toBe("/admin/orders/ord_9");
    expect(
      notificationHref(
        "supplier",
        note({ type: "shop_payout_released", orderId: "ord_9" }),
      ),
    ).toBe("/supplier/jobs/ord_9");
  });

  it("opens a client refund notice on the refund inbox for that order", () => {
    for (const type of ["refund_requested", "refund_unknown", "refund_supplier_paid"]) {
      const row = note({ type, orderId: "ord_9", title: "Client refund" });
      expect(notificationHref("ops_admin", row)).toBe("/ops/refunds?order=ord_9");
      expect(notificationHref("super_admin", row)).toBe("/admin/refunds?order=ord_9");
      // The shop's copy never reaches a refund surface.
      expect(notificationHref("supplier", row)).toBe("/supplier/jobs/ord_9");
    }
  });

  it("sends signup rows to the role's approval surface", () => {
    const row = note({ type: "ops_signup_submitted", approvalCaseId: "case_1" });
    expect(notificationHref("ops_admin", row)).toBeNull();
    expect(notificationHref("super_admin", row)).toBe("/admin/verification");
    expect(notificationHref("supplier", row)).toBeNull();
  });

  it("opens the authorized service review queue from its action alert", () => {
    const submitted = note({ type: "ops_service_submitted" });
    expect(notificationHref("ops_admin", submitted)).toBe("/ops/service-lines");
    expect(notificationHref("super_admin", submitted)).toBe(
      "/admin/verification?tab=services",
    );
    expect(notificationHref("supplier", note({ type: "service_verified" }))).toBe(
      "/supplier/catalogue",
    );
  });

  it("opens a pickup escalation on its order, in the tree that role may use", () => {
    for (const type of [
      "pickup_check_escalation",
      "pickup_escalation_changed",
      "pickup_escalation_resolved",
    ]) {
      const row = note({ type, orderId: "ord_9" });
      expect(notificationHref("ops_admin", row)).toBe("/ops/orders/ord_9");
      expect(notificationHref("super_admin", row)).toBe("/admin/orders/ord_9");
      expect(notificationHref("supplier", row)).toBe("/supplier/jobs/ord_9");
    }
    const shop = note({ type: "shop_pickup_issue_changed", orderId: "ord_9" });
    expect(notificationHref("supplier", shop)).toBe("/supplier/jobs/ord_9");
  });

  it("opens an escalation without an order on the escalations queue", () => {
    const row = note({ type: "pickup_check_escalation" });
    expect(notificationHref("ops_admin", row)).toBe("/ops/escalations");
    expect(notificationHref("super_admin", row)).toBe("/admin/escalations");
  });

  it("opens a filed issue report on that role's reports desk", () => {
    const row = note({ type: "ops_issue_report_filed" });
    expect(notificationHref("ops_admin", row)).toBe("/ops/issue-reports");
    expect(notificationHref("super_admin", row)).toBe("/admin/issue-reports");
    expect(notificationHref("client", row)).toBeNull();
    expect(notificationHref("supplier", row)).toBeNull();
    expect(notificationHref("rider", row)).toBeNull();
  });

  it("opens a party support message on that role's chat desk", () => {
    const row = note({ type: "ops_support_message" });
    expect(notificationHref("ops_admin", row)).toBe("/ops/chat");
    expect(notificationHref("super_admin", row)).toBe("/admin/chat");
    expect(notificationHref("supplier", row)).toBeNull();
    expect(notificationHref("super_admin", row)).not.toMatch(/^\/ops\//);
  });

  it("opens role events on the Super Admin roles desk", () => {
    const privileged = note({ type: "privileged_role_changed" });
    expect(notificationHref("super_admin", privileged)).toBe("/admin/roles");
    expect(notificationHref("ops_admin", note({ type: "role_changed" }))).toBe(
      "/ops/overview",
    );
  });

  it("opens an organization notice or reminder on that organization, in each tree", () => {
    const reminder = note({
      type: "organization_officer_confirmation",
      organizationUserId: "user_org",
    });
    expect(notificationHref("ops_admin", reminder)).toBe("/ops/organizations/user_org");
    expect(notificationHref("super_admin", reminder)).toBe(
      "/admin/organizations/user_org",
    );
    expect(notificationHref("supplier", reminder)).toBeNull();
  });

  it("lands hub pick-up alerts on the hub desk, even with an order", () => {
    for (const type of [
      "hub_unclaimed_escalated",
      "hub_redelivery_requested",
      "handover_escalated",
    ]) {
      expect(notificationHref("ops_admin", note({ type, orderId: "ord_1" }))).toBe(
        "/ops/hub",
      );
      expect(notificationHref("super_admin", note({ type, orderId: "ord_1" }))).toBe(
        "/admin/hub",
      );
    }
  });

  it("opens staff changes on Staff for Super Admin only", () => {
    expect(notificationHref("super_admin", note({ type: "staff_invite_created" }))).toBe(
      "/admin/staff",
    );
    expect(notificationHref("ops_admin", note({ type: "staff_invite_created" }))).toBe(
      "/ops/overview",
    );
  });

  it("sends a business permit request to the approval queue", () => {
    const permit = note({ type: "client_application_document_requested" });
    expect(notificationHref("ops_admin", permit)).toBeNull();
    expect(notificationHref("super_admin", permit)).toBe("/admin/verification");
  });
});

it("opens deletion requests only in the matching staff workspace", () => {
  for (const type of [
    "account_deletion_requested",
    "account_deletion_request_completed",
  ]) {
    expect(notificationHref("ops_admin", note({ type }))).toBe("/ops/account-deletion");
    expect(notificationHref("super_admin", note({ type }))).toBe(
      "/admin/account-deletion",
    );
    expect(notificationHref("supplier", note({ type }))).toBeNull();
    expect(notificationHref("client", note({ type }))).toBeNull();
    expect(notificationHref("rider", note({ type }))).toBeNull();
  }
});
