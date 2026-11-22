"use client";

import type { ReactNode } from "react";

import { WhosWorking } from "@/components/shop-device/WhosWorking";
import { useShopDevice } from "@/components/shop-device/useShopDevice";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isWorkerLockCode } from "@/lib/shop-device";

/**
 * The supplier tree on a shared shop PC. While nobody is picked, the whole
 * screen is "Who's working?" and nothing behind it mounts, so no Owner screen,
 * stream or cache survives a lock. A reload drops the in-memory turn; the API
 * then answers `shop_worker_locked` and the picker shows again.
 */
export function ShopDeviceGate({ children }: { children: ReactNode }) {
  const device = useShopDevice();
  const auth = useAuth();
  const apiLocked = auth.status === "unavailable" && isWorkerLockCode(auth.accessError);

  if (!device.worker && (device.shared || apiLocked)) {
    return <WhosWorking reason={device.lockReason} />;
  }
  // Picked, while the sign-in check catches up with the new turn.
  if (device.worker && (apiLocked || auth.status === "checking")) {
    return <LoadingBlock label="Opening the shop…" />;
  }
  return <>{children}</>;
}
