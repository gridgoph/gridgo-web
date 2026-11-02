import { describe, expect, it } from "vitest";

import type { Notification } from "@/lib/api/types";
import { notificationHref } from "@/lib/live/notificationHref";
import {
  emptyReplyDraft,
  eventDateWarningCopy,
  parseValidityDays,
  previewOptions,
  publishProblem,
  quoteErrorCopy,
  quoteFilterCounts,
  quotesWaitingOnOperations,
  readReplyDraft,
  replyChanges,
  selectBlocker,
  validityDaysInForce,
  validityUntilFromDay,
  type QuoteReply,
} from "@/lib/quote-requests";

function reply(id: string, supplierId: string, patch: Partial<QuoteReply> = {}): QuoteReply {
  return {
    id,
    status: "active",
    version: 1,
    supplierId,
    shopName: `Shop ${supplierId}`,
    priceMinor: 300000,
    clientPriceMinor: 345000,
    productionTime: { mode: "days", minDays: 3, maxDays: 3 },
    readyBy: "2026-11-06T09:00:00.000Z",
    eventDateFit: "before",
    recommendedOptions: "",
    note: "",
    publishedLabel: null,
    createdAt: "2026-11-02T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
    ...patch,
  };
}

describe("the queue's filters", () => {
  const rows = [
    { status: "requested" as const },
    { status: "quoting" as const },
    { status: "quoting" as const },
    { status: "published" as const },
    { status: "accepted" as const },
    { status: "ordered" as const },
    { status: "expired" as const },
    { status: "cancelled" as const },
  ];

  it("counts each status, open as everything not closed", () => {
    expect(quoteFilterCounts(rows)).toEqual({
      open: 5,
      requested: 1,
      quoting: 2,
      published: 1,
      accepted: 1,
      ordered: 1,
      expired: 1,
      cancelled: 1,
      all: 8,
    });
  });

  it("counts only the requests waiting on Operations for the rail", () => {
    expect(quotesWaitingOnOperations(rows)).toBe(3);
  });
});

