import type { User } from "@/lib/api/types";

/**
 * A shop or rider sign-up still waiting for a decision. Shared by the
 * approvals queue and the rail's count, so the badge and the page's
 * "waiting" list never disagree.
 */
export function isAwaitingSignupReview(user: Pick<User, "verificationStatus">): boolean {
  return (
    user.verificationStatus === "pending" ||
    user.verificationStatus === "unverified" ||
    !user.verificationStatus
  );
}
