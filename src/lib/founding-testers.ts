/**
 * Founding Tester missions (gridgo-api#293 and gridgo-client#323; contract
 * `gridgo-api/docs/FOUNDING_TESTER_API.md` over "Founding Tester missions" in
 * `VOUCHERS_API.md`).
 *
 * A client account earns the Founding Tester label by finishing five steps,
 * one path: add an item to the cart, place the order (payment confirmed),
 * track it in the app, receive it, and complete the survey. Finishing all
 * five adds a ₱15 GRIDGO voucher valid 30 days, once per account, unless the
 * monthly tester budget holds it. The API counts, awards and issues; this
 * portal reads, explains, and lets Super Admin void or resume a reward.
 *
 * Only client accounts created before the Super Admin's launch date can earn
 * it. The label belongs to the client's membership: it is never drawn on a
 * shop or rider row.
 *
 * Pure functions, unit tested in `src/lib/__tests__/founding-testers.test.ts`.
 */

import type {
  FoundingTesterMission,
  FoundingTesterProgress,
  User,
} from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import { formatPhp } from "@/lib/format";
import { formatManila, presentVoucherStatus } from "@/lib/vouchers";

export const FOUNDING_TESTER_LABEL = "Founding Tester";

/** The dashboard reads 100 clients a page (the API allows up to 500). */
export const FOUNDING_TESTERS_PAGE_SIZE = 100;

export const MISSION_COUNT = 5;

/**
 * The five steps, in order, under the API's own names (the client app shows
 * the same words), each with what the API counts as proof.
 */
export const MISSIONS: readonly {
  key: FoundingTesterMission;
  label: string;
  proof: string;
}[] = [
  {
    key: "added",
    label: "Add an item to your cart",
    proof: "An item in their cart or on a checkout",
  },
  { key: "placed", label: "Place your order", proof: "Payment confirmed" },
  { key: "tracked", label: "Track your order", proof: "Opened its tracking in the app" },
  {
    key: "received",
    label: "Receive your order",
    proof: "Delivery or hub hand-out confirmed",
  },
  { key: "rated", label: "Complete the survey", proof: "Survey sent" },
];

type Presentation = { label: string; tone: StatusTone; icon: StatusIconName };

/**
 * The users-list filter. "Not yet" asks the API for client rows without the
 * label, so it lists clients only, eligible or not.
 */
export type TesterFilter = "all" | "earned" | "not_yet";

export const TESTER_FILTERS: readonly { value: TesterFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "earned", label: "Founding Testers" },
  { value: "not_yet", label: "Not yet" },
];

/** What `GET /users` is asked for each filter. */
export function testerFilterQuery(filter: TesterFilter): {
  role?: "client";
  foundingTester?: boolean;
} {
  if (filter === "earned") return { role: "client", foundingTester: true };
  if (filter === "not_yet") return { role: "client", foundingTester: false };
  return {};
}

/**
 * Whether a directory row carries the badge. A shop or rider row never does,
 * even if the API ever sent the field on one.
 */
export function showsFoundingTesterBadge(
  user: Pick<User, "role" | "foundingTester">,
): boolean {
  return user.role === "client" && user.foundingTester === true;
}

export function progressText(
  progress: Pick<FoundingTesterProgress, "completedCount">,
): string {
  return `${Math.min(progress.completedCount, MISSION_COUNT)} of ${MISSION_COUNT}`;
}

/**
 * All five done with no label yet and nothing holding it: the API awards it
 * the next time the client opens the app, so a staff read can briefly show
 * 5 of 5 unlabelled.
 */
export function awaitingAward(progress: FoundingTesterProgress): boolean {
  return (
    progress.eligible &&
    !progress.label &&
    progress.rewardStatus !== "paused" &&
    progress.completedCount >= MISSION_COUNT
  );
}

/** Five of five, with the label and voucher held by the monthly budget. */
export function heldByBudget(progress: FoundingTesterProgress): boolean {
  return !progress.label && progress.rewardStatus === "paused";
}

export function presentTesterLabel(progress: FoundingTesterProgress): Presentation {
  if (progress.label)
    return { label: FOUNDING_TESTER_LABEL, tone: "info", icon: "award" };
  if (!progress.eligible) return { label: "Not eligible", tone: "neutral", icon: "ban" };
  if (heldByBudget(progress))
    return { label: "Waiting on budget", tone: "warning", icon: "clock" };
  if (awaitingAward(progress))
    return { label: "Label on its way", tone: "info", icon: "clock" };
  return { label: "Not yet", tone: "neutral", icon: "circle-dashed" };
}

