/**
 * Founding Tester invites, rewards and the monthly voucher budget
 * (gridgo-client#323; contract `gridgo-api/docs/FOUNDING_TESTER_API.md`).
 *
 * A client shares a personal invite link to the tester sign-up form. Operations
 * records each form response (code + email); the API matches it to a client
 * account by email. When the invited friend finishes all five steps, the
 * friend and the inviter each get a voucher, unless a phone number, app
 * installation or delivery address matches (a block, for good). Missing
 * evidence is neither a match nor a pass: the reward still issues, and records
 * which checks ran and what was missing so staff can review it and void it.
 * Every tester voucher counts against a monthly budget (Manila month, face
 * value); a reward with no room waits, paused, until Super Admin resumes it.
 *
 * Pure functions, unit tested in `src/lib/__tests__/tester-program.test.ts`.
 */

import type {
  TesterBudget,
  TesterCheckKey,
  TesterInvite,
  TesterInviteStatus,
  TesterInviteUnmatchedReason,
  TesterReward,
  TesterRewardCheck,
  TesterRewardStatus,
} from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import { formatPhp } from "@/lib/format";
import { formatManila } from "@/lib/vouchers";

type Presentation = { label: string; tone: StatusTone; icon: StatusIconName };

/** The client app's words for the share action. */
export const INVITE_A_FRIEND = "Invite a friend";

/** Reasons the API accepts on void and resume. */
export const TESTER_REASON_MAX = 1000;

/** The reward lists read 100 a page (the API allows up to 500). */
export const TESTER_LIST_PAGE_SIZE = 100;

// ---- Budget ----

/** "October 2026" from the API's `2026-10`. */
export function budgetMonthText(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m || m < 1 || m > 12) return month;
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleString("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The budget as one headline and one line under it. */
export function presentBudget(budget: TesterBudget): {
  value: string;
  hint: string;
  full: boolean;
} {
  const month = budgetMonthText(budget.month);
  if (budget.limitMinor == null) {
    return {
      value: formatPhp(budget.usedMinor),
      hint: `Issued in ${month}, Manila time. No monthly limit.`,
      full: false,
    };
  }
  const remaining =
    budget.remainingMinor ?? Math.max(0, budget.limitMinor - budget.usedMinor);
  return {
    value: `${formatPhp(budget.usedMinor)} of ${formatPhp(budget.limitMinor)}`,
    hint:
      remaining > 0
        ? `Issued in ${month}, Manila time. ${formatPhp(remaining)} left.`
        : `Issued in ${month}, Manila time. Nothing left: new rewards pause until Super Admin resumes each one.`,
    full: remaining <= 0,
  };
}

// ---- Rewards ----

export const REWARD_FILTERS: readonly {
  value: TesterRewardStatus | "all";
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "paused", label: "Paused" },
  { value: "issued", label: "Issued" },
  { value: "blocked", label: "Blocked" },
  { value: "voided", label: "Voided" },
];

export function rewardFilterOf(value: string | null): TesterRewardStatus | "all" {
  return REWARD_FILTERS.some((f) => f.value === value)
    ? (value as TesterRewardStatus | "all")
    : "all";
}

export function rewardKindText(reward: Pick<TesterReward, "kind">): string {
  return reward.kind === "referral" ? INVITE_A_FRIEND : "Five steps";
}

const BLOCK_WORDS: Record<string, string> = {
  same_phone: "same phone number",
  same_device: "same app installation",
  same_address: "same delivery address",
};

/** `same_phone,same_address` in words, in the API's order. */
export function blockReasonsText(reason: string | null): string {
  const words = (reason ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => BLOCK_WORDS[code] ?? code.replace(/_/g, " "));
  if (!words.length) return "A check matched";
  const sentence =
    words.length === 1
      ? words[0]
      : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return sentence[0].toUpperCase() + sentence.slice(1);
}

/** What the reward pays, from the API's own amount. */
export function rewardAmountText(
  reward: Pick<TesterReward, "kind" | "amountMinor">,
): string {
  if (reward.amountMinor === 0) return "No new money (earlier survey voucher)";
  if (reward.kind === "referral") {
    return `${formatPhp(reward.amountMinor / 2)} each to the friend and the inviter`;
  }
  return `${formatPhp(reward.amountMinor)} voucher`;
}

export type RewardStatePresentation = Presentation & { detail: string };

