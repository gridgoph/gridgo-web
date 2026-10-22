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
    expect(presentShopNotice({ type: "refund_unknown" })?.title).toBe("Client refund update");
    expect(presentShopNotice({ type: "refund_unknown" })?.body).toMatch(/Nothing changes for your shop/);
    expect(notificationHref("supplier", note({ type: "refund_unknown", orderId: "ord_1" }))).toBeNull();
    expect(
      notificationHref("supplier", note({ type: "support_message", threadId: "thr_1", orderId: "ord_1" })),
    ).toBe("/supplier/chat?thread=thr_1");
    expect(notificationHref("supplier", note({ type: "pickup_chat_message", orderId: "ord_1" }))).toBe(
      "/supplier/jobs/ord_1#pickup-chat",
    );
    expect(notificationHref("supplier", note({ type: "product_type.review" }))).toBe("/supplier/product-types");
    expect(notificationHref("supplier", note({ type: "older_notice" }))).toBe("/supplier/jobs");
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
