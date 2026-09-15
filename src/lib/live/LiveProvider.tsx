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
import {
  isFreshArrival,
  notificationChime,
  readNotificationSoundEnabled,
} from "@/lib/live/notificationSound";
import { createArrivalAnnouncer, type ArrivalAnnouncer } from "@/lib/live/arrivalToast";
import { toast } from "@/components/ui/toast";
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

function applyInboxMutations(
  rows: Notification[],
  mutations: ReadonlyMap<string, { kind: "read" | "deleted"; revision: number }>,
): Notification[] {
  return rows
    .filter((row) => mutations.get(row.id)?.kind !== "deleted")
    .map((row) =>
      mutations.get(row.id)?.kind === "read" ? { ...row, read: true } : row,
    );
}

type LiveProviderProps = {
  children: ReactNode;
  role?: Role;
  /**
   * Where "Open" on an arrival toast goes. The shell supplies navigation;
   * the provider itself never touches the router.
   */
  onOpenNotification?: (notification: Notification) => void;
};

export function LiveProvider({ children, role, onOpenNotification }: LiveProviderProps) {
  const { user } = useAuth();
  return (
    <AccountLiveProvider
      key={`${user?.id ?? "signed-out"}:${role ?? ""}`}
      role={role}
      onOpenNotification={onOpenNotification}
    >
      {children}
    </AccountLiveProvider>
  );
}

function AccountLiveProvider({ children, role, onOpenNotification }: LiveProviderProps) {
  const { user, refresh: refreshIdentity } = useAuth();
  const userId = user?.id;
  const identityRefresh = useRef(refreshIdentity);
  identityRefresh.current = refreshIdentity;
  const openNotification = useRef(onOpenNotification);
  openNotification.current = onOpenNotification;
  // The toast announcer outlives any one stream: a reconnect must not reset
  // an open burst, and "Open" must still mark the row read after a remount.
  const announcer = useRef<ArrivalAnnouncer | null>(null);
  const active = useRef(true);
  const inboxGeneration = useRef(0);
  const arrivalRevision = useRef(0);
  const mutationRevision = useRef(0);
  const mutations = useRef(
    new Map<string, { kind: "read" | "deleted"; revision: number }>(),
  );
  const arrivals = useRef(new Map<string, { revision: number; row: Notification }>());
  // Chime bookkeeping: ids this tab has already shown, and whether the first inbox
  // fetch landed. The stream replays history on connect; none of that is news.
  const knownIds = useRef(new Set<string>());
  const inboxLoaded = useRef(false);
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
    const mutationAtStart = mutationRevision.current;
    const inbox = await listNotificationInbox(role);
    if (!active.current || generation !== inboxGeneration.current) return;
    let rows = inbox.notifications;
    for (const [id, arrival] of arrivals.current) {
      if (arrival.revision > revision) rows = upsertNotification(rows, arrival.row);
      else arrivals.current.delete(id);
    }
    for (const [id, mutation] of mutations.current) {
      if (mutation.revision <= mutationAtStart) mutations.current.delete(id);
    }
    for (const row of rows) knownIds.current.add(row.id);
    inboxLoaded.current = true;
    setNotifications(applyInboxMutations(rows, mutations.current));
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
    announcer.current ??= createArrivalAnnouncer({
      manager: toast,
      onOpen: (notification) => {
        void markReadRef.current(notification.id).catch(() => undefined);
        openNotification.current?.(notification);
      },
    });

    async function boot() {
      if (cancelled) return;
      void refreshInbox().catch(() => undefined);
      if (cancelled) return;
      handle = openNotificationStream({
        role,
        getResumeFrom: () => snapshotRef.current,
        onNotification: (notification) => {
          if (cancelled) return;
          const row = applyInboxMutations([notification], mutations.current)[0];
          const unseen = !knownIds.current.has(notification.id);
          knownIds.current.add(notification.id);
          // News is a row this tab has not shown, arriving after the first
          // inbox fetch, still unread and still fresh. It gets said out loud
          // (if the sound is on) and shown where the person is looking.
          const news =
            unseen &&
            inboxLoaded.current &&
            Boolean(row) &&
            !row.read &&
            isFreshArrival(notification.at);
          if (news) {
            if (readNotificationSoundEnabled()) notificationChime().play();
            announcer.current?.announce(row);
          }
          const revision = ++arrivalRevision.current;
          if (row) arrivals.current.set(notification.id, { revision, row });
          else arrivals.current.delete(notification.id);
          setNotifications((prev) =>
            applyInboxMutations(
              upsertNotification(prev, notification),
              mutations.current,
            ),
          );
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

  useEffect(
    () => () => {
      announcer.current?.dispose();
      announcer.current = null;
    },
    [],
  );

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      // A healthy stream is left alone (wake is a no-op while live); only a
      // dropped one reconnects. The inbox is reconciled either way.
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
    if (!active.current) return;
    if (mutations.current.get(notificationId)?.kind !== "deleted")
      mutations.current.set(notificationId, {
        kind: "read",
        revision: ++mutationRevision.current,
      });
    setNotifications((prev) =>
      applyInboxMutations(upsertNotification(prev, next), mutations.current),
    );
  }, []);

  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  const markAllRead = useCallback(async () => {
    const cursor = snapshotRef.current;
    if (!cursor) return;
    const ids = new Set(notifications.map((row) => row.id));
    await markAllNotificationsRead(cursor, role);
    if (!active.current) return;
    for (const id of ids) {
      if (mutations.current.get(id)?.kind !== "deleted")
        mutations.current.set(id, {
          kind: "read",
          revision: ++mutationRevision.current,
        });
    }
    setNotifications((prev) => applyInboxMutations(prev, mutations.current));
  }, [notifications, role]);

  const remove = useCallback(async (notificationId: string) => {
    await deleteNotification(notificationId);
    if (!active.current) return;
    mutations.current.set(notificationId, {
      kind: "deleted",
      revision: ++mutationRevision.current,
    });
    setNotifications((prev) => applyInboxMutations(prev, mutations.current));
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