export function presentRewardState(reward: TesterReward): RewardStatePresentation {
  switch (reward.status) {
    case "issued":
      return {
        label: "Issued",
        tone: "success",
        icon: "circle-check",
        detail:
          reward.reason === "existing_survey_reward"
            ? `Their earlier survey voucher counts as this reward${reward.issuedAt ? ` (${formatManila(reward.issuedAt)})` : ""}. Nothing new was issued.`
            : reward.kind === "referral"
              ? `Issued ${formatManila(reward.issuedAt)}: a voucher to the friend and one to the inviter, each valid 30 days.`
              : `Issued ${formatManila(reward.issuedAt)}, valid 30 days.`,
      };
    case "paused":
      return {
        label: "Paused by budget",
        tone: "warning",
        icon: "clock",
        detail:
          "The monthly tester budget had no room when it was earned. No voucher yet; it waits for Super Admin to resume it, even after the month changes.",
      };
    case "voided":
      return {
        label: "Voided",
        tone: "neutral",
        icon: "circle-x",
        detail: reward.reason
          ? `Voided ${formatManila(reward.voidedAt)}: “${reward.reason}”`
          : `Voided ${formatManila(reward.voidedAt)}.`,
      };
    case "blocked":
      return {
        label: "Blocked",
        tone: "error",
        icon: "ban",
        detail: `${blockReasonsText(reward.reason)} as an earlier account. No invite vouchers were issued, for good. The friend's own five-step voucher is separate.`,
      };
    default:
      return { label: "Unknown", tone: "neutral", icon: "circle-help", detail: "" };
  }
}

/** What Super Admin may do to this reward. Blocked and voided are final. */
export function rewardActions(reward: Pick<TesterReward, "status">): {
  canVoid: boolean;
  canResume: boolean;
} {
  return {
    canVoid: reward.status === "issued" || reward.status === "paused",
    canResume: reward.status === "paused",
  };
}

// ---- Abuse checks ----

export const CHECKS: readonly { key: TesterCheckKey; label: string }[] = [
  { key: "phone", label: "Phone number" },
  { key: "device", label: "App installation" },
  { key: "address", label: "Delivery address" },
];

export function presentCheck(check: TesterRewardCheck | undefined): Presentation {
  if (!check) return { label: "Not run", tone: "neutral", icon: "circle-dashed" };
  if (check.status === "match")
    return { label: "Match", tone: "error", icon: "triangle-alert" };
  if (check.status === "no_match")
    return { label: "No match", tone: "success", icon: "circle-check" };
  return { label: "No evidence", tone: "neutral", icon: "circle-help" };
}

/** Whether any check ran short of evidence for someone: worth a staff look. */
export function evidenceMissing(reward: Pick<TesterReward, "kind" | "checks">): boolean {
  if (reward.kind !== "referral") return false;
  return CHECKS.some((c) => {
    const check = reward.checks[c.key];
    return !check || check.status === "missing" || check.missingClientIds.length > 0;
  });
}

/**
 * The coverage of one check in words. `name` turns an account ID into a name;
 * the invited friend is named as such.
 */
export function checkCoverageText(
  check: TesterRewardCheck | undefined,
  friendId: string,
  name: (id: string) => string,
): string {
  if (!check) return "This check was not recorded.";
  const who = (ids: string[]) =>
    ids.map((id) => (id === friendId ? "the friend" : name(id))).join(", ");
  const parts: string[] = [];
  if (check.matchedClientIds.length)
    parts.push(`Matched ${who(check.matchedClientIds)}.`);
  if (check.comparedClientIds.length)
    parts.push(`Compared with ${who(check.comparedClientIds)}.`);
  if (check.missingClientIds.length)
    parts.push(`Nothing on record for ${who(check.missingClientIds)}.`);
  return parts.length ? parts.join(" ") : "Nothing to compare.";
}

// ---- Invites ----

export const INVITE_FILTERS: readonly {
  value: TesterInviteStatus | "all";
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "unmatched", label: "Unmatched" },
  { value: "joined", label: "Joined" },
  { value: "completed", label: "Completed" },
];

export function inviteFilterOf(value: string | null): TesterInviteStatus | "all" {
  return INVITE_FILTERS.some((f) => f.value === value)
    ? (value as TesterInviteStatus | "all")
    : "all";
}

function inviteStatusOf(invite: TesterInvite): TesterInviteStatus {
  if (invite.status) return invite.status;
  return invite.completedAt ? "completed" : invite.clientId ? "joined" : "unmatched";
}

