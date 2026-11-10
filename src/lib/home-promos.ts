/**
 * Rules for the Home promos page (the partner card that rotates with Reorder
 * on the client app's Home). Pure: drafts, validation, status and labels. The
 * API shapes live in `src/lib/api/home-promos.ts`.
 */

import { isApiError } from "@/lib/api/client";
import type {
  HomePromo,
  HomePromoFile,
  HomePromoInput,
  HomePromoStatus,
  HomePromoStyle,
  HomePromoTag,
  HomePromoTapAction,
} from "@/lib/api/home-promos";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import { isoToManilaLocal, manilaLocalToIso } from "@/lib/vouchers";

export const HOME_PROMO_LIMITS = {
  name: 120,
  description: 140,
  linkText: 80,
  url: 2048,
  displayOrderMax: 9999,
} as const;

/** The client app's rotation interval: Reorder, then each live promo. */
export const ROTATE_MS = 5_000;

export const TAG_LABEL: Record<HomePromoTag, string> = {
  partner: "Partner",
  sponsored: "Sponsored",
  featured_shop: "Featured shop",
};

export const TAG_CHOICES: HomePromoTag[] = ["partner", "sponsored", "featured_shop"];

export const TAP_COPY: Record<HomePromoTapAction, { label: string; body: string }> = {
  sheet: { label: "Show description first", body: "A sheet opens with the button." },
  link: { label: "Open link directly", body: "The tap goes straight to the link." },
};

export const STYLE_LABEL: Record<HomePromoStyle, string> = { light: "Light", yellow: "Yellow" };

type Presentation = { label: string; tone: StatusTone; icon: StatusIconName };

export function presentHomePromoStatus(status: HomePromoStatus | string): Presentation {
  switch (status) {
    case "live":
      return { label: "Live", tone: "success", icon: "circle-check" };
    case "scheduled":
      return { label: "Scheduled", tone: "info", icon: "clock" };
    case "ended":
      return { label: "Ended", tone: "neutral", icon: "circle-dashed" };
    default:
      return { label: "Off", tone: "neutral", icon: "ban" };
  }
}

/** Live first, then scheduled, off, ended; then by display order. */
const STATUS_RANK: Record<string, number> = { live: 0, scheduled: 1, off: 2, ended: 3 };

export function sortHomePromos(promos: HomePromo[]): HomePromo[] {
  return [...promos].sort(
    (a, b) =>
      (STATUS_RANK[a.status] ?? 4) - (STATUS_RANK[b.status] ?? 4) ||
      a.displayOrder - b.displayOrder ||
      a.name.localeCompare(b.name),
  );
}

/** The live promos in the order the client app rotates them. */
export function rotationOrder(promos: HomePromo[]): HomePromo[] {
  return promos.filter((p) => p.status === "live").sort((a, b) => a.displayOrder - b.displayOrder);
}

/** The form's state: every value as typed, dates in Manila wall time. */
export type HomePromoDraft = {
  name: string;
  logo: HomePromoFile | null;
  image: HomePromoFile | null;
  description: string;
  tag: HomePromoTag;
  linkText: string;
  linkUrl: string;
  tapAction: HomePromoTapAction;
  style: HomePromoStyle;
  /** `YYYY-MM-DDTHH:MM`, Manila. */
  startsAt: string;
  /** Empty means no end. */
  endsAt: string;
  enabled: boolean;
  displayOrder: string;
};

export type HomePromoField = Exclude<keyof HomePromoDraft, "image" | "tag" | "tapAction" | "style" | "enabled">;
export type HomePromoErrors = Partial<Record<HomePromoField, string>>;

export function emptyHomePromoDraft(now: number = Date.now(), nextOrder = 1): HomePromoDraft {
  // Start at the next whole hour, Manila.
  const start = Math.ceil(now / 3_600_000) * 3_600_000;
  return {
    name: "",
    logo: null,
    image: null,
    description: "",
    tag: "partner",
    linkText: "",
    linkUrl: "https://",
    tapAction: "sheet",
    style: "light",
    startsAt: isoToManilaLocal(new Date(start).toISOString()),
    endsAt: "",
    enabled: true,
    displayOrder: String(nextOrder),
  };
}

export function draftFromHomePromo(promo: HomePromo): HomePromoDraft {
  return {
    name: promo.name,
    logo: promo.logo,
    image: promo.image,
    description: promo.description,
    tag: promo.tag,
    linkText: promo.linkText,
    linkUrl: promo.linkUrl,
    tapAction: promo.tapAction,
    style: promo.style,
    startsAt: promo.startsAt ? isoToManilaLocal(promo.startsAt) : "",
    endsAt: promo.endsAt ? isoToManilaLocal(promo.endsAt) : "",
    enabled: promo.enabled,
    displayOrder: String(promo.displayOrder),
  };
}

/** One display order past the highest in use. */
export function nextDisplayOrder(promos: HomePromo[]): number {
  return promos.reduce((max, p) => Math.max(max, p.displayOrder), 0) + 1;
}

