"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { listIssueReports, updateIssueReport } from "@/lib/api/client";
import type {
  IssueReport,
  IssueReportCategory,
  IssueReportCounts,
  IssueReportStatus,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_TABS: { value: IssueReportStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "published", label: "Published" },
  { value: "dismissed", label: "Dismissed" },
];

export function categoryLabel(category: IssueReportCategory | null): string {
  if (category === "bug") return "Bug, issue or concern";
  if (category === "feature") return "Feature or change request";
  if (category === "other") return "Something else";
  return "No category";
}

/** The reference the reporter was shown on the landing page. */
export function reportReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function statusChip(report: IssueReport) {
  if (report.status === "published") {
    return (
      <StatusChip
        tone="success"
        icon="circle-check"
        label={report.publishedIn ? `Published ${report.publishedIn}` : "Published"}
      />
    );
  }
  if (report.status === "dismissed") return <StatusChip tone="neutral" icon="circle-x" label="Dismissed" />;
  return <StatusChip tone="info" icon="clock" label="New" />;
}

function firstLine(text: string): string {
  const line = text.split("\n").find((part) => part.trim()) ?? text;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

/**
 * Issues anyone filed from the landing site's /report page. Operations and
 * Super Admin read them here, then mark each one published (with the reports
 * page date) or dismissed.
 */
export function IssueReportsDesk() {
  const [status, setStatus] = useState<IssueReportStatus>("new");
  const [reports, setReports] = useState<IssueReport[] | null>(null);
  const [counts, setCounts] = useState<IssueReportCounts | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [publishedIn, setPublishedIn] = useState("");

  const load = useCallback(async (keepId?: string | null) => {
    setError(null);
    const result = await listIssueReports(status);
    setReports(result.reports);
    setCounts(result.counts);
    setSelectedId((current) => {
      const preferred = keepId ?? current;
      if (preferred && result.reports.some((report) => report.id === preferred)) return preferred;
      return result.reports[0]?.id ?? null;
    });
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load()
      .catch(() => {
        if (!cancelled) {
          setReports(null);
          setError("Could not load issue reports. Check your connection and try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const selected = useMemo(
    () => reports?.find((report) => report.id === selectedId) ?? null,
    [reports, selectedId],
  );

  useEffect(() => {
    setActionError(null);
    setPublishedIn(selected?.publishedIn ?? "");
  }, [selected?.id, selected?.publishedIn]);

  async function mark(next: IssueReportStatus) {
    if (!selected || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      await updateIssueReport(selected.id, {
        status: next,
        publishedIn: next === "published" ? publishedIn.trim() || null : null,
      });
      // The report leaves this tab; the list picks the next one.
      await load(null);
    } catch {
      setActionError("Could not update this report. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (error && !reports) {
    return (
      <ErrorState
        body={error}
        action={
          <Button onClick={() => void load().catch(() => undefined)}>Try again</Button>
        }
      />
    );
  }

  return (
    <div className="grid min-h-[36rem] gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="gg-card flex min-w-0 flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-h3 text-text-primary m-0">Reports</h2>
            <p className="text-caption text-text-muted m-0 mt-1">
              Filed by anyone from the website&apos;s Report an issue page.
            </p>
          </div>
          <Button size="sm" onClick={() => void load().catch(() => setError("Could not refresh."))}>
            Refresh
          </Button>
        </div>
        <ToggleGroup
          value={[status]}
          onValueChange={(values) => {
            const next = values[0] as IssueReportStatus | undefined;
            if (next) setStatus(next);
          }}
          variant="outline"
          spacing={0}
          aria-label="Filter reports by status"
          className="flex flex-wrap gap-1"
        >
          {STATUS_TABS.map((tab) => (
            <ToggleGroupItem key={tab.value} value={tab.value}>
              {tab.label}
              {counts ? ` · ${counts[tab.value]}` : ""}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Issue reports">
          {loading && !reports ? (
            <p className="text-body text-text-muted m-0 px-1 py-3">Loading reports…</p>
          ) : !reports?.length ? (
            <EmptyState
              title={status === "new" ? "No new reports" : `No ${status} reports`}
              body={
                status === "new"
                  ? "A report appears here as soon as someone sends one from the website."
                  : "Reports you mark from the New tab land here."
              }
            />
          ) : (
            reports.map((report) => {
              const active = report.id === selectedId;
              return (
                <button
                  key={report.id}
                  type="button"
                  role="listitem"
                  onClick={() => setSelectedId(report.id)}
                  className={cn(
                    "mb-1 flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-field)] px-3 py-2 text-left",
                    active ? "bg-muted" : "hover:bg-overlay-hover",
                  )}
                >
                  <span className="text-body text-text-primary line-clamp-2" style={{ fontFamily: "var(--font-medium)" }}>
                    {firstLine(report.issue)}
                  </span>
                  <span className="text-caption text-text-muted">
                    {formatDateTime(report.createdAt)}
                    {report.category ? ` · ${categoryLabel(report.category)}` : ""}
                    {report.screenshots.length
                      ? ` · ${report.screenshots.length} screenshot${report.screenshots.length === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="gg-card flex min-w-0 flex-col gap-4">
        {!selected ? (
          <EmptyState
            title="Pick a report"
            body="The full text, category and screenshots open here."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-h3 text-text-primary m-0">Report {reportReference(selected.id)}</h2>
                <p className="text-caption text-text-muted m-0 mt-1">
                  Received {formatDateTime(selected.createdAt)} · {categoryLabel(selected.category)}
                </p>
              </div>
              {statusChip(selected)}
            </div>

            <p className="text-body text-text-primary m-0 whitespace-pre-wrap break-words">{selected.issue}</p>

            {selected.screenshots.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                  Screenshots
                </h3>
                <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
                  {selected.screenshots.map((shot) => (
                    <li key={shot.position}>
                      <a
                        href={shot.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block overflow-hidden rounded-[var(--radius-field)] border border-border bg-muted"
                      >
                        {/* Presigned MinIO links, so next/image cannot optimise them. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={shot.url}
                          alt={`Screenshot ${shot.position + 1} for report ${reportReference(selected.id)}`}
                          className="aspect-[4/3] w-full object-cover"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-caption text-text-muted m-0">
                  Open a screenshot to see it full size. Links expire after a few minutes; press Refresh for new ones.
                </p>
              </div>
            ) : null}

            <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
              {selected.status === "new" ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-text-secondary">Reports page date (optional)</span>
                    <Input
                      value={publishedIn}
                      onChange={(event) => setPublishedIn(event.target.value)}
                      placeholder="09-25-2026"
                      maxLength={200}
                      className="max-w-xs"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" disabled={saving} onClick={() => void mark("published")}>
                      Mark published
                    </Button>
                    <Button disabled={saving} onClick={() => void mark("dismissed")}>
                      Dismiss
                    </Button>
                  </div>
                </>
              ) : (
                <div>
                  <Button disabled={saving} onClick={() => void mark("new")}>
                    Move back to New
                  </Button>
                </div>
              )}
              {actionError ? (
                <p role="alert" className="text-caption text-error m-0">
                  {actionError}
                </p>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
