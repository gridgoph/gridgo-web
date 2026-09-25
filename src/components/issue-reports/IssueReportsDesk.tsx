"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  checkTrackerIssueUrl,
  parseTrackerIssueUrl,
  trackerIssueLabel,
  TRACKER_URL_EXAMPLE,
} from "@/components/issue-reports/tracker-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusChip, StatusChipLink } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isApiError, listIssueReports, updateIssueReport } from "@/lib/api/client";
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
  { value: "tracked", label: "Tracked" },
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

const EMPTY_BODY: Record<IssueReportStatus, string> = {
  new: "A report appears here as soon as someone sends one from the website.",
  tracked: "Reports linked to a GitHub tracker issue land here.",
  published: "Reports named in a dated reports page land here.",
  dismissed: "Reports you dismiss land here.",
};

function publishedChip(report: IssueReport) {
  return (
    <StatusChip
      tone="success"
      icon="circle-check"
      label={report.publishedIn ? `Published ${report.publishedIn}` : "Published"}
    />
  );
}

/** "Tracked: gridgo-web #62", opening the GitHub issue in a new tab. */
function trackedChip(url: string) {
  const issue = parseTrackerIssueUrl(url);
  const label = `Tracked: ${trackerIssueLabel(url)}`;
  return (
    <StatusChipLink
      tone="info"
      icon="circle-dot"
      label={label}
      href={url}
      linkLabel={issue ? `${label}, open issue ${issue.number} in ${issue.repo} on GitHub` : `${label}, open on GitHub`}
    />
  );
}

/**
 * Every chip a report carries: its status, and its tracker issue when it has
 * one. A published report that was tracked first shows both.
 */
function statusChips(report: IssueReport) {
  const tracker = report.trackerIssueUrl ?? null;
  const chips = [];
  if (report.status === "published") chips.push(<span key="published">{publishedChip(report)}</span>);
  if (report.status === "dismissed") {
    chips.push(
      <span key="dismissed">
        <StatusChip tone="neutral" icon="circle-x" label="Dismissed" />
      </span>,
    );
  }
  if (tracker && (report.status === "tracked" || report.status === "published")) {
    chips.push(<span key="tracked">{trackedChip(tracker)}</span>);
  } else if (report.status === "tracked") {
    chips.push(
      <span key="tracked">
        <StatusChip tone="info" icon="circle-dot" label="Tracked" />
      </span>,
    );
  }
  if (report.status === "new") {
    chips.push(
      <span key="new">
        <StatusChip tone="info" icon="clock" label="New" />
      </span>,
    );
  }
  return chips;
}

