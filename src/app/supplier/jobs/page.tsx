"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CircleAlert, Clock3, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
  type DataTableFacet,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatCard } from "@/components/ui/StatCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError, listJobs } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";
import { needsSupplierAction, primaryAction } from "@/lib/supplier-actions";
import { activitySortValue, jobActivity, relativeTime } from "../_lib/job-activity";

/** The label the queue shows — and therefore facets on — for a job with nothing owed. */
const NO_ACTION = "No action needed";

function nextStepLabel(job: Order): string {
  return primaryAction(job.state)?.label ?? NO_ACTION;
}

/** Whether a due date falls inside the next `hours`. */
function isDueWithin(when: string | null | undefined, hours: number): boolean {
  if (!when) return false;
  const at = Date.parse(when);
  if (Number.isNaN(at)) return false;
  return at - Date.now() <= hours * 3_600_000;
}

/**
 * Facet options built from the rows actually on the board.
 *
 * A fixed list would offer states this shop has never held and read as a broken
 * filter; the toolbar already shows a live count beside each value, and an
 * option that can only ever return zero is noise.
 */
function facetOptions(jobs: Order[], value: (job: Order) => string) {
  const seen = new Map<string, number>();
  for (const job of jobs) {
    const label = value(job);
    if (!label) continue;
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }
  return [...seen.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((label) => ({ value: label, label }));
}

export default function SupplierJobsPage() {
  const [jobs, setJobs] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Order is the table's own concern now: it opens on last movement,
      // descending, and every other order is one click on a header away.
      setJobs(await listJobs());
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

  useLiveReload("jobs", load);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo<DataTableColumn<Order>[]>(
    () => [
      {
        id: "job",
        header: "Job",
        primary: true,
        alwaysVisible: true,
        sortValue: (job) => job.title,
        filterValue: (job) =>
          `${job.title} ${job.size} ${job.material} ${job.id}`,
        cell: (job) => (
          <div className="min-w-0">
            <p
              className="text-body text-text-primary m-0 truncate"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {job.title}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5 truncate">
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
        /*
          The column this queue opens on.

          Sorting ran on "needs action, then deadline" before, which is a rule
          about importance, not recency — a job that moved an hour ago sat below
          quiet jobs with nearer deadlines, and nothing on screen said why the
          rows were in that order. Last movement is both the shop's real
          question and the column the orders table is indexed on.
        */
        id: "updated",
        header: "Last update",
        sortValue: activitySortValue,
        filterValue: (job) => jobActivity(job).what,
        cell: (job) => {
          const activity = jobActivity(job);
          return (
            <div
              className="min-w-0"
              title={activity.iso ? formatDateTime(activity.iso) : undefined}
            >
              <p
                className="text-body text-text-primary m-0 whitespace-nowrap"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {relativeTime(activity.at)}
              </p>
              <p className="text-caption text-text-muted m-0 mt-0.5 truncate">
                {activity.who ? `${activity.what} · ${activity.who}` : activity.what}
              </p>
            </div>
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
        // Matches the rendered text so the facet's values are the words on screen.
        sortValue: nextStepLabel,
        filterValue: nextStepLabel,
        cell: (job) => (
          <span className="text-body text-text-secondary">
            {nextStepLabel(job)}
          </span>
        ),
      },
    ],
    [],
  );

  const rows = useMemo(() => jobs ?? [], [jobs]);

  const facets = useMemo<DataTableFacet[]>(
    () => [
      {
        columnId: "status",
        title: "Status",
        options: facetOptions(rows, (job) => presentOrderState(job.state).label),
      },
      {
        columnId: "next",
        title: "Next step",
        options: facetOptions(rows, nextStepLabel),
      },
    ],
    [rows],
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

  const actionRequired = rows.filter((j) => needsSupplierAction(j.state)).length;
  const dueSoon = rows.filter((j) => isDueWithin(j.readyBy ?? j.deadline, 24)).length;
  const onTheBoard = rows.reduce(
    (total, j) => total + (j.supplierSubtotalMinor ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      {/*
        Three figures across the top instead of one sentence above a short
        table. A shop opening this wants to know what needs its attention, what
        runs out of time today, and what the board is worth -- and on a quiet
        day this page was a line of text with a screen of nothing under it.

        They use the portal's own StatCard now rather than a local box, so the
        hint line under each number says where it came from and the loading
        state holds its own layout.
      */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Need your action"
          value={String(actionRequired)}
          hint={
            actionRequired > 0
              ? "Filter the board by Next step to see them"
              : "Nothing is waiting on you"
          }
          icon={CircleAlert}
          loading={pending}
        />
        <StatCard
          label="Due within a day"
          value={String(dueSoon)}
          hint="Counted from your own ready-by date"
          icon={Clock3}
          loading={pending}
        />
        <StatCard
          label="On the board"
          value={formatPhp(onTheBoard)}
          hint="What every assigned job pays your shop"
          icon={Banknote}
          loading={pending}
        />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={pending}
        getRowId={(job) => job.id}
        caption="Assigned jobs"
        filterPlaceholder="Search jobs, sizes, materials…"
        facets={facets}
        defaultSortId="updated"
        defaultSortDirection="desc"
        itemLabel="jobs"
        pageSize={15}
        toolbar={
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>
            Refresh
          </Button>
        }
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
