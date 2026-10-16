import { describe, expect, it } from "vitest";

import type { Notification } from "@/lib/api/types";

import { NOTICE_FALLBACK_HREF, pushedNoticeHref, readPushedNotice } from "../notice";

describe("a tapped phone notification", () => {
  it("opens the job it is about, from the push's own fields", () => {
    const notice = readPushedNotice(
      new URLSearchParams("id=n1&type=shop_job_offered&orderId=ord_1"),
    );
    expect(notice).toEqual({ id: "n1", type: "shop_job_offered", orderId: "ord_1" });
    expect(pushedNoticeHref(notice)).toMatch(/^\/supplier\//);
  });

  it("prefers the inbox row, which also names a listing", () => {
    const notice = readPushedNotice(new URLSearchParams("id=n2&type=listing_suspended"));
    const row: Notification = {
      id: "n2",
      userId: "u",
      type: "listing_suspended",
      catalogItemId: "cat_9",
      title: "",
      body: "",
      read: false,
      at: "",
    };
    expect(pushedNoticeHref(notice)).toBe("/supplier/catalogue");
    expect(pushedNoticeHref(notice, row)).toBe("/supplier/catalogue/cat_9");
  });

  it("lands on the dashboard without a slip id", () => {
    expect(readPushedNotice(new URLSearchParams(""))).toBeNull();
    expect(pushedNoticeHref(null)).toBe(NOTICE_FALLBACK_HREF);
  });
});
