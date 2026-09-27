import { withRequestDeadline } from "@/lib/api/requestDeadline";
import { ApiError, getApiBase, getAuthToken, getWorkspaceRole } from "@/lib/api/client";
import type { SupportChatMessage, SupportChatThread } from "@/lib/api/types";

/**
 * Personal Operations chat for a party membership (shop, client, rider).
 *
 * The staff desk stays in `support-chat.ts` (`GET /support-chat/threads` and
 * `POST /support-chat/threads/:id/messages`). A supplier calling those is
 * forbidden. This client uses the party routes. `X-GRIDGO-Role` comes from
 * the workspace path, so a page under `/supplier` sends `supplier`.
 */

async function partyRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return withRequestDeadline(init.signal, async (signal) => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.body && !headers["Content-Type"])
      headers["Content-Type"] = "application/json";
    signal.throwIfAborted();
    const token = await getAuthToken();
    signal.throwIfAborted();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      const role = getWorkspaceRole();
      if (role) headers["X-GRIDGO-Role"] = role;
    }
    const res = await fetch(`${getApiBase()}${path}`, { ...init, headers, signal });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data as T;
  });
}

export async function getSupportChatMe(): Promise<{
  threads?: SupportChatThread[];
  thread: SupportChatThread | null;
  messages: SupportChatMessage[];
  unreadCount?: number;
}> {
  return partyRequest("/support-chat/me");
}

export async function getSupportChatThread(threadId: string): Promise<{
  thread: SupportChatThread;
  messages: SupportChatMessage[];
}> {
  return partyRequest(`/support-chat/threads/${encodeURIComponent(threadId)}`);
}

export async function openSupportChatThread(): Promise<{ thread: SupportChatThread }> {
  return partyRequest("/support-chat/me/threads", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function sendSupportChatMessage(
  body: string,
  threadId?: string,
): Promise<{
  thread: SupportChatThread;
  message: SupportChatMessage;
}> {
  return partyRequest("/support-chat/me/messages", {
    method: "POST",
    body: JSON.stringify({ body, ...(threadId ? { threadId } : {}) }),
  });
}

export async function markSupportChatRead(threadId?: string): Promise<{
  thread: SupportChatThread | null;
  unreadCount?: number;
}> {
  if (threadId) {
    return partyRequest(`/support-chat/threads/${encodeURIComponent(threadId)}/read`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
  }
  return partyRequest("/support-chat/me/read", {
    method: "PATCH",
    body: JSON.stringify({}),
  });
}
