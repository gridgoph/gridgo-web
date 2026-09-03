"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  listNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  openNotificationStream,
  type NotificationStreamHandle,
} from "@/lib/api/notifications";
import { getAuthToken } from "@/lib/api/client";
import type { InvalidatePing, Notification } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";

export type LiveContextValue = {
  notifications: Notification[];
  unreadCount: number;
  snapshot: string | null;
  live: boolean;
  subscribe: (listener: (ping: InvalidatePing) => void) => () => void;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (notificationId: string) => Promise<void>;
  refreshInbox: () => Promise<void>;
};

export const LiveContext = createContext<LiveContextValue | null>(null);

function upsertNotification(
  list: Notification[],
  next: Notification,
): Notification[] {
  const index = list.findIndex((row) => row.id === next.id);
  if (index === -1) return [next, ...list];
  const copy = list.slice();
  copy[index] = next;
  return copy;
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const listeners = useRef(new Set<(ping: InvalidatePing) => void>());
  const snapshotRef = useRef<string | null>(null);
  const liveRef = useRef(false);
  const handleRef = useRef<NotificationStreamHandle | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const refreshInbox = useCallback(async () => {
    const inbox = await listNotificationInbox();
    setNotifications(inbox.notifications);
    setSnapshot(inbox.snapshot);
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setSnapshot(null);
      setLive(false);
      return;
    }

    let cancelled = false;
    let handle: NotificationStreamHandle | null = null;

    async function boot() {
      const token = await getAuthToken();
      if (!token || cancelled) return;
      try {
        await refreshInbox();
      } catch {
        // Inbox list is optional on boot — the stream can still attach later.
      }
      if (cancelled) return;
      handle = openNotificationStream({
        getResumeFrom: () => snapshotRef.current,
        onNotification: (notification) => {
          setNotifications((prev) => upsertNotification(prev, notification));
          if (notification.id) setSnapshot(notification.id);
        },
        onInvalidate: (ping) => {
          for (const listener of listeners.current) listener(ping);
        },
        onStatus: (next) => setLive(next),
        onResumeUnavailable: async () => {
          setSnapshot(null);
          try {
            await refreshInbox();
          } catch {
            // Keep the last rendered inbox if the list call fails.
          }
        },
      });
      handleRef.current = handle;
    }

    void boot();
    return () => {
      cancelled = true;
      handle?.close();
      handleRef.current = null;
    };
  }, [refreshInbox, user]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      handleRef.current?.wake();
      if (!liveRef.current) void refreshInbox().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshInbox]);

  const subscribe = useCallback((listener: (ping: InvalidatePing) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const markRead = useCallback(async (notificationId: string) => {
    const next = await markNotificationRead(notificationId, true);
    setNotifications((prev) => upsertNotification(prev, next));
  }, []);

  const markAllRead = useCallback(async () => {
    const cursor = snapshotRef.current;
    if (!cursor) return;
    await markAllNotificationsRead(cursor);
    setNotifications((prev) => prev.map((row) => ({ ...row, read: true })));
  }, []);

  const remove = useCallback(async (notificationId: string) => {
    await deleteNotification(notificationId);
    setNotifications((prev) => prev.filter((row) => row.id !== notificationId));
  }, []);

  const value = useMemo<LiveContextValue>(
    () => ({
      notifications,
      unreadCount: notifications.filter((row) => !row.read).length,
      snapshot,
      live,
      subscribe,
      markRead,
      markAllRead,
      remove,
      refreshInbox,
    }),
    [
      live,
      markAllRead,
      markRead,
      notifications,
      refreshInbox,
      remove,
      snapshot,
      subscribe,
    ],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used within LiveProvider");
  return ctx;
}

export function useLiveOptional(): LiveContextValue | null {
  return useContext(LiveContext);
}
