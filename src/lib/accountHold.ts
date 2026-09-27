import type { AccountStatus } from "@/lib/api/types";

export type AccountHold = {
  title: string;
  reason: string;
};

/** What a signed-in person sees when GRIDGO has suspended or removed the account. */
export function accountHold(user: {
  accountStatus?: AccountStatus | string | null;
  accountStatusReason?: string | null;
} | null | undefined): AccountHold | null {
  if (user?.accountStatus === "suspended") {
    return {
      title: "This account is suspended.",
      reason: user.accountStatusReason ?? "",
    };
  }
  if (user?.accountStatus === "removed") {
    return {
      title: "This account has been removed.",
      reason: user.accountStatusReason ?? "",
    };
  }
  return null;
}
