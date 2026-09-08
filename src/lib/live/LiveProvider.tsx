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
import type { InvalidatePing, Notification, Role } from "@/lib/api/types";
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

function upsertNotification(list: Notification[], next: Notification): Notification[] {
  const index = list.findIndex((row) => row.id === next.id);
  if (index === -1) return [next, ...list];
  const copy = list.slice();
  copy[index] = next;
  return copy;
}

export function LiveProvider({ children, role }: { children: ReactNode; role?: Role }) {
  const { user } = useAuth();
  return (
    <AccountLiveProvider key={`${user?.id ?? "signed-out"}:${role ?? ""}`} role={role}>
      {children}
    </AccountLiveProvider>
  );
}

function AccountLiveProvider({ children, role }: { children: ReactNode; role?: Role }) {
  const { user, refresh: refreshIdentity } = useAuth();
  const userId = user?.id;
  const identityRefresh = useRef(refreshIdentity);
  identityRefresh.current = refreshIdentity;
  const active = useRef(true);
  const inboxGeneration = useRef(0);
  const arrivalRevision = useRef(0);
  const arrivals = useRef(new Map<string, { revision: number; row: Notification }>());
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
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
    if (!userId) return;
    const generation = ++inboxGeneration.current;
    const revision = arrivalRevision.current;
    const inbox = await listNotificationInbox(role);
    if (!active.current || generation !== inboxGeneration.current) return;
    let rows = inbox.notifications;
    for (const [id, arrival] of arrivals.current) {
      if (arrival.revision > revision) rows = upsertNotification(rows, arrival.row);
      else arrivals.current.delete(id);
    }
    setNotifications(rows);
    if (revision === arrivalRevision.current) {
      snapshotRef.current = inbox.snapshot;
      setSnapshot(inbox.snapshot);
    }
  }, [role, userId]);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setSnapshot(null);
      setLive(false);
      return;
    }

    let cancelled = false;
    let handle: NotificationStreamHandle | null = null;

    async function boot() {
      if (cancelled) return;
      void refreshInbox().catch(() => undefined);
      if (cancelled) return;
      handle = openNotificationStream({
        role,
        getResumeFrom: () => snapshotRef.current,
        onNotification: (notification) => {
          if (cancelled) return;
          arrivals.current.set(notification.id, {
            revision: ++arrivalRevision.current,
            row: notification,
          });
          setNotifications((prev) => upsertNotification(prev, notification));
          if (notification.id) {
            snapshotRef.current = notification.id;
            setSnapshot(notification.id);
          }
        },
        onInvalidate: (ping) => {
          if (cancelled) return;
          if (ping.resource === "notifications")
            void refreshInbox().catch(() => undefined);
          if (ping.resource === "identity") void identityRefresh.current();
          for (const listener of listeners.current) listener(ping);
        },
        onStatus: (next) => {
          if (cancelled) return;
          setLive(next);
          if (next) {
            void refreshInbox().catch(() => undefined);
            void identityRefresh.current();
          }
        },
        onResumeUnavailable: async () => {
          snapshotRef.current = null;
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
  }, [refreshInbox, userId, role]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      handleRef.current?.wake();
      if (userId) void refreshInbox().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshInbox, userId]);

  const subscribe = useCallback((listener: (ping: InvalidatePing) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const markRead = useCallback(async (notificationId: string) => {
    const next = await markNotificationRead(notificationId, true);
    if (active.current) setNotifications((prev) => upsertNotification(prev, next));
  }, []);

  const markAllRead = useCallback(async () => {
    const cursor = snapshotRef.current;
    if (!cursor) return;
    const ids = new Set(notifications.map((row) => row.id));
    await markAllNotificationsRead(cursor, role);
    if (active.current)
      setNotifications((prev) =>
        prev.map((row) => (ids.has(row.id) ? { ...row, read: true } : row)),
      );
  }, [notifications, role]);

  const remove = useCallback(async (notificationId: string) => {
    await deleteNotification(notificationId);
    if (active.current)
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
