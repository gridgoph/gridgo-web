/**
 * Home promos: the partner and sponsor cards that share the client app's
 * Home Reorder tile (contract "Home promo slot" in gridgo-api). Super Admin
 * and Operations both read and write them:
 *
 *   GET    /ops/promotions
 *   POST   /ops/promotions
 *   GET    /ops/promotions/:id
 *   PATCH  /ops/promotions/:id
 *   DELETE /ops/promotions/:id          (soft delete)
 *   GET    /ops/promotions/:id/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Contract: gridgo-api `docs/HOME_PROMOTIONS_API.md`. Logos and card images
 * ride the ordinary `/files` upload with the staff-only purposes
 * `promotion_logo` (5 MiB) and `promotion_image` (15 MiB); the promo write
 * binds them, so never call `/files/:id/attach` for them. Responses carry a
 * five-minute signed `downloadUrl`.
 *
 * This is the only file that knows the API's field names: everything raw is
 * read through `readHomePromo` into the shapes below.
 */

import { apiRequest } from "@/lib/api/client";
import type { StoredFile } from "@/lib/api/types";
import { colorFromStyle, isHexColor } from "@/lib/promo-card-colors";

export type HomePromoTag = "partner" | "sponsored" | "featured_shop";
export type HomePromoTapAction = "sheet" | "link";
/** The older API's card style; `color` replaced it and the API still derives it. */
export type HomePromoStyle = "light" | "yellow";
/** Derived by the API from `enabled`, the dates and the clock. */
export type HomePromoStatus = "live" | "scheduled" | "off" | "ended";

export type HomePromoFile = {
  fileId: string;
  /** Ready to draw, when the API sends one. */
  url: string | null;
  /** When a signed `url` stops working; null for a local or unsigned one. */
  expiresAt?: string | null;
};

export type HomePromo = {
  id: string;
  name: string;
  logo: HomePromoFile | null;
  image: HomePromoFile | null;
  description: string;
  tag: HomePromoTag;
  linkText: string;
  linkUrl: string;
  tapAction: HomePromoTapAction;
  /** The card's colour, `#RRGGBB` uppercase; from `style` on an API without `color`. */
  color: string;
  startsAt: string;
  endsAt: string | null;
  enabled: boolean;
  displayOrder: number;
  status: HomePromoStatus | (string & {});
  views: number;
  opens: number;
  taps: number;
  updatedAt: string | null;
};

/** Write body: media is `{fileId}` only; PATCH keeps omitted fields. */
export type HomePromoInput = {
  name: string;
  logo: { fileId: string };
  image: { fileId: string } | null;
  description: string;
  tag: HomePromoTag;
  linkText: string;
  linkUrl: string;
  tapAction: HomePromoTapAction;
  color: string;
  /** Sent beside `color` so an API without `color` keeps the nearest style. */
  style: HomePromoStyle;
  startsAt: string;
  endsAt: string | null;
  enabled: boolean;
  displayOrder: number;
};

