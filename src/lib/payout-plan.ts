/**
 * Which payout plan an order was committed under, and what each of its stages
 * waits on.
 *
 * Two plans are live at once, and an order keeps the one it was placed under:
 *
 * - Plan 2, the escrow split (every order committed from 25 Sep 2026): start of
 *   production on the shop's proof, delivered on the rider's delivery evidence,
 *   and a last share that takes no file and releases once the complaint window
 *   has closed with no open claim.
 * - Plan 1, the legacy four stages: printing and packaging on the shop's proofs,
 *   delivered on the rider's, and retention inheriting the delivered proof.
 *
 * Screens render whatever stages the order carries, in the API's array order,
 * and ask this module what each waits on. Never a list of codes: a future plan
 * adds stages without a screen change. The shares themselves are the API's
 * (`sharePercent`, `amountMinor`); nothing here knows a percentage.
 *
 * Only Operations and Super Admin release a stage, on every plan.
 *
 * Contract: gridgo-api `docs/OPERATIONAL_MODEL_V2_API.md#supplier-payout-milestones`.
 * Pure functions — no React, no fetch.
 */

import type { Order, PayoutMilestone, PayoutReleaseRequirement } from "@/lib/api/types";

export const LEGACY_PAYOUT_PLAN_VERSION = 1;
export const ESCROW_PAYOUT_PLAN_VERSION = 2;

export type PlanOrder = Partial<Pick<Order, "payoutPlanVersion" | "payoutMilestones">>;
export type PlanStage = Pick<PayoutMilestone, "code"> &
  Partial<Pick<PayoutMilestone, "releaseRequires" | "label" | "sharePercent">>;

/*
 What each known code waits on, for an API that predates `releaseRequires`.
 The API's own field always wins; this is only the fallback.
*/
const REQUIREMENT_BY_CODE: Readonly<Record<string, PayoutReleaseRequirement>> = {
  production_started: "shop_proof",
  printing: "shop_proof",
  packaging_qc: "shop_proof",
  delivered: "delivery_proof",
  issue_window: "issue_window_closed",
  retention: "issue_window_closed",
};

/** Codes only the escrow plan issues, for an API that predates `payoutPlanVersion`. */
const ESCROW_ONLY_CODES = new Set(["production_started", "issue_window"]);

const REQUIREMENTS = new Set<string>([
  "shop_proof",
  "delivery_proof",
  "issue_window_closed",
]);

/**
 * The order's payout plan version, or null before a commitment creates the
 * stages. An API without the field predates the escrow plan, so its orders
 * are plan 1 unless they already carry an escrow-only stage.
 */
export function payoutPlanVersionOf(order: PlanOrder): number | null {
  const stored = order.payoutPlanVersion;
  if (typeof stored === "number" && Number.isFinite(stored)) return stored;
  const milestones = order.payoutMilestones ?? [];
  if (milestones.length === 0) return null;
  return milestones.some((m) => ESCROW_ONLY_CODES.has(m.code))
    ? ESCROW_PAYOUT_PLAN_VERSION
    : LEGACY_PAYOUT_PLAN_VERSION;
}

/** True for an order still on the four legacy stages, which keeps its old rules and words. */
export function isLegacyPayoutPlan(order: PlanOrder): boolean {
  return payoutPlanVersionOf(order) === LEGACY_PAYOUT_PLAN_VERSION;
}

/**
 * True when this stage keeps the legacy rules and words. The order's plan
 * decides; a caller that passed no plan (a bare stage) is judged by the code,
 * since only the escrow plan issues its own codes.
 */
export function isLegacyStage(order: PlanOrder, stage: PlanStage): boolean {
  const version = payoutPlanVersionOf(order);
  if (version !== null) return version === LEGACY_PAYOUT_PLAN_VERSION;
  return !ESCROW_ONLY_CODES.has(stage.code);
}

/** What this stage's release waits on, from the API or, failing that, its code. */
export function releaseRequirementOf(stage: PlanStage): PayoutReleaseRequirement | null {
  const stated = stage.releaseRequires;
  if (typeof stated === "string" && REQUIREMENTS.has(stated)) {
    return stated as PayoutReleaseRequirement;
  }
  return REQUIREMENT_BY_CODE[stage.code] ?? null;
}

/**
 * Whether release refuses this stage without a Proof of Fulfilment on it.
 *
 * Every stage does, except the escrow plan's last share: it waits on the
 * complaint window, never on a file. Legacy retention still needs the
 * delivered proof it inherits, so it keeps the old rule.
 */
export function stageNeedsProof(order: PlanOrder, stage: PlanStage): boolean {
  if (releaseRequirementOf(stage) !== "issue_window_closed") return true;
  return isLegacyStage(order, stage);
}

/** True for the stage that is released once the complaint window has closed and nothing else. */
export function isWindowStage(order: PlanOrder, stage: PlanStage): boolean {
  return (
    releaseRequirementOf(stage) === "issue_window_closed" &&
    !stageNeedsProof(order, stage)
  );
}

/** The stages the shop files its own proof for, in the plan's order. */
export function shopProofStages(order: PlanOrder): PayoutMilestone[] {
  return (order.payoutMilestones ?? []).filter(
    (stage) => releaseRequirementOf(stage) === "shop_proof",
  );
}

/**
 * The stage the complaint window pays out, on a plan where Operations releases
 * it by hand. Null on a legacy order, whose retention releases on its own.
 */
export function windowStageOf(order: PlanOrder): PayoutMilestone | null {
  return (
    (order.payoutMilestones ?? []).find((stage) => isWindowStage(order, stage)) ?? null
  );
}
