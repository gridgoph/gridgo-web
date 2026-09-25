import type { PortalRoleProjection } from "@/lib/api/types";

/**
 * Standings that close a workspace. `pending` is deliberately absent: a shop
 * waiting for review keeps its workspace (gridgoph/gridgo-web#77).
 */
export type WithdrawnStatus = "suspended" | "rejected";

export type WithdrawnStanding = {
  status: WithdrawnStatus;
  /** Operations' own words, when they recorded any. */
  reason: string | null;
  /** The shop's trading name, so a multi-shop person knows which account this is. */
  accountName: string | null;
};

/** The public report page is how a shop with no workspace reaches Operations. */
export const OPERATIONS_CONTACT_URL = "https://gridgo.talasora.com/report";

/**
 * Read the supplier approval case the fixed `/auth/me/supplier` projection
 * already carries. Any other projection, an approved or pending case, or no
 * case at all (a migration-era account) leaves the workspace open.
 */
export function withdrawnStanding(projection: PortalRoleProjection): WithdrawnStanding | null {
  if (!("approvalCase" in projection)) return null;
  const approvalCase = projection.approvalCase;
  if (!approvalCase) return null;
  const { status } = approvalCase;
  if (status !== "suspended" && status !== "rejected") return null;
  const reason =
    status === "suspended" ? approvalCase.suspensionReason : approvalCase.rejectionReason;
  return {
    status,
    reason: reason?.trim() || null,
    accountName: projection.supplierProfile?.shopName?.trim() || null,
  };
}
