"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Notification, Role } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { useLive } from "@/lib/live/LiveProvider";
import { notificationHref } from "@/lib/live/notificationHref";
import { cn } from "@/lib/utils";

function unreadLabel(count: number): string {
  if (count <= 0) return "Notifications";
  if (count > 99) return "Notifications, 99+ unread";
  return `Notifications, ${count} unread`;
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
      <p className="text-muted-foreground m-0 px-1 py-6 text-center text-sm">
        You&apos;re all caught up
      </p>
    );
  }

  return (
    <ul className="m-0 flex max-h-80 list-none flex-col gap-0.5 overflow-y-auto p-0">
      {notifications.map((notification) => (
        <li key={notification.id}>
          <button
            type="button"
            className={cn(
              "hover:bg-muted flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-field)] px-2 py-2 text-left",
              !notification.read && "bg-muted/60",
            )}
            onClick={() => onOpen(notification)}
          >
            <span
              className="text-sm text-foreground"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {notification.title}
            </span>
            <span className="text-muted-foreground line-clamp-2 text-xs">
              {notification.body}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatDateTime(notification.at)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function BellButton({
  unreadCount,
  className,
}: {
  unreadCount: number;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("relative", className)}
      aria-label={unreadLabel(unreadCount)}
    >
      <Bell aria-hidden />
      {unreadCount > 0 ? (
        <Badge
          className="absolute top-1 right-1 min-w-4 px-1 py-0 text-[10px] leading-4"
          variant="destructive"
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
  const { notifications, unreadCount, markRead, markAllRead } = useLive();
  const [open, setOpen] = useState(false);

  async function openNotification(notification: Notification) {
    setOpen(false);
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

  const panel = (
    <>
      <div className="flex items-center justify-between gap-2">
        {unreadCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-caption h-8 min-h-8 px-2"
            onClick={() => void markAllRead()}
          >
            Mark all read
          </Button>
        ) : (
          <span />
        )}
      </div>
      <InboxList
        notifications={notifications}
        onOpen={(notification) => void openNotification(notification)}
      />
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<BellButton unreadCount={unreadCount} />} />
        <SheetContent side="right" className="w-full gap-2 p-4 sm:max-w-sm">
          <SheetHeader className="p-0">
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>
          {panel}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<BellButton unreadCount={unreadCount} />} />
      <PopoverContent align="end" className="w-96 gap-2 p-3">
        <PopoverHeader>
          <PopoverTitle>Notifications</PopoverTitle>
        </PopoverHeader>
        {panel}
      </PopoverContent>
    </Popover>
  );
}