/** One line under the label: why it is (not) there. */
export function testerLabelNote(
  progress: FoundingTesterProgress,
  reviewData?: boolean,
): string {
  if (progress.label) {
    return progress.awardedAt
      ? `Earned ${formatManila(progress.awardedAt)}. It stays earned, whatever happens to later orders.`
      : "Earned. It stays earned, whatever happens to later orders.";
  }
  if (!progress.eligible) {
    return reviewData
      ? "A test account cannot earn the label."
      : "This account was created on or after the Founding Tester launch date, so it cannot earn the label.";
  }
  if (heldByBudget(progress)) {
    return "All five steps are done. The label and voucher wait for room in the monthly tester budget and for Super Admin to resume the reward.";
  }
  if (awaitingAward(progress)) {
    return "All five steps are done. The label and voucher are added the next time they open the app.";
  }
  return "They earn it by finishing all five steps.";
}

export type RewardPresentation = Presentation & { detail: string };

const REWARD_TERMS = `${formatPhp(1500)} voucher, valid 30 days`;

/** The reward, never its private code. */
export function presentTesterReward(
  progress: FoundingTesterProgress,
): RewardPresentation {
  if (progress.rewardStatus === "ineligible") {
    return {
      label: "No reward",
      tone: "neutral",
      icon: "ban",
      detail: "Not eligible for the Founding Tester voucher.",
    };
  }
  if (progress.rewardStatus === "pending") {
    return {
      label: "After all five",
      tone: "neutral",
      icon: "circle-dashed",
      detail: `${REWARD_TERMS}, added when all five steps are done.`,
    };
  }
  if (progress.rewardStatus === "paused") {
    return {
      label: "Reward awaiting budget",
      tone: "warning",
      icon: "clock",
      detail:
        "All five steps are done, but the monthly tester budget had no room. No voucher yet: it waits for Super Admin to resume it.",
    };
  }
  if (progress.rewardStatus === "voided" && !progress.reward) {
    return {
      label: "Voided",
      tone: "neutral",
      icon: "circle-x",
      detail: "Super Admin voided this reward. An earned label stays.",
    };
  }
  const reused = progress.rewardStatus === "existing_survey_reward";
  const voucher = progress.reward;
  if (!voucher) {
    return {
      label: reused ? "Survey voucher" : "Voucher issued",
      tone: "neutral",
      icon: "circle-check",
      detail: reused
        ? "Their earlier survey voucher counts as this reward. No new voucher was issued."
        : `${REWARD_TERMS}.`,
    };
  }
  const status =
    progress.rewardStatus === "voided"
      ? { label: "Voided", tone: "neutral" as const, icon: "circle-x" as const }
      : presentVoucherStatus(voucher);
  const value = formatPhp(voucher.valueMinor);
  const when =
    voucher.status === "used"
      ? "used"
      : voucher.status === "void"
        ? "voided"
        : voucher.status === "expired"
          ? `expired ${formatManila(voucher.expiresAt)}`
          : `expires ${formatManila(voucher.expiresAt)}`;
  return {
    ...status,
    detail: reused
      ? `Their earlier ${value} survey voucher counts as this reward, ${when}. No new voucher was issued.`
      : `${value} voucher, ${when}.`,
  };
}

/** "Clients 101–200 of 245", or null when there is nothing on the page. */
export function pageRangeText(
  offset: number,
  count: number,
  total: number,
): string | null {
  if (count <= 0 || total <= 0) return null;
  return `Clients ${(offset + 1).toLocaleString("en-PH")}–${(offset + count).toLocaleString("en-PH")} of ${total.toLocaleString("en-PH")}`;
}

/** Offsets of the neighbouring pages, or null at either end. */
export function neighbourPages(
  offset: number,
  total: number,
  size: number = FOUNDING_TESTERS_PAGE_SIZE,
): { previous: number | null; next: number | null } {
  return {
    previous: offset > 0 ? Math.max(0, offset - size) : null,
    next: offset + size < total ? offset + size : null,
  };
}

/** The launch date as the settings card and its "in force" line say it. */
export function launchDateText(iso: string | null | undefined): string {
  if (!iso) return "Not set. Every client account can earn the label.";
  return `${formatManila(iso)}, Manila time. Accounts created before then can earn the label.`;
}
