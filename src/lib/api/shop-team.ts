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
  ShopRole,
  ShopSummary,
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

export type ShopTeam = { members: ShopMember[]; invites: ShopInvite[] };

export async function getMyShopTeam(): Promise<ShopTeam> {
  const result = await apiRequest<Partial<ShopTeam>>("/me/shop-team");
  return { members: result.members ?? [], invites: result.invites ?? [] };
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
