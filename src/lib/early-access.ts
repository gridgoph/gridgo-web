/**
 * Early access desk rules (contract `gridgo-api/docs/EARLY_ACCESS_API.md`).
 *
 * Pure helpers for `EarlyAccessDesk`: the view in the URL, the list as it was
 * read page by page, a grant applied in place, and the words on screen.
 * Times are Manila time; staff read them against their own working day.
 */

import { isApiError } from "@/lib/api/client";
import type {
  EarlyAccessCounts,
  EarlyAccessPage,
  EarlyAccessSignup,
  EarlyAccessStatus,
} from "@/lib/api/early-access";

/** What the status filter can show. `all` sends no status to the API. */
export type EarlyAccessFilter = EarlyAccessStatus | "all";

export type EarlyAccessView = { filter: EarlyAccessFilter; q: string };

/** One page per read; the API allows 100. */
export const EARLY_ACCESS_PAGE_SIZE = 50;
/** The API refuses a longer search (`400 invalid_query`). */
export const EARLY_ACCESS_QUERY_MAX = 254;

export const EARLY_ACCESS_FILTERS: readonly {
  value: EarlyAccessFilter;
  label: string;
}[] = [
  { value: "pending", label: "Waiting" },
  { value: "granted", label: "Granted" },
  { value: "all", label: "All" },
];

/** Waiting is the work, so it is the default and stays out of the URL. */
export function viewFromSearch(
  search: URLSearchParams | { get(key: string): string | null },
): EarlyAccessView {
  const raw = search.get("status");
  const filter: EarlyAccessFilter = raw === "granted" || raw === "all" ? raw : "pending";
  const q = (search.get("q") ?? "").slice(0, EARLY_ACCESS_QUERY_MAX);
  return { filter, q };
}

export function searchFromView(view: EarlyAccessView): string {
  const params = new URLSearchParams();
  if (view.filter !== "pending") params.set("status", view.filter);
  const q = view.q.trim();
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** A stable key for a view, so a read for another view never lands. */
export function viewKey(view: EarlyAccessView): string {
  return `${view.filter}\u0000${view.q.trim().toLowerCase()}`;
}

export function apiStatusOf(filter: EarlyAccessFilter): EarlyAccessStatus | null {
  return filter === "all" ? null : filter;
}

/**
 * The rows read so far for one view. `total` and `counts` follow the server
 * plus this desk's own grants, so paging stays right after a grant.
 */
export type EarlyAccessList = {
  key: string;
  filter: EarlyAccessFilter;
  rows: EarlyAccessSignup[];
  counts: EarlyAccessCounts;
  total: number;
};

export function listFromPage(
  view: EarlyAccessView,
  page: EarlyAccessPage,
): EarlyAccessList {
  return {
    key: viewKey(view),
    filter: view.filter,
    rows: page.signups,
    counts: page.counts,
    total: page.total,
  };
}

function matchesFilter(row: EarlyAccessSignup, filter: EarlyAccessFilter): boolean {
  return filter === "all" || row.status === filter;
}

/**
 * Where the next page starts. A row granted here under Waiting stays on
 * screen but no longer counts on the server, so it is not part of the offset.
 */
export function nextOffset(list: EarlyAccessList): number {
  return list.rows.filter((row) => matchesFilter(row, list.filter)).length;
}

export function hasMore(list: EarlyAccessList): boolean {
  return nextOffset(list) < list.total;
}

/**
 * Appends a page. A sign-up that arrived meanwhile pushes rows down, so a row
 * already shown can come back; it is kept once, where it was.
 */
export function appendPage(
  list: EarlyAccessList,
  page: EarlyAccessPage,
): EarlyAccessList {
  const seen = new Set(list.rows.map((row) => row.id));
  const fresh = page.signups.filter((row) => !seen.has(row.id));
  return {
    ...list,
    rows: [...list.rows, ...fresh],
    counts: page.counts,
    total: page.total,
  };
}

/**
 * A grant answered by the API, applied in place: the row keeps its position
 * (even under Waiting) and the counts move by one. A sign-up someone else
 * already granted changes no count.
 */
export function applyGrant(
  list: EarlyAccessList,
  updated: EarlyAccessSignup,
): EarlyAccessList {
  const index = list.rows.findIndex((row) => row.id === updated.id);
  const before = index >= 0 ? list.rows[index] : null;
  const rows =
    index >= 0 ? list.rows.map((row, i) => (i === index ? updated : row)) : list.rows;
  if (!before || before.status === "granted" || updated.status !== "granted") {
    return { ...list, rows };
  }
  const counts = {
    pending: Math.max(0, list.counts.pending - 1),
    granted: list.counts.granted + 1,
  };
  const total =
    list.filter === "pending"
      ? Math.max(0, list.total - 1)
      : list.filter === "granted"
        ? list.total + 1
        : list.total;
  return { ...list, rows, counts, total };
}

export function countFor(counts: EarlyAccessCounts, filter: EarlyAccessFilter): number {
  return filter === "all" ? counts.pending + counts.granted : counts[filter];
}

/**
 * The live stream says the list changed. Compared with the counts this desk
 * already knows (its own grants included), say what changed, or null.
 */
export function listChangeNotice(
  known: EarlyAccessCounts,
  latest: EarlyAccessCounts,
): string | null {
  if (known.pending === latest.pending && known.granted === latest.granted) return null;
  const added = latest.pending + latest.granted - (known.pending + known.granted);
  if (added > 0)
    return added === 1
      ? "1 new sign-up since this list loaded."
      : `${added} new sign-ups since this list loaded.`;
  return "Sign-ups changed since this list loaded.";
}

const MANILA_DATE_TIME = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
  timeStyle: "short",
});

