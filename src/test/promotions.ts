/**
 * `GET /admin/promotions` as the API sends it, at the launch defaults: the
 * Founding 30 at ₱200 (27 Oct–8 Nov), the Friend Pass at ₱100 for 20 friends,
 * a ₱9,000 cap and ₱15 rewards. Two claims (one used) and two invites.
 */
export function rawPromotions(overrides: Record<string, unknown> = {}) {
  return {
    version: 3,
    serverTime: "2026-10-28T02:00:00.000Z",
    settings: {
      founding: {
        amountMinor: 20000,
        slots: 30,
        startsAt: "2026-10-26T16:00:00.000Z",
        endsAt: "2026-11-08T15:59:59.000Z",
        enabled: true,
      },
      friendPass: {
        amountMinor: 10000,
        perFounder: 1,
        total: 20,
        upgradeAt: "2026-11-01T15:59:59.000Z",
        enabled: true,
      },
      budgetCapMinor: 900000,
      rewards: { surveyMinor: 1500, missionMinor: 1500, inviteMinor: 1500 },
    },
    founding: {
      slots: 30,
      claimed: 2,
      available: 28,
      used: 1,
      expiredUnused: 0,
      claims: [
        {
          id: "usr_ven",
          name: "Ven Cruz",
          email: "ven@example.test",
          clientId: "usr_ven",
          voucherId: "vch_1",
          claimedAt: "2026-10-27T01:00:00.000Z",
          valueMinor: 20000,
          status: "used",
          promotionKind: "founding",
          upgradedAt: null,
          orderIds: ["ord_1"],
        },
        {
          id: "usr_ana",
          name: "Ana Reyes",
          email: "ana@example.test",
          clientId: "usr_ana",
          voucherId: "vch_2",
          claimedAt: "2026-10-27T03:00:00.000Z",
          valueMinor: 20000,
          status: "available",
          promotionKind: "founding",
          upgradedAt: null,
          orderIds: [],
        },
      ],
    },
    friendPass: {
      total: 20,
      issued: 1,
      invites: [
        {
          id: "pinv_1",
          founder: { id: "usr_ven", name: "Ven Cruz", email: "ven@example.test" },
          email: "jo@example.test",
          friendEmail: "jo@example.test",
          clientId: "usr_jo",
          status: "claimed",
          createdAt: "2026-10-27T02:00:00.000Z",
          claimedAt: "2026-10-27T05:00:00.000Z",
          valueMinor: 10000,
          upgradedAt: null,
        },
        {
          id: "pinv_2",
          founder: { id: "usr_ana", name: "Ana Reyes", email: "ana@example.test" },
          email: "lee@example.test",
          friendEmail: "lee@example.test",
          clientId: null,
          status: "invited",
          createdAt: "2026-10-27T04:00:00.000Z",
          claimedAt: null,
          valueMinor: null,
          upgradedAt: null,
        },
      ],
    },
    budget: {
      capMinor: 900000,
      committedMinor: 50000,
      redeemedMinor: 20000,
      remainingMinor: 850000,
    },
    ...overrides,
  };
}
