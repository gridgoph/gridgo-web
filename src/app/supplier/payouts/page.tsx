"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  addShopEarnings,
  buildPayoutRows,
  formatMoneyOrUnavailable,
  matchesLedgerFilter,
  releaseLines,
  releaseMonths,
  settlementContrast,
  shopEarnings,
  unreleasedMinor,
  type LedgerFilter,
} from "@/app/supplier/_lib/payouts";
import { EvidenceStrip } from "@/components/orders/EvidencePreview";
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
  const [filter, setFilter] = useState<LedgerFilter>("unsettled");

  const load = useSerializedLoad(
    useCallback(async () => {
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
    }, []),
  );

  useLiveReload(["payouts", "jobs"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => (data ? buildPayoutRows(data.jobs, data.issues) : []),
    [data],
  );
  const earnings = useMemo(() => rows.map((row) => shopEarnings(row.order)), [rows]);
  const total = useMemo(() => addShopEarnings(earnings), [earnings]);
  const visible = rows.filter((row, index) => matchesLedgerFilter(earnings[index]!, filter));
  const lines = useMemo(() => (data ? releaseLines(data.jobs) : []), [data]);
  const months = useMemo(() => releaseMonths(lines).slice(0, 6), [lines]);
  const recent = lines.slice(0, 20);
  const outstanding = unreleasedMinor(total);

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
            You are paid in parts of your own price, and Operations releases each one: the
            first once you file a photo showing production has started, the next on the
            rider&rsquo;s delivery photo, and the last once the client&rsquo;s complaint
            window closes with nothing raised. Jobs accepted before 25 September 2026 keep
            the four parts they were accepted under. Each job below lists its own.
          </p>
          {pending ? null : (
            <p className="text-caption text-text-muted m-0 mt-1">
              {rows.length} job{rows.length === 1 ? "" : "s"}
              {heldCount > 0 ? ` · ${heldCount} on hold` : ""}
            </p>
          )}
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {issuesNote ? (
        <p className="text-caption text-text-secondary m-0" role="status">
          {issuesNote}
        </p>
      ) : null}

      {pending ? null : (
        <div className="flex flex-col gap-3">
          <p className="text-overline text-text-muted m-0">Still to reach you</p>
          <p className="text-h2 text-text-primary m-0 tabular-nums" style={{ fontFamily: "var(--font-bold)" }}>
            {formatPhp(outstanding)}
          </p>
          {outstanding > 0 ? (
            <dl className="gg-card m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Bucket
                label="Waiting on your evidence"
                amount={total.needsProofMinor}
                hint="Photograph the work and file it against the part it pays for."
              />
              <Bucket
                label="With GRIDGO"
                amount={total.awaitingReleaseMinor}
                hint="Filed and under review. Operations releases these."
              />
              {total.heldMinor > 0 ? (
                <Bucket
                  label="Held by a client report"
                  amount={total.heldMinor}
                  hint="Operations settles the report before this moves."
                />
              ) : null}
              {total.pausedMinor > 0 ? (
                <Bucket
                  label="Paused for a refund review"
                  amount={total.pausedMinor}
                  hint="Operations agrees with you what you keep. Money already released stays yours."
                />
              ) : null}
              {total.laterMinor > 0 ? (
                <Bucket
                  label="Later in the job"
                  amount={total.laterMinor}
                  hint="Not reached yet, or waiting on the rider. Nothing for you to file."
                />
              ) : null}
            </dl>
          ) : null}
          {total.lateDeductionMinor > 0 ? (
            <p className="text-caption text-text-secondary m-0">
              Taken off for late production: −{formatPhp(total.lateDeductionMinor)}. Already out of the figures here.
            </p>
          ) : null}
          <div role="group" aria-label="Unsettled or all" className="flex flex-wrap gap-2">
            {(
              [
                ["unsettled", "Unsettled"],
                ["released", "Released"],
                ["all", "All"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={filter === value ? "primary" : "outline"}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {pending ? (
        <SkeletonCards count={3} lines={2} label="Loading payouts" />
      ) : !rows.length ? (
        <EmptyState
          title="No payouts yet"
          body="Once a job you have accepted reaches production, its milestones appear here as you earn them."
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
          {visible.map((row) => {
            const split = shopEarnings(row.order);
            const contrast = settlementContrast(row.order, split);
            return (
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

              <p className="text-body text-text-secondary m-0">{row.settlement.detail}</p>

              <dl className="m-0 grid grid-cols-1 gap-3 border-t border-outline-subtle pt-3 sm:grid-cols-3">
                {contrast.replaced ? (
                  <>
                    <Figure label="Agreed settlement" value={formatPhp(contrast.agreedMinor)} />
                    {contrast.originalMinor != null ? (
                      <Figure
                        label="Original price"
                        value={formatPhp(contrast.originalMinor)}
                        note="Not paid. The settlement replaced it."
                      />
                    ) : null}
                  </>
                ) : (
                  <Figure
                    label="You earn on this job"
                    value={formatMoneyOrUnavailable(row.earnsMinor, formatPhp)}
                  />
                )}
                <Figure
                  label="Released to you"
                  value={formatMoneyOrUnavailable(split.releasedMinor, formatPhp)}
                />
                <Figure label="Still to come" value={formatPhp(unreleasedMinor(split))} />
              </dl>

              {row.holdReason ? (
                <p className="text-body text-warning m-0">On hold: {row.holdReason}</p>
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
          );
          })}
        </ul>
      )}

      {!pending && rows.length > 0 && visible.length === 0 ? (
        <EmptyState
          title="Nothing in this view"
          body="Switch to All to see every job you have been paid for."
          action={
            <Button variant="secondary" type="button" onClick={() => setFilter("all")}>
              Show all
            </Button>
          }
        />
      ) : null}

      {!pending && months.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Released by month">
          <h2 className="text-overline text-text-muted m-0">What GRIDGO sent you</h2>
          <ul className="gg-card m-0 flex list-none flex-col gap-3 p-4">
            {months.map((month) => (
              <li key={month.key} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <span className="text-body text-text-primary">{month.label}</span>
                  <span className="text-caption text-text-muted block">
                    {month.releaseCount === 1 ? "1 release" : `${month.releaseCount} releases`}
                  </span>
                </span>
                <span className="text-body text-text-primary tabular-nums">{formatPhp(month.totalMinor)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!pending && recent.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Recent transfers">
          <h2 className="text-overline text-text-muted m-0">Recent transfers</h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {recent.map((line) => (
              <li key={line.key} className="gg-card flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-body text-text-primary m-0">{line.title}</p>
                    <p className="text-caption text-text-muted m-0">
                      {line.label} · {formatDateTime(line.releasedAt)}
                      {line.reference ? ` · ref ${line.reference}` : ""}
                    </p>
                  </div>
                  <p className="text-body text-text-primary m-0 tabular-nums">{formatPhp(line.amountMinor)}</p>
                </div>
                {line.receiptFileId ? (
                  <EvidenceStrip
                    items={[
                      {
                        fileId: line.receiptFileId,
                        kind: "payout_receipt",
                        label: "Wallet receipt",
                        caption: line.reference,
                      },
                    ]}
                  />
                ) : null}
                <Link className="text-caption text-text-primary underline" href={`/supplier/jobs/${line.orderId}`}>
                  Open job
                </Link>
              </li>
            ))}
          </ul>
          {lines.length > recent.length ? (
            <p className="text-caption text-text-muted m-0">
              The {recent.length} most recent. Older releases stay on their own job.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-muted m-0">{label}</dt>
      <dd
        className="text-h3 text-text-primary m-0 mt-0.5 tabular-nums"
        style={{ fontFamily: "var(--font-bold)" }}
      >
        {value}
      </dd>
      {note ? <p className="text-caption text-text-muted m-0 mt-0.5">{note}</p> : null}
    </div>
  );
}

function Bucket({ label, amount, hint }: { label: string; amount: number; hint: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-muted m-0">{label}</dt>
      <dd className="text-body text-text-primary m-0 mt-0.5 tabular-nums" style={{ fontFamily: "var(--font-medium)" }}>
        {formatPhp(amount)}
      </dd>
      <p className="text-caption text-text-muted m-0 mt-0.5">{hint}</p>
    </div>
  );
}