export type HomePromoDay = { day: string; views: number; opens: number; taps: number };

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Counters are PostgreSQL bigints, which may arrive as digit strings. */
function count(value: unknown): number {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** A file ref: a bare id, or `{fileId|id, url|downloadUrl}`. */
function readFile(value: unknown, urlBeside?: unknown): HomePromoFile | null {
  if (typeof value === "string" && value) return { fileId: value, url: str(urlBeside), expiresAt: null };
  if (!isRecord(value)) return null;
  const fileId = str(value.fileId) ?? str(value.id);
  if (!fileId) return null;
  return {
    fileId,
    url: str(value.url) ?? str(value.downloadUrl) ?? str(urlBeside),
    expiresAt: str(value.expiresAt),
  };
}

const TAGS: readonly HomePromoTag[] = ["partner", "sponsored", "featured_shop"];

export function readHomePromo(raw: unknown): HomePromo {
  if (!isRecord(raw)) throw new Error("promotion_unreadable");
  const id = str(raw.id);
  if (!id) throw new Error("promotion_unreadable");
  const totals = isRecord(raw.totals) ? raw.totals : raw;
  const tag = TAGS.includes(raw.tag as HomePromoTag) ? (raw.tag as HomePromoTag) : "partner";
  return {
    id,
    name: str(raw.name) ?? "",
    logo: readFile(raw.logo ?? raw.logoFileId, raw.logoUrl),
    image: readFile(raw.image ?? raw.imageFileId, raw.imageUrl),
    description: typeof raw.description === "string" ? raw.description : "",
    tag,
    linkText: typeof raw.linkText === "string" ? raw.linkText : "",
    linkUrl: typeof raw.linkUrl === "string" ? raw.linkUrl : "",
    tapAction: raw.tapAction === "link" ? "link" : "sheet",
    color: isHexColor(raw.color) ? raw.color.toUpperCase() : colorFromStyle(raw.style),
    startsAt: str(raw.startsAt) ?? "",
    endsAt: str(raw.endsAt),
    enabled: raw.enabled === true,
    displayOrder: typeof raw.displayOrder === "number" ? raw.displayOrder : 0,
    status: str(raw.status) ?? "off",
    views: count(totals.views),
    opens: count(totals.opens),
    taps: count(totals.taps),
    updatedAt: str(raw.updatedAt),
  };
}

function readList(raw: unknown): HomePromo[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.promotions)
      ? raw.promotions
      : isRecord(raw) && Array.isArray(raw.items)
        ? raw.items
        : null;
  if (!list) throw new Error("promotion_unreadable");
  return list.map(readHomePromo);
}

function readOne(raw: unknown): HomePromo {
  return readHomePromo(isRecord(raw) && isRecord(raw.promotion) ? raw.promotion : raw);
}

function readDays(raw: unknown): HomePromoDay[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.days)
      ? raw.days
      : isRecord(raw) && Array.isArray(raw.stats)
        ? raw.stats
        : [];
  return list.flatMap((row) => {
    if (!isRecord(row)) return [];
    const day = str(row.day);
    if (!day) return [];
    return [{ day, views: count(row.views), opens: count(row.opens), taps: count(row.taps) }];
  });
}

const BASE = "/ops/promotions";

export async function listHomePromos(): Promise<HomePromo[]> {
  return readList(await apiRequest<unknown>(BASE));
}

export async function getHomePromo(id: string): Promise<HomePromo> {
  return readOne(await apiRequest<unknown>(`${BASE}/${encodeURIComponent(id)}`));
}

export async function createHomePromo(input: HomePromoInput): Promise<HomePromo> {
  return readOne(
    await apiRequest<unknown>(BASE, { method: "POST", body: JSON.stringify(input) }),
  );
}

export async function updateHomePromo(
  id: string,
  input: Partial<HomePromoInput>,
): Promise<HomePromo> {
  return readOne(
    await apiRequest<unknown>(`${BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  );
}

/** Soft delete: the card leaves Home; its counts stay with the API. */
export async function removeHomePromo(id: string): Promise<void> {
  await apiRequest<unknown>(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** One row per Asia/Manila day, `from`..`to` inclusive (`YYYY-MM-DD`). */
export async function getHomePromoStats(
  id: string,
  range: { from: string; to: string },
): Promise<HomePromoDay[]> {
  const query = new URLSearchParams(range).toString();
  return readDays(
    await apiRequest<unknown>(`${BASE}/${encodeURIComponent(id)}/stats?${query}`),
  );
}

export type HomePromoFilePurpose = "promotion_logo" | "promotion_image";

export async function uploadHomePromoFile(
  purpose: HomePromoFilePurpose,
  file: File,
): Promise<StoredFile> {
  const body = new FormData();
  body.append("purpose", purpose);
  body.append("file", file);
  const result = await apiRequest<{ file: StoredFile }>("/files", { method: "POST", body });
  return result.file;
}
