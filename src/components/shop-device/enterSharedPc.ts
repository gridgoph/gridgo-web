"use client";

import { lockWorkingDevice } from "@/lib/api/shop-team";
import { releaseWebPushForSignOut } from "@/lib/pwa/webPush";
import { lockShopDevice } from "@/lib/shop-device";

/**
 * Make this PC the shop's shared PC, in the order the API asks
 * (docs/SHOP_TEAM_API.md, shared devices): first stop this browser getting
 * the signed-in account's pushes (the lock refuses those routes after), then
 * lock the device, then show "Who's working?". Showing the picker unmounts
 * the work shell, which closes the account's stream and drops its cached
 * notifications and screens. From here the signed-in account only comes back
 * by signing out and in again.
 */
export async function enterSharedPc(): Promise<void> {
  await releaseWebPushForSignOut().catch(() => undefined);
  await lockWorkingDevice();
  lockShopDevice(null);
}
