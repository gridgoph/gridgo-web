"use client";

import { releaseWebPushForSharedPc, resumePersonalPush } from "@/lib/pwa/webPush";
import { beginSharedHandover, cancelSharedHandover, lockShopDevice } from "@/lib/shop-device";
import { sendDeviceLock } from "@/lib/shop-device-lock";

/**
 * Make this PC the shop's shared PC, in the order the API asks
 * (docs/SHOP_TEAM_API.md, shared devices):
 *
 * 1. The account's live stream closes and its push stops registering
 *    (`beginSharedHandover`; the shell reads it).
 * 2. Notifications on screen close and the browser's subscription is
 *    removed, here and at GRIDGO, each step confirmed
 *    (`releaseWebPushForSharedPc`). The lock refuses those routes after.
 * 3. The device locks on the API, then "Who's working?" shows.
 *
 * Any failure rejects and leaves this the account's PC, so the Owner can try
 * again; what was not removed is kept for that retry. From the picker on, the
 * signed-in account only comes back by signing out and in again.
 */
export async function enterSharedPc(): Promise<void> {
  beginSharedHandover();
  // Let the shell close the account's stream before anything else happens.
  await new Promise((resolve) => setTimeout(resolve, 0));
  try {
    await releaseWebPushForSharedPc();
    await sendDeviceLock();
  } catch (error) {
    cancelSharedHandover();
    resumePersonalPush();
    throw error;
  }
  lockShopDevice(null);
}
