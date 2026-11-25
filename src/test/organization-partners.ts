/** Partner organizations and perks for tests. Invented names and test figures only. */

import type { MemberPerk, OrganizationPartner } from "@/lib/api/organization-partners";

export function memberPerk(overrides: Partial<MemberPerk> = {}): MemberPerk {
  return {
    enabled: true,
    amountMinor: 1234,
    maxOrdersPerTerm: 3,
    endsAt: "2099-03-31T15:59:59.999Z",
    budgetCapMinor: 100000,
    version: 4,
    updatedAt: "2026-11-01T00:00:00.000Z",
    updatedBy: "user_admin",
    ...overrides,
  };
}

export function partner(
  overrides: Partial<OrganizationPartner> = {},
): OrganizationPartner {
  return {
    userId: "user_org",
    organizationName: "Sample Drafting Guild",
    label: "SDG",
    status: "active",
    live: true,
    partnerSince: "2026-10-05",
    version: 2,
    benefits: { badge: true, jointPromos: false, boothSupport: false },
    perkOverride: null,
    perk: memberPerk(),
    budgetUsedMinor: 20000,
    budgetLeftMinor: 80000,
    results: {
      term: { code: "2026-27", label: "SY 2026-27", endsOn: "2027-05-31" },
      memberCount: 41,
      membersOrdered: 12,
      memberOrders: 19,
      membersSavedMinor: 18000,
    },
    ...overrides,
  };
}
