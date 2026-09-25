/**
 * Payout stages exactly as the API sends them, for tests on both plans.
 *
 * Shapes follow gridgo-api `docs/OPERATIONAL_MODEL_V2_API.md#supplier-payout-milestones`:
 * every stage carries `label` and `releaseRequires`, and the order carries
 * `payoutPlanVersion`. Amounts are shares of a ₱1,000.00 shop price.
 */

import type { PayoutMilestone } from "@/lib/api/types";

type StageOverrides = Partial<Record<string, Partial<PayoutMilestone>>>;

const ESCROW = [
  { code: "production_started", label: "Start of production", sharePercent: 40, releaseRequires: "shop_proof" },
  { code: "delivered", label: "Delivered", sharePercent: 35, releaseRequires: "delivery_proof" },
  { code: "issue_window", label: "Issue window closed", sharePercent: 25, releaseRequires: "issue_window_closed" },
] as const;

const LEGACY = [
  { code: "printing", label: "Printing", sharePercent: 50, releaseRequires: "shop_proof" },
  { code: "packaging_qc", label: "Packaging", sharePercent: 15, releaseRequires: "shop_proof" },
  { code: "delivered", label: "Delivered", sharePercent: 25, releaseRequires: "delivery_proof" },
  { code: "retention", label: "Retention", sharePercent: 10, releaseRequires: "issue_window_closed" },
] as const;

function build(
  stages: readonly { code: string; label: string; sharePercent: number; releaseRequires: string }[],
  overrides: StageOverrides,
): PayoutMilestone[] {
  return stages.map((stage) => ({
    ...stage,
    amountMinor: stage.sharePercent * 1000,
    status: "pending_pof",
    pofFileIds: [],
    releasedAt: null,
    releasedBy: null,
    ...overrides[stage.code],
  }));
}

/** Plan 2: start of production 40, delivered 35, issue window 25. */
export function escrowStages(overrides: StageOverrides = {}): PayoutMilestone[] {
  return build(ESCROW, overrides);
}

/** Plan 1: printing 50, packaging 15, delivered 25, retention 10. */
export function legacyStages(overrides: StageOverrides = {}): PayoutMilestone[] {
  return build(LEGACY, overrides);
}

export const released = (fileId?: string): Partial<PayoutMilestone> => ({
  status: "released",
  pofFileIds: fileId ? [fileId] : [],
  releasedAt: "2026-09-26T02:00:00.000Z",
  releasedBy: "user_ops",
});

export const proofOnFile = (fileId: string): Partial<PayoutMilestone> => ({
  status: "pof_attached",
  pofFileIds: [fileId],
});
