import { describe, expect, it } from "vitest";

import type { ClientShopChatMessage, ClientShopChatState } from "@/lib/api/types";
import {
  chatFlagReasons,
  chatRowSummary,
  chatSide,
  chatWindowLine,
  mergeChatMessages,
  originalEvidence,
  reportReasonLabel,
  reportsByMessage,
  validateClientShopChatAttachment,
} from "@/lib/client-shop-chat";
import { formatDateTime } from "@/lib/format";

const REMINDER =
  "Price, specification and deadline changes require a formal change request. Chat messages do not change the order.";

function state(overrides: Partial<ClientShopChatState> = {}): ClientShopChatState {
  return {
    status: "open",
    closesAt: null,
    participants: ["Client", "Print shop", "GRIDGO"],
    reminder: REMINDER,
    unread: 0,
    contactAttempts: 0,
    ...overrides,
  };
}

function message(overrides: Partial<ClientShopChatMessage> = {}): ClientShopChatMessage {
  return {
    id: "m1",
    senderLabel: "Client",
    body: "Call [contact hidden] tomorrow",
    mine: false,
    createdAt: "2026-10-17T12:00:00.000Z",
    attachments: [],
    ...overrides,
  };
}

describe("original text as evidence", () => {
  it("shows what the sender typed only when masking changed it", () => {
    expect(
      originalEvidence(message({ originalBody: "Call 0917 123 4567 tomorrow", contactAttempt: true })),
    ).toBe("Call 0917 123 4567 tomorrow");
    expect(originalEvidence(message({ body: "Thanks", originalBody: "Thanks" }))).toBeNull();
  });

  it("has nothing to show when the API sent no original (a party's read)", () => {
    expect(originalEvidence(message())).toBeNull();
  });
});

describe("flags", () => {
  it("words reports and the thread's contact attempts against the threshold", () => {
    expect(
      chatFlagReasons(
        state({ reportCount: 2, contactAttempts: 4, contactThreshold: 3, flaggedAt: "x" }),
      ),
    ).toEqual(["2 reports", "4 contact attempts, limit 3 per person"]);
    expect(chatFlagReasons(state({ reportCount: 1, contactAttempts: 1 }))).toEqual([
      "1 report",
      "1 contact attempt",
    ]);
    expect(chatFlagReasons(state())).toEqual([]);
  });

  it("names every report reason in plain words, unknown ones included", () => {
    expect(reportReasonLabel("contact_sharing")).toBe("Sharing contact details");
    expect(reportReasonLabel("change_request")).toBe("Agreeing a change in chat");
    expect(reportReasonLabel("inappropriate")).toBe("Inappropriate");
    expect(reportReasonLabel("something_new")).toBe("Something else");
  });

  it("groups reports under the message they were made on", () => {
    const grouped = reportsByMessage([
      { id: "r1", messageId: "m1", reporterLabel: "Print shop", reason: "contact_sharing", createdAt: "a" },
      { id: "r2", messageId: "m1", reporterLabel: "Client", reason: "other", createdAt: "b" },
      { id: "r3", messageId: "m2", reporterLabel: "Client", reason: "other", createdAt: "c" },
    ]);
    expect(grouped.get("m1")?.map((report) => report.id)).toEqual(["r1", "r2"]);
    expect(grouped.get("m2")?.map((report) => report.id)).toEqual(["r3"]);
  });
});

describe("window", () => {
  it("says when the two sides can write", () => {
    expect(chatWindowLine(state({ closesAt: "2026-10-20T07:00:00.000Z" }))).toBe(
      `Open until the complaint window closes, ${formatDateTime("2026-10-20T07:00:00.000Z")}.`,
    );
    expect(chatWindowLine(state())).toBe("Open until the complaint window after delivery closes.");
    expect(chatWindowLine(state({ status: "read_only" }))).toMatch(/^Closed\./);
    expect(chatWindowLine(state({ status: "unavailable" }))).toBe(
      "Opens when the shop accepts the order.",
    );
  });

  it("summarises the closed row from the window, then from the read thread", () => {
    expect(chatRowSummary(state({ status: "unavailable" }))).toBe("Opens when the shop accepts");
    expect(chatRowSummary(state({ status: "read_only" }))).toBe("Closed, read only");
    expect(
      chatRowSummary(state(), {
        chat: state({ flaggedAt: "2026-10-17T12:00:00.000Z" }),
        messages: [message(), message({ id: "m2" })],
      }),
    ).toBe("Open · 2 messages · Flagged for review");
  });
});

describe("transcript", () => {
  it("puts GRIDGO on the right and both parties on the left", () => {
    expect(chatSide("GRIDGO")).toBe("outgoing");
    expect(chatSide("Client")).toBe("incoming");
    expect(chatSide("Print shop")).toBe("incoming");
  });

  it("merges a sent message once, in time order", () => {
    const first = message({ id: "a", createdAt: "2026-10-17T12:00:00.000Z" });
    const second = message({ id: "b", createdAt: "2026-10-17T12:05:00.000Z" });
    expect(mergeChatMessages([second], [first, second]).map((row) => row.id)).toEqual(["a", "b"]);
  });
});

describe("attachments", () => {
  const file = (name: string, type: string, size = 100) =>
    new File([new Uint8Array(size)], name, { type });

  it("accepts photos and PDFs up to 10 MB, as the API does", () => {
    expect(validateClientShopChatAttachment(file("gate.jpg", "image/jpeg"))).toBeNull();
    expect(validateClientShopChatAttachment(file("guide.pdf", "application/pdf"))).toBeNull();
    expect(validateClientShopChatAttachment(file("a.gif", "image/gif"))).toBe(
      "Choose a JPEG, PNG or WebP photo, or a PDF.",
    );
    expect(
      validateClientShopChatAttachment(file("big.png", "image/png", 10 * 1024 * 1024 + 1)),
    ).toBe("Files can be up to 10 MB.");
  });
});
