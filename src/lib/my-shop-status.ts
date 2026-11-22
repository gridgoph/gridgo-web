/**
 * The shop's status as My shop shows it (gridgo-api
 * `docs/EXPRESS_API.md#my-shop-status-and-night-documents`; the phone app's
 * `lib/shopStatus.ts`, gridgo-supplier#274; gridgoph/gridgo-web#328).
 *
 * The only place `GET /me/shop-status` becomes words on the web: the
 * open/closed sign, the chips under the shop's name and the Shop status
 * panel. Whether the shop is open is GRIDGO's answer (`isOpenNow`, which
 * already counts a night window); the portal never works it out from hours.
 * A pause or a manual closure closes the night window too.
 */

import {
  addDays,
  manilaClock,
  normalizeShopHours,
  openingLabel,
  timeLabel,
  weekLabel,
  type DayHours,
} from "@/lib/shop-hours";
import type { ShopHours } from "@/lib/api/types";

export type NightJobs = "off" | "until_21" | "until_23" | "all_night";
export type PauseChoice = "one_hour" | "today";
export type NightWindow = { night: string; startsAt: string; endsAt: string };

export type MyShopStatus = {
  /** Shared with shop hours and the shop profile; a stale one is refused. */
  version: number;
  shopName: string | null;
  hours: ShopHours | null;
  /** Today's opening windows in Manila minutes; empty on a closed day. */
  todayHours: DayHours[];
  isOpenNow: boolean;
  nextOpeningAt: string | null;
  temporarilyClosed: boolean;
  expressEnabled: boolean;
  nightJobs: NightJobs;
  nightWindow: NightWindow | null;
  printerDemandPings: boolean;
  pausedUntil: string | null;
};

export type MyShopStatusPatch = {
  temporarilyClosed?: boolean;
  expressEnabled?: boolean;
  nightJobs?: NightJobs;
  printerDemandPings?: boolean;
  /** Null resumes a paused shop. */
  pause?: PauseChoice | null;
};

const NIGHT_MODES: readonly NightJobs[] = ["off", "until_21", "until_23", "all_night"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function minuteOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1440
    ? value
    : null;
}

