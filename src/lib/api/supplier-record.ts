/**
 * The shop's own reviews and record. Current-user routes only:
 * `GET /me/reviews`, `GET /me/production-lapses`, `GET /me/shop-failures`,
 * `GET /me/reschedule-requests`.
 */

import { apiRequest as shopRequest } from "@/lib/api/client";

export function getMyReviews(): Promise<unknown> {
  return shopRequest("/me/reviews");
}

export function getMyProductionLapses(): Promise<unknown> {
  return shopRequest("/me/production-lapses");
}

export function getMyShopFailures(): Promise<unknown> {
  return shopRequest("/me/shop-failures");
}

export function getMyRescheduleRequests(): Promise<unknown> {
  return shopRequest("/me/reschedule-requests");
}