/** "17 Nov 2026, 6:05 pm", in Manila whatever the reader's clock says. */
export function formatManilaDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return MANILA_DATE_TIME.format(at);
}

/** No `?src=` on the sign-up link means the person came to the page directly. */
export function sourceLabel(source: string | null | undefined): string {
  return source ? source : "Direct";
}

export function platformLabel(platform: string): string {
  return platform === "android" ? "Android" : platform;
}

/**
 * Who granted it. `grantedBy` is a GRIDGO staff id or the support desk's
 * Clerk subject, and both can start `user_`, so only "you" is certain; any
 * other grant reads as GRIDGO staff rather than guessing where it came from.
 */
export function grantedByLabel(
  grantedBy: string | null,
  myId: string | null | undefined,
): string | null {
  if (!grantedBy) return null;
  if (myId && grantedBy === myId) return "by you";
  return "by GRIDGO staff";
}

/**
 * The toast after a grant. The API answers a repeat with the first decision
 * and sends the invite once per sign-up, so the copy says exactly that and
 * never guesses from timing whether this press sent it. Only a grant by
 * someone else is certain to be an earlier one.
 */
export function grantToast(
  updated: EarlyAccessSignup,
  myId: string | null | undefined,
): { title: string; description: string } {
  const byOther = Boolean(updated.grantedBy && myId && updated.grantedBy !== myId);
  return {
    title: byOther ? "Already granted" : "Access granted",
    description: byOther
      ? `${updated.email} was already granted ${formatManilaDateTime(updated.grantedAt)}. GRIDGO emails the Google Play invite once per sign-up.`
      : `${updated.email} has early access. GRIDGO emails the Google Play invite once per sign-up.`,
  };
}

export function listLoadError(err: unknown): string {
  if (isApiError(err)) {
    if (err.kind === "forbidden")
      return "This account cannot read early access sign-ups. Ask a Super Admin for Operations access.";
    if (err.code === "invalid_query")
      return "That search is too long. Search with part of the email instead.";
    if (err.kind === "validation")
      return "The list could not be read with these filters. Clear the search and try again.";
  }
  return "The sign-ups could not be loaded. Check your connection and try again.";
}

/** A refresh that failed while the rows already read stay on screen. */
export function refreshLoadError(err: unknown): string {
  if (isApiError(err) && (err.kind === "forbidden" || err.kind === "validation")) {
    return `The list was not refreshed. ${listLoadError(err)}`;
  }
  return "The list was not refreshed. Check your connection and try again.";
}

export function grantError(err: unknown): string {
  if (isApiError(err)) {
    if (err.kind === "not_found")
      return "This sign-up is no longer on file. Refresh the list.";
    if (err.kind === "forbidden")
      return "This account cannot grant early access. Ask a Super Admin for Operations access.";
  }
  return "Access was not granted. Check your connection and try again.";
}

/**
 * "Showing 50 of 120". Rows granted here under Waiting stay on screen, so
 * they are named apart rather than counted against what is still waiting.
 */
export function pagingSummary(list: EarlyAccessList): string {
  const matching = nextOffset(list);
  const extra = list.rows.length - matching;
  const base = `Showing ${matching} of ${Math.max(list.total, matching)}`;
  return extra > 0 ? `${base}, plus ${extra} granted just now` : base;
}
