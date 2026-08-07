"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
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

  if (loading && !jobs) return <LoadingBlock label="Loading assigned jobs…" />;
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
  if (!jobs?.length) {
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

  const actionRequired = jobs.filter((j) => needsSupplierAction(j.state)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-body text-text-secondary m-0">
            {jobs.length} job{jobs.length === 1 ? "" : "s"}
            {actionRequired > 0
              ? ` · ${actionRequired} need${actionRequired === 1 ? "s" : ""} your action`
              : ""}
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {/* Desktop/tablet table */}
      <div className="hidden md:block gg-card-flush overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-outline bg-surface-variant">
              <th className="text-caption text-text-muted px-4 py-3 font-normal">
                Job
              </th>
              <th className="text-caption text-text-muted px-4 py-3 font-normal">
                Status
              </th>
              <th className="text-caption text-text-muted px-4 py-3 font-normal">
                Deadline
              </th>
              <th className="text-caption text-text-muted px-4 py-3 font-normal">
                Total
              </th>
              <th className="text-caption text-text-muted px-4 py-3 font-normal">
                Next step
              </th>
              <th className="px-4 py-3">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const status = presentOrderState(job.state);
              const next = primaryAction(job.state);
              return (
                <tr
                  key={job.id}
                  className="border-b border-outline-subtle last:border-0"
                >
                  <td className="px-4 py-3 align-top">
                    <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                      {job.title}
                    </p>
                    <p className="text-caption text-text-muted m-0 mt-0.5">
                      {job.size} · {job.material}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusChip
                      tone={status.tone}
                      label={status.label}
                      icon={status.icon}
                    />
                  </td>
                  <td className="text-body text-text-secondary px-4 py-3 align-top whitespace-nowrap">
                    {formatDateTime(job.deadline)}
                  </td>
                  <td className="text-body text-text-primary px-4 py-3 align-top whitespace-nowrap">
                    {formatPhp(job.totalMinor + job.deliveryFeeMinor)}
                  </td>
                  <td className="text-body text-text-secondary px-4 py-3 align-top">
                    {next ? next.label : "No action needed"}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <Link
                      href={`/supplier/jobs/${job.id}`}
                      className="gg-btn gg-btn-secondary inline-flex"
                    >
                      Open
                      <ChevronRight size={16} aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards — no essential action needs horizontal scroll */}
      <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
        {jobs.map((job) => {
          const status = presentOrderState(job.state);
          const next = primaryAction(job.state);
          return (
            <li key={job.id}>
              <Link
                href={`/supplier/jobs/${job.id}`}
                className="gg-card flex flex-col gap-3 no-underline hover:bg-overlay-hover"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                      {job.title}
                    </p>
                    <p className="text-caption text-text-muted m-0 mt-0.5">
                      {job.size} · {job.material}
                    </p>
                  </div>
                  <ChevronRight
                    className="shrink-0 text-text-muted"
                    size={18}
                    aria-hidden
                  />
                </div>
                <StatusChip
                  tone={status.tone}
                  label={status.label}
                  icon={status.icon}
                />
                <dl className="m-0 grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-caption text-text-muted">Deadline</dt>
                    <dd className="text-body text-text-primary m-0">
                      {formatDateTime(job.deadline)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption text-text-muted">Total</dt>
                    <dd className="text-body text-text-primary m-0">
                      {formatPhp(job.totalMinor + job.deliveryFeeMinor)}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-caption text-text-muted">Next step</dt>
                    <dd className="text-body text-text-secondary m-0">
                      {next ? next.label : "No action needed"}
                    </dd>
                  </div>
                </dl>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
