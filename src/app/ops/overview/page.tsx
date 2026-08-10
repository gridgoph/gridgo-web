"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import {
  buildOverviewBuckets,
  pickOverviewNextAction,
  type OverviewBucket,
} from "@/app/ops/_lib/overview";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
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

  useEffect(() => {
    void load();
  }, [load]);

  const buckets = useMemo(
    () =>
      data
        ? buildOverviewBuckets(
            data.orders,
            data.claims,
            data.issues,
            Date.now(),
            {
              pendingSignups: data.pendingSignups,
              openEscalations: data.openEscalations,
            },
          )
        : [],
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

  if (loading && !data) {
    return <LoadingBlock label="Loading operations overview…" />;
  }

  if (error || !data) {
    return (
      <ErrorState
        body={error ?? "No data."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const activeCount = data.orders.filter((o) => o.state !== "draft").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          {activeCount
            ? `${activeCount} active order${activeCount === 1 ? "" : "s"} across queues. Focus the next action first — not every counter at once.`
            : "No active orders yet. Queues fill as clients submit work."}
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {next ? (
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
              render={<Link href="/ops/qa" />}
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
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {buckets.map((bucket) => (
            <BucketCard key={bucket.id} bucket={bucket} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function BucketCard({ bucket }: { bucket: OverviewBucket }) {
  return (
    <li className="gg-card flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {bucket.label}
          </p>
          <p className="text-caption text-text-muted m-0 mt-1">
            {bucket.description}
          </p>
        </div>
        <p
          className="text-h2 text-text-primary m-0 tabular-nums"
          aria-label={`${bucket.count} in ${bucket.label}`}
        >
          {bucket.count}
        </p>
      </div>
      <div className="mt-auto pt-1">
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href={bucket.href} />}
        >
          Open
          <ChevronRight data-icon="inline-end" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