const UNMATCHED_WORDS: Record<TesterInviteUnmatchedReason, string> = {
  no_client_account: "No client account uses this email yet.",
  ambiguous_email: "More than one client account uses this email.",
  self_invite: "This is the inviter's own email.",
  account_already_attributed: "That account was already invited by someone.",
};

export function presentInviteStatus(
  invite: TesterInvite,
): Presentation & { detail: string } {
  const status = inviteStatusOf(invite);
  if (status === "completed")
    return {
      label: "Completed",
      tone: "success",
      icon: "circle-check",
      detail: `Finished all five steps ${formatManila(invite.completedAt)}.`,
    };
  if (status === "joined")
    return {
      label: "Joined",
      tone: "info",
      icon: "circle-dot",
      detail: `Matched to a client account ${formatManila(invite.matchedAt)}.`,
    };
  return {
    label: "Unmatched",
    tone: "warning",
    icon: "triangle-alert",
    detail: invite.unmatchedReason
      ? (UNMATCHED_WORDS[invite.unmatchedReason] ?? "Not matched to an account yet.")
      : "Not matched to an account yet.",
  };
}

// ---- Settings ----

/** Pesos in the field, centavos to the API. Empty is no limit. */
export function parseBudgetPesos(
  input: string,
): { minor: number | null } | { problem: string } {
  const text = input.trim().replace(/,/g, "");
  if (text === "") return { minor: null };
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    return {
      problem: "Type an amount in pesos, like 1500 or 1500.50, or leave it empty.",
    };
  const [whole, cents = ""] = text.split(".");
  const minor = Number(whole) * 100 + Number(cents.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) return { problem: "That amount is too large." };
  return { minor };
}

export function budgetInputFrom(minor: number | null | undefined): string {
  if (minor == null) return "";
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

export function budgetSettingText(minor: number | null | undefined): string {
  if (minor == null) return "No limit.";
  if (minor === 0) return `${formatPhp(0)}: every new tester reward pauses.`;
  return `${formatPhp(minor)} a month (Manila time).`;
}

export const FORM_URL_MAX = 2048;

/**
 * The API's own checks on the sign-up form template, so the card can say
 * what is wrong before Save (the API still answers
 * `400 invalid_tester_signup_form_url`).
 */
export function formUrlProblem(template: string): string | null {
  const text = template.trim();
  if (text === "") return null;
  if (text.length > FORM_URL_MAX)
    return "The link is too long (2,048 characters at most).";
  if (text.split("{code}").length !== 2)
    return "Put {code} exactly once in the link, where the invite code goes.";
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return "That is not a full web address. Paste the form's link, starting with https://.";
  }
  if (parsed.protocol !== "https:") return "The form link must start with https://.";
  if (parsed.username || parsed.password)
    return "Take the user name or password out of the link.";
  if (!parsed.search.includes("{code}"))
    return "{code} must be in the part after the question mark, as the form's prefill value.";
  return null;
}

/** The link a client would share, for the card's example. */
export function formUrlExample(template: string, code = "EXAMPLECODE"): string {
  return template.trim().replace("{code}", encodeURIComponent(code));
}

// ---- Errors ----

const TESTER_ERROR_WORDS: Record<string, string> = {
  tester_reason_required: "Write a reason (1,000 characters at most).",
  tester_reward_not_found: "That reward no longer exists. The list was refreshed.",
  tester_reward_not_paused: "This reward is no longer paused. The list was refreshed.",
  tester_reward_not_ready:
    "This reward can no longer be issued: the account is not eligible, or its five steps no longer count.",
  tester_reward_not_voidable: "A blocked reward cannot be voided. Nothing was issued.",
  voucher_payment_reconciliation_required:
    "One of these vouchers is on a checkout waiting for payment review. Confirm or reject that payment first, then void.",
  tester_budget_overflow: "The budget total is too large to count. Nothing was issued.",
  invalid_tester_email: "That email does not look right (254 characters at most).",
  invalid_tester_invite_code:
    "No client has that invite code. Check it against the form response.",
  tester_invite_already_attributed:
    "That email was already recorded under another client's invite.",
  invalid_tester_monthly_budget:
    "Type the budget in pesos, zero or more, or leave it empty for no limit.",
  invalid_tester_signup_form_url:
    "The form link must start with https:// and have {code} once, after the question mark.",
  forbidden: "Only Super Admin can do this.",
};

/** Plain words for a tester-programme error, or null to use the caller's fallback. */
export function testerErrorText(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  return TESTER_ERROR_WORDS[err.code] ?? null;
}
