"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  buildPayoutRows,
  formatMoneyOrUnavailable,
  type PayoutRow,
} from "@/app/supplier/_lib/payouts";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError, listIssues, listJobs } from "@/lib/api/client";
import type { Issue, Order } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";

type LoadState = {
  jobs: Order[];
  issues: Issue[];
};

export default function SupplierPayoutsPage() {
  const [data, setData] = useState<LoadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuesNote, setIssuesNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIssuesNote(null);
    try {
      const jobs = await listJobs();
      let issues: Issue[] = [];
      try {
        issues = await listIssues();
      } catch (err) {
        // Claims list is ops-only; issues may still fail for some roles.
        if (err instanceof ApiError) {
          setIssuesNote(
            "Hold detail from issues could not be loaded. Settlement still uses each job’s hold flag from the order.",
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
            : `Could not load payouts (${err.code}).`,
        );
      } else {
        setError(
          "Network error loading payouts. Confirm the demo API is running, then retry.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => (data ? buildPayoutRows(data.jobs, data.issues) : []),
    [data],
  );

  const columns = useMemo<DataTableColumn<PayoutRow>[]>(
    () => [
      {
        id: "job",
        header: "Job",
        primary: true,
        sortValue: (r) => r.order.title,
        filterValue: (r) =>
          `${r.order.title} ${r.order.id} ${r.settlement.label}`,
        cell: (r) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {r.order.title}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {presentOrderState(r.order.state).label}
            </p>
          </div>
        ),
      },
      {
        id: "gross",
        header: "Gross",
        sortValue: (r) => r.grossMinor,
        cell: (r) => (
          <span className="text-body text-text-primary whitespace-nowrap">
            {formatPhp(r.grossMinor)}
          </span>
        ),
      },
      {
        id: "commission",
        header: "GRIDGO commission",
        cell: () => (
          <span className="text-body text-text-muted">Unavailable</span>
        ),
      },
      {
        id: "net",
        header: "Net",
        cell: (r) => (
          <span className="text-body text-text-muted">
            {formatMoneyOrUnavailable(r.netMinor, formatPhp)}
          </span>
        ),
      },
      {
        id: "settlement",
        header: "Settlement",
        sortValue: (r) => r.settlement.label,
        filterValue: (r) => r.settlement.label,
        cell: (r) => (
          <div>
            <StatusChip
              tone={r.settlement.tone}
              label={r.settlement.label}
              icon={r.settlement.icon}
            />
            {r.holdReason ? (
              <p className="text-caption text-text-secondary m-0 mt-1 max-w-xs">
                Hold reason: {r.holdReason}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "updated",
        header: "Updated",
        sortValue: (r) => r.order.updatedAt,
        cell: (r) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(r.order.updatedAt)}
          </span>
        ),
      },
    ],
    [],
  );

  if (loading && !data) {
    return <LoadingBlock label="Loading protected payment history…" />;
  }
  if (error || !data) {
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-prose">
          <p className="text-body text-text-secondary m-0">
            Protected payment status for completed and settling jobs. Gross is
            the product total from the order. The demo ledger does not return
            GRIDGO commission or net — those columns stay unavailable rather
            than guessed.
          </p>
          <p className="text-caption text-text-muted m-0 mt-1">
            {rows.length} job{rows.length === 1 ? "" : "s"}
            {heldCount > 0
              ? ` · ${heldCount} on hold`
              : ""}
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {issuesNote ? (
        <p className="text-caption text-text-secondary m-0" role="status">
          {issuesNote}
        </p>
      ) : null}

      {!rows.length ? (
        <EmptyState
          title="No protected payments yet"
          body="When jobs reach delivery and completion, their protected payment status appears here with gross totals and any holds."
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
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(r) => r.order.id}
          caption="Protected payment history"
          filterPlaceholder="Filter payouts…"
          defaultSortId="updated"
          defaultSortDirection="desc"
          rowActions={(r) => (
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href={`/supplier/jobs/${r.order.id}`} />}
            >
              Open job
            </Button>
          )}
        />
      )}
    </div>
  );
}
