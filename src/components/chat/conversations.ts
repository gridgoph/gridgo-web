import type { SupportChatMessage, SupportChatThread } from "@/lib/api/types";

/**
 * One inbox row per person. A client can keep more than one Operations chat
 * (each "New chat" in their app is its own thread), and the desk used to list
 * every thread, so one person showed up several times. The desk folds them
 * into one conversation; the newest thread leads and takes replies.
 */
export type SupportChatConversation = {
  /** The counterpart's user id: one conversation per person. */
  key: string;
  /** The most recently active thread: its names, preview and time lead the row. */
  lead: SupportChatThread;
  /** Every thread with this person, newest first. */
  threads: SupportChatThread[];
  unreadCount: number;
};

/** User id of the person on the other side of this thread. Staff-to-staff flips to the peer. */
export function supportChatCounterpartUserId(thread: SupportChatThread): string {
  if (thread.staffPeerUserId && thread.viewerUserId && thread.partyUserId === thread.viewerUserId) {
    return thread.staffPeerUserId;
  }
  return thread.partyUserId;
}

/**
 * Groups threads by person. The list arrives newest activity first (the API's
 * order, and the desk puts a live or just-sent thread in front), so the first
 * thread seen for a person leads and conversations keep that order.
 */
export function groupSupportChatThreads(
  threads: readonly SupportChatThread[],
): SupportChatConversation[] {
  const byKey = new Map<string, SupportChatThread[]>();
  for (const thread of threads) {
    const key = supportChatCounterpartUserId(thread);
    const rows = byKey.get(key);
    if (!rows) byKey.set(key, [thread]);
    else if (!rows.some((row) => row.id === thread.id)) rows.push(thread);
  }
  return [...byKey].map(([key, rows]) => ({
    key,
    lead: rows[0],
    threads: rows,
    unreadCount: rows.reduce((sum, row) => sum + Number(row.unreadCount || 0), 0),
  }));
}

/** All messages of a conversation in time order, each message once. */
export function mergeSupportChatMessages(
  ...lists: ReadonlyArray<readonly SupportChatMessage[]>
): SupportChatMessage[] {
  const byId = new Map<string, SupportChatMessage>();
  for (const list of lists) {
    for (const message of list) byId.set(message.id, message);
  }
  return [...byId.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
