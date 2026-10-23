"use client";

import { ChevronLeft, Pin, Undo2 } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  parseTrackerIssueUrl,
  trackerIssueLabel,
  withoutGithubLinks,
} from "@/components/issue-reports/tracker-link";
import {
  appendPage,
  hasMoreReports,
  ISSUE_REPORTS_MAX_LIMIT,
  ISSUE_REPORTS_PAGE_SIZE,
  reloadLimit,
  showingLabel,
} from "@/components/issue-reports/paging";
import {
  aiRowLabel,
  DEFAULT_FILTERS,
  filterQuery,
  isDefaultFilters,
  listIsWhole,
  matchesFilters,
  reportReference,
  triageCategoryLabel,
  triageOf,
  VALIDITY,
  VERDICTS,
  type TriageFilters as Filters,
} from "@/components/issue-reports/triage";
import { TriageFilters } from "@/components/issue-reports/TriageFilters";
import { AiSuggestion, TriageDetails, VerdictBar } from "@/components/issue-reports/TriagePanel";
import { PublishDialog, TrackDialog } from "@/components/issue-reports/WorkflowDialogs";
import { PriorityButton } from "@/components/ui/PriorityButton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip, StatusChipLink } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isApiError, listIssueReports, updateIssueReport } from "@/lib/api/client";
import type {
  IssueReport,
  IssueReportCategory,
  IssueReportCounts,
  IssueReportStatus,
  IssueReportTriageCounts,
  IssueReportTriageInput,
  IssueReportValidity,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { cn } from "@/lib/utils";

export { reportReference };

type ReportFilter = IssueReportStatus | "priorities";

const STATUS_TABS: { value: ReportFilter; label: string }[] = [
  { value: "priorities", label: "Priorities" },
  { value: "new", label: "New" },
  { value: "tracked", label: "Tracked" },
  { value: "published", label: "Published" },
  { value: "dismissed", label: "Dismissed" },
];

/** The category the reporter picked on the website's form. */
export function categoryLabel(category: IssueReportCategory | null): string {
  if (category === "bug") return "Bug, issue or concern";
  if (category === "feature") return "Feature or change request";
  if (category === "other") return "Something else";
  return "No category";
}

const EMPTY_BODY: Record<ReportFilter, string> = {
  priorities: "Pin a report to keep it here. It stays in its original status tab too.",
  new: "A report appears here as soon as someone sends one from the website.",
  tracked: "Reports the team is tracking land here.",
  published: "Reports named in a dated reports page land here.",
  dismissed: "Reports you dismiss land here.",
};

/** What each next step means, under the buttons that take it. */
const NEXT_STEP_HELP: Partial<Record<IssueReportStatus, string>> = {
  new: "Track it when the team takes it on. Publish it once the reports page covers it. Dismiss it if nobody will act on it.",
  tracked: "Publish it once the reports page covers it, or dismiss it if nobody will act on it.",
};

function publishedChip(report: IssueReport, trackerLinks: boolean) {
  const publishedIn = report.publishedIn && !trackerLinks ? withoutGithubLinks(report.publishedIn) : report.publishedIn;
  return (
    <StatusChip
      tone="success"
      icon="circle-check"
      label={publishedIn ? `Published ${publishedIn}` : "Published"}
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
 * one and the reader may see it. A published report that was tracked first
 * shows both.
 */
function statusChips(report: IssueReport, trackerLinks: boolean) {
  const tracker = trackerLinks ? (report.trackerIssueUrl ?? null) : null;
  const chips = [];
  if (report.status === "published") chips.push(<span key="published">{publishedChip(report, trackerLinks)}</span>);
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

/** A row's verdict and AI marker; "To review" with no AI review says nothing. */
function triageChips(report: IssueReport) {
  const triage = triageOf(report);
  const chips = [];
  if (triage.validity !== "unreviewed") {
    chips.push(
      <span key="validity">
        <StatusChip {...VALIDITY[triage.validity]} />
      </span>,
    );
  }
  if (report.aiReview) {
    chips.push(
      <span key="ai">
        <StatusChip tone="info" icon="sparkles" label={aiRowLabel(report.aiReview)} />
      </span>,
    );
  }
  return chips;
}

function firstLine(text: string): string {
  const line = text.split("\n").find((part) => part.trim()) ?? text;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

/** The desk is two panes side by side from this width; below it, one at a time. */
const SIDE_BY_SIDE_QUERY = "(min-width: 1024px)";

function sideBySide(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(SIDE_BY_SIDE_QUERY).matches
    : true;
}

/** Typing in a field never triggers a verdict key. */
function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("[role=dialog],[role=listbox]") !== null;
}

function triageErrorCopy(err: unknown): string {
  if (isApiError(err) && err.code === "issue_report_not_found") {
    return "This report no longer exists. Press Refresh.";
  }
  if (isApiError(err) && err.kind === "forbidden") return "Your account cannot sort issue reports.";
  if (isApiError(err) && err.kind === "validation") {
    return "The server refused that change. Check the label or the repeated report and try again.";
  }
  return "Could not save the change. Try again.";
}

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 px-3 py-2.5">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-3 w-7/12" />
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4 p-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-3 w-64" />
      <div className="flex flex-col gap-2 pt-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

type Undo = { id: string; validity: IssueReportValidity; previous: IssueReportTriageInput };

/**
 * Issues anyone filed from the landing site's /report page. Operations and
 * Super Admin sort them here (a verdict of valid, spam or duplicate, their
 * own category and labels, beside the AI's separate suggestion), then mark
 * each one tracked, published (with the reports page date) or dismissed.
 *
 * `trackerLinks` is Super Admin's: the GitHub tracker issue a report became,
 * its chip and the field that sets it. Without it the desk never shows a
 * GitHub link or sends one; the API keeps the stored link, omits it from
 * Operations' responses and refuses one from Operations (403
 * `tracker_issue_url_forbidden`).
 *
 * The desk fills the window under the header: the list scrolls on its own
 * and loads a page at a time, and the open report keeps its verdict and next
 * step pinned at the bottom of its panel. Below 1024px it is one pane at a
 * time (the list, then the report with a way back).
 */
export function IssueReportsDesk({ trackerLinks = false }: { trackerLinks?: boolean } = {}) {
  const [status, setStatus] = useState<ReportFilter>("new");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reports, setReports] = useState<IssueReport[] | null>(null);
  const [counts, setCounts] = useState<IssueReportCounts | null>(null);
  const [triageCounts, setTriageCounts] = useState<IssueReportTriageCounts | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  // Below 1024px: whether the report pane is showing instead of the list.
  const [detailOpen, setDetailOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"publish" | "track" | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const reportsRef = useRef<IssueReport[]>([]);
  // Bumped by every refresh, so a page that lands after it is dropped.
  const generationRef = useRef(0);
  const loadingMoreRef = useRef(false);
  // Where focus goes after the single pane switches (phone and tablet).
  const focusAfterSwitch = useRef<"detail" | "row" | null>(null);

  useEffect(() => {
    reportsRef.current = reports ?? [];
  }, [reports]);

  const query = useMemo(() => filterQuery(filters), [filters]);

  /** Whether the API's per-status counts still total this list. */
  const countsFor = useCallback(
    (latestCounts: IssueReportCounts, latestTriage: IssueReportTriageCounts | null | undefined) =>
      listIsWhole(filters, latestTriage) ? latestCounts : null,
    [filters],
  );

  /** Refetches the tab, keeping as many pages as are already loaded. */
  const load = useCallback(async (keepId?: string | null) => {
    const generation = ++generationRef.current;
    setError(null);
    setMoreError(null);
    const requested = reloadLimit(reportsRef.current.length);
    const result = await listIssueReports(status, { limit: requested }, query);
    if (generation !== generationRef.current) return;
    reportsRef.current = result.reports;
    setReports(result.reports);
    setCounts(result.counts);
    setTriageCounts(result.triageCounts ?? null);
    setHasMore(
      hasMoreReports(result.reports.length, countsFor(result.counts, result.triageCounts), status, {
        received: result.reports.length,
        requested,
      }),
    );
    setSelectedId((current) => {
      const preferred = keepId ?? current;
      if (preferred && result.reports.some((report) => report.id === preferred)) return preferred;
      return result.reports[0]?.id ?? null;
    });
  }, [status, query, countsFor]);

  const loadMore = useCallback(async () => {
    const current = reportsRef.current;
    const last = current.at(-1);
    if (!last || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(null);
    const generation = generationRef.current;
    try {
      const result = await listIssueReports(status, { limit: ISSUE_REPORTS_PAGE_SIZE, before: last.id }, query);
      if (generation !== generationRef.current) return;
      const page = appendPage(current, result.reports);
      if (page.ignoredCursor) {
        // An API without `before` paging: ask for a longer first page instead.
        const requested = Math.min(current.length + ISSUE_REPORTS_PAGE_SIZE, ISSUE_REPORTS_MAX_LIMIT);
        const grown = await listIssueReports(status, { limit: requested }, query);
        if (generation !== generationRef.current) return;
        reportsRef.current = grown.reports;
        setReports(grown.reports);
        setCounts(grown.counts);
        setTriageCounts(grown.triageCounts ?? null);
        setHasMore(
          grown.reports.length > current.length &&
            hasMoreReports(grown.reports.length, countsFor(grown.counts, grown.triageCounts), status, {
              received: grown.reports.length,
              requested,
            }),
        );
        return;
      }
      reportsRef.current = page.reports;
      setReports(page.reports);
      setCounts(result.counts);
      setTriageCounts(result.triageCounts ?? null);
      setHasMore(
        page.added > 0 &&
          hasMoreReports(page.reports.length, countsFor(result.counts, result.triageCounts), status, {
            received: result.reports.length,
            requested: ISSUE_REPORTS_PAGE_SIZE,
          }),
      );
    } catch {
      if (generation === generationRef.current) setMoreError("Could not load more reports.");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [status, query, countsFor]);

  useLiveReload("issue-reports", load);

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

  // Infinite scroll: the next page loads as the end of the list nears. The
  // Load more button below the list does the same by hand.
  useEffect(() => {
    const root = listRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore || moreError || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root, rootMargin: "0px 0px 320px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, moreError, loadMore, reports]);

  // Keep the open report's row in view, in the list's own scroll area.
  useEffect(() => {
    if (!selectedId || detailOpen) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-report-id="${selectedId}"]`);
    row?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId, detailOpen, reports]);

  // The single pane moved focus out of view; put it where the reader now is.
  useEffect(() => {
    const target = focusAfterSwitch.current;
    if (!target) return;
    focusAfterSwitch.current = null;
    if (target === "detail") detailHeadingRef.current?.focus();
    else listRef.current?.querySelector<HTMLButtonElement>(`[data-report-id="${selectedId}"] button`)?.focus();
  }, [detailOpen, selectedId]);

  const selected = useMemo(
    () => reports?.find((report) => report.id === selectedId) ?? null,
    [reports, selectedId],
  );

  const storedTrackerUrl = trackerLinks ? (selected?.trackerIssueUrl ?? null) : null;
  // A different report clears the last report's refusal.
  const [errorFor, setErrorFor] = useState<string | null>(null);
  if ((selected?.id ?? null) !== errorFor) {
    setErrorFor(selected?.id ?? null);
    setActionError(null);
  }

  function resetList() {
    generationRef.current += 1;
    reportsRef.current = [];
    setReports(null);
    setHasMore(false);
    setSelectedId(null);
    setDetailOpen(false);
    setUndo(null);
  }

  function changeStatus(next: ReportFilter) {
    if (next === status) return;
    resetList();
    setStatus(next);
  }

  function changeFilters(next: Filters) {
    resetList();
    setFilters(next);
  }

  function openReport(id: string) {
    setSelectedId(id);
    if (!sideBySide()) {
      focusAfterSwitch.current = "detail";
      setDetailOpen(true);
    }
  }

  function backToList() {
    focusAfterSwitch.current = "row";
    setDetailOpen(false);
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!reports?.length) return;
    const index = reports.findIndex((report) => report.id === selectedId);
    let next: number;
    if (event.key === "ArrowDown") next = Math.min(reports.length - 1, index + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = reports.length - 1;
    else return;
    event.preventDefault();
    const id = reports[next].id;
    setSelectedId(id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-report-id="${id}"] button`)?.focus();
  }

  /**
   * Reloads after a change to `target`. One that left this view hands over
   * to the report below it, so the desk works down the list instead of
   * jumping back to the top.
   */
  async function reloadAfter(target: IssueReport, stays: boolean) {
    const list = reports ?? [];
    const index = list.findIndex((report) => report.id === target.id);
    const neighbour = list[index + 1] ?? list[index - 1] ?? null;
    await load(stays ? target.id : (neighbour?.id ?? null));
    if (!stays && !sideBySide()) backToList();
  }

  async function mark(
    next: IssueReportStatus,
    extra: { publishedIn?: string | null; trackerIssueUrl?: string | null } = {},
  ) {
    if (!selected || saving) return;
    const input: Parameters<typeof updateIssueReport>[1] = {
      status: next,
      publishedIn: next === "published" ? (extra.publishedIn ?? null) : null,
      ...(extra.trackerIssueUrl !== undefined ? { trackerIssueUrl: extra.trackerIssueUrl } : {}),
    };
    setSaving(true);
    setActionError(null);
    setDialogError(null);
    setUndo(null);
    try {
      await updateIssueReport(selected.id, input);
      setDialog(null);
      await reloadAfter(selected, next === status || status === "priorities");
    } catch (err) {
      const message =
        trackerLinks && isApiError(err) && err.kind === "validation"
          ? "The server refused that change. Check the GitHub issue link and try again."
          : "Could not update this report. Try again.";
      if (dialog) setDialogError(message);
      else setActionError(message);
    } finally {
      setSaving(false);
    }
  }

  /** Moving back keeps a Super Admin's stored link on the way to Tracked. */
  function moveBack(next: "new" | "tracked") {
    void mark(next, next === "tracked" && storedTrackerUrl ? { trackerIssueUrl: storedTrackerUrl } : {});
  }

  async function saveTriage(input: IssueReportTriageInput, target: IssueReport | null = selected) {
    if (!target || saving) return;
    const before = triageOf(target);
    setSaving(true);
    setActionError(null);
    try {
      const updated = await updateIssueReport(target.id, { triage: input });
      const stays = matchesFilters(updated, filters);
      if (input.validity && input.validity !== before.validity) {
        setUndo(
          stays
            ? null
            : {
                id: target.id,
                validity: input.validity,
                previous: {
                  validity: before.validity,
                  ...(before.validity === "duplicate" ? { duplicateOf: before.duplicateOf } : {}),
                },
              },
        );
      }
      // Show the change at once; the reload brings the counts.
      const next = reportsRef.current.map((report) => (report.id === updated.id ? updated : report));
      reportsRef.current = next;
      setReports(next);
      try {
        await reloadAfter(target, stays);
      } catch {
        setError("Saved, but the list could not refresh. Press Refresh.");
      }
    } catch (err) {
      setActionError(triageErrorCopy(err));
    } finally {
      setSaving(false);
    }
  }

  async function undoVerdict() {
    if (!undo || saving) return;
    const target = undo;
    setSaving(true);
    try {
      await updateIssueReport(target.id, { triage: target.previous });
      setUndo(null);
      await load(target.id);
    } catch {
      setError("Could not undo. Find the report under its verdict and change it there.");
    } finally {
      setSaving(false);
    }
  }

  async function pinSelected() {
    if (!selected || saving) return;
    const generation = generationRef.current;
    const target = selected;
    setSaving(true);
    setActionError(null);
    try {
      const updated = await updateIssueReport(target.id, { priority: !target.priority });
      if (generation !== generationRef.current) return;
      const next = reportsRef.current
        .map((report) => (report.id === updated.id ? updated : report))
        .filter((report) => status !== "priorities" || report.priority);
      reportsRef.current = next;
      setReports(next);
      setCounts((current) =>
        current
          ? {
              ...current,
              priorities: Math.max(
                0,
                (current.priorities ?? 0) + (updated.priority ? 1 : -1),
              ),
            }
          : current,
      );
      if (!next.some((report) => report.id === target.id))
        setSelectedId(next[0]?.id ?? null);
      if (status === "priorities" && !updated.priority) {
        try {
          await load(next[0]?.id ?? null);
        } catch {
          setError(
            "Priority was removed, but the list could not refresh. Press Refresh to load the remaining reports.",
          );
        }
      }
    } catch {
      if (generation === generationRef.current)
        setActionError("Could not change priority. Refresh the reports and try again.");
    } finally {
      setSaving(false);
    }
  }

  // V, S and D give the open report its verdict, unless someone is typing.
  function onDeskKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!selected || saving || dialog || event.altKey || event.ctrlKey || event.metaKey || typingIn(event.target)) {
      return;
    }
    const verdict = VERDICTS.find((entry) => entry.key === event.key.toLowerCase());
    if (!verdict || triageOf(selected).validity === verdict.validity) return;
    event.preventDefault();
    void saveTriage({ validity: verdict.validity });
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

  const initialLoad = loading && !reports;
  const total = counts && listIsWhole(filters, triageCounts) ? counts[status] : undefined;
  const filtered = !isDefaultFilters(filters);
  const labelSuggestions = (triageCounts?.labels ?? []).map((entry) => entry.label);

  return (
    <div
      onKeyDown={onDeskKeyDown}
      className="grid h-[calc(100dvh-5rem)] min-h-[30rem] gap-3 lg:grid-cols-[24rem_minmax(0,1fr)] lg:gap-4 xl:grid-cols-[26rem_minmax(0,1fr)]"
    >
      <aside
        aria-label="Report list"
        className={cn("gg-card-flush min-h-0 min-w-0 flex-col", detailOpen ? "hidden lg:flex" : "flex")}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b border-outline p-4 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-h3 text-text-primary m-0">Reports</h2>
              <p className="text-caption text-text-muted m-0 mt-1 hidden md:block">
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
              const next = values[0] as ReportFilter | undefined;
              if (next) changeStatus(next);
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
          <TriageFilters
            filters={filters}
            triageCounts={triageCounts}
            moreOpen={moreOpen}
            onMoreOpenChange={setMoreOpen}
            onChange={changeFilters}
          />
        </div>

        {undo ? (
          <div
            role="status"
            className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-outline px-4 py-1"
          >
            <span className="text-caption text-text-secondary">
              Report {reportReference(undo.id)} marked {VALIDITY[undo.validity].label.toLowerCase()} and hidden by
              your filters.
            </span>
            <Button variant="ghost" size="xs" disabled={saving} onClick={() => void undoVerdict()}>
              <Undo2 aria-hidden />
              Undo
            </Button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-caption text-error m-0 px-4 py-2">
            {error}
          </p>
        ) : null}
        <div
          ref={listRef}
          onKeyDown={onListKeyDown}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
        >
          {initialLoad ? (
            <>
              <p className="sr-only" role="status">Loading reports…</p>
              <ListSkeleton />
            </>
          ) : !reports?.length ? (
            filtered ? (
              <EmptyState
                title="Nothing matches"
                body={`No ${status === "priorities" ? "priority" : status} reports match these filters.`}
                className="border-0"
                action={<Button onClick={() => changeFilters(DEFAULT_FILTERS)}>Reset filters</Button>}
              />
            ) : (
              <EmptyState title={`No ${status} reports`} body={EMPTY_BODY[status]} className="border-0" />
            )
          ) : (
            <>
              <div role="list" aria-label="Issue reports" className="flex flex-col gap-0.5">
                {reports.map((report) => {
                  const active = report.id === selectedId;
                  const triage = triageOf(report);
                  // New and Dismissed rows sit in their own tab; the chip would repeat it.
                  const chips = [
                    ...(report.status === "tracked" || report.status === "published"
                      ? statusChips(report, trackerLinks)
                      : []),
                    ...triageChips(report),
                  ];
                  const sorted = [
                    triage.category ? triageCategoryLabel(triage.category) : null,
                    ...triage.labels.slice(0, 3).map((label) => `#${label}`),
                    triage.labels.length > 3 ? `+${triage.labels.length - 3}` : null,
                  ].filter(Boolean);
                  return (
                    <div
                      key={report.id}
                      role="listitem"
                      data-report-id={report.id}
                      className={cn(
                        "relative flex flex-col rounded-[var(--radius-field)]",
                        active ? "bg-muted" : "hover:bg-overlay-hover",
                      )}
                    >
                      {/* The open report also carries a bar, so the choice reads without colour. */}
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[var(--color-text-primary)]"
                        />
                      ) : null}
                      <button
                        type="button"
                        aria-current={active ? "true" : undefined}
                        onClick={() => openReport(report.id)}
                        className="flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-field)] px-3 py-2 text-left"
                      >
                        {report.priority ? (
                          <span className="text-caption text-text-secondary inline-flex items-center gap-1">
                            <Pin size={12} aria-hidden /> Priority
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            "text-body line-clamp-2",
                            triage.validity === "spam" ? "text-text-muted" : "text-text-primary",
                          )}
                          style={{ fontFamily: "var(--font-medium)" }}
                        >
                          {firstLine(trackerLinks ? report.issue : withoutGithubLinks(report.issue))}
                        </span>
                        <span className="text-caption text-text-muted">
                          {reportReference(report.id)} ·{" "}
                          {formatDateTime(report.createdAt)}
                          {report.screenshots.length
                            ? ` · ${report.screenshots.length} screenshot${report.screenshots.length === 1 ? "" : "s"}`
                            : ""}
                        </span>
                        {sorted.length ? (
                          <span className="text-caption text-text-secondary flex flex-wrap gap-x-2">
                            {sorted.map((token) => (
                              <span key={token}>{token}</span>
                            ))}
                          </span>
                        ) : null}
                      </button>
                      {chips.length ? (
                        <div className="-mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2">{chips}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div ref={sentinelRef} className="flex flex-col items-center gap-2 px-2 pt-3 pb-2">
                {moreError ? (
                  <>
                    <p role="alert" className="text-caption text-error m-0">
                      {moreError}
                    </p>
                    <Button size="sm" onClick={() => void loadMore()}>
                      Try again
                    </Button>
                  </>
                ) : hasMore ? (
                  <Button size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
                    {loadingMore ? "Loading more…" : "Load more"}
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </div>

        {reports?.length ? (
          <p
            className="text-caption text-text-muted m-0 shrink-0 border-t border-outline px-4 py-2"
            aria-live="polite"
          >
            {showingLabel(reports.length, total)}
          </p>
        ) : null}
      </aside>

      <section
        aria-label="Open report"
        className={cn("gg-card-flush min-h-0 min-w-0 flex-col", detailOpen ? "flex" : "hidden lg:flex")}
      >
        {initialLoad ? (
          <DetailSkeleton />
        ) : !selected ? (
          <div className="p-4">
            <EmptyState
              title={reports?.length ? "Pick a report" : "Nothing to open"}
              body={
                reports?.length
                  ? "The full text, screenshots, AI suggestion and your sorting open here."
                  : "Reports in this view open here."
              }
              className="border-0 p-0"
            />
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-col gap-2 border-b border-outline px-4 pt-3 pb-3">
              <Button variant="ghost" size="sm" className="-ml-2 self-start lg:hidden" onClick={backToList}>
                <ChevronLeft aria-hidden="true" />
                All reports
              </Button>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 ref={detailHeadingRef} tabIndex={-1} className="text-h3 text-text-primary m-0 outline-offset-4">
                    Report {reportReference(selected.id)}
                  </h2>
                  <p className="text-caption text-text-muted m-0 mt-1">
                    Received {formatDateTime(selected.createdAt)} · Reporter picked{" "}
                    {categoryLabel(selected.category)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {statusChips(selected, trackerLinks)}
                  {triageOf(selected).validity !== "unreviewed" ? (
                    <StatusChip {...VALIDITY[triageOf(selected).validity]} />
                  ) : null}
                  <PriorityButton
                    priority={!!selected.priority}
                    name={`report ${reportReference(selected.id)}`}
                    disabled={saving}
                    onClick={() => void pinSelected()}
                  />
                </div>
              </div>
            </div>

            {/* Keyed by report, so a newly opened report starts at its top. */}
            <div
              key={selected.id}
              role="region"
              aria-label={`Report ${reportReference(selected.id)} text`}
              tabIndex={0}
              className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto overscroll-contain p-4 xl:grid-cols-[minmax(0,1fr)_18rem]"
            >
              <div className="flex min-w-0 flex-col gap-4">
                <p className="text-body text-text-primary m-0 max-w-[72ch] whitespace-pre-wrap break-words">
                  {trackerLinks ? selected.issue : withoutGithubLinks(selected.issue)}
                </p>

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
              </div>

              <div className="flex min-w-0 flex-col gap-6 border-t border-outline pt-4 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-4">
                <AiSuggestion
                  report={selected}
                  reports={reports ?? []}
                  trackerLinks={trackerLinks}
                  disabled={saving}
                  onTriage={(input) => void saveTriage(input)}
                  onOpenReport={openReport}
                />
                <TriageDetails
                  key={selected.id}
                  report={selected}
                  reports={reports ?? []}
                  labelSuggestions={labelSuggestions}
                  disabled={saving}
                  onTriage={(input) => void saveTriage(input)}
                  onOpenReport={openReport}
                />
              </div>
            </div>

            {/* Pinned to the bottom of the panel, however long the report. */}
            <div className="flex shrink-0 flex-col gap-3 border-t border-outline bg-surface p-4">
              <VerdictBar report={selected} disabled={saving} onTriage={(input) => void saveTriage(input)} />
              <div className="flex flex-col gap-1.5 md:flex-row md:items-start md:gap-3">
                <p className="text-caption text-text-secondary m-0 md:w-24 md:shrink-0 md:pt-3.5">Next step</p>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {selected.status === "new" || selected.status === "tracked" ? (
                      <>
                        {trackerLinks ? (
                          <Button
                                                        disabled={saving}
                            onClick={() => {
                              setDialogError(null);
                              setDialog("track");
                            }}
                          >
                            {selected.status === "tracked"
                              ? storedTrackerUrl
                                ? "Change GitHub link"
                                : "Add GitHub link"
                              : "Mark tracked…"}
                          </Button>
                        ) : selected.status === "new" ? (
                          <Button disabled={saving} onClick={() => void mark("tracked")}>
                            Mark tracked
                          </Button>
                        ) : null}
                        <Button
                          variant="primary"
                                                    disabled={saving}
                          onClick={() => {
                            setDialogError(null);
                            setDialog("publish");
                          }}
                        >
                          Mark published…
                        </Button>
                        <Button disabled={saving} onClick={() => void mark("dismissed")}>
                          Dismiss
                        </Button>
                        {selected.status === "tracked" ? (
                          <Button variant="ghost" disabled={saving} onClick={() => moveBack("new")}>
                            Move back to New
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {selected.status === "published" && (storedTrackerUrl || !trackerLinks) ? (
                          <Button disabled={saving} onClick={() => moveBack("tracked")}>
                            Move back to Tracked
                          </Button>
                        ) : null}
                        <Button disabled={saving} onClick={() => moveBack("new")}>
                          Move back to New
                        </Button>
                      </>
                    )}
                  </div>
                  {NEXT_STEP_HELP[selected.status] ? (
                    <p className="text-caption text-text-muted m-0 hidden md:block">{NEXT_STEP_HELP[selected.status]}</p>
                  ) : null}
                </div>
              </div>
              {actionError ? (
                <p role="alert" className="text-caption text-error m-0">
                  {actionError}
                </p>
              ) : null}
            </div>

            {dialog === "publish" ? (
              <PublishDialog
                open
                reference={reportReference(selected.id)}
                busy={saving}
                error={dialogError}
                onCancel={() => setDialog(null)}
                storedDate={trackerLinks ? (selected.publishedIn ?? "") : withoutGithubLinks(selected.publishedIn ?? "")}
                trackerLinks={trackerLinks}
                storedUrl={storedTrackerUrl}
                onPublish={(input) => void mark("published", input)}
              />
            ) : null}
            {dialog === "track" ? (
              <TrackDialog
                open
                reference={reportReference(selected.id)}
                busy={saving}
                error={dialogError}
                onCancel={() => setDialog(null)}
                storedUrl={storedTrackerUrl}
                onTrack={(url) => void mark("tracked", { trackerIssueUrl: url })}
              />
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
