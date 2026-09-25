"use client";

/**
 * The payout shares as an accordion, as many as the order's plan has and in the
 * API's order, each row readable without opening: the share, its amount, and
 * where it stands. Opening a row shows who filed
 * the Proof of Fulfilment and when, the one reason it cannot go out yet, or
 * the release action when it can. Pictures of those proofs live on Production
 * (and the dedicated payout desk when `emphasizeProof` is on). Wallet
 * receipts stay here.
 *
 * Amounts are shares of the supplier's own price, so this is safe on the
 * supplier's surfaces too. Pass `onRelease` only from Operations; the API
 * refuses anyone else.
 *
 * On an escrow-plan order whose complaint window has closed with nothing
 * raised, the last share gets one clear action above the list ("Everything
 * looks good", gridgo-web#58) instead of a button buried in its row.
 */

import { useState } from "react";
import { CircleCheck, Lock } from "lucide-react";

import { EvidencePlate } from "@/components/orders/EvidencePreview";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Claim, Order, PayoutMilestone } from "@/lib/api/types";
import { milestoneReleaseBlocker } from "@/lib/api/constraints";
import { formatDateTime, formatPhp } from "@/lib/format";
import { milestoneName, milestoneProofSource } from "@/lib/order-state";
import { stageNeedsProof } from "@/lib/payout-plan";
import {
  describeProof,
  milestoneProofs,
  milestoneReadiness,
  presentReadiness,
  readyWindowShare,
  releasableMilestones,
  releaseRecord,
  type MilestoneReadiness,
} from "@/lib/payouts";
import { cn } from "@/lib/utils";

type Props = {
  order: Order;
  /** Active claim holds on this order, when the caller has them. */
  holds?: Claim[];
  /** Operations only. Omit for a read-only view. */
  onRelease?: (milestone: PayoutMilestone) => void;
  /** Milestone code currently being released. */
  releasing?: string | null;
  /**
   * Codes to open on first render. Defaults to the shares that can be
   * released now, or the next one waiting when none can.
   */
  defaultOpen?: string[];
  /** Larger proof plates for a screen whose whole job is looking at them. */
  emphasizeProof?: boolean;
};

