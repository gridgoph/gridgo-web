"use client";

import { ChevronLeft, Undo2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { BulkBar } from "@/components/issue-reports/BulkBar";
import { type BulkOutcome, type BulkWrite } from "@/components/issue-reports/bulk";
import { DeskToolbar } from "@/components/issue-reports/DeskToolbar";
import {
  appendPage,
  hasMoreReports,
  ISSUE_REPORTS_MAX_LIMIT,
  ISSUE_REPORTS_PAGE_SIZE,
  reloadLimit,
  showingLabel,
} from "@/components/issue-reports/paging";
import { ReportRow, ValidityBadge } from "@/components/issue-reports/ReportRow";
import {
  parseTrackerIssueUrl,
  trackerIssueLabel,
  withoutGithubLinks,
} from "@/components/issue-reports/tracker-link";
import {
  acceptSuggestion,
  activeFilters,
  canAcceptSuggestion,
  clearFilters,
  filterQuery,
  knownTotal,
  matchesSearch,
  matchesView,
  reportReference,
  searchFromView,
  statusLabel,
  tabCount,
  triageOf,
  triageSummary,
  VALIDITY,
  VALIDITY_TABS,
  VERDICTS,
  viewFromSearch,
  type DeskView,
  type ValidityTab,
} from "@/components/issue-reports/triage";
import { AiSuggestion, TONE_COLOR, TriageDetails, VerdictBar } from "@/components/issue-reports/TriagePanel";
import { PublishDialog, TrackDialog } from "@/components/issue-reports/WorkflowDialogs";
import { PriorityButton } from "@/components/ui/PriorityButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_ICONS, StatusChip, StatusChipLink } from "@/components/ui/StatusChip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getIssueReport, isApiError, listIssueReports, updateIssueReport } from "@/lib/api/client";
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

/** The category the reporter picked on the website's form. */
export function categoryLabel(category: IssueReportCategory | null): string {
  if (category === "bug") return "Bug, issue or concern";
  if (category === "feature") return "Feature or change request";
  if (category === "other") return "Something else";
  return "No category";
}

