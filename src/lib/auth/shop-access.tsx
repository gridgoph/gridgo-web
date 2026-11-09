"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { ShopSummary } from "@/lib/api/types";
import { isShopStaff } from "@/lib/shop-team";

export type ShopAccess = {
  /** The shop and this person's place in it, from `/auth/me/supplier`. */
  shop: ShopSummary | null;
  /** A Staff login: work screens only. */
  staff: boolean;
};

const ShopAccessContext = createContext<ShopAccess>({ shop: null, staff: false });

/**
 * Whether this supplier workspace belongs to a shop's Staff. `RoleGate`
 * provides it from the supplier projection; nothing else may set it. Hiding
 * is a courtesy: the API refuses every Owner-only route on its own.
 */
export function ShopAccessProvider({
  shop,
  children,
}: {
  shop: ShopSummary | null;
  children: ReactNode;
}) {
  return (
    <ShopAccessContext.Provider value={{ shop, staff: isShopStaff(shop) }}>
      {children}
    </ShopAccessContext.Provider>
  );
}

export function useShopAccess(): ShopAccess {
  return useContext(ShopAccessContext);
}
