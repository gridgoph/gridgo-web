import type { PortalRole, RoleMembership } from "@/lib/api/types";

/** Stable landing order only; every destination still authorizes its fixed projection. */
const PORTAL_ROLE_ORDER: readonly PortalRole[] = ["super_admin", "ops_admin", "supplier"];

export function isPortalRole(role: string): role is PortalRole {
  return PORTAL_ROLE_ORDER.some((candidate) => candidate === role);
}

export function portalRolesFromMemberships(
  memberships: readonly RoleMembership[],
): PortalRole[] {
  const assigned = new Set(memberships.map((membership) => membership.role));
  return PORTAL_ROLE_ORDER.filter((role) => assigned.has(role));
}

export function preferredPortalRole(
  memberships: readonly RoleMembership[],
): PortalRole | null {
  return portalRolesFromMemberships(memberships)[0] ?? null;
}
