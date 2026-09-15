import { withRequestDeadline } from "@/lib/api/requestDeadline";
import { ApiError, getApiBase, getAuthToken, getWorkspaceRole } from "@/lib/api/client";
import type {
  InvalidatePing,
  InvalidateResource,
  Notification,
  NotificationInbox,
  Role,
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
  "notifications",
  "identity",
  "catalog",
  "services",
  "availability",
  "settings",
  "location",
  "credits",
]);

async function notificationRequest<T>(
  path: string,
  init: RequestInit = {},
  tokenOptions?: { skipCache?: boolean },
): Promise<T> {
  return withRequestDeadline(init.signal, async (signal) => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    signal.throwIfAborted();
    const token = await getAuthToken(tokenOptions);
    signal.throwIfAborted();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      const role = getWorkspaceRole();
      if (role) headers["X-GRIDGO-Role"] = role;
    }

    const res = await fetch(`${getApiBase()}${path}`, {
      ...init,
      headers,
      signal,
    });
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

export async function listNotificationInbox(role?: Role): Promise<NotificationInbox> {
  const result = await notificationRequest<NotificationInbox>(
    `/notifications${role ? `?role=${role}` : ""}`,
  );
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

export async function markAllNotificationsRead(
  snapshot: string,
  role?: Role,
): Promise<number> {
  const result = await notificationRequest<{ updatedCount: number }>(
    `/notifications/read-all${role ? `?role=${role}` : ""}`,
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
    if (typeof candidate.id !== "string" || typeof candidate.title !== "string")
      return null;
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
    if (
      typeof body.resource !== "string" ||
      !RESOURCES.has(body.resource as InvalidateResource)
    ) {
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
  role?: Role;
  onNotification: (notification: Notification) => void;
  onInvalidate: (ping: InvalidatePing) => void;
  onStatus?: (live: boolean) => void;
  getResumeFrom?: () => string | null;
  onResumeUnavailable?: () => void | Promise<void>;
};

export type NotificationStreamHandle = {
  close: () => void;
  /**
   * Reconnect if the stream is down. A healthy connection is left alone, so
   * returning to the tab never drops the frames already flowing; the
   * provider refreshes the inbox separately on return.
   */
  wake: () => void;
  /** Whether frames are currently flowing. */
  isLive: () => boolean;
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
  let sequence = 0;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let live = false;
  const setStatus = (next: boolean) => {
    live = next;
    handlers.onStatus?.(next);
  };

  const stopRequest = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
    if (timer) clearTimeout(timer);
    timer = null;
    abort?.abort();
    abort = null;
  };

  const scheduleRetry = (suggested: number | null) => {
    if (closed) return;
    sequence += 1;
    stopRequest();
    attempt += 1;
    timer = setTimeout(() => void connect(), reconnectDelayMs(attempt, suggested));
  };

  async function connect() {
    if (closed) return;
    const ticket = ++sequence;
    stopRequest();
    setStatus(false);
    watchdog = setTimeout(() => {
      setStatus(false);
      scheduleRetry(null);
    }, 45_000);
    const token = await getAuthToken(
      refreshed401 ? { skipCache: true } : undefined,
    ).catch(() => null);
    if (closed || ticket !== sequence) return;
    if (!token) {
      setStatus(false);
      scheduleRetry(null);
      return;
    }

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
      res = await fetch(
        `${getApiBase()}/notifications/stream${handlers.role ? `?role=${handlers.role}` : ""}`,
        {
          method: "GET",
          headers,
          signal: controller.signal,
        },
      );
    } catch {
      if (closed || controller.signal.aborted) return;
      setStatus(false);
      scheduleRetry(null);
      return;
    }

    if (closed || ticket !== sequence) return;

    if (res.status === 401 && !refreshed401) {
      refreshed401 = true;
      setStatus(false);
      void connect();
      return;
    }
    if (res.status === 401) {
      setStatus(false);
      scheduleRetry(null);
      return;
    }
    if (res.status === 409) {
      lastEventId = null;
      refreshed401 = false;
      setStatus(false);
      void Promise.resolve(handlers.onResumeUnavailable?.()).finally(() => {
        if (!closed) scheduleRetry(null);
      });
      return;
    }
    if (!res.ok || !res.body) {
      setStatus(false);
      scheduleRetry(null);
      return;
    }

    refreshed401 = false;
    attempt = 0;
    setStatus(true);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!closed && ticket === sequence) {
        const { done, value } = await reader.read();
        if (done || ticket !== sequence || closed) break;
        if (watchdog) clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          setStatus(false);
          scheduleRetry(null);
        }, 45_000);
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
    if (!closed && ticket === sequence) {
      setStatus(false);
      scheduleRetry(null);
    }
  }

  void connect();

  return {
    close: () => {
      closed = true;
      live = false;
      sequence++;
      stopRequest();
    },
    wake: () => {
      if (closed || live) return;
      attempt = 0;
      void connect();
    },
    isLive: () => live,
  };
}
