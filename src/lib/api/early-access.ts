/**
 * Google Play early access: the website's Android waitlist, read and granted
 * by Operations and Super Admin (contract `gridgo-api/docs/EARLY_ACCESS_API.md`).
 *
 * The email is personal data. It is shown on the staff screen only and is
 * never logged, copied into a URL, or put in a notice.
 */

import { apiRequest } from "@/lib/api/client";

export type EarlyAccessStatus = "pending" | "granted";

export type EarlyAccessSignup = {
  id: string;
  email: string;
  /** Short slug from the website's `?src=` (a booth, a campus); null when none. */
  source: string | null;
  platform: "android" | string;
  status: EarlyAccessStatus;
  createdAt: string;
  grantedAt: string | null;
  /** GRIDGO user id for Operations/Super Admin; the Clerk subject for the support desk. */
  grantedBy: string | null;
};

/** Per status, matching `q` and ignoring the status filter. */
export type EarlyAccessCounts = { pending: number; granted: number };

export type EarlyAccessPage = {
  signups: EarlyAccessSignup[];
  counts: EarlyAccessCounts;
  /** Rows matching both the status filter and `q`. */
  total: number;
  limit: number;
  offset: number;
};

export type EarlyAccessQuery = {
  status?: EarlyAccessStatus | null;
  q?: string;
  /** 1–100; the API's default is 50. */
  limit?: number;
  offset?: number;
};

/** Newest first, id as the tie-breaker. */
export async function listEarlyAccess(
  query: EarlyAccessQuery = {},
): Promise<EarlyAccessPage> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  const q = query.q?.trim();
  if (q) params.set("q", q);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  const qs = params.toString();
  return apiRequest<EarlyAccessPage>(`/ops/early-access${qs ? `?${qs}` : ""}`);
}

/**
 * Marks the sign-up granted and queues the Play invite email. Idempotent: a
 * sign-up already granted comes back with its original decision.
 */
export async function grantEarlyAccess(id: string): Promise<EarlyAccessSignup> {
  return apiRequest<EarlyAccessSignup>(
    `/ops/early-access/${encodeURIComponent(id)}/grant`,
    {
      method: "POST",
    },
  );
}
