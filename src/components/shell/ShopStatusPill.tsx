"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Store } from "lucide-react";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { getExpressSettings, getMyShopHours } from "@/lib/api/client";
import type { ExpressSettings, ShopHours } from "@/lib/api/types";
import { useShopAccess } from "@/lib/auth/shop-access";
import { SHOP_STATUS_CHANGED, shopStatus } from "@/lib/shop-status";

/**
 * The shop's name and status at the top of the rail: open or closed, Express
 * on or off. Hours and the Express switch are the Owner's (the API refuses
 * them to Staff), so a Staff login reads the shop's name only. Opens My shop
 * for the Owner, where both are changed.
 */
export function ShopStatusPill({ onNavigate }: { onNavigate: () => void }) {
  const { shop, staff } = useShopAccess();
  const [hours, setHours] = useState<ShopHours | null>(null);
  const [express, setExpress] = useState<ExpressSettings | null>(null);

  const load = useCallback(() => {
    if (staff) return;
    void getMyShopHours()
      .then(setHours)
      .catch(() => undefined);
    // An API without the shop-wide switch answers 404: the pill leaves Express out.
    void getExpressSettings()
      .then(setExpress)
      .catch(() => undefined);
  }, [staff]);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener(SHOP_STATUS_CHANGED, onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(SHOP_STATUS_CHANGED, onFocus);
    };
  }, [load]);

  const status = shopStatus(hours, express);
  const name = shop?.name?.trim() || "Your shop";
  const dot =
    status.open == null
      ? "var(--color-text-muted)"
      : status.open
        ? "var(--color-success)"
        : "var(--color-text-muted)";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          className="bg-sidebar-accent/60 group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
          tooltip={status.line ? `${name} · ${status.line}` : name}
          render={staff ? <div /> : <Link href="/supplier/my-shop" />}
          onClick={onNavigate}
          aria-label={status.line ? `${name}, ${status.line}` : name}
        >
          <Store strokeWidth={1.75} aria-hidden />
          <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate" style={{ fontFamily: "var(--font-medium)" }}>
              {name}
            </span>
            {status.line ? (
              <span className="text-caption text-text-secondary flex items-center gap-1.5 truncate">
                <span
                  aria-hidden
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{ background: dot }}
                />
                {status.line}
              </span>
            ) : null}
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
