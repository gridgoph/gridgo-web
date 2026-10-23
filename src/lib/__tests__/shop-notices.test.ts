import { describe, expect, it } from "vitest";

import { notificationHref } from "@/lib/live/notificationHref";
import { presentShopNotice } from "@/lib/shop-notices";
import type { Notification } from "@/lib/api/types";

function note(partial: Partial<Notification>): Notification {
  return {
    id: "n1",
    userId: "u1",
    title: "Platform title",
    body: "Platform body",
    read: false,
    at: "2026-10-22T00:00:00.000Z",
    ...partial,
  };
}

describe("shop notices", () => {
  it("says a client transfer is not the shop's work, and opens a support thread", () => {
    expect(presentShopNotice({ type: "refund_unknown" })?.title).toBe(
      "Client refund update",
    );
    expect(presentShopNotice({ type: "refund_unknown" })?.body).toMatch(
      /Nothing changes for your shop/,
    );
    expect(
      notificationHref("supplier", note({ type: "refund_unknown", orderId: "ord_1" })),
    ).toBeNull();
    expect(
      notificationHref(
        "supplier",
        note({ type: "support_message", threadId: "thr_1", orderId: "ord_1" }),
      ),
    ).toBe("/supplier/chat?thread=thr_1");
    expect(
      notificationHref(
        "supplier",
        note({ type: "pickup_chat_message", orderId: "ord_1" }),
      ),
    ).toBe("/supplier/jobs/ord_1#pickup-chat");
    expect(notificationHref("supplier", note({ type: "product_type.review" }))).toBe(
      "/supplier/product-types",
    );
    expect(notificationHref("supplier", note({ type: "older_notice" }))).toBe(
      "/supplier/jobs",
    );
  });

  it("does not quote a deduction on a warning-only late notice", () => {
    const notice = presentShopNotice({
      type: "production_lapse_warning",
      body: "this is minor lateness and it is warning only",
    });
    expect(notice?.title).toBe("Late production: minor");
    expect(notice?.body).toMatch(/nothing comes off your payout/i);
    expect(notice?.body).not.toMatch(/₱/);
  });
});

it("keeps supplier legal/privacy and product decisions inside their self-service trees", () => {
  expect(notificationHref("supplier", note({ type: "legal.published" }))).toBe(
    "/supplier/legal",
  );
  expect(notificationHref("supplier", note({ type: "privacy.updated" }))).toBe(
    "/supplier/privacy",
  );
  expect(
    notificationHref("supplier", note({ type: "account_deletion_request_completed" })),
  ).toBe("/supplier/privacy");
  expect(
    notificationHref(
      "supplier",
      note({ type: "support_message", threadId: "thread / two" }),
    ),
  ).toBe("/supplier/chat?thread=thread%20%2F%20two");
  expect(
    notificationHref("supplier", note({ type: "support_message", orderId: "job" })),
  ).toBe("/supplier/chat");
});
it("uses the jobs list when an update can belong to a shop that no longer owns the job", () => {
  for (const type of ["shop_recovery", "order_reschedule_rematched", "older_notice"]) {
    expect(notificationHref("supplier", note({ type, orderId: "former_job" }))).toBe(
      "/supplier/jobs",
    );
  }
});
it("does not promise that lifting a refund hold lifts other independent holds", () => {
  for (const type of ["refund_rejected", "refund_withdrawn"]) {
    expect(presentShopNotice({ type })?.body).not.toMatch(/pick it up where you left it/);
    expect(presentShopNotice({ type })?.body).toMatch(/other holds/i);
  }
});
it("describes lifting a take-down separately from the shop relisting it", () => {
  const body = presentShopNotice({
    type: "listing_suspended",
    body: "Branding in sample.",
  })?.body;
  expect(body).not.toMatch(/Only GRIDGO can put it back on the board/);
  expect(body).toMatch(/lift the take-down/);
  expect(body).toMatch(/you.*put it back/i);
});

it("keeps an assessed historical deduction separate from what is owed now", () => {
  const body = presentShopNotice({
    type: "production_lapse_deduction",
    body: "A deduction of ₱30.00 was applied.",
  })?.body;
  expect(body).toMatch(/₱30.00 was deducted/);
  expect(body).toMatch(/at the time of the assessment/);
  expect(body).not.toMatch(/still owes/);
});

it("preserves known order-conversation and handover destinations while unknown events fall back", () => {
  for (const type of [
    "client_shop_chat_message",
    "handover_escalated",
    "issue_decision",
    "milestone_released",
  ]) {
    expect(notificationHref("supplier", note({ type, orderId: "job / one" }))).toBe(
      "/supplier/jobs/job%20%2F%20one",
    );
  }
});

it("uses the API's shared review landing without guessing a product type from copy", () => {
  const notice = note({
    type: "catalog_review_decided",
    body: "Open your listing to see its review status.",
  });
  expect(notificationHref("supplier", notice)).toBe("/supplier/catalogue");
  expect(presentShopNotice(notice)?.title).toBe("Review finished");
  expect(
    notificationHref("supplier", { ...notice, body: "A product type was reviewed" }),
  ).toBe("/supplier/catalogue");
});
it("limits the distinct product-type destination to the tested forward-compatible event", () => {
  expect(notificationHref("supplier", note({ type: "product_type.review" }))).toBe(
    "/supplier/product-types",
  );
  expect(notificationHref("supplier", note({ type: "product_type_unknown" }))).toBe(
    "/supplier/jobs",
  );
});
