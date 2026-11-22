"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { ShopRole, ShopSummary, ShopWorker } from "@/lib/api/types";
import { isShopStaff, shopCapabilities, type ShopCapabilities } from "@/lib/shop-team";

export type ShopAccess = {
  /** The shop and this person's place in it, from `/auth/me/supplier`. */
  shop: ShopSummary | null;
  /** Not the Owner (Staff or Manager): no Money, no Owner settings. */
  staff: boolean;
  /** A Manager: also hours, products and Staff. */
  manager: boolean;
  /** The role in force: the picked PIN person's on a shared PC, else the login's. */
  role: ShopRole;
  /** On a shared shop PC: who is working now. */
  worker: ShopWorker | null;
  can: ShopCapabilities;
};

const OWNER: ShopAccess = {
  shop: null,
  staff: false,
  manager: false,
  role: "owner",
  worker: null,
  can: shopCapabilities("owner"),
};

const ShopAccessContext = createContext<ShopAccess>(OWNER);

/**
 * Whether this supplier workspace belongs to a shop's Staff or Manager.
 * `RoleGate` provides it from the supplier projection; nothing else may set
 * it. Hiding is a courtesy: the API refuses every Owner-only route on its own.
 */
export function ShopAccessProvider({
  shop,
  children,
}: {
  shop: ShopSummary | null;
  children: ReactNode;
}) {
  const value = useMemo<ShopAccess>(() => {
    const role: ShopRole = shop?.role ?? "owner";
    return {
      shop,
      staff: isShopStaff(shop),
      manager: role === "manager",
      role,
      worker: shop?.worker ?? null,
      can: shopCapabilities(role),
    };
  }, [shop]);
  return <ShopAccessContext.Provider value={value}>{children}</ShopAccessContext.Provider>;
}

export function useShopAccess(): ShopAccess {
  return useContext(ShopAccessContext);
}
