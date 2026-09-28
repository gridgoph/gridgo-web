/**
 * The shop's progress photos, and the rule they enforce.
 *
 * Contract: "Production progress photos" in
 * `gridgo-api/docs/OPERATIONAL_MODEL_V2_API.md`. A shop cannot pack a job
 * (`production` or `supplier_self_qc` to `supplier_self_qc` or
 * `ready_for_dispatch`) until the order has one ready, attached JPEG/PNG/WebP
 * of its own; the start-of-production image counts, a PDF does not
 * (`409 production_photo_required`). Operations and Super Admin may move the
 * same edges without a photo, but only with a written reason
 * (`400 production_override_reason_required`), and the API audits it as
 * `order.production_override`.
 *
 * During rollout an older API sends no `productionProgress`. Every helper here
 * then answers "unknown" rather than "missing", so a screen never blocks a shop
 * on a field the server has not started sending.
 *
 * Pure functions: no React, no fetch.
 */

import type { AuditEntry, Order, ProductionPhoto, ProductionProgress } from "@/lib/api/types";

/** The audit action every staff production correction writes. */
export const PRODUCTION_OVERRIDE_ACTION = "order.production_override";

/** Where a shop can still add a progress photo. The API refuses anywhere else. */
const PHOTO_OPEN_STATES = new Set(["production", "supplier_self_qc"]);

/**
 * From production onwards the gallery has something to say: photos, or that
 * none arrived. Before production there is nothing to photograph yet.
 */
const PROGRESS_REACHED = new Set([
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "awaiting_collection",
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
]);

type ProgressSource = Pick<Order, "state"> & Partial<Pick<Order, "productionProgress">>;

/** The gallery as the API sent it, or null on an API that predates it. */
export function productionProgressOf(order: ProgressSource): ProductionProgress | null {
  const progress = order.productionProgress;
  if (!progress || !Array.isArray(progress.photos)) return null;
  return progress;
}

/** The photos, oldest first, so their numbers follow the job. */
export function progressPhotos(order: ProgressSource): ProductionPhoto[] {
  const progress = productionProgressOf(order);
  if (!progress) return [];
  return [...progress.photos].sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * True only when the API says, in so many words, that no photo is on file.
 * An absent field is not a missing photo.
 */
export function productionPhotoMissing(order: ProgressSource): boolean {
  const progress = productionProgressOf(order);
  if (!progress) return false;
  return progress.status === "waiting_for_photo" || progress.photos.length === 0;
}

/** Whether the order has reached the point where the gallery belongs on screen. */
export function progressReached(order: Pick<Order, "state">): boolean {
  return PROGRESS_REACHED.has(order.state);
}

/** Whether the shop may attach a progress photo right now. */
export function canAddProgressPhoto(order: Pick<Order, "state">): boolean {
  return PHOTO_OPEN_STATES.has(order.state);
}

/**
 * Whether Operations may move this job to ready for dispatch with a reason.
 * The API accepts the correction on exactly the edges it gates for the shop.
 */
export function canCorrectProduction(order: Pick<Order, "state">): boolean {
  return PHOTO_OPEN_STATES.has(order.state);
}

/** "1 progress photo", "3 progress photos". */
export function progressPhotoCount(count: number): string {
  return count === 1 ? "1 progress photo" : `${count} progress photos`;
}

/** An audited staff correction, as the workspace shows it. */
export type ProductionCorrection = {
  id: string;
  at: string;
  actorId: string | null;
  actorRole: string | null;
  reason: string;
  from: string | null;
  to: string | null;
  /** Whether the job had no progress photo when it was moved on. */
  photoMissing: boolean;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * The production corrections in an audit read, oldest first. Anything that is
 * not one (another action, another order) is dropped, so a filter the server
 * ignored cannot put a stranger's entry on this order.
 */
export function productionCorrections(
  entries: readonly AuditEntry[] | null | undefined,
  orderId: string,
): ProductionCorrection[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(
      (entry) =>
        entry.action === PRODUCTION_OVERRIDE_ACTION &&
        (entry.orderId === orderId || entry.entityId === orderId),
    )
    .map((entry) => ({
      id: entry.id,
      at: entry.at,
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      reason: text(entry.reason) ?? "",
      from: text(entry.detail?.from),
      to: text(entry.detail?.to),
      photoMissing: entry.detail?.photoMissing === true,
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Whether a signed link is still worth using. A link within half a minute of
 * expiry is treated as gone, so an image is not requested just as it dies.
 */
export function signedUrlUsable(
  photo: Pick<ProductionPhoto, "downloadUrl" | "downloadUrlExpiresAt">,
  now = Date.now(),
): boolean {
  if (!photo.downloadUrl) return false;
  if (!photo.downloadUrlExpiresAt) return true;
  const expires = Date.parse(photo.downloadUrlExpiresAt);
  if (Number.isNaN(expires)) return true;
  return expires - now > 30_000;
}

/** Copy shared by every screen that shows the rule. */
export const PRODUCTION_PHOTO_COPY = {
  waitingTitle: "Waiting for a progress photo",
  /** Supplier: why packing is not offered yet. */
  supplierRule:
    "Add one photo of this job before you pack it. A start-of-production photo counts; a PDF does not.",
  /** Supplier: the refusal, when the API had the last word. */
  supplierRefused:
    "Add a progress photo before packing this job. A start-of-production photo counts; a PDF does not.",
  /** Supplier: attaching after the job moved on. */
  supplierTooLate:
    "This job has moved on, so it no longer takes progress photos. The page now shows where it stands.",
  /** Operations, while the shop still has the job. */
  staffWaiting:
    "The shop has not sent a progress photo. It cannot pack this job until it does.",
  /** Operations, after the job moved on without one. */
  staffMovedOnWithout: "No progress photo was sent before this job left production.",
  /** What a shop photo is for, where the shop takes it. */
  supplierHint:
    "Show this job on your floor: on the press, finished, or packed. The client sees this photo on their order.",
} as const;