const EMPTY: Record<ValidityTab, { title: string; body: string }> = {
  review: {
    title: "Nothing needs review",
    body: "Every report has a verdict. A new report from the website lands here first.",
  },
  valid: { title: "No valid reports", body: "Reports you mark valid land here." },
  duplicate: { title: "No duplicates", body: "Reports you mark as repeating an earlier one land here." },
  spam: { title: "No spam", body: "Reports you mark spam land here, out of the way." },
  all: {
    title: "No reports yet",
    body: "A report appears here as soon as someone sends one from the website's Report an issue page.",
  },
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
 * Every chip a report's status earns: published, dismissed, new, and its
 * tracker issue when it has one and the reader may see it. A published
 * report that was tracked first shows both. `listRow` leaves out New and
 * Dismissed, which the row already says in words.
 */
function statusChips(report: IssueReport, trackerLinks: boolean, listRow = false) {
  const tracker = trackerLinks ? (report.trackerIssueUrl ?? null) : null;
  const chips = [];
  if (report.status === "published") chips.push(<span key="published">{publishedChip(report, trackerLinks)}</span>);
  if (report.status === "dismissed" && !listRow) {
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
  if (report.status === "new" && !listRow) {
    chips.push(
      <span key="new">
        <StatusChip tone="info" icon="clock" label="New" />
      </span>,
    );
  }
  return chips;
}

/** The desk is two panes side by side from this width; below it, one at a time. */
const SIDE_BY_SIDE_QUERY = "(min-width: 1024px)";

function sideBySide(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(SIDE_BY_SIDE_QUERY).matches
    : true;
}

/** Typing in a field, or working in a menu or dialog, never triggers a desk key. */
function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.closest("[role=dialog],[role=alertdialog],[role=listbox],[role=menu]") !== null
  );
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

/** The part of the view the API answers; the search box is the browser's. */
function apiKey(view: DeskView): string {
  return searchFromView({ ...view, q: view.q.trim() ? "1" : "" });
}

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2 md:gap-1">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex gap-2 px-3 py-3">
          <Skeleton className="size-4 shrink-0 rounded-[4px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-3 w-7/12" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
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
 * Super Admin sort them here: tabs by staff verdict (Needs review, Valid,
 * Duplicate, Spam, All) with the AI's separate suggestion on every report,
 * one press to accept it, or many at once from the selection. Each report
 * then moves through tracked, published (with the reports page date) or
 * dismissed. The tab, filters, search and open report live in the URL.
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
 * time (the list, then the report on its own with a way back).
 */
export function IssueReportsDesk({ trackerLinks = false }: { trackerLinks?: boolean } = {}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [view, setView] = useState<DeskView>(() => viewFromSearch(searchParams));
  // A shared link's report, opened once the first page lands.
  const [linkedReport] = useState<string | null>(() => searchParams?.get("report") ?? null);
  const [reports, setReports] = useState<IssueReport[] | null>(null);
  const [counts, setCounts] = useState<IssueReportCounts | null>(null);
  const [triageCounts, setTriageCounts] = useState<IssueReportTriageCounts | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A report opened from a link that is not in this view's list.
  const [peek, setPeek] = useState<IssueReport | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [capped, setCapped] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  // Below 1024px: whether the report pane is showing instead of the list.
  const [detailOpen, setDetailOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"publish" | "track" | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const reportsRef = useRef<IssueReport[]>([]);
  const peekRef = useRef<IssueReport | null>(null);
  const bulkRunningRef = useRef(false);
  // Bumped by every refresh, so a page that lands after it is dropped.
  const generationRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const linkedOpened = useRef(false);
  // Where focus goes after the single pane switches (phone and tablet).
  const focusAfterSwitch = useRef<"detail" | "row" | null>(null);

  useEffect(() => {
    reportsRef.current = reports ?? [];
  }, [reports]);
  useEffect(() => {
    peekRef.current = peek;
  }, [peek]);
  useEffect(() => {
    bulkRunningRef.current = bulkRunning;
  }, [bulkRunning]);

  const searching = view.q.trim().length > 0;
  const key = apiKey(view);
  // Only what the API answers reloads the list; typing in a search does not.
  const apiView = useMemo(() => viewFromSearch(new URLSearchParams(key)), [key]);
  const query = useMemo(() => filterQuery(apiView), [apiView]);
  const statusArg = apiView.status === "any" ? null : apiView.status;

  /** Refetches the view, keeping as many pages as are already loaded. */
  const load = useCallback(
    async (keepId?: string | null) => {
      const generation = ++generationRef.current;
      setError(null);
      setMoreError(null);
      // A search reads everything it can at once, then filters in the browser.
      const requested = searching ? ISSUE_REPORTS_MAX_LIMIT : reloadLimit(reportsRef.current.length);
      const result = await listIssueReports(statusArg, { limit: requested }, query);
      if (generation !== generationRef.current) return;
      reportsRef.current = result.reports;
      setReports(result.reports);
      setCounts(result.counts);
      setTriageCounts(result.triageCounts ?? null);
      const total = knownTotal(apiView, result.counts, result.triageCounts);
      setHasMore(!searching && hasMoreReports(result.reports.length, total, { received: result.reports.length, requested }));
      setCapped(searching && result.reports.length >= requested);
      const ids = new Set(result.reports.map((report) => report.id));
      setSelection((current) => {
        const kept = [...current].filter((id) => ids.has(id));
        return kept.length === current.size ? current : new Set(kept);
      });
      setSelectedId((current) => {
        const preferred = keepId ?? current;
        if (preferred && (ids.has(preferred) || peekRef.current?.id === preferred)) return preferred;
        return result.reports[0]?.id ?? null;
      });
    },
    [statusArg, query, searching, apiView],
  );

  const loadMore = useCallback(async () => {
    const current = reportsRef.current;
    const last = current.at(-1);
    if (!last || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(null);
    const generation = generationRef.current;
    try {
      const result = await listIssueReports(statusArg, { limit: ISSUE_REPORTS_PAGE_SIZE, before: last.id }, query);
      if (generation !== generationRef.current) return;
      const page = appendPage(current, result.reports);
      if (page.ignoredCursor) {
        // An API without `before` paging: ask for a longer first page instead.
        const requested = Math.min(current.length + ISSUE_REPORTS_PAGE_SIZE, ISSUE_REPORTS_MAX_LIMIT);
        const grown = await listIssueReports(statusArg, { limit: requested }, query);
        if (generation !== generationRef.current) return;
        reportsRef.current = grown.reports;
        setReports(grown.reports);
        setCounts(grown.counts);
        setTriageCounts(grown.triageCounts ?? null);
        setHasMore(
          grown.reports.length > current.length &&
            hasMoreReports(grown.reports.length, knownTotal(apiView, grown.counts, grown.triageCounts), {
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
          hasMoreReports(page.reports.length, knownTotal(apiView, result.counts, result.triageCounts), {
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
  }, [statusArg, query, apiView]);

  // A live ping mid-run would reshuffle the rows being saved; the run reloads
  // when it ends.
  const liveLoad = useCallback(() => (bulkRunningRef.current ? undefined : load()), [load]);
  useLiveReload("issue-reports", liveLoad);

  const openPeek = useCallback(async (id: string) => {
    try {
      const found = await getIssueReport(id);
      peekRef.current = found;
      setPeek(found);
      setSelectedId(found.id);
    } catch {
      setError(`Could not open report ${reportReference(id)}. It may have been removed.`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const first = !linkedOpened.current && linkedReport ? linkedReport : undefined;
    void (async () => {
      try {
        await load(first);
        if (cancelled || !first) return;
        linkedOpened.current = true;
        if (!sideBySide()) setDetailOpen(true);
        if (!reportsRef.current.some((report) => report.id === first)) await openPeek(first);
      } catch {
        if (!cancelled) {
          setReports(null);
          setError("Could not load issue reports. Check your connection and try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, linkedReport, openPeek]);

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

  const visible = useMemo(
    () =>
      searching
        ? (reports ?? []).filter((report) =>
            matchesSearch(report, view.q, trackerLinks ? undefined : withoutGithubLinks),
          )
        : (reports ?? []),
    [reports, searching, view.q, trackerLinks],
  );

  const selected = useMemo(() => {
    if (peek && peek.id === selectedId && !visible.some((report) => report.id === peek.id)) return peek;
    return visible.find((report) => report.id === selectedId) ?? visible[0] ?? null;
  }, [visible, selectedId, peek]);
  const outsideView = Boolean(selected && peek && selected === peek);

  // The view and the open report live in the URL, so a reload or a shared
  // link comes back to the same place. Replaced, never pushed: Back leaves.
  useEffect(() => {
    if (typeof window === "undefined" || loading) return;
    const next = `${pathname ?? window.location.pathname}${searchFromView(view, selected?.id ?? null)}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [view, selected?.id, pathname, loading]);

  // Keep the open report's row in view, in the list's own scroll area.
  useEffect(() => {
    if (!selected || detailOpen) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-report-id="${selected.id}"]`);
    row?.scrollIntoView?.({ block: "nearest" });
  }, [selected, detailOpen]);

  // The single pane moved focus out of view; put it where the reader now is.
  useEffect(() => {
    const target = focusAfterSwitch.current;
    if (!target) return;
    focusAfterSwitch.current = null;
    if (target === "detail") detailHeadingRef.current?.focus();
    else listRef.current?.querySelector<HTMLButtonElement>(`[data-report-id="${selectedId}"] [data-open-report]`)?.focus();
  }, [detailOpen, selectedId]);

  const storedTrackerUrl = trackerLinks ? (selected?.trackerIssueUrl ?? null) : null;
  // A different report clears the last report's refusal.
  const [errorFor, setErrorFor] = useState<string | null>(null);
  if ((selected?.id ?? null) !== errorFor) {
    setErrorFor(selected?.id ?? null);
    setActionError(null);
  }

  const busy = saving || bulkRunning;

  function reportHref(id: string): string {
    return `${pathname ?? ""}${searchFromView(clearFilters({ ...view, tab: "all" }), id)}`;
  }

  function changeView(next: DeskView) {
    if (bulkRunning) return;
    setSelection(new Set());
    setAnchor(null);
    setUndo(null);
    if (apiKey(next) !== apiKey(view)) {
      generationRef.current += 1;
      reportsRef.current = [];
      setReports(null);
      setHasMore(false);
      setSelectedId(null);
      setPeek(null);
      setDetailOpen(false);
    }
    setView(next);
  }

  function openReport(id: string) {
    if (reportsRef.current.some((report) => report.id === id)) {
      setSelectedId(id);
    } else {
      void openPeek(id);
    }
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
    if (!visible.length || typingIn(event.target)) return;
    const index = visible.findIndex((report) => report.id === selected?.id);
    let next: number;
    if (event.key === "ArrowDown") next = Math.min(visible.length - 1, index + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = visible.length - 1;
    else return;
    event.preventDefault();
    const id = visible[next].id;
    setSelectedId(id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-report-id="${id}"] [data-open-report]`)?.focus();
  }

  function toggleChecked(id: string, checked: boolean, range: boolean) {
    setSelection((current) => {
      const next = new Set(current);
      const from = range && anchor ? visible.findIndex((report) => report.id === anchor) : -1;
      const to = visible.findIndex((report) => report.id === id);
      const ids =
        from >= 0 && to >= 0
          ? visible.slice(Math.min(from, to), Math.max(from, to) + 1).map((report) => report.id)
          : [id];
      for (const each of ids) {
        if (checked) next.add(each);
        else next.delete(each);
      }
      return next;
    });
    setAnchor(id);
  }

  /** Puts the API's copy of a report in place, in the list or the peek. */
  function replaceReport(updated: IssueReport) {
    const next = reportsRef.current.map((report) => (report.id === updated.id ? updated : report));
    reportsRef.current = next;
    setReports(next);
    if (peekRef.current?.id === updated.id) {
      peekRef.current = updated;
      setPeek(updated);
    }
  }

  /**
   * Reloads after a change to `target`. When the open report left this view
   * it hands over to the report below it, so the desk works down the list
   * instead of jumping back to the top. A change to another row (its own
   * Accept) keeps the open report where it is.
   */
  async function reloadAfter(target: IssueReport, stays: boolean) {
    if (target.id !== selected?.id) {
      await load(selected?.id ?? null);
      return;
    }
    const list = visible;
    const index = list.findIndex((report) => report.id === target.id);
    const neighbour = list[index + 1] ?? list[index - 1] ?? null;
    await load(stays ? target.id : (neighbour?.id ?? null));
    if (!stays && !sideBySide()) backToList();
  }

  async function mark(
    next: IssueReportStatus,
    extra: { publishedIn?: string | null; trackerIssueUrl?: string | null } = {},
  ) {
    if (!selected || busy) return;
    const target = selected;
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
      const updated = await updateIssueReport(target.id, input);
      setDialog(null);
      if (outsideView) replaceReport(updated);
      await reloadAfter(target, outsideView || matchesView(updated ?? { ...target, status: next }, view));
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
    if (!target || busy) return;
    const before = triageOf(target);
    const peeked = outsideView && target.id === selected?.id;
    setSaving(true);
    setActionError(null);
    try {
      const updated = await updateIssueReport(target.id, { triage: input });
      const stays = peeked || matchesView(updated, view);
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
      replaceReport(updated);
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

  function acceptFor(report: IssueReport) {
    if (!report.aiReview || !canAcceptSuggestion(report)) return;
    void saveTriage(acceptSuggestion(report.aiReview, triageOf(report)), report);
  }

  async function undoVerdict() {
    if (!undo || busy) return;
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
    if (!selected || busy) return;
    const generation = generationRef.current;
    const target = selected;
    setSaving(true);
    setActionError(null);
    try {
      const updated = await updateIssueReport(target.id, { priority: !target.priority });
      if (generation !== generationRef.current) return;
      if (peekRef.current?.id === updated.id) {
        peekRef.current = updated;
        setPeek(updated);
      }
      const next = reportsRef.current
        .map((report) => (report.id === updated.id ? updated : report))
        .filter((report) => !view.priority || report.priority);
      reportsRef.current = next;
      setReports(next);
      setCounts((current) =>
        current
          ? {
              ...current,
              priorities: Math.max(0, (current.priorities ?? 0) + (updated.priority ? 1 : -1)),
            }
          : current,
      );
      if (!next.some((report) => report.id === target.id) && !outsideView) setSelectedId(next[0]?.id ?? null);
      if (view.priority && !updated.priority) {
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

  function bulkFinished(outcome: BulkOutcome) {
    setUndo(null);
    setSelection(new Set([...outcome.failed.map((entry) => entry.report.id), ...outcome.untouched.map((report) => report.id)]));
    void load(selected?.id ?? null).catch(() => setError("Saved, but the list could not refresh. Press Refresh."));
  }

  const bulkWrite = useCallback((id: string, write: BulkWrite) => updateIssueReport(id, write), []);

  // V, S and D give the open report its verdict, A accepts its suggestion and
  // X selects it, unless someone is typing.
  function onDeskKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!selected || busy || dialog || event.altKey || event.ctrlKey || event.metaKey || typingIn(event.target)) {
      return;
    }
    const pressed = event.key.toLowerCase();
    if (pressed === "a" && canAcceptSuggestion(selected)) {
      event.preventDefault();
      acceptFor(selected);
      return;
    }
    if (pressed === "x" && !outsideView) {
      event.preventDefault();
      toggleChecked(selected.id, !selection.has(selected.id), false);
      return;
    }
    const verdict = VERDICTS.find((entry) => entry.key === pressed);
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
  const filtered = activeFilters(view).length > 0;
  const total = knownTotal(apiView, counts, triageCounts);
  const labelSuggestions = (triageCounts?.labels ?? []).map((entry) => entry.label);
  const selectedReports = visible.filter((report) => selection.has(report.id));
  const allChecked = visible.length > 0 && selectedReports.length === visible.length;
  const tabLabel = VALIDITY_TABS.find((entry) => entry.value === view.tab)!.label;
  const countLine = searching
    ? `${visible.length === 1 ? "1 match" : `${visible.length} matches`}${capped ? ` in the newest ${reports?.length ?? 0}` : ""}`
    : showingLabel(reports?.length ?? 0, total);
  const acceptShown = selected ? canAcceptSuggestion(selected) : false;

  return (
    <Tabs
      value={view.tab}
      onValueChange={(value) => changeView({ ...view, tab: value as ValidityTab })}
      onKeyDown={onDeskKeyDown}
      className="h-[calc(100dvh-5rem)] min-h-[32rem] gap-3"
    >
      <div className={cn("flex shrink-0 flex-col gap-3", detailOpen && "hidden lg:flex")}>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
          <TabsList
            aria-label="Reports by verdict"
            className="grid h-auto w-full grid-cols-5 group-data-horizontal/tabs:h-auto md:inline-flex md:w-fit"
          >
            {VALIDITY_TABS.map((tab) => {
              const count = tabCount(tab.value, triageCounts);
              const validity = tab.validity ? VALIDITY[tab.validity] : null;
              const Icon = validity ? STATUS_ICONS[validity.icon] : null;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  disabled={bulkRunning}
                  aria-label={typeof count === "number" ? `${tab.label}, ${count}` : tab.label}
                  className="h-auto min-h-11 flex-col gap-0 px-1 md:flex-row md:gap-1.5 md:px-3"
                >
                  {validity && Icon ? (
                    <Icon aria-hidden className="hidden md:block" style={{ color: TONE_COLOR[validity.tone] }} />
                  ) : null}
                  <span className="text-[12px] leading-4 md:hidden">{tab.short}</span>
                  <span className="hidden md:inline">{tab.label}</span>
                  <span className="min-w-[2ch] text-[12px] leading-4 tabular-nums opacity-80 md:text-[13px]">
                    {typeof count === "number" ? count : "–"}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          <p className="text-caption text-text-muted m-0" aria-live="polite">
            {triageCounts ? triageSummary(triageCounts) : " "}
          </p>
        </div>
        <DeskToolbar
          view={view}
          counts={counts}
          triageCounts={triageCounts}
          busy={busy || loading}
          onChange={changeView}
          onRefresh={() => void load().catch(() => setError("Could not refresh."))}
        />
      </div>

      <TabsContent
        value={view.tab}
        className="grid min-h-0 gap-3 lg:grid-cols-[26rem_minmax(0,1fr)] lg:gap-4 xl:grid-cols-[28rem_minmax(0,1fr)]"
      >
        <aside
          aria-label="Report list"
          className={cn("gg-card-flush min-h-0 min-w-0 flex-col", detailOpen ? "hidden lg:flex" : "flex")}
        >
          <h2 className="sr-only">{tabLabel} reports</h2>
          <div className="flex min-h-11 shrink-0 items-center gap-1 border-b border-outline pr-3 pl-1 md:pl-0">
            <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
              <Checkbox
                checked={allChecked}
                indeterminate={selectedReports.length > 0 && !allChecked}
                disabled={!visible.length || bulkRunning}
                aria-label={allChecked ? "Clear the selection" : `Select all ${visible.length} shown`}
                onCheckedChange={(checked) => {
                  setSelection(checked ? new Set(visible.map((report) => report.id)) : new Set());
                  setAnchor(null);
                }}
              />
            </label>
            <span className="text-caption text-text-secondary min-w-0 flex-1 truncate" aria-live="polite">
              {initialLoad ? "Loading reports…" : countLine}
            </span>
            <span className="text-caption text-text-muted hidden xl:inline" aria-hidden>
              ↑↓ move · V S D A verdict · X select
            </span>
          </div>

          {undo ? (
            <div
              role="status"
              className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-outline px-4 py-1"
            >
              <span className="text-caption text-text-secondary">
                Report {reportReference(undo.id)} marked {VALIDITY[undo.validity].label.toLowerCase()} and moved out of
                this view.
              </span>
              <Button variant="ghost" size="xs" disabled={busy} onClick={() => void undoVerdict()}>
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
            ) : !visible.length ? (
              filtered ? (
                <EmptyState
                  title="Nothing matches"
                  body={`No ${tabLabel.toLowerCase()} reports match ${searching ? "this search and these filters" : "these filters"}.`}
                  className="border-0"
                  action={<Button onClick={() => changeView(clearFilters(view))}>Clear all filters</Button>}
                />
              ) : (
                <EmptyState title={EMPTY[view.tab].title} body={EMPTY[view.tab].body} className="border-0" />
              )
            ) : (
              <>
                <div role="list" aria-label="Issue reports" className="flex flex-col gap-2 md:gap-0.5">
                  {visible.map((report) => (
                    <ReportRow
                      key={report.id}
                      report={report}
                      active={report.id === selected?.id}
                      checked={selection.has(report.id)}
                      trackerLinks={trackerLinks}
                      disabled={busy}
                      statusChips={statusChips(report, trackerLinks, true)}
                      onOpen={openReport}
                      onCheck={toggleChecked}
                      onAccept={acceptFor}
                    />
                  ))}
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
                  ) : capped ? (
                    <p className="text-caption text-text-muted m-0 text-center">
                      Search looks through the newest {reports?.length ?? 0} reports in this view. Narrow it with a
                      filter to reach older ones.
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>

          <BulkBar
            selected={selectedReports}
            reports={reports ?? []}
            disabled={saving}
            write={bulkWrite}
            onSaved={replaceReport}
            onRunningChange={setBulkRunning}
            onFinished={bulkFinished}
            onClear={() => setSelection(new Set())}
          />
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
                title={visible.length ? "Pick a report" : "Nothing to open"}
                body={
                  visible.length
                    ? "The full text, screenshots, suggestion and your sorting open here."
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
                    <ValidityBadge report={selected} />
                    {statusChips(selected, trackerLinks)}
                    <PriorityButton
                      priority={!!selected.priority}
                      name={`report ${reportReference(selected.id)}`}
                      disabled={busy}
                      onClick={() => void pinSelected()}
                    />
                  </div>
                </div>
                {outsideView ? (
                  <p role="note" className="text-caption text-text-secondary m-0">
                    Opened from a link. This report is not in this view: it is{" "}
                    {VALIDITY[triageOf(selected).validity].label.toLowerCase()} and {statusLabel(selected.status).toLowerCase()}.
                  </p>
                ) : null}
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
                  <AiSuggestion
                    report={selected}
                    trackerLinks={trackerLinks}
                    reportHref={reportHref}
                    onOpenReport={openReport}
                  />
                  <p className="text-body text-text-primary m-0 max-w-[72ch] whitespace-pre-wrap break-words">
                    {trackerLinks ? selected.issue : withoutGithubLinks(selected.issue)}
                  </p>

                  {selected.screenshots.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <h3 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                        Screenshots
                      </h3>
                      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3">
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
                        Open a screenshot to see it full size. Links expire after a few minutes; press Refresh for new
                        ones.
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="flex min-w-0 flex-col gap-6 border-t border-outline pt-4 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-4">
                  <TriageDetails
                    key={selected.id}
                    report={selected}
                    reports={reports ?? []}
                    labelSuggestions={labelSuggestions}
                    disabled={busy}
                    onTriage={(input) => void saveTriage(input)}
                    reportHref={reportHref}
                    onOpenReport={openReport}
                  />
                </div>
              </div>

              {/* Pinned to the bottom of the panel, however long the report. */}
              <div className="flex shrink-0 flex-col gap-3 border-t border-outline bg-surface p-4">
                <VerdictBar report={selected} disabled={busy} onTriage={(input) => void saveTriage(input)} />
                <div className="flex flex-col gap-1.5 md:flex-row md:items-start md:gap-3">
                  <p className="text-caption text-text-secondary m-0 md:w-24 md:shrink-0 md:pt-3.5">Next step</p>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {selected.status === "new" || selected.status === "tracked" ? (
                        <>
                          {trackerLinks ? (
                            <Button
                              disabled={busy}
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
                            <Button disabled={busy} onClick={() => void mark("tracked")}>
                              Mark tracked
                            </Button>
                          ) : null}
                          {/* The panel's one yellow button is Accept suggestion while it shows. */}
                          <Button
                            variant={acceptShown ? "outline" : "primary"}
                            disabled={busy}
                            onClick={() => {
                              setDialogError(null);
                              setDialog("publish");
                            }}
                          >
                            Mark published…
                          </Button>
                          <Button disabled={busy} onClick={() => void mark("dismissed")}>
                            Dismiss
                          </Button>
                          {selected.status === "tracked" ? (
                            <Button variant="ghost" disabled={busy} onClick={() => moveBack("new")}>
                              Move back to New
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {selected.status === "published" && (storedTrackerUrl || !trackerLinks) ? (
                            <Button disabled={busy} onClick={() => moveBack("tracked")}>
                              Move back to Tracked
                            </Button>
                          ) : null}
                          <Button disabled={busy} onClick={() => moveBack("new")}>
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
      </TabsContent>
    </Tabs>
  );
}
