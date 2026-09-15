"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Notification, Role } from "@/lib/api/types";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { useLive } from "@/lib/live/LiveProvider";
import { notificationHref } from "@/lib/live/notificationHref";
import { cn } from "@/lib/utils";

function unreadLabel(count: number): string {
  if (count <= 0) return "Notifications";
  if (count > 99) return "Notifications, 99+ unread";
  return `Notifications, ${count} unread`;
}

function waitingCopy(count: number): string {
  if (count <= 0) return "You're caught up";
  if (count === 1) return "1 waiting";
  if (count > 99) return "99+ waiting";
  return `${count} waiting`;
}

function CropMarks() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1 left-1 z-10 size-2.5 border-t border-l border-foreground"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-1 right-1 z-10 size-2.5 border-t border-r border-foreground"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-1 left-1 z-10 size-2.5 border-b border-l border-foreground"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-1 bottom-1 z-10 size-2.5 border-r border-b border-foreground"
      />
    </>
  );
}

function InboxList({
  notifications,
  onOpen,
}: {
  notifications: Notification[];
  onOpen: (notification: Notification) => void;
}) {
  if (notifications.length === 0) {
    return (
      <div
        data-slot="inbox-empty"
        className="border-outline mx-3 mb-3 flex flex-col gap-1 rounded-[var(--radius-field)] border border-dashed px-3 py-6"
      >
        <p
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          The desk is clear
        </p>
        <p className="text-caption text-text-muted m-0">
          Payments, sign-ups, pickup holds, and shop progress land here
        </p>
      </div>
    );
  }

  return (
    <ul className="m-0 flex max-h-80 list-none flex-col gap-2 overflow-y-auto px-3 pb-3">
      {notifications.map((notification) => {
        const unread = !notification.read;
        return (
          <li key={notification.id}>
            <button
              type="button"
              className={cn(
                "flex min-h-11 w-full flex-col items-stretch gap-1 rounded-[var(--radius-field)] border px-3 py-2.5 text-left",
                unread
                  ? "border-outline bg-surface-variant"
                  : "border-outline-subtle bg-surface",
                "hover:bg-overlay-hover",
              )}
              onClick={() => onOpen(notification)}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className="text-body text-text-primary min-w-0 truncate"
                  style={{ fontFamily: "var(--font-medium)" }}
                >
                  {notification.title}
                </span>
                {unread ? (
                  <span className="text-overline text-text-primary border-outline shrink-0 border px-1.5 py-0.5">
                    New
                  </span>
                ) : null}
              </span>
              <span className="text-caption text-text-secondary line-clamp-2">
                {notification.body}
              </span>
              <time
                className="text-caption text-text-muted tabular-nums"
                dateTime={notification.at}
                title={formatDateTime(notification.at)}
              >
                {formatRelativeTime(notification.at)}
              </time>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function InboxPanel({
  notifications,
  unreadCount,
  markError,
  onMarkAllRead,
  onOpen,
}: {
  notifications: Notification[];
  unreadCount: number;
  markError: string | null;
  onMarkAllRead: () => void;
  onOpen: (notification: Notification) => void;
}) {
  return (
    <div data-slot="inbox-docket" className="flex flex-col gap-0">
      <div className="flex items-center justify-between gap-2 px-3 pb-2">
        <p className="text-caption text-text-muted m-0">{waitingCopy(unreadCount)}</p>
        {unreadCount > 0 ? (
          <Button variant="outline" size="sm" onClick={onMarkAllRead}>
            Mark all read
          </Button>
        ) : null}
      </div>
      {markError ? (
        <p className="text-caption text-error m-0 px-3 pb-2">{markError}</p>
      ) : null}
      <div className="border-outline mx-3 mb-3 border-t border-dashed" aria-hidden />
      <InboxList notifications={notifications} onOpen={onOpen} />
    </div>
  );
}

/** Must be a Button element — a wrapper component drops the trigger's click. */
function bellTrigger(unreadCount: number) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative self-center data-open:bg-muted"
      aria-label={unreadLabel(unreadCount)}
      data-slot="inbox-bell"
    >
      <Bell aria-hidden />
      {unreadCount > 0 ? (
        <Badge
          variant="default"
          className="absolute top-1 right-1 min-w-4 px-1 py-0 text-nav leading-4"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </Badge>
      ) : null}
    </Button>
  );
}

export function InboxBell({ role }: { role: Role }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { notifications, unreadCount, live, markRead, markAllRead } = useLive();
  const [open, setOpen] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  async function openNotification(notification: Notification) {
    setOpen(false);
    setMarkError(null);
    if (!notification.read) {
      try {
        await markRead(notification.id);
      } catch {
        // Navigation still happens; unread can be cleared on the next hydrate.
      }
    }
    const href = notificationHref(role, notification);
    if (href) router.push(href);
  }

  async function handleMarkAllRead() {
    setMarkError(null);
    try {
      await markAllRead();
    } catch {
      setMarkError("Couldn't mark them read. Try again.");
    }
  }

  const panel = (
    <InboxPanel
      notifications={notifications}
      unreadCount={unreadCount}
      markError={markError}
      onMarkAllRead={() => void handleMarkAllRead()}
      onOpen={(notification) => void openNotification(notification)}
    />
  );

  const trigger = bellTrigger(unreadCount);
  const floorStatus = live ? "Floor live" : "Reconnecting";

  if (isMobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setMarkError(null);
        }}
      >
        <SheetTrigger render={trigger} />
        <SheetContent side="right" className="relative w-full gap-0 p-0 sm:max-w-sm">
          <CropMarks />
          <SheetHeader className="border-outline gap-1 border-b border-dashed px-3 py-3">
            <SheetTitle className="text-h3 m-0">Desk</SheetTitle>
            <SheetDescription className="text-caption text-text-muted">
              {floorStatus}
            </SheetDescription>
          </SheetHeader>
          {panel}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setMarkError(null);
      }}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align="end"
        sideOffset={8}
        className="relative w-96 gap-0 overflow-hidden rounded-[var(--radius-card)] p-0"
      >
        <CropMarks />
        <PopoverHeader className="border-outline gap-1 border-b border-dashed px-3 py-3">
          <PopoverTitle className="text-h3 m-0">Desk</PopoverTitle>
          <PopoverDescription className="text-caption text-text-muted">
            {floorStatus}
          </PopoverDescription>
        </PopoverHeader>
        {panel}
      </PopoverContent>
    </Popover>
  );
}
