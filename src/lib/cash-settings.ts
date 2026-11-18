/**
 * The cash on delivery settings card's rules (CASH_ON_DELIVERY_API.md):
 * the API's bounds, checked before Save, and the partial update it accepts.
 */

import type { CashSettings } from "@/lib/api/types";
import { pesosToMinor } from "@/lib/format";

/** What the API assumes when the settings carry no cash object. */
export const CASH_SETTINGS_DEFAULTS: CashSettings = {
  enabled: false,
  limitMinor: 150_000,
  noShowWaitSeconds: 600,
};

export const NO_SHOW_WAIT_MIN_SECONDS = 60;
export const NO_SHOW_WAIT_MAX_SECONDS = 7_200;
export const OFFER_COUNTDOWN_MIN_SECONDS = 10;
export const OFFER_COUNTDOWN_MAX_SECONDS = 120;

export type CashDraft = {
  enabled: boolean;
  limitPesos: string;
  waitMinutes: string;
  countdownSeconds: string;
};

export type ParsedCashDraft = {
  enabled: boolean;
  limitMinor: number;
  noShowWaitSeconds: number;
  countdownSeconds: number;
};

const wholeNumber = (value: string): number | null =>
  /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;

export function cashSettingsDraftError(
  draft: CashDraft,
): { field: "limit" | "wait" | "countdown"; message: string } | null {
  const limit = pesosToMinor(draft.limitPesos);
  if (limit === null || limit < 1) {
    return { field: "limit", message: "Enter a peso amount above ₱0.00, such as 1500." };
  }
  const minutes = wholeNumber(draft.waitMinutes);
  if (
    minutes === null ||
    minutes * 60 < NO_SHOW_WAIT_MIN_SECONDS ||
    minutes * 60 > NO_SHOW_WAIT_MAX_SECONDS
  ) {
    return { field: "wait", message: "Enter whole minutes from 1 to 120." };
  }
  const seconds = wholeNumber(draft.countdownSeconds);
  if (
    seconds === null ||
    seconds < OFFER_COUNTDOWN_MIN_SECONDS ||
    seconds > OFFER_COUNTDOWN_MAX_SECONDS
  ) {
    return { field: "countdown", message: "Enter whole seconds from 10 to 120." };
  }
  return null;
}

export function parseCashDraft(draft: CashDraft): ParsedCashDraft | null {
  if (cashSettingsDraftError(draft)) return null;
  return {
    enabled: draft.enabled,
    limitMinor: pesosToMinor(draft.limitPesos) as number,
    noShowWaitSeconds: Number(draft.waitMinutes.trim()) * 60,
    countdownSeconds: Number(draft.countdownSeconds.trim()),
  };
}

/**
 * Only what changed: a partial `cash` object keeps the other cash settings,
 * and the countdown rides alongside it.
 */
export function cashSettingsChanges(
  stored: CashSettings,
  storedCountdown: number,
  next: ParsedCashDraft,
): { cash: Partial<CashSettings>; countdown?: number } {
  const cash: Partial<CashSettings> = {};
  if (next.enabled !== stored.enabled) cash.enabled = next.enabled;
  if (next.limitMinor !== stored.limitMinor) cash.limitMinor = next.limitMinor;
  if (next.noShowWaitSeconds !== stored.noShowWaitSeconds) {
    cash.noShowWaitSeconds = next.noShowWaitSeconds;
  }
  return next.countdownSeconds !== storedCountdown
    ? { cash, countdown: next.countdownSeconds }
    : { cash };
}
