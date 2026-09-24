"use client";

import { SidebarMenuBadge } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

function compactCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function ordersWaitingLabel(count: number): string {
  return count === 1 ? "1 order waiting on you" : `${compactCount(count)} orders waiting on you`;
}

/**
 * The count of orders waiting on Operations, on the rail's Orders row — or on
 * the Queue parent row while that group is folded, so closing a group never
 * hides the work.
 *
 * Yellow, by the captain's call: it is the one place on the rail that asks for
 * attention rather than naming a destination, and the number is work that only
 * this desk can move. It is absent, not zero, when nothing is waiting, so the
 * rail stays quiet until there is something to walk across the room for. The
 * type and colour classes sit on plain elements rather than a merged
 * primitive, which is what once turned the bell count into a blank dot.
 *
 * The count itself comes from `useOrdersWaitingCount`, read once per rail by
 * AppShell, so a folded and an open row never fetch the queue twice.
 */
export function OrdersQueuePill({
  count,
  className,
}: {
  count: number | null;
  className?: string;
}) {
  if (!count) return null;
  return (
    <SidebarMenuBadge
      data-testid="orders-queue-pill"
      className={cn(
        "top-1/2! -translate-y-1/2 rounded-pill bg-[var(--color-action-yellow)] px-1.5 text-[var(--color-action-yellow-on)] peer-hover/menu-button:text-[var(--color-action-yellow-on)] peer-data-active/menu-button:text-[var(--color-action-yellow-on)]",
        className,
      )}
    >
      <span className="text-caption" style={{ fontFamily: "var(--font-medium)" }} aria-hidden>
        {compactCount(count)}
      </span>
      <span className="sr-only">{ordersWaitingLabel(count)}</span>
    </SidebarMenuBadge>
  );
}
