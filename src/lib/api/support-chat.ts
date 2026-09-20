import { withRequestDeadline } from "@/lib/api/requestDeadline";
import { ApiError, getApiBase, getAuthToken, getWorkspaceRole } from "@/lib/api/client";
import type {
  SupportChatEvent,
  SupportChatMessage,
  SupportChatPartyRole,
  SupportChatThread,
} from "@/lib/api/types";
import { parseSseChunk, reconnectDelayMs, type SseEvent } from "@/lib/eventStream";

async function chatRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return withRequestDeadline(init.signal, async (signal) => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
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

export async function listSupportChatThreads(filters?: {
  role?: SupportChatPartyRole | "all";
  q?: string;
}): Promise<SupportChatThread[]> {
  const params = new URLSearchParams();
  if (filters?.role && filters.role !== "all") params.set("role", filters.role);
  if (filters?.q?.trim()) params.set("q", filters.q.trim());
  const query = params.toString();
  const result = await chatRequest<{ threads: SupportChatThread[] }>(
    `/support-chat/threads${query ? `?${query}` : ""}`,
  );
  return result.threads ?? [];
}

export async function getSupportChatThread(threadId: string): Promise<{
  thread: SupportChatThread;
  messages: SupportChatMessage[];
}> {
  return chatRequest(`/support-chat/threads/${encodeURIComponent(threadId)}`);
}

export async function replySupportChat(
  threadId: string,
  body: string,
): Promise<{ thread: SupportChatThread; message: SupportChatMessage }> {
  return chatRequest(`/support-chat/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function readSupportChatEvent(event: SseEvent): SupportChatEvent | null {
  if (event.event !== "support_chat" || !event.data) return null;
  try {
    const parsed = JSON.parse(event.data) as Partial<SupportChatEvent>;
    if (parsed?.type !== "message" || !parsed.thread?.id || !parsed.message?.id) return null;
    return parsed as SupportChatEvent;
  } catch {
    return null;
  }
}

export function openSupportChatStream(handlers: {
  onEvent: (event: SupportChatEvent) => void;
  onStatus?: (live: boolean) => void;
}): { close: () => void } {
  let closed = false;
  let attempt = 0;
  let lastEventId: string | null = null;
  let abort: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    abort?.abort();
    abort = null;
  };

  const schedule = () => {
    if (closed) return;
    stop();
    attempt += 1;
    timer = setTimeout(() => void connect(), reconnectDelayMs(attempt, null));
  };

  async function connect() {
    if (closed) return;
    stop();
    handlers.onStatus?.(false);
    const token = await getAuthToken().catch(() => null);
    if (closed) return;
    if (!token) {
      schedule();
      return;
    }
    const controller = new AbortController();
    abort = controller;
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
    };
    const role = getWorkspaceRole();
    if (role) headers["X-GRIDGO-Role"] = role;
    if (lastEventId) headers["Last-Event-ID"] = lastEventId;

    let res: Response;
    try {
      res = await fetch(`${getApiBase()}/support-chat/stream`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
    } catch {
      if (!closed && !controller.signal.aborted) schedule();
      return;
    }
    if (closed) return;
    if (!res.ok || !res.body) {
      schedule();
      return;
    }
    attempt = 0;
    handlers.onStatus?.(true);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseChunk(buffer);
        buffer = rest;
        for (const event of events) {
          if (event.id) lastEventId = event.id;
          const chat = readSupportChatEvent(event);
          if (chat) handlers.onEvent(chat);
        }
      }
    } catch {
      // reconnect below
    }
    if (!closed) schedule();
  }

  void connect();
  return {
    close: () => {
      closed = true;
      stop();
    },
  };
}
