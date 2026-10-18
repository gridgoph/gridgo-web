import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  downloadApprovalProof,
  getClientShopChat,
  listClientShopChats,
  setTokenProvider,
} from "@/lib/api/client";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const chat = {
  status: "open",
  closesAt: null,
  participants: ["Client", "Print shop", "GRIDGO"],
  reminder: "r",
  unread: 3,
  contactAttempts: 0,
};

let calls: string[];

beforeEach(() => {
  calls = [];
  setTokenProvider(() => "token");
});

afterEach(() => {
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("client–shop chat client", () => {
  it("reads every page in order and keeps the first page's unread count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://gridgo.test");
        calls.push(`${url.pathname}${url.search}`);
        if (!url.searchParams.get("after")) {
          return json({ chat, messages: [{ id: "a" }], nextAfter: "a", reports: [{ id: "r1" }] });
        }
        return json({ chat: { ...chat, unread: 0 }, messages: [{ id: "b" }], nextAfter: null, reports: [{ id: "r1" }] });
      }),
    );
    const read = await getClientShopChat("ord_1");
    expect(calls).toEqual([
      "/orders/ord_1/client-shop-chat?limit=100",
      "/orders/ord_1/client-shop-chat?limit=100&after=a",
    ]);
    expect(read.messages.map((message) => message.id)).toEqual(["a", "b"]);
    expect(read.chat.unread).toBe(3);
    expect(read.reports).toEqual([{ id: "r1" }]);
  });

  it("asks the staff list for flagged threads only when told to", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://gridgo.test");
        calls.push(`${url.pathname}${url.search}`);
        return json({ threads: [], nextOffset: null });
      }),
    );
    await listClientShopChats({ flagged: true, limit: 25 });
    await listClientShopChats({ limit: 25, offset: 25 });
    expect(calls).toEqual([
      "/ops/client-shop-chats?flagged=1&limit=25",
      "/ops/client-shop-chats?limit=25&offset=25",
    ]);
  });

  it("downloads the approval proof PDF as bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(new URL(String(input), "http://gridgo.test").pathname);
        return new Response("%PDF-1.4", { headers: { "Content-Type": "application/pdf" } });
      }),
    );
    const blob = await downloadApprovalProof("ord_1");
    expect(calls).toEqual(["/orders/ord_1/approval-proof/download"]);
    expect(await blob.text()).toBe("%PDF-1.4");
  });
});
