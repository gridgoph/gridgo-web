"use client";

/**
 * The four payout shares as an accordion, each row readable without opening:
 * the share, its amount, and where it stands. Opening a row shows the Proof
 * of Fulfilment that backs it — the picture, who filed it and when — plus the
 * one reason it cannot go out yet, or the release action when it can.
 *
 * Amounts are shares of the supplier's own price, so this is safe on the
 * supplier's surfaces too. Pass `onRelease` only from Operations; the API
 * refuses anyone else.
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
import { milestoneProofSource, presentMilestone } from "@/lib/order-state";
import {
  describeProof,
  milestoneProofs,
  milestoneReadiness,
  presentReadiness,
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
        Shares are set up when the shop accepts and names its price. Each of the four
        releases against a Proof of Fulfilment.
      </p>
    );
  }

  return (
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
        const name = presentMilestone(milestone.code, milestone.sharePercent);

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
                    {milestoneProofSource(milestone.code)}.
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
                  <ul
                    className={cn(
                      "m-0 grid list-none gap-3 p-0",
                      emphasizeProof
                        ? "grid-cols-1 md:grid-cols-2"
                        : "grid-cols-1 sm:grid-cols-2",
                    )}
                  >
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
                  <p className="text-body text-text-secondary m-0">
                    No proof on file yet. {milestoneProofSource(milestone.code)}.
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

                {onRelease && !released ? (
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
