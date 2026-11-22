"use client";

import { useSyncExternalStore } from "react";

import {
  shopDeviceSnapshot,
  subscribeShopDevice,
  type ShopDeviceState,
} from "@/lib/shop-device";

const SERVER: ShopDeviceState = { shared: false, worker: null, expiresAt: null, lockReason: null };

/** The shared shop PC state (`src/lib/shop-device.ts`), re-rendering on change. */
export function useShopDevice(): ShopDeviceState {
  return useSyncExternalStore(subscribeShopDevice, shopDeviceSnapshot, () => SERVER);
}
