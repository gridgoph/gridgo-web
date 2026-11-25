/**
 * Partner organizations and the member perk, GRIDGO's side (issue report
 * F67EAE25; contract `gridgo-api/docs/ORGANIZATION_MEMBERS_API.md`, "Partners
 * and the perk"). Operations and Super Admin read; only Super Admin writes.
 * Every write carries `expectedVersion` (0 to create) and an audited reason,
 * and a stale one is `409` with `currentVersion`.
 *
 * Money is centavos throughout and every figure here is the API's: the portal
 * never works out what an order saves. No member name or contact is read.
 */

import { apiRequest } from "@/lib/api/client";

export type MemberPerk = {
  enabled: boolean;
  /** The most one order may save; GRIDGO's service fee is the real ceiling. */
  amountMinor: number;
  maxOrdersPerTerm: number;
  /** The perk stops at this instant. */
  endsAt: string;
  /** Cumulative for one organization, across terms. */
  budgetCapMinor: number;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type PartnerBenefits = {
  badge: boolean;
  jointPromos: boolean;
  boothSupport: boolean;
};

export type PartnerStatus = "active" | "ended";

export type PartnerResults = {
  term: { code: string; label: string; endsOn: string };
  memberCount: number;
  /** Members with at least one paid order this term. */
  membersOrdered: number;
  memberOrders: number;
  membersSavedMinor: number;
};

export type OrganizationPartner = {
  userId: string;
  organizationName: string | null;
  label: string;
  status: PartnerStatus;
  /** False when the account, its approval or its officer of record lapsed. */
  live: boolean;
  /** A Manila calendar date. */
  partnerSince: string;
  version: number;
  benefits: PartnerBenefits;
  perkOverride: MemberPerk | null;
  /** The perk in force right now; null when off, ended or never set. */
  perk: MemberPerk | null;
  /** Orders waiting for payment count too; a returned use gives its money back. */
  budgetUsedMinor: number;
  budgetLeftMinor: number | null;
  results: PartnerResults;
};

export type MemberPerkInput = Pick<
  MemberPerk,
  "enabled" | "amountMinor" | "maxOrdersPerTerm" | "endsAt" | "budgetCapMinor"
>;

export type PartnerInput = {
  label: string;
  status: PartnerStatus;
  partnerSince: string;
  benefits: PartnerBenefits;
};

type Write = { expectedVersion: number; reason: string };

const partnerPath = (userId: string) =>
  `/ops/organization-partners/${encodeURIComponent(userId)}`;

const json = (method: "PUT" | "DELETE", body: unknown) => ({
  method,
  body: JSON.stringify(body),
});

/** Ops / Super Admin. Every partner, live or ended, with its totals. */
export async function listOrganizationPartners(): Promise<OrganizationPartner[]> {
  const body = await apiRequest<{ partners: OrganizationPartner[] }>(
    "/ops/organization-partners",
  );
  return body.partners ?? [];
}

/** Ops / Super Admin. `404 organization_partner_not_found` for a plain organization. */
export async function getOrganizationPartner(
  userId: string,
): Promise<OrganizationPartner> {
  return (await apiRequest<{ partner: OrganizationPartner }>(partnerPath(userId)))
    .partner;
}

/** Super Admin. Creates (`expectedVersion: 0`) or changes a partner; `ended` stops its perk. */
export async function saveOrganizationPartner(
  userId: string,
  input: PartnerInput & Write,
): Promise<OrganizationPartner> {
  const body = await apiRequest<{ partner: OrganizationPartner }>(
    partnerPath(userId),
    json("PUT", input),
  );
  return body.partner;
}

/** Ops / Super Admin. Null until a Super Admin sets the standard perk. */
export async function getStandardPerk(): Promise<MemberPerk | null> {
  return (await apiRequest<{ standard: MemberPerk | null }>("/ops/member-perk")).standard;
}

/** Super Admin. The one perk every partner without its own gets; new orders only. */
export async function saveStandardPerk(
  input: MemberPerkInput & Write,
): Promise<MemberPerk> {
  return (
    await apiRequest<{ standard: MemberPerk }>("/ops/member-perk", json("PUT", input))
  ).standard;
}

/** Super Admin. Replaces the standard perk for one organization, including off. */
export async function savePartnerPerk(
  userId: string,
  input: MemberPerkInput & Write,
): Promise<OrganizationPartner> {
  const body = await apiRequest<{ partner: OrganizationPartner }>(
    `${partnerPath(userId)}/perk`,
    json("PUT", input),
  );
  return body.partner;
}

/** Super Admin. Back to the standard perk. */
export async function removePartnerPerk(
  userId: string,
  input: Write,
): Promise<OrganizationPartner> {
  const body = await apiRequest<{ partner: OrganizationPartner }>(
    `${partnerPath(userId)}/perk`,
    json("DELETE", input),
  );
  return body.partner;
}
