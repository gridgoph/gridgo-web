/**
 * "What moved, and when" for the assigned-jobs queue.
 *
 * A shop opening this screen is not asking which job is oldest; it is asking
 * which one changed while it was on the floor. `updatedAt` is the column that
 * answers that, and the orders table is indexed on it
 * (`orders_supplier_state_idx`), so it is the field the API was built to sort
 * on rather than one derived here.
 *
 * A bare timestamp still does not say what happened, so the queue pairs it with
 * the last timeline note — the difference between "2h ago" and "Accepted ·
 * 2h ago".
 */

import type { Order, TimelineEntry } from "@/lib/api/types";
import { presentOrderState, presentTimelineActor } from "@/lib/order-state";

export type JobActivity = {
  /** Epoch ms of the most recent movement, or null when the API sent none. */
  at: number | null;
  /** ISO string behind `at`, for a title attribute / absolute read. */
  iso: string | null;
  /** What moved, in the shop's words. Empty when nothing is recorded. */
  what: string;
  /** Who moved it, already presented. Empty when the entry has no actor. */
  who: string;
};

/** The newest timeline entry, or null when the job carries none. */
export function latestTimelineEntry(job: Order): TimelineEntry | null {
  const timeline = Array.isArray(job.timeline) ? job.timeline : [];
  let newest: TimelineEntry | null = null;
  let newestAt = -Infinity;
  for (const entry of timeline) {
    const at = Date.parse(entry?.at ?? "");
    if (Number.isNaN(at)) continue;
    if (at >= newestAt) {
      newestAt = at;
      newest = entry;
    }
  }
  return newest;
}

/**
 * Last movement on a job.
 *
 * `updatedAt` is the clock — it is stamped on every transition and is what the
 * sort runs on. The timeline supplies the words. When the two disagree the
 * clock still wins, because a job can be touched without the timeline gaining
 * a row and a queue that sorted on the notes would leave that job stranded.
 */
export function jobActivity(job: Order): JobActivity {
  const entry = latestTimelineEntry(job);
  const updatedAt = Date.parse(job.updatedAt ?? "");
  const entryAt = entry ? Date.parse(entry.at) : NaN;

  const at = Number.isNaN(updatedAt)
    ? Number.isNaN(entryAt)
      ? null
      : entryAt
    : updatedAt;

  const iso = Number.isNaN(updatedAt)
    ? (entry?.at ?? null)
    : (job.updatedAt ?? null);

  // The note is the shop's own sentence when there is one; the state label is
  // the fallback, so this never renders a snake_case value.
  const what =
    entry?.note?.trim() ||
    (entry?.state ? presentOrderState(entry.state).label : "") ||
    presentOrderState(job.state).label;

  return {
    at,
    iso,
    what,
    who: entry?.by ? presentTimelineActor(entry.by) : "",
  };
}

/**
 * Coarse relative time, past only.
 *
 * Deliberately not `Intl.RelativeTimeFormat` per-unit precision: a queue reads
 * better with a short glanceable token than with "2 hours ago" repeated down a
 * column. Anything older than a week defers to the absolute date the cell
 * already shows.
 */
export function relativeTime(at: number | null, now: number = Date.now()): string {
  if (at === null || Number.isNaN(at)) return "—";
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return "over a month ago";
}

/** Sort key for the queue's default order: newest movement first. */
export function activitySortValue(job: Order): number {
  const { at } = jobActivity(job);
  // A job with no clock sorts to the bottom rather than the top, so a missing
  // field never outranks a job that genuinely just moved.
  return at ?? 0;
}
