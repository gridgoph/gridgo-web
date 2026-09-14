"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  buildPayoutRows,
  formatMoneyOrUnavailable,
} from "@/app/supplier/_lib/payouts";
import { MilestoneList } from "@/components/orders/MilestoneList";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError, listIssues, listJobs } from "@/lib/api/client";
import type { Issue, Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime, formatPhp } from "@/lib/format";

type LoadState = {
  jobs: Order[];
  issues: Issue[];
};

export default function SupplierPayoutsPage() {
  const [data, setData] = useState<LoadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuesNote, setIssuesNote] = useState<string | null>(null);

  const load = useSerializedLoad(useCallback(async () => {
    setLoading(true);
    setError(null);
    setIssuesNote(null);
    try {
      const jobs = await listJobs();
      let issues: Issue[] = [];
      try {
        issues = await listIssues();
      } catch (err) {
        // Claims are Operations-only; issues can fail on their own.
        if (err instanceof ApiError) {
          setIssuesNote(
            "The reason behind a hold could not be loaded. Each job still shows whether it is held.",
          );
        }
      }
      setData({ jobs, issues });
    } catch (err) {
      setData(null);
      if (err instanceof ApiError) {
        setError(
          err.status === 403
            ? "Payout history is only available to supplier accounts."
            : "Could not load payouts. Retry when the API responds.",
        );
      } else {
        setError(
          "Network error loading payouts. Confirm the demo API is running, then retry.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []));

  useLiveReload(["payouts", "jobs"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => (data ? buildPayoutRows(data.jobs, data.issues) : []),
    [data],
  );

  const pending = loading && !data;

  if (!pending && (error || !data)) {
    return (
      <ErrorState
        body={error ?? "Could not load payouts."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const heldCount = rows.filter((r) => r.order.payoutHold).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-prose">
          <p className="text-body text-text-secondary m-0">
            You are paid in four parts of your own price: half when printing is
            under way, 15% on packaging and quality check, a quarter on
            delivery, and the last 10% once the client&rsquo;s issue window
            closes. Each part needs a Proof of Fulfilment before Operations can
            release it.
          </p>
          {pending ? null : (
            <p className="text-caption text-text-muted m-0 mt-1">
              {rows.length} job{rows.length === 1 ? "" : "s"}
              {heldCount > 0 ? ` · ${heldCount} on hold` : ""}
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </div>

      {issuesNote ? (
        <p className="text-caption text-text-secondary m-0" role="status">
          {issuesNote}
        </p>
      ) : null}

      {pending ? (
        <SkeletonCards count={3} lines={2} label="Loading payouts" />
      ) : !rows.length ? (
        <EmptyState
          title="No payouts yet"
          body="Once a job you have accepted reaches production, its four milestones appear here as you earn them."
          action={
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href="/supplier/jobs" />}
            >
              Open job inbox
            </Button>
          }
        />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {rows.map((row) => (
            <li key={row.order.id} className="gg-card flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="text-body text-text-primary m-0"
                    style={{ fontFamily: "var(--font-medium)" }}
                  >
                    {row.order.title}
                  </p>
                  <p className="text-caption text-text-muted m-0 mt-0.5">
                    Order {row.order.id}
                  </p>
                  <p className="text-caption text-text-muted m-0 mt-0.5">
                    Updated {formatDateTime(row.order.updatedAt)}
                  </p>
                </div>
                <StatusChip
                  tone={row.settlement.tone}
                  label={row.settlement.label}
                  icon={row.settlement.icon}
                />
              </div>

              <p className="text-body text-text-secondary m-0">
                {row.settlement.detail}
              </p>

              <dl className="m-0 grid grid-cols-1 gap-3 border-t border-outline-subtle pt-3 sm:grid-cols-3">
                <Figure
                  label="You earn on this job"
                  value={formatMoneyOrUnavailable(row.earnsMinor, formatPhp)}
                />
                <Figure
                  label="Released to you"
                  value={formatMoneyOrUnavailable(row.releasedMinor, formatPhp)}
                />
                <Figure
                  label="Still to come"
                  value={formatMoneyOrUnavailable(
                    row.outstandingMinor,
                    formatPhp,
                  )}
                />
              </dl>

              {row.holdReason ? (
                <p className="text-body text-warning m-0">
                  On hold: {row.holdReason}
                </p>
              ) : null}

              <MilestoneList order={row.order} />

              <div className="border-t border-outline-subtle pt-3">
                <Button
                  variant="secondary"
                  nativeButton={false}
                  render={<Link href={`/supplier/jobs/${row.order.id}`} />}
                >
                  Open job
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-muted m-0">{label}</dt>
      <dd
        className="text-h3 text-text-primary m-0 mt-0.5 tabular-nums"
        style={{ fontFamily: "var(--font-bold)" }}
      >
        {value}
      </dd>
    </div>
  );
}
