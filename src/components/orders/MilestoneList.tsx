/**
 * The payout milestones on an order, as many as its plan has and in the API's
 * order, each with its evidence and whatever is currently stopping it from
 * being released.
 *
 * The amounts are shares of the supplier's own price, so they are safe for the
 * supplier's own payouts screen as well as Operations. Pass `onRelease` only
 * from an Operations surface — the API refuses anyone else.
 */

import { ImagePlus } from "lucide-react";

import { EvidenceStrip } from "@/components/orders/EvidencePreview";
import { ProofGallery } from "@/components/orders/ProofGallery";
import { SettlementPayouts } from "@/components/orders/SettlementPayouts";
import { StatusChip } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/button";
import type { Order, PayoutMilestone } from "@/lib/api/types";
import { milestoneIsClosed, milestoneReleaseBlocker } from "@/lib/api/constraints";
import { formatDateTime, formatPhp } from "@/lib/format";
import {
  milestoneName,
  milestoneProofSource,
  presentMilestoneStatus,
  type StatePresentation,
} from "@/lib/order-state";
import { shopProofNotStarted, stageNeedsProof } from "@/lib/payout-plan";
import { proofCountLabel, shopProofAccess, stageProofIds } from "@/lib/payout-proofs";

const READY_FOR_OPERATIONS: StatePresentation = {
  label: "Ready for Operations",
  tone: "info",
  icon: "circle-check",
};

type Props = {
  order: Order;
  /** Operations only. Omit for a read-only view. */
  onRelease?: (milestone: PayoutMilestone) => void;
  /** Milestone code currently being released. */
  releasing?: string | null;
  /** The shop's job page: add proof photos to a stage the shop files for. */
  onAddProof?: (milestone: PayoutMilestone) => void;
  addDisabled?: boolean;
};

export function MilestoneList({
  order,
  onRelease,
  releasing,
  onAddProof,
  addDisabled = false,
}: Props) {
  const milestones = order.payoutMilestones;

  if (!milestones?.length) {
    return (
      <p className="text-body text-text-secondary m-0">
        Milestones appear once you accept the job. Operations releases each one
        once what it waits on is in.
      </p>
    );
  }

  /*
   One reason, stated once.

   Until any proof exists, `milestoneReleaseBlocker` returns the same sentence
   for every stage — so the list repeated one long paragraph under each row and
   buried the per-stage detail that actually differs. When they all agree, the
   reason belongs above the list; the rows keep only what is theirs alone.
  */
  const unreleased = milestones.filter((m) => !milestoneIsClosed(m));
  const blockers = unreleased.map((m) => milestoneReleaseBlocker(order, m));
  const sharedBlocker =
    unreleased.length > 1 && blockers.every((b) => b !== null && b === blockers[0])
      ? blockers[0]
      : null;

  return (
    <div className="flex flex-col gap-3">
      {sharedBlocker ? (
        <p className="text-caption text-text-secondary bg-surface-variant rounded-field m-0 px-3 py-2">
          {sharedBlocker}
        </p>
      ) : null}
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {milestones.map((milestone, index) => {
          const needsProof = stageNeedsProof(order, milestone);
          const blocker = milestoneReleaseBlocker(order, milestone);
          // A share with no file to wait on is ready the moment nothing blocks it.
          const superseded = milestone.status === "superseded";
          const status =
            !needsProof && !milestoneIsClosed(milestone) && blocker === null
              ? READY_FOR_OPERATIONS
              : presentMilestoneStatus(milestone.status, {
                  needsProof,
                  reached: !shopProofNotStarted(order, milestone),
                });
          const released = milestone.status === "released";
          const proofIds = stageProofIds(milestone);
          const proofCount = proofIds.length;
          const access = onAddProof ? shopProofAccess(order, milestone) : null;

          return (
            <li
              key={milestone.code}
              className="rounded-card border border-outline-subtle px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p
                    className="text-body text-text-primary m-0"
                    style={{ fontFamily: "var(--font-medium)" }}
                  >
                    <span className="text-text-muted tabular-nums">
                      {index + 1}/{milestones.length}
                    </span>{" "}
                    {milestoneName(milestone)}
                  </p>
                  <p className="text-caption text-text-muted m-0 mt-0.5">
                    {milestone.sharePercent}% of supplier earnings ·{" "}
                    {milestoneProofSource(milestone, order)}
                  </p>
                </div>
                {milestone.amountMinor !== undefined ? (
                  <p
                    className={`text-body m-0 tabular-nums ${
                      superseded ? "text-text-muted" : "text-text-primary"
                    }`}
                    style={{
                      fontFamily: superseded ? "var(--font-sans)" : "var(--font-bold)",
                    }}
                  >
                    {formatPhp(milestone.amountMinor)}
                    {superseded ? <span className="sr-only">, not paid</span> : null}
                    {milestone.productionDeductionMinor ? (
                      <span className="text-caption text-text-muted block text-right" style={{ fontFamily: "var(--font-sans)" }}>
                        After {formatPhp(milestone.productionDeductionMinor)} late deduction
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
                <span className="text-caption text-text-muted">
                  {proofCount === 0 && !needsProof
                    ? "No proof needed"
                    : proofCountLabel(proofCount)}
                </span>
                {released ? (
                  <span className="text-caption text-text-muted">
                    Released {formatDateTime(milestone.releasedAt)}
                    {milestone.reference ? `, reference ${milestone.reference}` : ""}
                  </span>
                ) : null}
              </div>

              {released && milestone.receiptFileId ? (
                <div className="mt-3">
                  <EvidenceStrip
                    items={[
                      {
                        fileId: milestone.receiptFileId,
                        kind: "payout_receipt" as const,
                        label: "Wallet receipt",
                        caption: milestone.reference ?? null,
                      },
                    ]}
                  />
                </div>
              ) : null}

              {proofCount > 0 ? (
                <div className="mt-3">
                  <ProofGallery fileIds={proofIds} label={`${milestoneName(milestone)} proof`} />
                </div>
              ) : null}

              {access?.allowed && onAddProof ? (
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    disabled={addDisabled}
                    onClick={() => onAddProof(milestone)}
                  >
                    <ImagePlus data-icon="inline-start" strokeWidth={1.75} aria-hidden />
                    {proofCount === 0 ? "Add proof photos" : "Add more proof photos"}
                  </Button>
                </div>
              ) : access && !access.allowed && access.reason ? (
                <p className="text-caption text-text-secondary m-0 mt-2">{access.reason}</p>
              ) : null}

              {!released && blocker && blocker !== sharedBlocker ? (
                <p className="text-caption text-text-secondary m-0 mt-2">{blocker}</p>
              ) : null}

              {onRelease && !released && !superseded ? (
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    disabled={Boolean(blocker) || releasing !== null}
                    onClick={() => onRelease(milestone)}
                  >
                    {releasing === milestone.code
                      ? "Releasing…"
                      : `Release ${formatPhp(milestone.amountMinor ?? 0)}`}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {order.supplierSettlementPayouts?.length ? (
        <SettlementPayouts order={order} />
      ) : null}
    </div>
  );
}
