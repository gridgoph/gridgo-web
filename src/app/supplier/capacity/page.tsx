"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";

import {
  buildCapacitySnapshot,
  formatCapacityFigure,
} from "@/app/supplier/_lib/capacity";
import { presentServiceState } from "@/app/supplier/_lib/service-state";
import { categoryName } from "@/app/supplier/_lib/taxonomy-labels";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonValue } from "@/components/ui/loading";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError, getTaxonomy, listJobs, listSupplierServices } from "@/lib/api/client";
import type { Order, SupplierService, Taxonomy } from "@/lib/api/types";
import { describeQuantity } from "@/lib/quantity";
import { presentOrderState } from "@/lib/order-state";
import { formatDateTime } from "@/lib/format";

type LoadState = {
  services: SupplierService[];
  jobs: Order[];
  taxonomy: Taxonomy;
};

export default function SupplierCapacityPage() {
  const [data, setData] = useState<LoadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [services, jobs, taxonomy] = await Promise.all([
        listSupplierServices(),
        listJobs(),
        getTaxonomy(),
      ]);
      setData({ services, jobs, taxonomy });
    } catch (err) {
      setData(null);
      if (err instanceof ApiError) {
        setError(
          err.status === 403
            ? "Capacity is only available to supplier accounts."
            : `Could not load capacity (${err.code}).`,
        );
      } else {
        setError(
          "Network error loading capacity. Confirm the demo API is running, then retry.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const snapshot = useMemo(
    () => (data ? buildCapacitySnapshot(data.services, data.jobs) : null),
    [data],
  );

  const liveLines = useMemo(
    () => (data ? data.services.filter((s) => s.state === "live") : []),
    [data],
  );

  const lineColumns = useMemo<DataTableColumn<SupplierService>[]>(() => {
    if (!data) return [];
    return [
      {
        id: "line",
        header: "Live line",
        primary: true,
        sortValue: (s) => categoryName(s.categoryCode, data.taxonomy),
        cell: (s) => (
          <span
            className="text-body text-text-primary"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {categoryName(s.categoryCode, data.taxonomy)}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (s) => {
          const st = presentServiceState(s.state, s);
          return <StatusChip tone={st.tone} label={st.label} icon={st.icon} />;
        },
      },
      {
        id: "daily",
        header: "Daily",
        sortValue: (s) => s.capacityDaily ?? -1,
        cell: (s) => (
          <span className="text-body text-text-secondary">
            {s.capacityDaily != null
              ? formatCapacityFigure(s.capacityDaily)
              : "Unavailable"}
          </span>
        ),
      },
      {
        id: "weekly",
        header: "Weekly",
        sortValue: (s) => s.capacityWeekly ?? -1,
        cell: (s) => (
          <span className="text-body text-text-secondary">
            {s.capacityWeekly != null
              ? formatCapacityFigure(s.capacityWeekly)
              : "Unavailable"}
          </span>
        ),
      },
      {
        id: "turnaround",
        header: "Turnaround",
        sortValue: (s) => s.turnaroundHours,
        cell: (s) => (
          <span className="text-body text-text-secondary">{s.turnaroundHours}h</span>
        ),
      },
    ];
  }, [data]);

  const jobColumns = useMemo<DataTableColumn<Order>[]>(
    () => [
      {
        id: "job",
        header: "Committed job",
        primary: true,
        sortValue: (j) => j.title,
        cell: (j) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {j.title}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {describeQuantity(j.quantity, j.unit)}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (j) => presentOrderState(j.state).label,
        cell: (j) => {
          const st = presentOrderState(j.state);
          return <StatusChip tone={st.tone} label={st.label} icon={st.icon} />;
        },
      },
      {
        id: "deadline",
        header: "Deadline",
        sortValue: (j) => j.deadline || j.promisedDate || "",
        cell: (j) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(j.deadline || j.promisedDate)}
          </span>
        ),
      },
    ],
    [],
  );

  const pending = loading && !data;

  if (!pending && (error || !data || !snapshot)) {
    return (
      <ErrorState
        body={error ?? "Could not load capacity."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  // Labels are fixed for this shop board; only the figures wait on the API.
  const cards = [
    {
      label: "Declared daily",
      value: snapshot ? formatCapacityFigure(snapshot.declared.daily) : "",
      hint: snapshot
        ? snapshot.declared.linesWithDaily > 0
          ? `Across ${snapshot.declared.linesWithDaily} live line${snapshot.declared.linesWithDaily === 1 ? "" : "s"}`
          : "No live line declares daily capacity"
        : null,
    },
    {
      label: "Declared weekly",
      value: snapshot ? formatCapacityFigure(snapshot.declared.weekly) : "",
      hint: snapshot
        ? snapshot.declared.linesWithWeekly > 0
          ? `Across ${snapshot.declared.linesWithWeekly} live line${snapshot.declared.linesWithWeekly === 1 ? "" : "s"}`
          : "No live line declares weekly capacity"
        : null,
    },
    {
      label: "Committed now",
      value: snapshot ? formatCapacityFigure(snapshot.committed.unitCount) : "",
      hint: snapshot
        ? `${snapshot.committed.jobCount} job${snapshot.committed.jobCount === 1 ? "" : "s"} still in production`
        : null,
    },
    {
      label: "Remaining daily",
      value: snapshot ? formatCapacityFigure(snapshot.remainingDaily) : "",
      hint: snapshot
        ? snapshot.remainingDaily == null
          ? "Needs declared daily capacity from the API"
          : "Declared daily minus committed units"
        : null,
    },
  ];
  const dailyUtilisation =
    snapshot && snapshot.declared.daily != null && snapshot.declared.daily > 0
      ? (snapshot.committed.unitCount / snapshot.declared.daily) * 100
      : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Shop headroom is derived from capacity you declare on live catalogue lines, set
          against units already committed on accepted jobs. Figures the API does not
          supply are labelled unavailable — nothing is invented.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            nativeButton={false}
            render={<Link href="/supplier/catalogue" />}
          >
            Edit on catalogue
          </Button>
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="gg-card flex flex-col gap-1"
            aria-busy={pending || undefined}
          >
            <p className="text-caption text-text-muted m-0">{card.label}</p>
            {pending ? (
              <div className="flex h-[30px] items-center">
                <SkeletonValue className="w-20" />
                <span className="sr-only">Loading</span>
              </div>
            ) : (
              <p
                className="text-h2 text-text-primary m-0"
                style={{ fontFamily: "var(--font-bold)" }}
              >
                {card.value}
              </p>
            )}
            {card.hint ? (
              <p className="text-caption text-text-secondary m-0">{card.hint}</p>
            ) : null}
          </div>
        ))}
      </div>

      {snapshot && dailyUtilisation != null ? (
        <section className="gg-card" aria-labelledby="daily-load-heading">
          <Progress value={Math.min(dailyUtilisation, 100)} max={100}>
            <ProgressLabel id="daily-load-heading">Daily production load</ProgressLabel>
            <ProgressValue />
          </Progress>
          <p className="text-caption text-text-secondary m-0 mt-2">
            {snapshot.committed.unitCount} committed unit
            {snapshot.committed.unitCount === 1 ? "" : "s"} against{" "}
            {snapshot.declared.daily} declared daily.{" "}
            {dailyUtilisation > 100
              ? "Commitments exceed declared daily capacity; update the catalogue or coordinate the queue."
              : "The bar shows current commitments as a share of declared daily capacity."}
          </p>
        </section>
      ) : null}

      <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
        {(snapshot?.notes ?? []).map((note) => (
          <li key={note} className="text-caption text-text-secondary">
            {note}
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-3" aria-labelledby="cap-lines">
        <h2 id="cap-lines" className="text-h3 text-text-primary m-0">
          Live service capacity
        </h2>
        {!pending && !liveLines.length ? (
          <EmptyState
            title="No live capacity declared"
            body="Verify a service line and set daily or weekly capacity so matching and this board can use real numbers."
            action={
              <Button
                variant="primary"
                nativeButton={false}
                render={<Link href="/supplier/catalogue" />}
              >
                Open catalogue
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={lineColumns}
            data={liveLines}
            loading={pending}
            getRowId={(s) => s.id}
            caption="Live service capacity"
          />
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="cap-jobs">
        <h2 id="cap-jobs" className="text-h3 text-text-primary m-0">
          Committed jobs
        </h2>
        {!pending && !snapshot?.committed.jobs.length ? (
          <EmptyState
            title="No production commitments"
            body="When you accept jobs, their unit counts appear here until they leave the shop for dispatch."
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
            columns={jobColumns}
            data={snapshot?.committed.jobs ?? []}
            loading={pending}
            getRowId={(j) => j.id}
            caption="Committed jobs"
            rowActions={(j) => (
              <DataTableRowAction
                label="Open"
                icon={Eye}
                href={`/supplier/jobs/${j.id}`}
              />
            )}
          />
        )}
      </section>
    </div>
  );
}
