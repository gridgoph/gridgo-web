"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Volume2, VolumeX } from "lucide-react";

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
import { useNotificationSound } from "@/lib/live/useNotificationSound";
import { FAMILY_ICON, presentSlip, slipFamily } from "@/components/shell/slip";
import { cn } from "@/lib/utils";

/**
 * The Desk: every slip that needs a person on the floor, in one register.
 *
 * The count is the one loud thing — on the bell and at the top of the panel.
 * Rows are hairline-separated register lines, not cards: a type icon tile that
 * is filled while the slip is unread and hollow once it is read, the event as
 * the headline, the order underneath it, the time at the trailing edge.
 */

function compactCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function unreadLabel(count: number): string {
  if (count <= 0) return "Notifications";
  return `Notifications, ${compactCount(count)} unread`;
}

export { presentSlip, shortRef, slipFamily } from "@/components/shell/slip";

/* ----------------------------------------------------------------------------
   Panel pieces
   ------------------------------------------------------------------------- */

function SlipRow({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: (notification: Notification) => void;
}) {
  const unread = !notification.read;
  const { headline, reference } = presentSlip(notification);
  const Icon = FAMILY_ICON[slipFamily(notification)];

  return (
    <li className="border-outline-subtle border-b last:border-b-0">
      <button
        type="button"
        data-slot="inbox-slip"
        data-read={unread ? "false" : "true"}
        className="hover:bg-overlay-hover active:bg-overlay-pressed grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3 text-left transition-colors focus-visible:-outline-offset-2"
        onClick={() => onOpen(notification)}
      >
        {/* Filled while unread, hollow once read — the marker that survives greyscale. */}
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-pill border",
            unread
              ? "border-primary bg-primary text-primary-foreground"
              : "border-outline-subtle bg-surface text-text-muted",
          )}
        >
          <Icon size={14} strokeWidth={2} />
        </span>

        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            className={`text-body truncate ${unread ? "text-text-primary" : "text-text-secondary"}`}
            style={unread ? { fontFamily: "var(--font-medium)" } : undefined}
          >
            {headline}
          </span>
          {reference ? (
            <span className="text-caption text-text-muted truncate tabular-nums">
              {reference}
            </span>
          ) : null}
          <span className="text-caption text-text-secondary line-clamp-2">
            {notification.body}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <time
            className="text-caption text-text-muted tabular-nums whitespace-nowrap"
            dateTime={notification.at}
            title={formatDateTime(notification.at)}
          >
            {formatRelativeTime(notification.at)}
          </time>
          {unread ? (
            <span
              className="text-caption text-text-primary"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              New
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function InboxList({
  notifications,
  onOpen,
  fill,
}: {
  notifications: Notification[];
  onOpen: (notification: Notification) => void;
  fill: boolean;
}) {
  if (notifications.length === 0) {
    return (
      <div data-slot="inbox-empty" className="flex flex-col gap-1 px-4 py-8">
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
    <ul
      className={cn(
        "m-0 flex list-none flex-col overflow-y-auto p-0 [scrollbar-color:var(--color-outline)_transparent] [scrollbar-width:thin]",
        fill ? "min-h-0 flex-1" : "max-h-[26rem]",
      )}
    >
      {notifications.map((notification) => (
        <SlipRow key={notification.id} notification={notification} onOpen={onOpen} />
      ))}
    </ul>
  );
}

function SoundToggle() {
  const { enabled, setEnabled } = useNotificationSound();
  const label = enabled ? "Turn sound off" : "Turn sound on";
  return (
    <Button
      variant="ghost"
      size="icon"
      data-slot="inbox-sound"
      data-state={enabled ? "on" : "off"}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      onClick={() => setEnabled(!enabled)}
    >
      {enabled ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
    </Button>
  );
}

/** Live-stream state as dot + words, so it still reads without the colour. */
function FloorStatus({ live }: { live: boolean }) {
  return (
    <span className="text-caption text-text-muted flex items-center gap-1.5">
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-pill ${live ? "bg-success" : "bg-warning"}`}
      />
      {live ? "Floor live" : "Reconnecting"}
    </span>
  );
}

function InboxPanel({
  notifications,
  unreadCount,
  markError,
  onMarkAllRead,
  onOpen,
  fill,
}: {
  notifications: Notification[];
  unreadCount: number;
  markError: string | null;
  onMarkAllRead: () => void;
  onOpen: (notification: Notification) => void;
  fill: boolean;
}) {
  return (
    <div
      data-slot="inbox-docket"
      className={cn("flex flex-col gap-0", fill && "min-h-0 flex-1")}
    >
      <div className="flex items-end justify-between gap-3 px-4 pt-1 pb-3">
        <p data-slot="inbox-waiting" className="m-0 flex items-baseline gap-1.5">
          {unreadCount > 0 ? (
            <>
              <span className="text-h1 text-text-primary tabular-nums">
                {compactCount(unreadCount)}
              </span>{" "}
              <span className="text-body text-text-secondary">waiting</span>
            </>
          ) : (
            <span className="text-body text-text-secondary">You&apos;re caught up</span>
          )}
        </p>
        <span className="flex shrink-0 items-center gap-1">
          {unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={onMarkAllRead}>
              Mark all read
            </Button>
          ) : null}
          <SoundToggle />
        </span>
      </div>
      {markError ? (
        <p className="text-caption text-error m-0 px-4 pb-2">{markError}</p>
      ) : null}
      {/* The tear line: what is above is the desk, what is below are the slips. */}
      <div className="border-outline mx-4 border-t border-dashed" aria-hidden />
      <InboxList notifications={notifications} onOpen={onOpen} fill={fill} />
    </div>
  );
}

/**
 * Must be a Button element — a wrapper component drops the trigger's click.
 * The count is a 20px monochrome pill (shadcn `primary` pair, never yellow)
 * with a surface-coloured ring so it lifts off the bell in both themes.
 */
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
        /*
         * A plain span rather than <Badge>: tailwind-merge reads GRIDGO's type
         * utilities (text-caption, text-nav, …) as text colours and drops the
         * badge's own text colour, which painted the digits in the pill's
         * colour — the "dot" the captain saw. Sitting a quarter off the corner
         * keeps the bell itself uncovered.
         */
        <span
          aria-hidden
          data-slot="inbox-count"
          className="bg-primary text-primary-foreground text-caption ring-surface absolute top-0 right-0 flex h-5 min-w-5 -translate-y-1/4 translate-x-1/4 items-center justify-center rounded-pill px-1.5 tabular-nums ring-2"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {compactCount(unreadCount)}
        </span>
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

  const trigger = bellTrigger(unreadCount);

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
        {/* The primitive's own data-[side] width beats a bare w-full, so the
            override has to sit on the same variant. */}
        <SheetContent
          side="right"
          className="gap-0 p-0 data-[side=right]:w-full sm:max-w-sm"
        >
          {/* Right padding clears the sheet's own close control. */}
          <SheetHeader className="flex-row items-center justify-between gap-3 px-4 pt-3 pr-16 pb-0">
            {/* Type and colour stay off these primitives' className: tailwind-merge
                treats text-h3 / text-caption as colours and drops one of the pair. */}
            <SheetTitle
              className="text-h3 m-0"
              style={{ fontFamily: "var(--font-bold)" }}
            >
              Desk
            </SheetTitle>
            <SheetDescription className="m-0">
              <FloorStatus live={live} />
            </SheetDescription>
          </SheetHeader>
          <InboxPanel
            notifications={notifications}
            unreadCount={unreadCount}
            markError={markError}
            onMarkAllRead={() => void handleMarkAllRead()}
            onOpen={(notification) => void openNotification(notification)}
            fill
          />
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
        className="w-96 gap-0 overflow-hidden rounded-card p-0"
      >
        <PopoverHeader className="flex-row items-center justify-between gap-3 px-4 pt-3 pb-0">
          <PopoverTitle
            className="text-h3 m-0"
            style={{ fontFamily: "var(--font-bold)" }}
          >
            Desk
          </PopoverTitle>
          <PopoverDescription className="m-0">
            <FloorStatus live={live} />
          </PopoverDescription>
        </PopoverHeader>
        <InboxPanel
          notifications={notifications}
          unreadCount={unreadCount}
          markError={markError}
          onMarkAllRead={() => void handleMarkAllRead()}
          onOpen={(notification) => void openNotification(notification)}
          fill={false}
        />
      </PopoverContent>
    </Popover>
  );
}