export function PayoutMilestones({
  order,
  holds = [],
  onRelease,
  releasing = null,
  defaultOpen,
  emphasizeProof = false,
}: Props) {
  const milestones = order.payoutMilestones ?? [];
  const [open, setOpen] = useState<string[]>(
    () => defaultOpen ?? defaultOpenCodes(order, holds),
  );

  if (milestones.length === 0) {
    return (
      <p className="text-body text-text-secondary m-0">
        Shares are set up when the shop accepts and names its price. Operations releases
        each one once what it waits on is in.
      </p>
    );
  }

  const windowShare = onRelease ? readyWindowShare(order, holds) : null;

  return (
    <div className="flex flex-col gap-3">
      {windowShare && onRelease ? (
        <WindowClosedRelease
          milestone={windowShare}
          releasing={releasing}
          onRelease={() => onRelease(windowShare)}
        />
      ) : null}
      <Accordion
        multiple
        value={open}
        onValueChange={(value) => setOpen(value as string[])}
        className="rounded-card border border-outline-subtle"
      >
        {milestones.map((milestone, index) => {
          const readiness = milestoneReadiness(order, milestone, holds);
          const status = presentReadiness(readiness);
          const proofs = milestoneProofs(order, milestone);
          const released = readiness === "released";
          const record = released ? releaseRecord(order, milestone) : null;
          const blocker = released ? null : blockerFor(readiness, order, milestone);
          const name = milestoneName(milestone);
          const needsProof = stageNeedsProof(order, milestone);

          return (
            <AccordionItem key={milestone.code} value={milestone.code}>
              <AccordionHeader render={<div />}>
                <AccordionTrigger className="items-center">
                  <Marker index={index} readiness={readiness} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className="text-body text-text-primary"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {name}
                    </span>
                    <span className="text-caption text-text-muted">
                      {milestone.sharePercent}% of what the shop earns.{" "}
                      {milestoneProofSource(milestone, order)}.
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {milestone.amountMinor !== undefined ? (
                      <span
                        className="text-body text-text-primary tabular-nums"
                        style={{ fontFamily: "var(--font-bold)" }}
                      >
                        {formatPhp(milestone.amountMinor)}
                      </span>
                    ) : null}
                    <StatusChip
                      tone={status.tone}
                      label={status.label}
                      icon={status.icon}
                    />
                  </span>
                </AccordionTrigger>
              </AccordionHeader>
              <AccordionContent>
                <div className="flex flex-col gap-3 sm:pl-9">
                  {proofs.length > 0 ? (
                    emphasizeProof ? (
                      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
                        {proofs.map((proof) => (
                          <li key={proof.fileId} className="min-w-0">
                            <EvidencePlate fileId={proof.fileId} label={proof.label} />
                            <p className="text-caption text-text-muted m-0 mt-1">
                              {describeProof(proof, formatDateTime)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul className="m-0 flex list-none flex-col gap-1 p-0">
                        {proofs.map((proof) => (
                          <li key={proof.fileId}>
                            <p className="text-caption text-text-secondary m-0">
                              {proof.label}. {describeProof(proof, formatDateTime)}.
                            </p>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : needsProof ? (
                    <p className="text-body text-text-secondary m-0">
                      No proof on file yet. {milestoneProofSource(milestone, order)}.
                    </p>
                  ) : released ? null : (
                    <p className="text-body text-text-secondary m-0">
                      Nothing to file for this share. It waits on the client&rsquo;s
                      complaint window closing with no claim open.
                    </p>
                  )}

                  {record ? (
                    <p className="text-caption text-text-secondary m-0">
                      Released {record.at ? formatDateTime(record.at) : ""}
                      {record.by ? ` by ${record.by}` : ""}
                      {milestone.reference ? `, reference ${milestone.reference}` : ""}.
                    </p>
                  ) : null}

                  {released && milestone.receiptFileId ? (
                    <div className="max-w-sm">
                      <EvidencePlate
                        fileId={milestone.receiptFileId}
                        label="Wallet receipt"
                        caption={milestone.reference ?? null}
                      />
                    </div>
                  ) : null}

                  {blocker ? (
                    <p className="text-caption text-text-secondary m-0">{blocker}</p>
                  ) : null}

                  {windowShare?.code === milestone.code ? (
                    <p className="text-caption text-text-secondary m-0">
                      Ready. Release it with the action above the shares.
                    </p>
                  ) : onRelease && !released ? (
                    <div>
                      <Button
                        variant="secondary"
                        disabled={readiness !== "ready" || releasing !== null}
                        onClick={() => onRelease(milestone)}
                      >
                        {releasing === milestone.code
                          ? "Releasing…"
                          : milestone.amountMinor !== undefined
                            ? `Release ${formatPhp(milestone.amountMinor)}`
                            : "Release this share"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

/**
 * "Everything looks good": the complaint window closed with nothing raised,
 * so the last share is one press away. The page's one yellow action while it
 * shows — nothing else on a completed order asks Operations for a decision.
 */
function WindowClosedRelease({
  milestone,
  releasing,
  onRelease,
}: {
  milestone: PayoutMilestone;
  releasing: string | null;
  onRelease: () => void;
}) {
  const amount =
    milestone.amountMinor !== undefined ? formatPhp(milestone.amountMinor) : null;
  return (
    <div
      className="rounded-card border border-outline flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      role="group"
      aria-labelledby={`window-release-${milestone.code}`}
    >
      <div className="flex min-w-0 max-w-prose items-start gap-3">
        <CircleCheck
          size={20}
          strokeWidth={2}
          className="text-success mt-0.5 shrink-0"
          aria-hidden
        />
        <div className="min-w-0">
          <p
            id={`window-release-${milestone.code}`}
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            Everything looks good
          </p>
          <p className="text-caption text-text-secondary m-0 mt-0.5">
            The complaint window has closed with no claim open. The last{" "}
            {milestone.sharePercent}% of the shop&rsquo;s price
            {amount ? `, ${amount},` : ""} is ready for you to release.
          </p>
        </div>
      </div>
      <Button variant="primary" disabled={releasing !== null} onClick={onRelease}>
        {releasing === milestone.code
          ? "Releasing…"
          : `Release the last ${milestone.sharePercent}%`}
      </Button>
    </div>
  );
}

/**
 * Open what needs a decision. When nothing can be released, open the next
 * share so the screen still says what it is waiting for.
 */
export function defaultOpenCodes(order: Order, holds: readonly Claim[] = []): string[] {
  const ready = releasableMilestones(order, holds).map((m) => m.code);
  if (ready.length > 0) return ready;
  const next = (order.payoutMilestones ?? []).find((m) => m.status !== "released");
  return next ? [next.code] : [];
}

function blockerFor(
  readiness: MilestoneReadiness,
  order: Order,
  milestone: PayoutMilestone,
): string | null {
  if (readiness === "ready") return null;
  return milestoneReleaseBlocker(order, milestone);
}

/**
 * The shares release in order, so the number is information: it is the
 * position in a sequence, and the tick replaces it once that step is behind.
 */
function Marker({ index, readiness }: { index: number; readiness: MilestoneReadiness }) {
  const base =
    "flex size-6 shrink-0 items-center justify-center rounded-pill border text-caption tabular-nums";
  if (readiness === "released") {
    return (
      <span className={cn(base, "border-success text-success")} aria-hidden>
        <CircleCheck size={14} strokeWidth={2} />
      </span>
    );
  }
  if (readiness === "not_reached") {
    return (
      <span className={cn(base, "border-outline-subtle text-text-muted")} aria-hidden>
        <Lock size={12} strokeWidth={2} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        readiness === "ready"
          ? "border-outline bg-surface-variant text-text-primary"
          : "border-outline-subtle text-text-secondary",
      )}
      style={{ fontFamily: "var(--font-medium)" }}
      aria-hidden
    >
      {index + 1}
    </span>
  );
}
