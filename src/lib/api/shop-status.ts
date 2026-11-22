/**
 * My shop status (`GET/PATCH /me/shop-status`, gridgo-api
 * docs/EXPRESS_API.md#my-shop-status-and-night-documents). Owners and Staff
 * read; the Owner alone writes this release. Every write carries the shop
 * profile's `expectedVersion`; `409 shop_profile_stale` means reread.
 */

import { apiRequest } from "@/lib/api/client";
import {
  normalizeMyShopStatus,
  type MyShopStatus,
  type MyShopStatusPatch,
} from "@/lib/my-shop-status";

export async function getMyShopStatus(): Promise<MyShopStatus | null> {
  return normalizeMyShopStatus(await apiRequest<unknown>("/me/shop-status"));
}

export async function updateMyShopStatus(
  expectedVersion: number,
  patch: MyShopStatusPatch,
): Promise<MyShopStatus | null> {
  return normalizeMyShopStatus(
    await apiRequest<unknown>("/me/shop-status", {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion, ...patch }),
    }),
  );
}
