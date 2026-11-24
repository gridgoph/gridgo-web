/**
 * "How you earn": the lines a new shop reads at the finish of guided setup,
 * ported word for word from the shop app's `howYouEarnLines`. Built from
 * GRIDGO's own schedule (`GET /settings` `shopMoney`), so a changed time,
 * minimum or bonus changes the words; null when GRIDGO does not run daily
 * payouts yet, and then nothing is promised.
 */

import type { ShopMoneySettings } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { clockWords } from "@/lib/shop-money";

export function percentLabel(bps: number): string {
  const value = bps / 100;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function howYouEarnLines(schedule: ShopMoneySettings | null | undefined): string[] | null {
  if (!schedule || typeof schedule.payoutTime !== "string" || !Number.isFinite(schedule.minimumMinor)) return null;
  const lines = [
    "You earn on every job you finish, any time of day. Express jobs are paid daily; other jobs pay in parts as they move.",
    `GRIDGO pays you at ${clockWords(schedule.payoutTime)} on business days, to your payout QR. ${formatPhp(schedule.minimumMinor)} minimum: a smaller amount rolls over to the next day, and GRIDGO pays the transfer fee.`,
  ];
  if (schedule.bonusRateBps > 0 && schedule.bonusDays > 0 && schedule.bonusCapMinor > 0) {
    lines.push(
      `Launch week: +${percentLabel(schedule.bonusRateBps)} on your shop pay for ${schedule.bonusDays} days from your first order, up to ${formatPhp(schedule.bonusCapMinor)}.`,
    );
  }
  return lines;
}

/** `GET /me/supplier-readiness` `operational.ready`: true only when matching can use the shop. */
export function shopReadyForJobs(body: unknown): boolean | null {
  if (!body || typeof body !== "object") return null;
  const operational = (body as { operational?: unknown }).operational;
  if (!operational || typeof operational !== "object") return null;
  const ready = (operational as { ready?: unknown }).ready;
  return typeof ready === "boolean" ? ready : null;
}
