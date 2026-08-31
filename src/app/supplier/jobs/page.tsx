"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError, listJobs } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";
import { needsSupplierAction, primaryAction } from "@/lib/supplier-actions";

function sortJobs(jobs: Order[]): Order[] {
  return [...jobs].sort((a, b) => {
    const aNeed = needsSupplierAction(a.state) ? 0 : 1;
    const bNeed = needsSupplierAction(b.state) ? 0 : 1;
    if (aNeed !== bNeed) return aNeed - bNeed;
    const da = a.deadline || a.promisedDate || "9999";
    const db = b.deadline || b.promisedDate || "9999";
    return da.localeCompare(db);
  });
}

export default function SupplierJobsPage() {
  const [jobs, setJobs] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listJobs();
      setJobs(sortJobs(data));
    } catch (err) {
      setJobs(null);
      if (err instanceof ApiError) {
        setError(
          err.status === 403
            ? "This inbox is only available to supplier accounts."
            : `Could not load jobs (${err.code}). Check the API and try again.`,
        );
      } else {
        setError(
          "Network error loading jobs. Confirm the demo API is running, then retry.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo<DataTableColumn<Order>[]>(
    () => [
      {
        id: "job",
        header: "Job",
        primary: true,
        sortValue: (job) => job.title,
        filterValue: (job) =>
          `${job.title} ${job.size} ${job.material} ${job.id}`,
        cell: (job) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {job.title}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {job.size || "—"} · {job.material || "—"}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (job) => presentOrderState(job.state).label,
        filterValue: (job) => presentOrderState(job.state).label,
        cell: (job) => {
          const status = presentOrderState(job.state);
          return (
            <StatusChip
              tone={status.tone}
              label={status.label}
              icon={status.icon}
            />
          );
        },
      },
      {
        id: "deadline",
        header: "Deadline",
        sortValue: (job) => job.deadline || job.promisedDate || "",
        cell: (job) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(job.deadline)}
          </span>
        ),
      },
      {
        id: "earnings",
        header: "You earn",
        sortValue: (job) => job.supplierPriceMinor ?? -1,
        cell: (job) => (
          <span className="text-body text-text-primary tabular-nums whitespace-nowrap">
            {job.supplierPriceMinor !== undefined
              ? formatPhp(job.supplierPriceMinor)
              : "Set on accept"}
          </span>
        ),
      },
      {
        id: "next",
        header: "Next step",
        sortValue: (job) => primaryAction(job.state)?.label ?? "",
        filterValue: (job) => primaryAction(job.state)?.label ?? "",
        cell: (job) => {
          const next = primaryAction(job.state);
          return (
            <span className="text-body text-text-secondary">
              {next ? next.label : "No action needed"}
            </span>
          );
        },
      },
    ],
    [],
  );

  const pending = loading && !jobs;

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
  if (!pending && !jobs?.length) {
    return (
      <EmptyState
        title="No assigned jobs"
        body="When Operations matches work to your shop, new jobs appear here for accept or decline."
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Refresh inbox
          </Button>
        }
      />
    );
  }

  const actionRequired =
    jobs?.filter((j) => needsSupplierAction(j.state)).length ?? 0;
  const dueSoon = (jobs ?? []).filter((j) => isDueWithin(j.readyBy ?? j.deadline, 24)).length;
  const onTheBoard = (jobs ?? []).reduce((total, j) => total + (j.supplierSubtotalMinor ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      {/*
        Three figures across the top instead of one sentence above a short
        table. A shop opening this wants to know what needs its attention, what
        runs out of time today, and what the board is worth -- and on a quiet
        day this page was a line of text with a screen of nothing under it.
      */}
      <div className="flex flex-wrap items-stretch gap-2">
        <SummaryFigure label="Need your action" value={String(actionRequired)} emphasis={actionRequired > 0} />
        <SummaryFigure label="Due within a day" value={String(dueSoon)} emphasis={dueSoon > 0} />
        <SummaryFigure label="On the board" value={formatPhp(onTheBoard)} />
        <div className="ml-auto flex items-end">
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={jobs ?? []}
        loading={pending}
        getRowId={(job) => job.id}
        caption="Assigned jobs"
        filterPlaceholder="Filter jobs…"
        rowActions={(job) => (
          <DataTableRowAction
            label="Open"
            icon={Eye}
            href={`/supplier/jobs/${job.id}`}
          />
        )}
      />
    </div>
  );
}

/** Whether a due date falls inside the next `hours`. */
function isDueWithin(when: string | null | undefined, hours: number): boolean {
  if (!when) return false;
  const at = Date.parse(when);
  if (Number.isNaN(at)) return false;
  return at - Date.now() <= hours * 3_600_000;
}

function SummaryFigure({
  label, value, emphasis = false,
}: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div
      className="gg-card px-3 py-2 min-w-36"
      style={emphasis ? { borderColor: "var(--color-accent)" } : undefined}
    >
      <p className="text-overline text-text-muted m-0">{label}</p>
      <p className="text-h3 text-text-primary m-0 mt-0.5 tabular-nums" style={{ fontFamily: "var(--font-bold)" }}>
        {value}
      </p>
    </div>
  );
}
