/**
 * Shop Owner and Staff logins (gridgo-api docs/SHOP_TEAM_API.md).
 *
 * The Owner's team routes live under `/me/shop-team`; a signed-in invitee
 * finds and claims invitations under `/auth/shop-invites`, which works before
 * the person has any GRIDGO account. Operations reads and removes a shop's
 * team under `/ops/shops/:shopId/team`. Responses are private: never cache
 * them, and never log or send an invite token anywhere but the claim body.
 */

import { apiRequest } from "@/lib/api/client";
import type {
  ShopInvite,
  ShopInviteKind,
  ShopMember,
  ShopPinStaff,
  ShopRole,
  ShopSummary,
  ShopTeamSettings,
  ShopTeamStats,
  ShopWorker,
} from "@/lib/api/types";

const json = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

const seg = (value: string) => encodeURIComponent(value);

// ---- The signed-in person ---------------------------------------------------

/** Every shop this person belongs to, pending and removed included. */
export async function listMyShopMemberships(): Promise<ShopSummary[]> {
  const result = await apiRequest<{ shops?: ShopSummary[] }>("/me/shop-memberships");
  return result.shops ?? [];
}

/**
 * Email and phone invitations waiting for this signed-in person, matched on
 * the verified email or phone in their sign-in account. QR and link
 * invitations are never listed here.
 */
export async function discoverShopInvites(): Promise<ShopInvite[]> {
  const result = await apiRequest<{ invites?: ShopInvite[] }>("/auth/shop-invites", json({}));
  return result.invites ?? [];
}

export type ShopInviteClaim = { token: string } | { inviteId: string };

/** Join a shop. The person waits as `pending` until an Owner approves. */
export async function claimShopInvite(
  claim: ShopInviteClaim,
): Promise<{ member: ShopMember; shop: ShopSummary }> {
  return apiRequest("/auth/shop-invites/claim", json(claim));
}

// ---- The Owner's team -------------------------------------------------------

/**
 * The team as `GET /me/shop-team` reads it. `pinStaff`, `stats` and
 * `settings` come from the extended contract (gridgo-api#422): null means
 * this GRIDGO does not offer them, so PIN people, the shared PC and the week
 * view stay hidden instead of leading to a refusal.
 */
export type ShopTeam = {
  members: ShopMember[];
  invites: ShopInvite[];
  pinStaff: ShopPinStaff[] | null;
  stats: ShopTeamStats | null;
  settings: ShopTeamSettings | null;
};

export async function getMyShopTeam(): Promise<ShopTeam> {
  const result = await apiRequest<{
    members?: ShopMember[];
    invites?: ShopInvite[];
    pinStaff?: ShopPinStaff[];
    stats?: ShopTeamStats;
    settings?: ShopTeamSettings;
  }>("/me/shop-team");
  return {
    members: result.members ?? [],
    invites: result.invites ?? [],
    pinStaff: Array.isArray(result.pinStaff) ? result.pinStaff : null,
    stats: result.stats && typeof result.stats === "object" ? result.stats : null,
    settings: result.settings && typeof result.settings === "object" ? result.settings : null,
  };
}

export type CreatedShopInvite = {
  invite: ShopInvite;
  /** Returned once, only here. Build the join link and QR from it, then drop it. */
  token: string;
};

export async function createShopInvite(
  kind: ShopInviteKind,
  identity?: string,
): Promise<CreatedShopInvite> {
  const result = await apiRequest<CreatedShopInvite>(
    "/me/shop-team/invites",
    json(identity === undefined ? { kind } : { kind, identity }),
  );
  return { invite: result.invite, token: result.token };
}

/**
 * "New code": cancel this invite and issue a fresh one of the same kind and
 * recipient in one step. The old link and QR stop working at once; the new
 * token is returned once, like a created invite.
 */
export async function replaceShopInvite(inviteId: string): Promise<CreatedShopInvite> {
  const result = await apiRequest<CreatedShopInvite>(
    `/me/shop-team/invites/${seg(inviteId)}/replace`,
    json({}),
  );
  return { invite: result.invite, token: result.token };
}

export async function revokeShopInvite(inviteId: string): Promise<ShopInvite> {
  const result = await apiRequest<{ invite: ShopInvite }>(
    `/me/shop-team/invites/${seg(inviteId)}`,
    { method: "DELETE" },
  );
  return result.invite;
}

export async function approveShopMember(userId: string): Promise<ShopMember> {
  const result = await apiRequest<{ member: ShopMember }>(
    `/me/shop-team/members/${seg(userId)}`,
    { method: "PATCH", body: JSON.stringify({ status: "active" }) },
  );
  return result.member;
}