describe("the reply form", () => {
  it("asks for the shop, a price above zero and a usable production time", () => {
    const read = readReplyDraft({ ...emptyReplyDraft(), price: "0", minDays: "4", maxDays: "2" });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.errors.supplierId).toMatch(/Choose the shop/);
    expect(read.errors.price).toMatch(/above ₱0/);
    expect(read.errors.productionTime).toMatch(/soonest/i);
  });

  it("refuses a price with a third decimal and same-day hours of nothing", () => {
    const read = readReplyDraft({
      ...emptyReplyDraft(),
      supplierId: "s1",
      price: "1.005",
      mode: "same_day",
      hours: "",
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(Object.keys(read.errors).sort()).toEqual(["price", "productionTime"]);
  });

  it("refuses notes over 1,000 characters", () => {
    const read = readReplyDraft({
      ...emptyReplyDraft(),
      supplierId: "s1",
      price: "3000",
      note: "x".repeat(1001),
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.errors.note).toMatch(/1,000/);
  });

  it("builds the API body in centavos with the catalogue's production time shape", () => {
    const read = readReplyDraft({
      ...emptyReplyDraft(),
      supplierId: " s1 ",
      price: "3,450.50",
      minDays: "2",
      maxDays: "4",
      recommendedOptions: " Grommets ",
    });
    expect(read).toEqual({
      ok: true,
      body: {
        supplierId: "s1",
        priceMinor: 345050,
        productionTime: { mode: "days", minDays: 2, maxDays: 4 },
        recommendedOptions: "Grommets",
        note: "",
      },
    });
  });

  it("keeps the shop on an edit and sends only what changed", () => {
    const read = readReplyDraft(
      { ...emptyReplyDraft(), price: "3000", minDays: "3", maxDays: "3", note: "Called" },
      { editing: true },
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.body.supplierId).toBeUndefined();
    expect(replyChanges(reply("r1", "s1"), read.body)).toEqual({ note: "Called" });
    expect(replyChanges(reply("r1", "s1", { note: "Called" }), read.body)).toBeNull();
  });
});

describe("publishing", () => {
  const replies = [
    reply("a", "s1"),
    reply("b", "s2"),
    reply("c", "s3"),
    reply("d", "s4"),
    reply("e", "s1"),
    reply("w", "s5", { status: "withdrawn" }),
  ];

  it("takes one to three active replies, one per shop", () => {
    expect(publishProblem(replies, [])).toMatch(/at least one/);
    expect(publishProblem(replies, ["a"])).toBeNull();
    expect(publishProblem(replies, ["a", "b", "c"])).toBeNull();
    expect(publishProblem(replies, ["a", "b", "c", "d"])).toMatch(/at most 3/);
    expect(publishProblem(replies, ["a", "e"])).toMatch(/one option per shop.*Shop s1/i);
    expect(publishProblem(replies, ["w"])).toMatch(/active/);
  });

  it("says why a reply cannot be ticked", () => {
    expect(selectBlocker(replies, ["a"], replies[4])).toMatch(/already chosen/);
    expect(selectBlocker(replies, ["a", "b", "c"], replies[3])).toMatch(/3 options/);
    expect(selectBlocker(replies, [], replies[5])).toBe("Withdrawn");
    expect(selectBlocker(replies, ["a"], replies[0])).toBeNull();
    expect(selectBlocker(replies, ["a"], replies[1])).toBeNull();
  });

  it("previews the client's options lettered A, B, C with no shop in them", () => {
    const cheap = reply("cheap", "s2", { clientPriceMinor: 200000, shopName: "Secret Prints" });
    const dear = reply("dear", "s1", { clientPriceMinor: 500000, shopName: "Hidden Signs" });
    const { options, exact } = previewOptions([dear, cheap], ["dear", "cheap"], [
      "cost",
      "speed",
      "quality",
      "distance",
    ]);
    expect(exact).toBe(true);
    expect(options.map((option) => [option.label, option.replyId])).toEqual([
      ["A", "cheap"],
      ["B", "dear"],
    ]);
    const text = JSON.stringify(options);
    expect(text).not.toMatch(/Secret Prints|Hidden Signs|s1|s2|priceMinor":3/);
    expect(options.every((option) => !("shopName" in option) && !("supplierId" in option))).toBe(
      true,
    );
  });

  it("does not claim final letters when the client ranks quality or distance first", () => {
    const { exact } = previewOptions(replies, ["a", "b"], ["quality", "speed", "cost", "distance"]);
    expect(exact).toBe(false);
  });
});

describe("the event-date warning", () => {
  it("names each API warning in plain words and never stays silent on a new one", () => {
    expect(eventDateWarningCopy({ code: "event_date_passed" })).toMatch(/already passed/);
    expect(eventDateWarningCopy({ code: "no_option_before_event" })).toMatch(
      /No shop reply so far can be ready before/,
    );
    expect(eventDateWarningCopy({ code: "event_date_soon" })).toMatch(/less than 3 days/);
    expect(eventDateWarningCopy({ code: "future_code", message: "API words" })).toBe("API words");
    expect(eventDateWarningCopy(null)).toBeNull();
  });
});

describe("quote validity", () => {
  it("takes whole days from 1 to 90", () => {
    expect(parseValidityDays("7")).toBe(7);
    expect(parseValidityDays("1")).toBe(1);
    expect(parseValidityDays("90")).toBe(90);
    expect(parseValidityDays("0")).toBeNull();
    expect(parseValidityDays("91")).toBeNull();
    expect(parseValidityDays("7.5")).toBeNull();
    expect(parseValidityDays("")).toBeNull();
    expect(validityDaysInForce(undefined)).toBe(7);
    expect(validityDaysInForce(14)).toBe(14);
  });

  it("ends one request's validity at the end of a Manila day, after today and within 90 days", () => {
    const now = Date.parse("2026-11-02T04:00:00.000Z");
    expect(validityUntilFromDay("2026-11-10", now)).toEqual({
      ok: true,
      validUntil: "2026-11-10T15:59:00.000Z",
    });
    expect(validityUntilFromDay("2026-11-01", now)).toMatchObject({ ok: false });
    expect(validityUntilFromDay("2027-03-01", now)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/90 days/),
    });
    expect(validityUntilFromDay("", now)).toMatchObject({ ok: false });
  });
});

describe("refusals", () => {
  it("names why a shop cannot take the job", () => {
    expect(
      quoteErrorCopy("quote_shop_unavailable", { blockers: ["shop_closed", "supplier_not_approved"] }),
    ).toBe("That shop cannot take this job: it is closed for now, it is not approved.");
    expect(quoteErrorCopy("quote_shop_unavailable", {})).toMatch(/cannot take GRIDGO work/);
    expect(quoteErrorCopy("invalid_quote_options")).toMatch(/one per shop/);
    expect(quoteErrorCopy("something_else")).toBeNull();
  });
});

describe("quote notices", () => {
  const notice = (patch: Partial<Notification>): Notification => ({
    id: "n1",
    userId: "u1",
    type: "ops_quote_requested",
    title: "New quote request",
    body: "",
    read: false,
    at: "2026-11-02T00:00:00.000Z",
    ...patch,
  });

  it("opens the request in the reader's own tree", () => {
    expect(notificationHref("ops_admin", notice({ quoteRequestId: "qreq_1" }))).toBe(
      "/ops/quotes/qreq_1",
    );
    expect(
      notificationHref("super_admin", notice({ type: "ops_quote_expired", quoteRequestId: "qreq_1" })),
    ).toBe("/admin/quotes/qreq_1");
    expect(notificationHref("ops_admin", notice({}))).toBe("/ops/quotes");
    expect(notificationHref("supplier", notice({ quoteRequestId: "qreq_1" }))).toBeNull();
  });
});