function firstLine(text: string): string {
  const line = text.split("\n").find((part) => part.trim()) ?? text;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

/**
 * Issues anyone filed from the landing site's /report page. Operations and
 * Super Admin read them here, then mark each one tracked (with the GitHub
 * tracker issue it became), published (with the reports page date) or
 * dismissed.
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
  const [trackerUrl, setTrackerUrl] = useState("");
  const [trackerError, setTrackerError] = useState<string | null>(null);

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

  // Refill the form whenever a different report (or a changed one) is shown.
  // Done while rendering, not in an effect, so the fields never show a frame
  // of the previous report's values.
  const formKey = selected
    ? `${selected.id}|${selected.publishedIn ?? ""}|${selected.trackerIssueUrl ?? ""}`
    : null;
  const [filledFor, setFilledFor] = useState<string | null>(null);
  if (formKey !== filledFor) {
    setFilledFor(formKey);
    setActionError(null);
    setTrackerError(null);
    setPublishedIn(selected?.publishedIn ?? "");
    setTrackerUrl(selected?.trackerIssueUrl ?? "");
  }

  async function mark(next: IssueReportStatus) {
    if (!selected || saving) return;
    const input: Parameters<typeof updateIssueReport>[1] = {
      status: next,
      publishedIn: next === "published" ? publishedIn.trim() || null : null,
    };
    // Tracked needs a link. Published keeps one if the field holds it; the
    // API clears the link on New and Dismissed by itself.
    if (next === "tracked" || (next === "published" && (trackerUrl.trim() || selected.trackerIssueUrl))) {
      if (next === "published" && !trackerUrl.trim()) {
        input.trackerIssueUrl = null;
      } else {
        const check = checkTrackerIssueUrl(trackerUrl);
        if (!check.ok) {
          setTrackerError(check.error);
          return;
        }
        input.trackerIssueUrl = check.url;
      }
    }
    setSaving(true);
    setActionError(null);
    setTrackerError(null);
    try {
      await updateIssueReport(selected.id, input);
      // The report usually leaves this tab; the list picks the next one.
      await load(next === status ? selected.id : null);
    } catch (err) {
      setActionError(
        isApiError(err) && err.kind === "validation"
          ? "The server refused that change. Check the GitHub issue link and try again."
          : "Could not update this report. Try again.",
      );
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
              {counts ? ` · ${counts[tab.value] ?? 0}` : ""}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Issue reports">
          {loading && !reports ? (
            <p className="text-body text-text-muted m-0 px-1 py-3">Loading reports…</p>
          ) : !reports?.length ? (
            <EmptyState
              title={`No ${status} reports`}
              body={EMPTY_BODY[status]}
            />
          ) : (
            reports.map((report) => {
              const active = report.id === selectedId;
              // New and Dismissed rows sit in their own tab; the chip would repeat it.
              const chips = report.status === "tracked" || report.status === "published" ? statusChips(report) : [];
              return (
                <div
                  key={report.id}
                  role="listitem"
                  className={cn(
                    "mb-1 flex flex-col rounded-[var(--radius-field)]",
                    active ? "bg-muted" : "hover:bg-overlay-hover",
                  )}
                >
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    onClick={() => setSelectedId(report.id)}
                    className="flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-field)] px-3 py-2 text-left"
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
                  {chips.length ? (
                    <div className="-mt-2 flex flex-wrap items-center gap-x-2 px-3">{chips}</div>
                  ) : null}
                </div>
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
              <div className="flex flex-wrap items-center gap-2">{statusChips(selected)}</div>
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
              {selected.status === "new" || selected.status === "tracked" ? (
                <>
                  <Field data-invalid={trackerError ? true : undefined} className="gap-1">
                    {/* Type and colour stay off merged primitives (AGENTS.md). */}
                    <FieldLabel htmlFor="tracker-issue-url">
                      <span className="text-caption text-text-secondary">GitHub tracker issue</span>
                    </FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        id="tracker-issue-url"
                        type="url"
                        inputMode="url"
                        value={trackerUrl}
                        onChange={(event) => {
                          setTrackerUrl(event.target.value);
                          setTrackerError(null);
                        }}
                        placeholder={TRACKER_URL_EXAMPLE}
                        aria-invalid={trackerError ? true : undefined}
                        aria-describedby={trackerError ? "tracker-issue-url-error" : "tracker-issue-url-help"}
                        maxLength={300}
                        className="min-w-0 max-w-md flex-1"
                      />
                      <Button disabled={saving} onClick={() => void mark("tracked")}>
                        {selected.status === "tracked" ? "Save link" : "Mark tracked"}
                      </Button>
                    </div>
                    {trackerError ? (
                      <FieldError id="tracker-issue-url-error">
                        <span className="text-caption text-error">{trackerError}</span>
                      </FieldError>
                    ) : (
                      <FieldDescription id="tracker-issue-url-help">
                        <span className="text-caption text-text-muted">
                          Paste the link of the issue this report was filed as, or linked to.
                        </span>
                      </FieldDescription>
                    )}
                  </Field>
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
                    {selected.status === "tracked" ? (
                      <Button variant="ghost" disabled={saving} onClick={() => void mark("new")}>
                        Move back to New
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selected.status === "published" && selected.trackerIssueUrl ? (
                    <Button disabled={saving} onClick={() => void mark("tracked")}>
                      Move back to Tracked
                    </Button>
                  ) : null}
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