function isoOf(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** GRIDGO's answer, read defensively. Null when it is not a shop-status answer. */
export function normalizeMyShopStatus(raw: unknown): MyShopStatus | null {
  if (!isRecord(raw) || !Number.isInteger(raw.version)) return null;
  const hours = normalizeShopHours(raw.hours);
  const todayHours: DayHours[] = [];
  for (const row of Array.isArray(raw.todayHours) ? raw.todayHours : []) {
    if (!isRecord(row)) continue;
    const opensMinute = minuteOf(row.opensMinute);
    const closesMinute = minuteOf(row.closesMinute);
    if (opensMinute != null && closesMinute != null) todayHours.push({ opensMinute, closesMinute });
  }
  const night = isRecord(raw.nightWindow) ? raw.nightWindow : null;
  const startsAt = isoOf(night?.startsAt);
  const endsAt = isoOf(night?.endsAt);
  return {
    version: raw.version as number,
    shopName: typeof raw.shopName === "string" && raw.shopName.trim() ? raw.shopName : null,
    hours,
    todayHours,
    isOpenNow: raw.isOpenNow === true,
    nextOpeningAt: isoOf(raw.nextOpeningAt),
    temporarilyClosed: hours?.temporarilyClosed === true,
    expressEnabled: raw.expressEnabled !== false,
    nightJobs: NIGHT_MODES.includes(raw.nightJobs as NightJobs) ? (raw.nightJobs as NightJobs) : "off",
    nightWindow:
      night && startsAt && endsAt && typeof night.night === "string"
        ? { night: night.night, startsAt, endsAt }
        : null,
    printerDemandPings: raw.printerDemandPings === true,
    pausedUntil: isoOf(raw.pausedUntil),
  };
}

/* ------------------------------------------------------------------ words */

/** The night-jobs choices, in the order the panel draws them. */
export const NIGHT_CHOICES: readonly { value: Exclude<NightJobs, "off">; label: string }[] = [
  { value: "until_21", label: "9 PM" },
  { value: "until_23", label: "11 PM" },
  { value: "all_night", label: "All night" },
];

/** The pause choices, in the order the panel draws them. */
export const PAUSE_CHOICES: readonly { value: PauseChoice; label: string }[] = [
  { value: "one_hour", label: "1 hour" },
  { value: "today", label: "Rest of today" },
];

/** The chip under the shop's name. Null while night jobs are off. */
export function nightChipLabel(mode: NightJobs): string | null {
  if (mode === "until_21") return "Night until 9 PM";
  if (mode === "until_23") return "Night until 11 PM";
  if (mode === "all_night") return "Night: all night";
  return null;
}

/** "8 AM", "5:30 PM": the short form a sign has room for. */
export function shortTime(minute: number): string {
  return timeLabel(minute).replace(":00 ", " ");
}

function manilaTime(iso: string): string {
  return shortTime(Math.floor(manilaClock(new Date(iso)).minute));
}

export function isPaused(status: Pick<MyShopStatus, "pausedUntil">, now: Date): boolean {
  return status.pausedUntil != null && Date.parse(status.pausedUntil) > now.getTime();
}

/** "Paused until 3:40 PM", or "Paused for the rest of today" when it runs to midnight. */
export function pauseLine(pausedUntil: string, now: Date): string {
  const until = manilaClock(new Date(pausedUntil));
  const today = manilaClock(now).dayKey;
  if (Math.floor(until.minute) === 0 && until.dayKey === addDays(today, 1)) {
    return "Paused for the rest of today";
  }
  if (until.dayKey !== today) {
    return `Paused until ${openingLabel(pausedUntil, now)?.replace(/:00 /, " ") ?? manilaTime(pausedUntil)}`;
  }
  return `Paused until ${manilaTime(pausedUntil)}`;
}

/** Today's hours as one range: "8 AM – 6 PM". Null on a closed day. */
export function todayRange(todayHours: DayHours[]): string | null {
  if (!todayHours.length) return null;
  const opens = Math.min(...todayHours.map((w) => w.opensMinute));
  const closes = Math.max(...todayHours.map((w) => w.closesMinute));
  return `${shortTime(opens)} – ${shortTime(closes)}`;
}

/** What pressing the sign does. Only the Owner gets a press. */
export type SignAction = "close" | "open" | "resume" | "hours";

export type Sign = {
  open: boolean;
  word: "OPEN" | "CLOSED";
  /** Today's hours, the night window, a pause, or when it opens next. */
  line: string;
  action: SignAction;
  actionLabel: string;
};

/** The hanging sign: open or closed, and the one line that goes under it. */
export function signOf(status: MyShopStatus, now: Date): Sign {
  if (isPaused(status, now)) {
    return {
      open: false,
      word: "CLOSED",
      line: pauseLine(status.pausedUntil as string, now),
      action: "resume",
      actionLabel: "Resume now",
    };
  }
  if (status.temporarilyClosed) {
    return {
      open: false,
      word: "CLOSED",
      line: "Closed until you open it",
      action: "open",
      actionLabel: "Open the shop",
    };
  }
  if (status.isOpenNow) {
    const line = status.nightWindow
      ? `Night jobs until ${manilaTime(status.nightWindow.endsAt)}`
      : (todayRange(status.todayHours) ?? "Open now");
    return { open: true, word: "OPEN", line, action: "close", actionLabel: "Close the shop" };
  }
  const next = status.nextOpeningAt ? openingLabel(status.nextOpeningAt, now) : null;
  return {
    open: false,
    word: "CLOSED",
    line: next ? `Opens ${next.replace(/:00 /, " ")}` : "No opening time set",
    action: "hours",
    actionLabel: "Change your hours",
  };
}

/** The Hours row's line: "Mon–Sat, 8:00 AM – 6:00 PM", or the night time with it. */
export function hoursLine(status: MyShopStatus): string {
  const week = status.hours ? weekLabel(status.hours.week) : "";
  const night = nightChipLabel(status.nightJobs);
  return [week || "No hours set", night].filter(Boolean).join(" · ");
}

/** The sentence said after a change lands, so the shop knows it took. */
export function changeSentence(patch: MyShopStatusPatch): string {
  if (patch.temporarilyClosed === true) return "Your shop is closed. No new jobs until you open it.";
  if (patch.temporarilyClosed === false) return "Your shop is open again.";
  if (patch.expressEnabled === true) return "Express is on. Clients can send you Express documents.";
  if (patch.expressEnabled === false) return "Express is off. Clients cannot send you Express jobs.";
  if (patch.nightJobs === "off") return "Night jobs are off.";
  if (patch.nightJobs) {
    const label = NIGHT_CHOICES.find((c) => c.value === patch.nightJobs)?.label ?? "";
    return patch.nightJobs === "all_night"
      ? "Night jobs are on all night, after your closing time."
      : `Night jobs are on until ${label}, after your closing time.`;
  }
  if (patch.printerDemandPings === true) return "You will get a ping when clients near you need a printer.";
  if (patch.printerDemandPings === false) return "No more pings about clients who need a printer.";
  if (patch.pause === "one_hour") return "Paused for 1 hour. Jobs you already have still finish.";
  if (patch.pause === "today") return "Paused for the rest of today. Jobs you already have still finish.";
  if (patch.pause === null) return "Your shop is taking jobs again.";
  return "Saved.";
}

/** Plain words for a refused status change. */
export function shopStatusErrorCopy(code: string | null | undefined): string {
  switch (code) {
    case "shop_profile_stale":
      return "Your shop changed on another screen. This shows the latest; make your change again.";
    case "shop_owner_required":
      return "Only the shop owner can change these.";
    default:
      return "That did not save. Try again.";
  }
}
