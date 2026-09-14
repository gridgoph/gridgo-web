"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  Factory,
  QrCode,
  Search,
  Siren,
  Timer,
  Truck,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";

import {
  buildOverviewBuckets,
  pickOverviewNextAction,
  type OverviewBucket,
  type OverviewBucketId,
} from "@/app/ops/_lib/overview";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonLines } from "@/components/ui/loading";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  ApiError,
  listClaims,
  listEscalations,
  listIssues,
  listOrders,
  listUsers,
} from "@/lib/api/client";
import type { Claim, Issue, Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";

type LoadState = {
  orders: Order[];
  claims: Claim[];
  issues: Issue[];
  /** Suppliers and riders who cannot be given work until someone decides. */
  pendingSignups: number;
  openEscalations: number;
};

export default function OpsOverviewPage() {
  const [data, setData] = useState<LoadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orders, claims, issues, escalations, suppliers, riders] =
        await Promise.all([
          listOrders(),
          listClaims(),
          listIssues(),
          listEscalations({ status: "open" }),
          listUsers("supplier"),
          listUsers("rider"),
        ]);
      setData({
        orders,
        claims,
        issues,
        pendingSignups: [...suppliers, ...riders].filter(
          (u) => u.verificationStatus === "pending",
        ).length,
        openEscalations: escalations.length,
      });
    } catch (err) {
      setData(null);
      if (err instanceof ApiError) {
        setError(
          `Could not load the operations picture (${err.code}). Retry when the API responds.`,
        );
      } else {
        setError(
          "Network error loading overview. Confirm the demo API is running.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveReload(["orders", "claims", "escalations", "approvals"], load);

  useEffect(() => {
    void load();
  }, [load]);

  // Every bucket's label, description and destination is static copy — only
  // the count comes from the API. Building the buckets from empty arrays gives
  // the real grid with zeroed counts, so the queue names are on screen before
  // the numbers arrive.
  const buckets = useMemo(
    () =>
      buildOverviewBuckets(
        data?.orders ?? [],
        data?.claims ?? [],
        data?.issues ?? [],
        Date.now(),
        {
          pendingSignups: data?.pendingSignups ?? 0,
          openEscalations: data?.openEscalations ?? 0,
        },
      ),
    [data],
  );

  const next = useMemo(
    () =>
      data
        ? pickOverviewNextAction(
            data.orders,
            data.claims,
            data.issues,
            Date.now(),
            { openEscalations: data.openEscalations },
          )
        : null,
    [data],
  );

  if (error) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const pending = loading && !data;
  const activeCount = data
    ? data.orders.filter((o) => o.state !== "draft").length
    : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          {pending
            ? "Focus the next action first — not every counter at once."
            : activeCount
              ? `${activeCount} active order${activeCount === 1 ? "" : "s"} across queues. Focus the next action first — not every counter at once.`
              : "No active orders yet. Queues fill as clients submit work."}
        </p>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </div>

      {pending ? (
        // "Next action" is the page's own promise, so the heading is real and
        // only the recommendation itself is reserved.
        <section className="gg-card flex flex-col gap-3" aria-busy>
          <span className="sr-only">Working out the next action</span>
          <p className="text-overline text-text-muted m-0 uppercase">
            Next action
          </p>
          <Skeleton className="h-7 w-1/2" aria-hidden />
          <SkeletonLines lines={2} />
          <Skeleton className="h-11 w-40 rounded-field" aria-hidden />
        </section>
      ) : next ? (
        <section
          className="gg-card flex flex-col gap-3"
          aria-labelledby="next-action-heading"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-overline text-text-muted m-0 uppercase">
                Next action
              </p>
              <h2
                id="next-action-heading"
                className="text-h3 text-text-primary m-0 mt-1"
              >
                {next.title}
              </h2>
              {next.orderId ? (
                <p className="text-caption text-text-muted m-0 mt-1">
                  Order {next.orderId}
                </p>
              ) : null}
              <p className="text-body text-text-secondary m-0 mt-1">
                {next.body}
              </p>
            </div>
            <StatusChip
              tone="warning"
              label="Action required"
              icon="triangle-alert"
            />
          </div>
          <div>
            <Button
              variant="primary"
              nativeButton={false}
              render={<Link href={next.href} />}
            >
              {next.cta}
              <ChevronRight data-icon="inline-end" aria-hidden />
            </Button>
          </div>
        </section>
      ) : (
        <EmptyState
          title="Nothing needs Operations right now"
          body="Queues are clear. Refresh after new submissions, or open the QA queue to browse the full book."
          action={
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href="/ops/orders" />}
            >
              Open QA queue
            </Button>
          }
        />
      )}

      <section aria-labelledby="queues-heading">
        <h2 id="queues-heading" className="text-h3 text-text-primary m-0 mb-3">
          Queues
        </h2>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {buckets.map((bucket) => (
            <BucketCard key={bucket.id} bucket={bucket} pending={pending} />
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Each queue borrows the icon its screen already carries on the rail, so the
 * card and the destination read as the same place.
 */
const BUCKET_ICONS: Record<OverviewBucketId, LucideIcon> = {
  needs_qa: ClipboardList,
  payment_confirmation: QrCode,
  awaiting_matching: Search,
  signup_approvals: UserRoundCheck,
  in_production: Factory,
  out_for_delivery: Truck,
  escalated: Siren,
  blocked: AlertTriangle,
  sla_risk: Timer,
};

function BucketCard({
  bucket,
  pending,
}: {
  bucket: OverviewBucket;
  /** Counts are still in flight; the queue's own copy is not. */
  pending: boolean;
}) {
  const Icon = BUCKET_ICONS[bucket.id];
  return (
    <li>
      {/* The whole card is the control. Eight identical "Open" buttons taught
          nothing that the card title did not already say. */}
      <Link
        href={bucket.href}
        aria-label={pending ? bucket.label : `${bucket.label}: ${bucket.count}`}
        className="gg-card group flex h-full min-h-11 flex-col gap-2 no-underline hover:bg-overlay-hover"
      >
        <div className="flex items-start justify-between gap-3">
          <span
            className="bg-surface-variant text-text-muted flex size-9 shrink-0 items-center justify-center rounded-field"
            aria-hidden
          >
            <Icon size={18} strokeWidth={1.75} />
          </span>
          {pending ? (
            // 30px is the `text-h2` line box the count will occupy.
            <div className="flex h-[30px] items-center" aria-hidden>
              <Skeleton className="h-6 w-8" />
            </div>
          ) : (
            <p
              className="text-h2 text-text-primary m-0 tabular-nums"
              aria-hidden
            >
              {bucket.count}
            </p>
          )}
        </div>
        <p
          className="text-body text-text-primary m-0 mt-1"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {bucket.label}
        </p>
        <p className="text-caption text-text-muted m-0">{bucket.description}</p>
        <span className="text-caption text-text-secondary mt-auto inline-flex items-center gap-1 pt-2">
          Open
          <ChevronRight size={14} aria-hidden />
        </span>
      </Link>
    </li>
  );
}
