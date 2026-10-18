import type {
  ClientShopChatLabel,
  ClientShopChatListEntry,
  ClientShopChatMessage,
  ClientShopChatReport,
  ClientShopChatState,
  ClientShopChatWindow,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

/**
 * The masked client–shop conversation, as Operations reads it (gridgo-api
 * `docs/ORDER_CLIENT_SHOP_CHAT_API.md`). Participants are the three labels
 * the API sends and nothing else; staff see the original text beside the
 * masked text as evidence.
 */

export const CLIENT_SHOP_CHAT_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export const CLIENT_SHOP_CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CLIENT_SHOP_CHAT_ATTACHMENT_MAX_COUNT = 4;
/** The API's chat parser limit, in UTF-16 code units (what `maxLength` counts). */
export const CLIENT_SHOP_CHAT_BODY_MAX = 1000;

export function validateClientShopChatAttachment(file: File): string | null {
  const type = file.type === "image/jpg" ? "image/jpeg" : file.type;
  const name = file.name.toLowerCase();
  const extensionOk = [".jpg", ".jpeg", ".png", ".webp", ".pdf"].some((ext) =>
    name.endsWith(ext),
  );
  if (
    !CLIENT_SHOP_CHAT_ATTACHMENT_TYPES.includes(
      type as (typeof CLIENT_SHOP_CHAT_ATTACHMENT_TYPES)[number],
    ) ||
    !extensionOk
  ) {
    return "Choose a JPEG, PNG or WebP photo, or a PDF.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > CLIENT_SHOP_CHAT_ATTACHMENT_MAX_BYTES) return "Files can be up to 10 MB.";
  return null;
}

export const REPORT_REASON_LABEL: Record<string, string> = {
  contact_sharing: "Sharing contact details",
  inappropriate: "Inappropriate",
  change_request: "Agreeing a change in chat",
  other: "Something else",
};

export function reportReasonLabel(reason: string): string {
  return REPORT_REASON_LABEL[reason] ?? "Something else";
}

export function chatStatusChip(status: ClientShopChatWindow["status"]): {
  tone: StatusTone;
  icon: StatusIconName;
  label: string;
} {
  if (status === "open") return { tone: "info", icon: "circle-dot", label: "Open" };
  if (status === "read_only") return { tone: "neutral", icon: "ban", label: "Closed" };
  return { tone: "neutral", icon: "circle-dashed", label: "Not open yet" };
}

/** One sentence on when the two sides can write. */
export function chatWindowLine(chat: ClientShopChatWindow): string {
  if (chat.status === "open") {
    return chat.closesAt
      ? `Open until the complaint window closes, ${formatDateTime(chat.closesAt)}.`
      : "Open until the complaint window after delivery closes.";
  }
  if (chat.status === "read_only") {
    return "Closed. Nobody can write any more; the messages stay with the order as evidence.";
  }
  return "Opens when the shop accepts the order.";
}

/** "2 reports", "4 contact attempts (flag at 3)", in that order; empty when clean. */
export function chatFlagReasons(chat: ClientShopChatState): string[] {
  const reasons: string[] = [];
  const reports = chat.reportCount ?? 0;
  if (reports > 0) reasons.push(reports === 1 ? "1 report" : `${reports} reports`);
  if (chat.contactAttempts > 0) {
    const attempts =
      chat.contactAttempts === 1 ? "1 contact attempt" : `${chat.contactAttempts} contact attempts`;
    reasons.push(
      chat.contactThreshold ? `${attempts}, limit ${chat.contactThreshold} per person` : attempts,
    );
  }
  return reasons;
}

export function isFlagged(chat: Pick<ClientShopChatState, "flaggedAt">): boolean {
  return Boolean(chat.flaggedAt);
}

/** The closed workspace row: the window, before the thread is read. */
export function chatRowSummary(
  chat: ClientShopChatWindow,
  thread?: { chat: ClientShopChatState; messages: ClientShopChatMessage[] } | null,
): string {
  const window = chatStatusChip(chat.status).label;
  if (!thread) {
    if (chat.status === "open") {
      return chat.closesAt ? `Open until ${formatDateTime(chat.closesAt)}` : "Open";
    }
    return chat.status === "read_only" ? "Closed, read only" : "Opens when the shop accepts";
  }
  const count = thread.messages.length;
  const messages = count === 0 ? "No messages" : count === 1 ? "1 message" : `${count} messages`;
  return [window, messages, isFlagged(thread.chat) ? "Flagged for review" : null]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Staff evidence: the original text when it differs from what the two sides
 * read. A message the API did not mask has nothing to compare.
 */
export function originalEvidence(message: ClientShopChatMessage): string | null {
  if (typeof message.originalBody !== "string") return null;
  if (message.originalBody === message.body) return null;
  return message.originalBody;
}

export function reportsByMessage(
  reports: ClientShopChatReport[] | undefined,
): Map<string, ClientShopChatReport[]> {
  const byMessage = new Map<string, ClientShopChatReport[]>();
  for (const report of reports ?? []) {
    const list = byMessage.get(report.messageId) ?? [];
    list.push(report);
    byMessage.set(report.messageId, list);
  }
  return byMessage;
}

/** GRIDGO on the right, the two parties on the left. */
export function chatSide(label: ClientShopChatLabel): "incoming" | "outgoing" {
  return label === "GRIDGO" ? "outgoing" : "incoming";
}

export function mergeChatMessages(
  current: ClientShopChatMessage[],
  incoming: ClientShopChatMessage[],
): ClientShopChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/** List rows: flagged first is the API's job; this only words the row. */
export function chatListLine(entry: ClientShopChatListEntry): string {
  const reasons = chatFlagReasons(entry);
  return reasons.length ? reasons.join(" · ") : "No reports or contact attempts";
}

