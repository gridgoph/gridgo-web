/**
 * The four payout milestones on an order, each with its evidence and whatever
 * is currently stopping it from being released.
 *
 * The amounts are shares of the supplier's own price, so they are safe for the
 * supplier's own payouts screen as well as Operations. Pass `onRelease` only
 * from an Operations surface — the API refuses anyone else.
 */

import { StatusChip } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/button";
import type { Order, PayoutMilestone } from "@/lib/api/types";
import { milestoneReleaseBlocker } from "@/lib/api/constraints";
import { formatDateTime, formatPhp } from "@/lib/format";
import {
  milestoneProofSource,
  presentMilestone,
  presentMilestoneStatus,
} from "@/lib/order-state";

type Props = {
  order: Order;
  /** Operations only. Omit for a read-only view. */
  onRelease?: (milestone: PayoutMilestone) => void;
  /** Milestone code currently being released. */
  releasing?: string | null;
};

export function MilestoneList({ order, onRelease, releasing }: Props) {
  const milestones = order.payoutMilestones;

  if (!milestones?.length) {
    return (
      <p className="text-body text-text-secondary m-0">
        Milestones are set up when the supplier accepts and names its price.
        Each of the four releases against a Proof of Fulfilment.
      </p>
    );
  }

  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {milestones.map((milestone) => {
        const status = presentMilestoneStatus(milestone.status);
        const blocker = milestoneReleaseBlocker(order, milestone);
        const released = milestone.status === "released";
        const proofCount = milestone.pofFileIds.length;

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
                  {presentMilestone(milestone.code)}
                </p>
                <p className="text-caption text-text-muted m-0 mt-0.5">
                  {milestone.sharePercent}% of supplier earnings ·{" "}
                  {milestoneProofSource(milestone.code)}
                </p>
              </div>
              {milestone.amountMinor !== undefined ? (
                <p
                  className="text-body text-text-primary m-0 tabular-nums"
                  style={{ fontFamily: "var(--font-bold)" }}
                >
                  {formatPhp(milestone.amountMinor)}
                </p>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusChip
                tone={status.tone}
                label={status.label}
                icon={status.icon}
              />
              <span className="text-caption text-text-muted">
                {proofCount === 0
                  ? "No proof on file"
                  : proofCount === 1
                    ? "1 proof on file"
                    : `${proofCount} proofs on file`}
              </span>
              {released ? (
                <span className="text-caption text-text-muted">
                  Released {formatDateTime(milestone.releasedAt)}
                </span>
              ) : null}
            </div>

            {!released && blocker ? (
              <p className="text-caption text-text-secondary m-0 mt-2">
                {blocker}
              </p>
            ) : null}

            {onRelease && !released ? (
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
  );
}
