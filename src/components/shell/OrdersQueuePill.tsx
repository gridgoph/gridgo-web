"use client";

import { SidebarMenuBadge } from "@/components/ui/sidebar";
import { useOrdersWaitingCount } from "@/lib/live/useOrdersWaitingCount";

function compactCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * The count of orders waiting on Operations, on the rail's Orders row.
 *
 * Yellow, by the captain's call: it is the one place on the rail that asks for
 * attention rather than naming a destination, and the number is work that only
 * this desk can move. It is absent, not zero, when nothing is waiting, so the
 * rail stays quiet until there is something to walk across the room for. The
 * type and colour classes sit on plain elements rather than a merged
 * primitive, which is what once turned the bell count into a blank dot.
 */
export function OrdersQueuePill() {
  const count = useOrdersWaitingCount();
  if (!count) return null;
  return (
    <SidebarMenuBadge
      data-testid="orders-queue-pill"
      className="rounded-pill bg-[var(--color-action-yellow)] px-1.5 text-[var(--color-action-yellow-on)] peer-hover/menu-button:text-[var(--color-action-yellow-on)] peer-data-active/menu-button:text-[var(--color-action-yellow-on)]"
    >
      <span className="text-caption" style={{ fontFamily: "var(--font-medium)" }} aria-hidden>
        {compactCount(count)}
      </span>
      <span className="sr-only">
        {count === 1 ? "1 order waiting on you" : `${compactCount(count)} orders waiting on you`}
      </span>
    </SidebarMenuBadge>
  );
}
