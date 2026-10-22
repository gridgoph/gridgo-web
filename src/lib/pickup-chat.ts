/**
 * Messages between the shop and the rider collecting one job.
 *
 * The wording matches gridgo-supplier `lib/pickupChat.ts`. The API decides
 * the window and says so on the job as `pickupChat`: `open` from the moment
 * a rider accepts the pick-up until delivery, `read_only` for a day after,
 * and absent otherwise. This module only reads that answer. It never works
 * the window out from the job's state.
 */

import { ApiError } from "@/lib/api/client";

export type PickupChatStatus = "open" | "read_only";

export type PickupChatSummary = {
  status: PickupChatStatus;
  unread: number;
  closesAt: string | null;
  retentionHours: number;
  riderFirstName: string | null;
};

export type PickupChatAttachment = {
  fileId: string;
  contentType?: string | null;
  originalFilename?: string | null;
};

export type PickupChatMessage = {
  id: string;
  senderRole: "supplier" | "rider";
  body: string;
  attachments?: PickupChatAttachment[];
  createdAt: string;
  mine: boolean;
};

export const PICKUP_MESSAGE_MAX = 1000;
export const PICKUP_CHAT_IMAGE_PURPOSE = "pickup_chat_image";
export const PICKUP_CHAT_IMAGE_MAX_COUNT = 4;
export const PICKUP_CHAT_NOTICE = "pickup_chat_message";
export const PICKUP_CHAT_POLL_MS = 5_000;
export const PICKUP_CHAT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

function firstName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const word = value.trim().split(/\s+/)[0];
  return word ? word.slice(0, 40) : null;
}

export function pickupChatOf(order: { pickupChat?: unknown } | null | undefined): PickupChatSummary | null {
  const raw = order?.pickupChat;
  if (!raw || typeof raw !== "object") return null;
  const { status, unread, closesAt, retentionHours, riderFirstName, rider } = raw as Record<string, unknown>;
  if (status !== "open" && status !== "read_only") return null;
  return {
    status,
    unread: typeof unread === "number" && Number.isFinite(unread) && unread > 0 ? Math.floor(unread) : 0,
    closesAt: typeof closesAt === "string" && Number.isFinite(Date.parse(closesAt)) ? closesAt : null,
    retentionHours: typeof retentionHours === "number" && retentionHours > 0 ? retentionHours : 24,
    riderFirstName:
      firstName(riderFirstName) ??
      (rider && typeof rider === "object" ? firstName((rider as Record<string, unknown>).firstName) : null),
  };
}

export function closesAtLabel(closesAt: string, now: Date | number = Date.now()): string {
  const at = new Date(closesAt);
  const time = at.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  const day = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const today = new Date(now);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  if (day(at) === day(today)) return `${time} today`;
  if (day(at) === day(tomorrow)) return `${time} tomorrow`;
  const date = at.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
  return `${date}, ${time}`;
}

export function riderNameOf(chat: Pick<PickupChatSummary, "riderFirstName"> | null): string {
  return chat?.riderFirstName || "the rider";
}

export function pickupChatEntry(chat: PickupChatSummary, now: Date | number = Date.now()) {
  const name = riderNameOf(chat);
  const unread = chat.unread > 0 ? `${chat.unread} new` : null;
  if (chat.status === "open") {
    return {
      title: chat.riderFirstName ? `Message ${chat.riderFirstName}` : "Message the rider",
      detail: "Ask where they are or tell them which door to use. Phone numbers stay private.",
      unread,
      accessibilityLabel: `Message ${name} about this pickup${unread ? `, ${unread} messages` : ""}`,
    };
  }
  return {
    title: chat.riderFirstName ? `Messages with ${chat.riderFirstName}` : "Messages with the rider",
    detail: chat.closesAt
      ? `Delivered. Readable until ${closesAtLabel(chat.closesAt, now)}, then removed.`
      : `Delivered. Removed ${chat.retentionHours} hours after delivery.`,
    unread,
    accessibilityLabel: `Read your messages with ${name}${unread ? `, ${unread} messages` : ""}`,
  };
}

export function pickupChatNotice(chat: PickupChatSummary, now: Date | number = Date.now()): string {
  if (chat.status === "open") {
    return `Only your shop and ${riderNameOf(chat)} see these messages. They are removed ${chat.retentionHours} hours after delivery.`;
  }
  return chat.closesAt
    ? `This job has been delivered, so no new messages can be sent. These are removed at ${closesAtLabel(chat.closesAt, now)}.`
    : "This job has been delivered, so no new messages can be sent.";
}

export function senderLabel(message: Pick<PickupChatMessage, "mine">, chat: PickupChatSummary | null): string {
  if (message.mine) return "Your shop";
  return chat?.riderFirstName || "Rider";
}

export function messageTime(at: string): string {
  return new Date(at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

export function validatePickupImage(file: { name?: string; type?: string; size?: number }): string | null {
  const type = file.type === "image/jpg" ? "image/jpeg" : file.type || "";
  const name = String(file.name || "").toLowerCase();
  const extensionOk = [".jpg", ".jpeg", ".png", ".webp"].some((ext) => name.endsWith(ext));
  const typeOk = ["image/jpeg", "image/png", "image/webp"].includes(type);
  if (!typeOk && !extensionOk) return "Choose a JPEG, PNG, or WebP photo.";
  if (file.size === 0) return "That file is empty.";
  if (typeof file.size === "number" && file.size > PICKUP_CHAT_IMAGE_MAX_BYTES) return "Photos can be up to 15 MB.";
  return null;
}

export type PickupChatUnavailable = { title: string; body: string };

function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : "";
}

export function pickupChatUnavailable(error: unknown): PickupChatUnavailable | null {
  const code = errorCode(error);
  if (code === "pickup_chat_closed") {
    return {
      title: "These messages were removed",
      body: "Messages with the rider are removed one day after delivery. For anything about this job, message Operations.",
    };
  }
  if (code === "pickup_chat_not_available") {
    return {
      title: "No rider to message yet",
      body: "You can message the rider once one accepts the pickup. GRIDGO tells you when that happens.",
    };
  }
  if (code === "forbidden" || code === "order_not_found") {
    return {
      title: "This conversation is not available",
      body: "Only your shop and the rider collecting this job can read its messages.",
    };
  }
  return null;
}

export function pickupSendError(error: unknown): string {
  const code = errorCode(error);
  if (code === "pickup_chat_read_only") return "This job has been delivered, so no new messages can be sent.";
  if (code === "too_many_requests") return "You are sending messages too fast. Wait a moment and try again.";
  if (code === "invalid_request") return "Write a message of up to 1,000 characters, or add a photo.";
  if (code === "invalid_chat_image" || code === "invalid_file_type" || code === "file_too_large") {
    return "That photo could not be sent. Choose a JPEG, PNG, or WebP of up to 15 MB.";
  }
  if (code === "file_already_attached") return "That photo was already sent. Choose it again to send it once more.";
  if (error instanceof Error && !(error instanceof ApiError) && error.message.startsWith("That photo")) {
    return error.message;
  }
  return "That did not reach the rider. Check your connection and send it again.";
}
