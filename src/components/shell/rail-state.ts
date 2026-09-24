/**
 * What the rail remembers per browser: whether the whole sidebar is folded to
 * its icon column, and which labeled groups the person left open.
 *
 * Both are conveniences, never authority. Storage can be blocked (private
 * mode, cleared site data), so every read falls back to the default and every
 * write is allowed to fail. AppShell only mounts after RoleGate's client-side
 * projection check, so reading here during the first render cannot disagree
 * with server HTML.
 */

import type { NavGroup } from "@/lib/nav";

export const RAIL_OPEN_STORAGE_KEY = "gridgo-rail-open";
export const RAIL_GROUPS_STORAGE_KEY = "gridgo-rail-groups";

export type GroupOpenState = Record<string, boolean>;

export function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function groupHasActivePage(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => isActiveHref(pathname, item.href));
}

/** Expanded unless this browser folded the rail last time. */
export function readRailOpen(): boolean {
  try {
    return window.localStorage.getItem(RAIL_OPEN_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeRailOpen(open: boolean): void {
  try {
    window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, String(open));
  } catch {
    /* Blocked storage: the fold still applies to this page. */
  }
}

export function readGroupOpenState(): GroupOpenState {
  try {
    const raw = window.localStorage.getItem(RAIL_GROUPS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const state: GroupOpenState = {};
    for (const [id, open] of Object.entries(parsed)) {
      if (typeof open === "boolean") state[id] = open;
    }
    return state;
  } catch {
    return {};
  }
}

export function writeGroupOpen(groupId: string, open: boolean): void {
  try {
    const next = { ...readGroupOpenState(), [groupId]: open };
    window.localStorage.setItem(RAIL_GROUPS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Blocked storage: the group still toggles for this page. */
  }
}

/**
 * The group holding the current page is always open on arrival; every other
 * group is what the person last chose, and closed if they never chose.
 */
export function initialGroupOpen(
  group: NavGroup,
  pathname: string,
  remembered: GroupOpenState,
): boolean {
  if (groupHasActivePage(group, pathname)) return true;
  return remembered[group.id] ?? false;
}
