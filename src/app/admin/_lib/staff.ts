/**
 * Invited staff, Super Admin only (gridgoph/gridgo-api#125; contract gridgo-api
 * docs/HUB_HANDOVER_API.md "Staff provisioning").
 *
 * An invite is a one-time code for one person. They sign in to the GRIDGO
 * Admin App with their own GRIDGO account and enter it; the first account to
 * redeem it owns it. The code is shown once, when the invite is created, and
 * the API never returns it again. Revoking stops an unused code; it never
 * removes someone who already joined (suspend them instead).
 *
 * Roles are configurable. A role only decides whether its staff may hand out
 * hub orders; no staff role grants Operations or Super Admin powers.
 *
 * Pure: no React, no fetch.
 */

import type { StaffInvite, StaffRole } from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

export const INVITE_DAYS_MIN = 1;
export const INVITE_DAYS_MAX = 30;
export const INVITE_DAYS_DEFAULT = 7;
export const ROLE_NAME_MAX = 80;

export type InviteState = "waiting" | "used" | "revoked" | "expired";

export function inviteState(invite: StaffInvite, now: number = Date.now()): InviteState {
  if (invite.redeemedAt || invite.redeemedBy) return "used";
  if (invite.revokedAt) return "revoked";
  if (Date.parse(invite.expiresAt) <= now) return "expired";
  return "waiting";
}

export const INVITE_STATE: Record<
  InviteState,
  { label: string; tone: StatusTone; icon: StatusIconName }
> = {
  waiting: { label: "Not used yet", tone: "info", icon: "clock" },
  used: { label: "Used", tone: "success", icon: "circle-check" },
  revoked: { label: "Revoked", tone: "neutral", icon: "ban" },
  expired: { label: "Expired", tone: "neutral", icon: "circle-x" },
};

/** Waiting invites first (soonest to expire), then the rest newest first. */
export function sortInvites(
  invites: readonly StaffInvite[],
  now: number = Date.now(),
): StaffInvite[] {
  return [...invites].sort((a, b) => {
    const aw = inviteState(a, now) === "waiting";
    const bw = inviteState(b, now) === "waiting";
    if (aw !== bw) return aw ? -1 : 1;
    if (aw) return a.expiresAt.localeCompare(b.expiresAt);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function roleName(roles: readonly StaffRole[], code: string): string {
  return roles.find((role) => role.code === code)?.name ?? code.replace(/_/g, " ");
}

/** "Hub runner" → "hub_runner": the API's role code shape (`^[a-z][a-z0-9_]{1,39}$`). */
export function roleCodeFromName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "");
  return slug.slice(0, 40);
}

export function roleProblem(name: string, roles: readonly StaffRole[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Name the role.";
  if (trimmed.length > ROLE_NAME_MAX)
    return `Keep the name to ${ROLE_NAME_MAX} characters.`;
  const code = roleCodeFromName(trimmed);
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(code))
    return "Use at least two letters in the name.";
  if (roles.some((role) => role.code === code))
    return "A role with this name already exists.";
  return null;
}

export function inviteDaysProblem(value: string): string | null {
  const days = Number(value);
  if (!Number.isInteger(days) || days < INVITE_DAYS_MIN || days > INVITE_DAYS_MAX) {
    return `Choose ${INVITE_DAYS_MIN} to ${INVITE_DAYS_MAX} days.`;
  }
  return null;
}
