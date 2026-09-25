"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { EvidenceStrip } from "@/components/orders/EvidencePreview";
import { PayoutDestinationCard } from "@/components/orders/PayoutDestination";
import { PayoutMilestones } from "@/components/orders/PayoutMilestones";
import {
  ReleaseMilestoneDialog,
  type ReleaseDecision,
  type ReleaseTarget,
} from "@/components/orders/ReleaseMilestoneDialog";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonDetail } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { getOrder, listClaims, releaseMilestoneWithReceipt } from "@/lib/api/client";
import type { Claim, Order } from "@/lib/api/types";
import { artworkEvidence } from "@/lib/evidence";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";
import { activeHolds, payoutProgress, payoutSummary } from "@/lib/payouts";
import { describeQuantity } from "@/lib/quantity";

type Loaded = {
  order: Order;
  holds: Claim[];
};

/**
 * One supplier's payout on one order, for the person deciding it.
 *
 * The queue says which order is waiting; this screen says why, with the
 * Proof of Fulfilment large enough to actually check. Each share opens to its
 * evidence and its one blocker or its release button. The order's own
 * specification sits on the right so the proof can be read against what was
 * ordered — a photo of a printed run only means something next to the spec.
 */
export default function OpsPayoutReviewPage() {
  const { id: orderId } = useParams<{ id: string }>();

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [release, setRelease] = useState<ReleaseTarget | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [released, setReleased] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [order, claims] = await Promise.all([getOrder(orderId), listClaims()]);
        setData({ order, holds: activeHolds(order, claims) });
      } catch (err) {
        setData(null);
        setError(opsErrorMessage(err, "That payout could not be loaded."));
      } finally {
        setLoading(false);
      }
    }, [orderId]),
  );

  useLiveReload(["payouts", "orders", "claims"], load, { matchId: orderId });

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmRelease(decision: ReleaseDecision) {
    if (!release || !data) return;
    const { milestone } = release;
    setReleasing(milestone.code);
    setReleaseError(null);
    try {
      const result = await releaseMilestoneWithReceipt(
        data.order.id,
        milestone.code,
        decision,
      );
      setData({ order: result.order, holds: data.holds });
      setReleased(
        milestone.amountMinor !== undefined
          ? `${formatPhp(milestone.amountMinor)} released to the supplier.`
          : "Share released to the supplier.",
      );
      setRelease(null);
    } catch (err) {
      setReleaseError(opsErrorMessage(err, "Could not release that share. Try again."));
    } finally {
      setReleasing(null);
    }
  }

  if (loading && !data) return <SkeletonDetail label="Loading this payout…" />;
  if (error || !data) {
    return (
      <ErrorState
        body={error ?? "That payout could not be found."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const { order, holds } = data;
  const status = presentOrderState(order.state, order);
  const progress = payoutProgress(order);
  const artwork = artworkEvidence(order);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/ops/payouts"
            className="text-caption text-text-muted inline-flex items-center gap-1 hover:text-text-secondary"
          >
            <ChevronLeft size={14} strokeWidth={2} aria-hidden />
            Back to payouts
          </Link>
          <h1 className="text-h2 text-text-primary m-0 mt-1 truncate">
            {order.title || "Untitled order"}
          </h1>
          <p className="text-body text-text-secondary m-0 mt-1">
            {payoutSummary(order, holds)}
          </p>
        </div>
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      </div>

      {released ? (
        <p className="text-body text-success m-0" role="status">
          {released}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-3">
          {holds.length ? (
            <div className="rounded-card border border-error px-4 py-3" role="status">
              <p
                className="text-body text-text-primary m-0"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {holds.length === 1
                  ? "A claim is holding this payout"
                  : `${holds.length} claims are holding this payout`}
              </p>
              <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                {holds.map((claim) => (
                  <li key={claim.id} className="text-body text-text-secondary">
                    {claim.holdReason || claim.reason}
                  </li>
                ))}
              </ul>
              <p className="text-caption text-text-muted m-0 mt-2">
                Nothing releases until the hold is lifted on{" "}
                <Link href="/ops/claims" className="underline-offset-2 hover:underline">
                  Claims and holds
                </Link>
                .
              </p>
            </div>
          ) : null}

          <section className="gg-card p-3" aria-labelledby="payout-shares-heading">
            <h2 id="payout-shares-heading" className="text-h3 text-text-primary m-0 mb-1">
              Four shares of what the shop earns
            </h2>
            <p className="text-caption text-text-muted m-0 mb-3">
              Each one releases only against the picture behind it. Open a share to check
              the proof before you release it.
            </p>
            <PayoutMilestones
              order={order}
              holds={holds}
              releasing={releasing}
              emphasizeProof
              onRelease={(milestone) => {
                setReleaseError(null);
                setReleased(null);
                setRelease({ order, milestone });
              }}
            />
          </section>
        </div>

        <aside
          className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start"
          aria-label="Payout details"
        >
          <section className="gg-card p-3">
            <h2 className="text-overline text-text-muted m-0 mb-2">Shop earnings</h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 m-0">
              <dt className="text-caption text-text-muted">Earns</dt>
              <dd className="text-body text-text-primary m-0 tabular-nums">
                {progress.totalMinor !== null ? formatPhp(progress.totalMinor) : "—"}
              </dd>
              <dt className="text-caption text-text-muted">Released</dt>
              <dd className="text-body text-text-secondary m-0 tabular-nums">
                {progress.releasedMinor !== null
                  ? formatPhp(progress.releasedMinor)
                  : "—"}
              </dd>
              <dt className="text-caption text-text-muted">Still to go</dt>
              <dd className="text-body text-text-secondary m-0 tabular-nums">
                {progress.outstandingMinor !== null
                  ? formatPhp(progress.outstandingMinor)
                  : "—"}
              </dd>
            </dl>
            <p className="text-caption text-text-muted m-0 mt-2">
              {progress.releasedCount} of {progress.count} shares released. The commission
              and the delivery fee sit outside these.
            </p>
          </section>

          {/*
            The plate sits beside the shares because releasing one is scanning
            it: the person reads the share, scans the plate, sends, then clicks
            Release. Drawn here rather than only inside the dialog so it can be
            checked before any share is opened.
          */}
          <PayoutDestinationCard account={order.supplierPayoutAccount ?? null} />

          <section className="gg-card p-3">
            <h2 className="text-overline text-text-muted m-0 mb-2">This order</h2>
            <p
              className="text-body-lg text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {order.title || "Untitled order"}
            </p>
            <p className="text-body text-text-secondary m-0 mt-1">
              {describeQuantity(order.quantity, order.unit)}
            </p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 m-0 mt-2">
              {(
                [
                  ["Size", order.size],
                  ["Material", order.material],
                  ["Finish", order.finish],
                ] as const
              )
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-caption text-text-muted">{label}</dt>
                    <dd className="text-body text-text-secondary m-0">{value}</dd>
                  </div>
                ))}
            </dl>
            {order.readyBy ? (
              <p className="text-caption text-text-muted m-0 mt-2">
                Client was promised {formatDateTime(order.readyBy)}
              </p>
            ) : null}
            <Link
              href={`/ops/orders/${order.id}`}
              className="text-caption text-text-secondary mt-2 inline-block underline-offset-2 hover:underline"
            >
              Open the order workspace
            </Link>
          </section>

          {artwork.length ? (
            <section className="gg-card p-3">
              <h2 className="text-overline text-text-muted m-0 mb-2">Artwork</h2>
              <EvidenceStrip items={artwork} />
            </section>
          ) : null}
        </aside>
      </div>

      <ReleaseMilestoneDialog
        target={release}
        destination={order.supplierPayoutAccount ?? null}
        busy={releasing !== null}
        error={releaseError}
        onCancel={() => {
          setRelease(null);
          setReleaseError(null);
        }}
        onConfirm={(decision) => void confirmRelease(decision)}
      />
    </div>
  );
}
