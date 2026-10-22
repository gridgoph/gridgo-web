/**
 * The shop's own reviews and record. Current-user routes only:
 * `GET /me/reviews`, `GET /me/production-lapses`, `GET /me/shop-failures`,
 * `GET /me/reschedule-requests`.
 */

import { withRequestDeadline } from "@/lib/api/requestDeadline";
import { ApiError, getApiBase, getAuthToken, getWorkspaceRole } from "@/lib/api/client";

async function shopRequest<T>(path: string): Promise<T> {
  return withRequestDeadline(undefined, async (signal) => {
    const headers: Record<string, string> = { Accept: "application/json" };
    signal.throwIfAborted();
    const token = await getAuthToken();
    signal.throwIfAborted();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      const role = getWorkspaceRole();
      if (role) headers["X-GRIDGO-Role"] = role;
    }
    const res = await fetch(`${getApiBase()}${path}`, { headers, signal });
    const textBody = await res.text();
    let data: unknown = null;
    if (textBody) {
      try {
        data = JSON.parse(textBody);
      } catch {
        data = textBody;
      }
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data as T;
  });
}

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
