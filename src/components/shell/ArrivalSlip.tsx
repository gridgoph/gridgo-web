"use client";

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Notification } from "@/lib/api/types";
import { FAMILY_ICON, presentSlip, slipFamily } from "@/components/shell/slip";
import { isProductionReminder } from "@/lib/live/notificationSound";

/**
 * One slip, landing on the desk.
 *
 * The same register line the Desk panel draws — filled icon tile (this row is
 * unread by definition), the event as the headline, the order underneath —
 * with one "Open" that goes exactly where the inbox row would. Nothing here
 * carries meaning by colour alone; the tile is filled, not tinted.
 *
 * Built on the toast primitive's own parts rather than the styled `ui/toast`
 * wrappers, because the toast list imports this file: the wrappers would make
 * the two modules import each other.
 */
export function ArrivalSlip({ notification }: { notification: Notification }) {
  const { headline, reference } = presentSlip(notification);
  const reminder = isProductionReminder(notification.type);
  const Icon = FAMILY_ICON[slipFamily(notification)];

  return (
    <ToastPrimitive.Content
      data-slot="arrival-slip"
      className="flex h-full items-start gap-3 overflow-hidden px-4 py-3 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100"
    >
      <span
        aria-hidden
        className={
          reminder
            ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-pill border text-text-primary"
            : "border-primary bg-primary text-primary-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-pill border"
        }
        style={reminder ? { background: "var(--color-warning)", borderColor: "var(--color-warning)" } : undefined}
      >
        <Icon size={14} strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <ToastPrimitive.Title
          data-slot="arrival-headline"
          className="text-body text-text-primary m-0 truncate"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {headline}
        </ToastPrimitive.Title>
        {reminder ? (
          <p className="text-caption m-0" style={{ color: "var(--color-warning)" }}>
            Needs an update
          </p>
        ) : null}
        {reference ? (
          <ToastPrimitive.Description
            data-slot="arrival-reference"
            className="text-caption text-text-muted m-0 truncate tabular-nums"
          >
            {reference}
          </ToastPrimitive.Description>
        ) : (
          <ToastPrimitive.Description
            data-slot="arrival-reference"
            className="text-caption text-text-secondary m-0 line-clamp-2"
          >
            {notification.body}
          </ToastPrimitive.Description>
        )}
      </div>
      <ToastPrimitive.Action
        data-slot="arrival-open"
        render={<Button variant="outline" size="sm" />}
        className="shrink-0 self-center"
      />
      <ToastPrimitive.Close
        data-slot="arrival-close"
        aria-label="Dismiss"
        render={<Button variant="ghost" size="icon-sm" />}
        className="text-text-muted hover:text-text-primary shrink-0 self-center"
      >
        <XIcon aria-hidden="true" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Content>
  );
}

/** Several slips at once: one line, and the bell to read them. */
export function ArrivalBurst({ count }: { count: number }) {
  return (
    <ToastPrimitive.Content
      data-slot="arrival-burst"
      className="flex h-full items-start gap-3 overflow-hidden px-4 py-3 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100"
    >
      <span
        aria-hidden
        className="border-primary bg-primary text-primary-foreground text-caption mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-pill border tabular-nums"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {count > 99 ? "99+" : count}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <ToastPrimitive.Title
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        />
        <ToastPrimitive.Description className="text-caption text-text-muted m-0" />
      </div>
      <ToastPrimitive.Close
        aria-label="Dismiss"
        render={<Button variant="ghost" size="icon-sm" />}
        className="text-text-muted hover:text-text-primary shrink-0 self-center"
      >
        <XIcon aria-hidden="true" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Content>
  );
}