/** An absolute https link with a host; anything else is refused. */
export function isHttpsUrl(value: string): boolean {
  const text = value.trim();
  if (!/^https:\/\//i.test(text) || /\s/.test(text)) return false;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && url.hostname.includes(".") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateHomePromoDraft(draft: HomePromoDraft): HomePromoErrors {
  const errors: HomePromoErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = "Enter the business name.";
  else if (name.length > HOME_PROMO_LIMITS.name)
    errors.name = `Keep it to ${HOME_PROMO_LIMITS.name} characters.`;
  if (!draft.logo) errors.logo = "Add the logo.";
  const description = draft.description.trim();
  if (!description) errors.description = "Write a line about them.";
  else if (description.length > HOME_PROMO_LIMITS.description)
    errors.description = `Keep it to ${HOME_PROMO_LIMITS.description} characters.`;
  const linkText = draft.linkText.trim();
  if (!linkText) errors.linkText = "Enter the button words.";
  else if (linkText.length > HOME_PROMO_LIMITS.linkText)
    errors.linkText = `Keep it to ${HOME_PROMO_LIMITS.linkText} characters.`;
  if (!isHttpsUrl(draft.linkUrl) || draft.linkUrl.trim().length > HOME_PROMO_LIMITS.url)
    errors.linkUrl = "Enter a full https:// link.";
  const starts = manilaLocalToIso(draft.startsAt);
  if (!starts) errors.startsAt = "Pick the start date and time.";
  if (draft.endsAt) {
    const ends = manilaLocalToIso(draft.endsAt);
    if (!ends) errors.endsAt = "Pick the end date and time, or clear it.";
    else if (starts && Date.parse(ends) <= Date.parse(starts))
      errors.endsAt = "End after the start.";
  }
  const order = draft.displayOrder.trim();
  if (!/^\d+$/.test(order) || Number(order) > HOME_PROMO_LIMITS.displayOrderMax)
    errors.displayOrder = `Use a whole number, 0 to ${HOME_PROMO_LIMITS.displayOrderMax}.`;
  return errors;
}

/** The API body. Call only after `validateHomePromoDraft` is empty. */
export function inputFromHomePromoDraft(draft: HomePromoDraft): HomePromoInput {
  return {
    name: draft.name.trim(),
    logo: { fileId: draft.logo?.fileId ?? "" },
    image: draft.image ? { fileId: draft.image.fileId } : null,
    description: draft.description.trim(),
    tag: draft.tag,
    linkText: draft.linkText.trim(),
    linkUrl: draft.linkUrl.trim(),
    tapAction: draft.tapAction,
    style: draft.style,
    startsAt: manilaLocalToIso(draft.startsAt) ?? "",
    endsAt: draft.endsAt ? manilaLocalToIso(draft.endsAt) : null,
    enabled: draft.enabled,
    displayOrder: Number(draft.displayOrder.trim()),
  };
}

/** What the form would show on Home right now, before the API derives it. */
export function draftStatus(draft: HomePromoDraft, now: number = Date.now()): HomePromoStatus {
  if (!draft.enabled) return "off";
  const starts = manilaLocalToIso(draft.startsAt);
  const ends = draft.endsAt ? manilaLocalToIso(draft.endsAt) : null;
  if (ends && Date.parse(ends) <= now) return "ended";
  if (starts && Date.parse(starts) > now) return "scheduled";
  return "live";
}

/** `YYYY-MM-DD` in Manila for an instant. */
export function manilaDay(at: number): string {
  return new Date(at + 8 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * The stats table's range: from the promo's start (or 29 days back, whichever
 * is later) to today or its end, in Manila days. Never more than 92 days.
 */
export function statsRange(
  promo: Pick<HomePromo, "startsAt" | "endsAt">,
  now: number = Date.now(),
  maxDays = 92,
): { from: string; to: string } {
  const endAt = promo.endsAt ? Math.min(Date.parse(promo.endsAt), now) : now;
  const toAt = Number.isNaN(endAt) ? now : endAt;
  const startAt = Date.parse(promo.startsAt);
  const floor = toAt - (maxDays - 1) * 86_400_000;
  const fromAt = Number.isNaN(startAt) ? toAt - 29 * 86_400_000 : Math.max(Math.min(startAt, toAt), floor);
  return { from: manilaDay(fromAt), to: manilaDay(toAt) };
}

/** Every day of the range, newest first, with zero for days the API left out. */
export function fillDays(
  range: { from: string; to: string },
  rows: { day: string; views: number; opens: number; taps: number }[],
): { day: string; views: number; opens: number; taps: number }[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const out: { day: string; views: number; opens: number; taps: number }[] = [];
  const start = Date.parse(`${range.from}T00:00:00Z`);
  for (let at = Date.parse(`${range.to}T00:00:00Z`); at >= start; at -= 86_400_000) {
    const day = new Date(at).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, views: 0, opens: 0, taps: 0 });
  }
  return out;
}

/** Share of `part` in `whole` as a whole percent, or null when there is no whole. */
export function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function homePromoErrorText(err: unknown, fallback: string): string {
  if (!isApiError(err)) return "The connection dropped. Check it and try again.";
  switch (err.code) {
    case "forbidden":
      return "This login cannot change Home promos.";
    case "not_found":
    case "promotion_not_found":
      return "This promo was removed.";
    case "promotion_file_not_ready":
      return "That picture is still uploading or was not accepted. Upload it again.";
    case "invalid_promotion":
      switch (err.detail<string>("field")) {
        case "linkUrl":
          return "The link must be a full https:// address.";
        case "endsAt":
          return "End after the start.";
        case "startsAt":
          return "Pick the start date and time.";
        case "logo":
          return "Add the logo.";
        default:
          return "Check the fields and try again.";
      }
    default:
      if (err.kind === "validation") return "Check the highlighted fields and try again.";
      if (err.kind === "server") return "GRIDGO could not save just now. Try again.";
      return fallback;
  }
}
