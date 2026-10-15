import type { Notification } from "@/lib/api/types";
import { notificationHref } from "@/lib/live/notificationHref";

/**
 * Where a tapped phone notification lands. The push carries only the slip's
 * id, type and order (the API's lock-screen allowlist), so the inbox row is
 * preferred when it is still there: it also names a listing, which the push
 * never does. Same rules as an inbox row (`notificationHref`).
 */
export type PushedNotice = { id: string; type: string | null; orderId: string | null };

export const NOTICE_FALLBACK_HREF = "/supplier/dashboard";

export function readPushedNotice(params: URLSearchParams): PushedNotice | null {
  const id = params.get("id")?.trim();
  if (!id) return null;
  return {
    id,
    type: params.get("type")?.trim() || null,
    orderId: params.get("orderId")?.trim() || null,
  };
}

export function pushedNoticeHref(
  notice: PushedNotice | null,
  row?: Notification,
): string {
  if (!notice) return NOTICE_FALLBACK_HREF;
  const notification: Notification = row ?? {
    id: notice.id,
    userId: "",
    type: notice.type ?? undefined,
    orderId: notice.orderId,
    title: "",
    body: "",
    read: false,
    at: "",
  };
  return notificationHref("supplier", notification) ?? NOTICE_FALLBACK_HREF;
}