export async function setShopMemberRole(userId: string, role: ShopRole): Promise<ShopMember> {
  const result = await apiRequest<{ member: ShopMember }>(
    `/me/shop-team/members/${seg(userId)}`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
  return result.member;
}

/** Decline a pending person or remove a member. Their access ends at once. */
export async function removeShopMember(userId: string): Promise<ShopMember> {
  const result = await apiRequest<{ member: ShopMember }>(
    `/me/shop-team/members/${seg(userId)}`,
    { method: "DELETE" },
  );
  return result.member;
}

/** Owner/Manager: a teammate's job alerts (`PATCH /me/shop-team/members/:userId`). */
export async function setShopMemberAlerts(userId: string, jobAlerts: boolean): Promise<ShopMember> {
  const result = await apiRequest<{ member: ShopMember }>(
    `/me/shop-team/members/${seg(userId)}`,
    { method: "PATCH", body: JSON.stringify({ jobAlerts }) },
  );
  return result.member;
}

/** The signed-in person's (or the picked PIN person's) own job alerts. */
export async function setMyTeamAlerts(jobAlerts: boolean): Promise<void> {
  await apiRequest("/me/shop-team/me", {
    method: "PATCH",
    body: JSON.stringify({ jobAlerts }),
  });
}

/** Owner only: whether Staff see who was fastest this week. */
export async function updateShopTeamSettings(
  patch: Partial<ShopTeamSettings>,
): Promise<ShopTeamSettings> {
  const result = await apiRequest<{ settings: ShopTeamSettings }>("/me/shop-team/settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return result.settings;
}

// ---- Phone-free PIN people ---------------------------------------------------
//
// A PIN is four digits sent as a string (leading zeroes kept). It goes in the
// request body only: never into state that outlives the form, a log or a URL.

export async function createPinStaff(input: {
  name: string;
  pin: string;
  role?: "staff" | "manager";
  jobAlerts?: boolean;
}): Promise<ShopPinStaff> {
  const result = await apiRequest<{ member: ShopPinStaff }>("/me/shop-team/pin-staff", json(input));
  return result.member;
}

export async function updatePinStaff(
  id: string,
  patch: { name?: string; role?: "staff" | "manager"; jobAlerts?: boolean },
): Promise<ShopPinStaff> {
  const result = await apiRequest<{ member: ShopPinStaff }>(`/me/shop-team/pin-staff/${seg(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return result.member;
}

/** A new PIN. Every shop device that had this person picked goes back to the picker. */
export async function resetPinStaffPin(id: string, pin: string): Promise<ShopPinStaff> {
  const result = await apiRequest<{ member: ShopPinStaff }>(
    `/me/shop-team/pin-staff/${seg(id)}/reset`,
    json({ pin }),
  );
  return result.member;
}

export async function removePinStaff(id: string): Promise<ShopPinStaff> {
  const result = await apiRequest<{ member: ShopPinStaff }>(`/me/shop-team/pin-staff/${seg(id)}`, {
    method: "DELETE",
  });
  return result.member;
}

// ---- The shared shop PC ("Who's working?") ------------------------------------
//
// These always carry `X-GRIDGO-Role: supplier`: a locked device has no other
// workspace, and the picker must work before anyone is picked.

const SUPPLIER = { "X-GRIDGO-Role": "supplier" };

export type WorkingList = {
  members: Array<ShopMember | ShopPinStaff>;
  worker: ShopWorker | null;
};

export async function getWorkingList(): Promise<WorkingList> {
  const result = await apiRequest<Partial<WorkingList>>("/me/shop-team/working", {
    headers: SUPPLIER,
  });
  return { members: result.members ?? [], worker: result.worker ?? null };
}

export type WorkerSelection = { worker: ShopPinStaff; token: string; expiresAt: string };

export async function selectWorker(pinStaffId: string, pin: string): Promise<WorkerSelection> {
  return apiRequest<WorkerSelection>("/me/shop-team/working/select", {
    method: "POST",
    headers: SUPPLIER,
    body: JSON.stringify({ pinStaffId, pin }),
  });
}

/** Lock this device: nobody works until someone types a PIN again. */
export async function lockWorkingDevice(): Promise<void> {
  await apiRequest("/me/shop-team/working/lock", {
    method: "POST",
    headers: SUPPLIER,
    body: JSON.stringify({}),
  });
}

// ---- Operations and Super Admin --------------------------------------------

export async function getOpsShopTeam(shopId: string): Promise<ShopMember[]> {
  const result = await apiRequest<{ members?: ShopMember[] }>(
    `/ops/shops/${seg(shopId)}/team`,
  );
  return result.members ?? [];
}

export async function removeOpsShopMember(shopId: string, userId: string): Promise<ShopMember> {
  const result = await apiRequest<{ member: ShopMember }>(
    `/ops/shops/${seg(shopId)}/team/${seg(userId)}`,
    { method: "DELETE" },
  );
  return result.member;
}
