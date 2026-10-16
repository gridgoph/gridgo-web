import { describe, expect, it } from "vitest";

import {
  groupSupportChatThreads,
  mergeSupportChatMessages,
} from "@/components/chat/conversations";
import type { SupportChatMessage, SupportChatThread } from "@/lib/api/types";

function thread(id: string, partyUserId: string, extra: Partial<SupportChatThread> = {}) {
  return {
    id,
    partyUserId,
    partyRole: "client",
    lastMessageAt: "2026-09-20T03:00:00.000Z",
    unreadCount: 0,
    createdAt: "2026-09-20T03:00:00.000Z",
    updatedAt: "2026-09-20T03:00:00.000Z",
    ...extra,
  } as SupportChatThread;
}

function message(id: string, createdAt: string): SupportChatMessage {
  return {
    id,
    threadId: "t",
    senderUserId: "u",
    senderRole: "client",
    body: id,
    createdAt,
    mine: false,
  };
}

describe("groupSupportChatThreads", () => {
  it("folds one person's threads into one conversation led by the newest", () => {
    const rows = [
      thread("t-new", "ana", { unreadCount: 1 }),
      thread("t-ben", "ben"),
      thread("t-old", "ana", { unreadCount: 2 }),
    ];
    const conversations = groupSupportChatThreads(rows);
    expect(conversations.map((c) => c.key)).toEqual(["ana", "ben"]);
    expect(conversations[0].lead.id).toBe("t-new");
    expect(conversations[0].threads.map((t) => t.id)).toEqual(["t-new", "t-old"]);
    expect(conversations[0].unreadCount).toBe(3);
  });

  it("keys a staff-to-staff thread by the peer, and drops a repeated thread", () => {
    const mine = thread("t-staff", "me", {
      viewerUserId: "me",
      staffPeerUserId: "peer",
      partyRole: "ops_admin",
    });
    const conversations = groupSupportChatThreads([mine, mine]);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].key).toBe("peer");
    expect(conversations[0].threads).toHaveLength(1);
  });
});

describe("mergeSupportChatMessages", () => {
  it("orders by time and keeps each message once", () => {
    const merged = mergeSupportChatMessages(
      [message("b", "2026-09-20T03:00:00.000Z"), message("a", "2026-09-19T03:00:00.000Z")],
      [message("b", "2026-09-20T03:00:00.000Z"), message("c", "2026-09-21T03:00:00.000Z")],
    );
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });
});
