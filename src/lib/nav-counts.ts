/**
 * What the rail's count badges mean, and how a group adds them up.
 *
 * Pure on purpose (no React, no fetching) so placement and wording are
 * testable. The reads behind each key live in `src/lib/live/useNavCounts.ts`;
 * which row carries which key lives on `NavItem.count` in `src/lib/nav.ts`.
 */

import type { NavCountKey, NavGroup, NavItem } from "@/lib/nav";

/** Known counts by source. A missing key is "not read yet" and draws nothing. */
export type NavCounts = Partial<Record<NavCountKey, number>>;

type CountMeaning = {
  /** "3 need action", "1 unread" — read after the row's label. */
  phrase: (count: number) => string;
  /**
   * Yellow, by the captain's call, only for work that blocks an order until
   * this desk moves it. Everything else is a quiet monochrome count so the
   * rail never becomes a yellow column.
   */
  attention: boolean;
};

const needAction = (count: number) =>
  `${compactCount(count)} ${count === 1 ? "needs" : "need"} action`;

export const NAV_COUNT_MEANING: Record<NavCountKey, CountMeaning> = {
  "orders-waiting": { phrase: needAction, attention: true },
  "signups-waiting": {
    phrase: (count) => `${compactCount(count)} waiting for review`,
    attention: false,
  },
  "escalations-open": {
    phrase: (count) => `${compactCount(count)} open`,
    attention: false,
  },
  "claims-open": { phrase: (count) => `${compactCount(count)} open`, attention: false },
  "chat-unread": { phrase: (count) => `${compactCount(count)} unread`, attention: false },
  "issue-reports-new": {
    phrase: (count) => `${compactCount(count)} new`,
    attention: false,
  },
  "jobs-need-action": { phrase: needAction, attention: false },
  // The captain's own calls: quiet, because no order waits on them.
  "tracker-needs-decision": {
    phrase: (count) => `${compactCount(count)} ${count === 1 ? "needs" : "need"} a decision`,
    attention: false,
  },
};

/** Over 99 reads "99+"; the badge is a hint, the page has the exact figure. */
export function compactCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** A row's count, or 0 when it has no source or nothing is waiting. */
export function itemCount(item: NavItem, counts: NavCounts): number {
  if (!item.count) return 0;
  const value = counts[item.count] ?? 0;
  return value > 0 ? value : 0;
}

/** A group's total: the sum of its pages' counts. */
export function groupCount(group: NavGroup, counts: NavCounts): number {
  return group.items.reduce((total, item) => total + itemCount(item, counts), 0);
}

/**
 * An open group's total earns its place only when it adds up more than one
 * row. With a single counted page, the page's own badge sits right below and
 * a second copy of the same number would read as two separate things.
 */
export function showOpenGroupTotal(group: NavGroup, counts: NavCounts): boolean {
  return group.items.filter((item) => itemCount(item, counts) > 0).length > 1;
}

/** True when any counted page in the group is work that blocks an order. */
export function groupNeedsAttention(group: NavGroup, counts: NavCounts): boolean {
  return group.items.some(
    (item) =>
      item.count !== undefined &&
      NAV_COUNT_MEANING[item.count].attention &&
      itemCount(item, counts) > 0,
  );
}

export function itemNeedsAttention(item: NavItem, counts: NavCounts): boolean {
  return (
    item.count !== undefined &&
    NAV_COUNT_MEANING[item.count].attention &&
    itemCount(item, counts) > 0
  );
}

/** What a screen reader hears after the row's label: "3 need action". */
export function itemCountPhrase(item: NavItem, counts: NavCounts): string | null {
  const count = itemCount(item, counts);
  if (!count || !item.count) return null;
  return NAV_COUNT_MEANING[item.count].phrase(count);
}

/** A group's total mixes kinds of work, so it only says how many need action. */
export function groupCountPhrase(group: NavGroup, counts: NavCounts): string | null {
  const count = groupCount(group, counts);
  return count ? needAction(count) : null;
}

/** "Orders, 3 need action" — the label alone when nothing is counted. */
export function countedName(label: string, phrase: string | null): string {
  return phrase ? `${label}, ${phrase}` : label;
}
