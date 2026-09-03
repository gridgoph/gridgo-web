import { ApiError, getApiBase, getAuthToken } from "@/lib/api/client";
import type {
  InvalidatePing,
  InvalidateResource,
  Notification,
  NotificationInbox,
} from "@/lib/api/types";
import { parseSseChunk, reconnectDelayMs, type SseEvent } from "@/lib/eventStream";

const RESOURCES = new Set<InvalidateResource>([
  "orders",
  "jobs",
  "approvals",
  "escalations",
  "claims",
  "dispatch",
  "payouts",
]);

async function notificationRequest<T>(
  path: string,
  init: RequestInit = {},
  tokenOptions?: { skipCache?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const token = await getAuthToken(tokenOptions);
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
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
}

export async function listNotificationInbox(): Promise<NotificationInbox> {
  const result = await notificationRequest<NotificationInbox>("/notifications");
  return {
    notifications: result.notifications ?? [],
    snapshot: result.snapshot ?? null,
  };
}

export async function markNotificationRead(
  notificationId: string,
  read = true,
): Promise<Notification> {
  const result = await notificationRequest<{ notification: Notification }>(
    `/notifications/${encodeURIComponent(notificationId)}`,
    { method: "PATCH", body: JSON.stringify({ read }) },
  );
  return result.notification;
}

export async function markAllNotificationsRead(snapshot: string): Promise<number> {
  const result = await notificationRequest<{ updatedCount: number }>(
    "/notifications/read-all",
    { method: "PATCH", body: JSON.stringify({ snapshot }) },
  );
  return result.updatedCount;
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await notificationRequest(`/notifications/${encodeURIComponent(notificationId)}`, {
    method: "DELETE",
  });
}

export function readNotificationEvent(event: SseEvent): Notification | null {
  if (event.event !== "notification" || !event.data) return null;
  try {
    const parsed: unknown = JSON.parse(event.data);
    if (typeof parsed !== "object" || !parsed) return null;
    const body = parsed as { notification?: unknown };
    const candidate = (body.notification ?? parsed) as Partial<Notification>;
    if (typeof candidate.id !== "string" || typeof candidate.title !== "string") return null;
    return candidate as Notification;
  } catch {
    return null;
  }
}

export function readInvalidateEvent(event: SseEvent): InvalidatePing | null {
  if (event.event !== "invalidate" || !event.data) return null;
  try {
    const parsed: unknown = JSON.parse(event.data);
    if (typeof parsed !== "object" || !parsed) return null;
    const body = parsed as { resource?: unknown; id?: unknown };
    if (typeof body.resource !== "string" || !RESOURCES.has(body.resource as InvalidateResource)) {
      return null;
    }
    return {
      resource: body.resource as InvalidateResource,
      ...(typeof body.id === "string" && body.id ? { id: body.id } : {}),
    };
  } catch {
    return null;
  }
}

export type NotificationStreamHandlers = {
  onNotification: (notification: Notification) => void;
  onInvalidate: (ping: InvalidatePing) => void;
  onStatus?: (live: boolean) => void;
  getResumeFrom?: () => string | null;
  onResumeUnavailable?: () => void | Promise<void>;
};

export type NotificationStreamHandle = {
  close: () => void;
  wake: () => void;
};

export function openNotificationStream(
  handlers: NotificationStreamHandlers,
): NotificationStreamHandle {
  let closed = false;
  let attempt = 0;
  let lastEventId: string | null = null;
  let abort: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let refreshed401 = false;

  const stopRequest = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    abort?.abort();
    abort = null;
  };

  const scheduleRetry = (suggested: number | null) => {
    if (closed) return;
    attempt += 1;
    timer = setTimeout(() => void connect(), reconnectDelayMs(attempt, suggested));
  };

  async function connect() {
    if (closed) return;
    const token = await getAuthToken(refreshed401 ? { skipCache: true } : undefined);
    if (closed) return;
    if (!token) {
      handlers.onStatus?.(false);
      return;
    }

    stopRequest();
    const controller = new AbortController();
    abort = controller;
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
    };
    const resumeFrom = handlers.getResumeFrom?.() ?? lastEventId;
    if (resumeFrom) {
      lastEventId = resumeFrom;
      headers["Last-Event-ID"] = resumeFrom;
    }

    let res: Response;
    try {
      res = await fetch(`${getApiBase()}/notifications/stream`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
    } catch {
      if (closed || controller.signal.aborted) return;
      handlers.onStatus?.(false);
      scheduleRetry(null);
      return;
    }

    if (closed) return;

    if (res.status === 401 && !refreshed401) {
      refreshed401 = true;
      handlers.onStatus?.(false);
      void connect();
      return;
    }
    if (res.status === 401) {
      handlers.onStatus?.(false);
      return;
    }
    if (res.status === 409) {
      lastEventId = null;
      refreshed401 = false;
      handlers.onStatus?.(false);
      void Promise.resolve(handlers.onResumeUnavailable?.()).finally(() => {
        if (!closed) scheduleRetry(null);
      });
      return;
    }
    if (!res.ok || !res.body) {
      handlers.onStatus?.(false);
      scheduleRetry(null);
      return;
    }

    refreshed401 = false;
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
          const notification = readNotificationEvent(event);
          if (notification) handlers.onNotification(notification);
          const ping = readInvalidateEvent(event);
          if (ping) handlers.onInvalidate(ping);
        }
      }
    } catch {
      // Abort or a dropped socket — reconnect below unless we closed on purpose.
    }
    handlers.onStatus?.(false);
    if (!closed) scheduleRetry(null);
  }

  void connect();

  return {
    close: () => {
      closed = true;
      stopRequest();
    },
    wake: () => {
      if (closed) return;
      attempt = 0;
      void connect();
    },
  };
}
