"use client";

import { ExternalLink, MessageSquareText, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  filterByDeveloperAndQuery,
  filterTrackerItems,
  groupBySection,
  isTrackerNotConfigured,
  NO_TRACKER_FILTERS,
  statusCounts,
  TRACKER_STATUSES,
  trackerDevelopers,
  trackerErrorMessage,
  trackerItemName,
  type TrackerFilters,
  type TrackerSectionGroup,
} from "@/app/admin/_lib/tracker";
import { DecisionPanel } from "@/app/admin/tracker/_components/DecisionPanel";
import { TrackerStatusSelect } from "@/app/admin/tracker/_components/TrackerStatusSelect";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusMark } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { getTracker } from "@/lib/api/client";
import type { TrackerBoard, TrackerItem, TrackerStatus } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import type { StatusTone } from "@/lib/order-state";
import { cn } from "@/lib/utils";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "not-configured" }
  | { kind: "error"; message: string };

/** Bar fill per tone. Tokens only; the legend below carries icon + label. */
const TONE_FILL: Record<StatusTone, string> = {
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  error: "bg-error",
  neutral: "bg-text-muted",
};

/** "gridgo-web" → "web": the repo is already on the section's product. */
function shortRepo(repo: string): string {
  return repo.replace(/^gridgo-/, "");
}

/**
 * The captain's sheet, read live from the GitHub issues labelled `tracker`.
 * Every column is read-only except Status; a Needs decision item opens the
 * Decision panel.
 */
export function TrackerDesk() {
  const [board, setBoard] = useState<TrackerBoard | null>(null);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TrackerFilters>(NO_TRACKER_FILTERS);
  const [panelKey, setPanelKey] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const load = useCallback(async (refresh = false) => {
    try {
      const result = await getTracker({ refresh });
      setBoard(result);
      setState({ kind: "ready" });
      setRefreshError(null);
    } catch (err) {
      if (isTrackerNotConfigured(err)) {
        setBoard(null);
        setState({ kind: "not-configured" });
        return;
      }
      setState((current) =>
        current.kind === "ready" ? current : { kind: "error", message: trackerErrorMessage(err, "load") },
      );
      setRefreshError(trackerErrorMessage(err, "load"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }

  const replaceItem = useCallback((updated: TrackerItem) => {
    setBoard((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => (item.key === updated.key ? updated : item)),
          }
        : current,
    );
  }, []);

  const items = useMemo(() => board?.items ?? [], [board]);
  const narrowed = useMemo(() => filterByDeveloperAndQuery(items, filters), [items, filters]);
  const counts = useMemo(() => statusCounts(narrowed), [narrowed]);
  const totals = useMemo(() => statusCounts(items), [items]);
  const visible = useMemo(() => filterTrackerItems(items, filters), [items, filters]);
  const sections = useMemo(() => groupBySection(visible), [visible]);
  const developers = useMemo(() => {
    const found = trackerDevelopers(items);
    return found.length ? found : ["Mark", "Ven"];
  }, [items]);
  const panelItem = panelKey ? (items.find((item) => item.key === panelKey) ?? null) : null;
  const filtered =
    filters.status !== "all" || filters.developer !== "all" || filters.query.trim() !== "";

  if (state.kind === "loading") return <LoadingBlock label="Reading the tracker from GitHub…" />;

  if (state.kind === "not-configured") {
    return (
      <EmptyState
        title="Tracker is not connected yet"
        body="The API does not have its GitHub access yet, so it cannot read the tracker issues. Once the token is set on the server, the sheet appears here. Nothing else in the dashboard is affected."
        action={
          <Button disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw aria-hidden />
            {refreshing ? "Checking…" : "Check again"}
          </Button>
        }
        className="max-w-2xl"
      />
    );
  }

  if (state.kind === "error") {
    return (
      <ErrorState
        title="The tracker did not load"
        body={state.message}
        action={
          <Button disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? "Trying…" : "Try again"}
          </Button>
        }
      />
    );
  }

  const total = items.length;
  const waiting = totals["needs-decision"];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section aria-labelledby="tracker-summary" className="gg-card flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="tracker-summary" className="text-h3 text-text-primary m-0">
              {totals.live} of {total} live on production
            </h2>
            <p className="text-body text-text-secondary m-0">
              {waiting === 0
                ? "Nothing is waiting on your decision."
                : `${waiting} ${waiting === 1 ? "item waits" : "items wait"} on your decision.`}{" "}
              Only the status changes here; everything else comes from the GitHub issues.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button size="sm" disabled={refreshing} onClick={() => void refresh()}>
              <RefreshCw aria-hidden className={cn(refreshing && "motion-safe:animate-spin")} />
              {refreshing ? "Reading GitHub…" : "Refresh from GitHub"}
            </Button>
            {board ? (
              <span className="text-caption text-text-muted">
                Read {formatDateTime(board.fetchedAt)}
              </span>
            ) : null}
          </div>
        </div>

        {total > 0 ? (
          <div
            aria-hidden
            className="flex h-2 w-full gap-0.5 overflow-hidden rounded-[var(--radius-pill)]"
          >
            {TRACKER_STATUSES.filter((meta) => totals[meta.value] > 0).map((meta) => (
              <span
                key={meta.value}
                className={cn("h-full", TONE_FILL[meta.tone], meta.value === "in-review" && "opacity-60")}
                style={{ flexGrow: totals[meta.value], flexBasis: 0 }}
              />
            ))}
          </div>
        ) : null}

        <ToggleGroup
          value={[filters.status]}
          onValueChange={(values) => {
            const next = values[0] as TrackerStatus | "all" | undefined;
            setFilters((current) => ({ ...current, status: next ?? "all" }));
          }}
          variant="outline"
          spacing={0}
          aria-label="Filter by status"
          className="flex flex-wrap gap-1.5"
        >
          <ToggleGroupItem value="all" aria-label={`All statuses, ${narrowed.length}`}>
            All <span className="tabular-nums text-text-muted">{narrowed.length}</span>
          </ToggleGroupItem>
          {TRACKER_STATUSES.map((meta) => (
            <ToggleGroupItem
              key={meta.value}
              value={meta.value}
              aria-label={`${meta.label}, ${counts[meta.value]}`}
            >
              <StatusMark tone={meta.tone} icon={meta.icon} label={meta.label} />
              <span className="tabular-nums text-text-muted">{counts[meta.value]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Select
            value={filters.developer}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                developer: typeof value === "string" ? value : "all",
              }))
            }
          >
            <SelectTrigger aria-label="Filter by developer" className="min-h-11 w-full bg-card md:w-52">
              <SelectValue>
                {filters.developer === "all" ? "Every developer" : filters.developer}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value="all" className="min-h-11">
                  Every developer
                </SelectItem>
                {developers.map((name) => (
                  <SelectItem key={name} value={name} className="min-h-11">
                    {name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Search the tracker</span>
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
            />
            <Input
              type="search"
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              placeholder="Search ID, requirement, module or category"
              className="h-11 pl-9"
            />
          </label>
          {filtered ? (
            <Button variant="ghost" onClick={() => setFilters(NO_TRACKER_FILTERS)}>
              Clear filters
            </Button>
          ) : null}
        </div>

        {refreshError ? (
          <p role="alert" className="text-caption text-error m-0">
            {refreshError} The sheet below is from the last good read.
          </p>
        ) : null}
      </section>

      {total === 0 ? (
        <EmptyState
          title="No tracker issues yet"
          body="Label a GitHub issue `tracker` in one of the five GRIDGO repositories and it appears here after the next refresh."
        />
      ) : sections.length === 0 ? (
        <EmptyState
          title="Nothing matches these filters"
          body="No item has that status, developer and search together."
          action={<Button onClick={() => setFilters(NO_TRACKER_FILTERS)}>Clear filters</Button>}
        />
      ) : (
        sections.map((section) => (
          <TrackerSection
            key={section.key}
            section={section}
            isMobile={isMobile}
            onChanged={replaceItem}
            onOpenDecision={setPanelKey}
          />
        ))
      )}

      <DecisionPanel
        item={panelItem}
        open={panelKey !== null}
        onOpenChange={(open) => {
          if (!open) setPanelKey(null);
        }}
        onSaved={replaceItem}
      />
    </div>
  );
}

function TrackerSection({
  section,
  isMobile,
  onChanged,
  onOpenDecision,
}: {
  section: TrackerSectionGroup;
  isMobile: boolean;
  onChanged: (item: TrackerItem) => void;
  onOpenDecision: (key: string) => void;
}) {
  const headingId = `section-${section.key}`;
  const waiting = section.items.filter((item) => item.status === "needs-decision").length;

  return (
    <section aria-labelledby={headingId} className="gg-card-flush min-w-0">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-muted px-4 py-3">
        <h2
          id={headingId}
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-bold)", letterSpacing: "0.02em" }}
        >
          {section.title}
        </h2>
        <p className="text-caption text-text-secondary m-0">
          {section.items.length} {section.items.length === 1 ? "item" : "items"}
          {waiting ? `, ${waiting} ${waiting === 1 ? "needs" : "need"} a decision` : ""}
        </p>
      </header>

      {isMobile ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {section.items.map((item) => (
            <li key={item.key} className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <span className="text-caption text-text-muted tabular-nums">ID {item.ref}</span>
                <GitHubLink item={item} />
              </div>
              <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                {item.requirement}
              </p>
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt className="text-caption text-text-muted">Module / Step</dt>
                <dd className="text-caption text-text-secondary m-0">{item.module}</dd>
                <dt className="text-caption text-text-muted">Developer</dt>
                <dd className="text-caption text-text-secondary m-0">{item.developer || "—"}</dd>
                <dt className="text-caption text-text-muted">Category</dt>
                <dd className="text-caption text-text-secondary m-0">{item.category}</dd>
              </dl>
              <TrackerStatusSelect item={item} onChanged={onChanged} />
              <DecisionButton item={item} onOpen={onOpenDecision} fullWidth />
            </li>
          ))}
        </ul>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[56rem] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-16" />
              <col className="w-40" />
              <col className="w-24" />
              <col />
              <col className="w-40" />
              <col className="w-56" />
              <col className="w-24" />
            </colgroup>
            <thead>
              <tr className="border-b border-border">
                {[
                  "ID",
                  "Module / Step",
                  "Developer",
                  "Requirement / Issue Description",
                  "Category",
                  "Status",
                  "GitHub",
                ].map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="text-caption text-text-muted px-3 py-2 align-bottom first:pl-4 last:pr-4"
                    style={{ fontFamily: "var(--font-medium)" }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.items.map((item) => (
                <tr key={item.key} className="border-b border-border align-top last:border-b-0">
                  <td className="text-body text-text-secondary px-3 py-3 pl-4 tabular-nums">{item.ref}</td>
                  <td className="text-body text-text-secondary px-3 py-3 break-words">{item.module}</td>
                  <td className="text-body text-text-secondary px-3 py-3">{item.developer || "—"}</td>
                  <td className="text-body text-text-primary px-3 py-3 break-words">{item.requirement}</td>
                  <td className="text-caption text-text-secondary px-3 py-3 break-words">{item.category}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1.5">
                      <TrackerStatusSelect item={item} onChanged={onChanged} />
                      <DecisionButton item={item} onOpen={onOpenDecision} />
                    </div>
                  </td>
                  <td className="px-3 py-2 pr-4">
                    <GitHubLink item={item} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GitHubLink({ item }: { item: TrackerItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${item.key} on GitHub`}
      className="text-caption text-text-secondary inline-flex min-h-11 items-center gap-1 whitespace-nowrap underline underline-offset-4 hover:text-text-primary"
    >
      {shortRepo(item.repo)} #{item.number}
      <ExternalLink size={12} aria-hidden />
    </a>
  );
}

/**
 * Needs decision: the way in to decide. Otherwise, only when there is history
 * to read. Outline, never yellow — this is a dense queue.
 */
function DecisionButton({
  item,
  onOpen,
  fullWidth = false,
}: {
  item: TrackerItem;
  onOpen: (key: string) => void;
  fullWidth?: boolean;
}) {
  const count = item.decisions.length;
  if (item.status === "needs-decision") {
    return (
      <Button
        size="sm"
        fullWidth={fullWidth}
        onClick={() => onOpen(item.key)}
        aria-label={`Decide ${trackerItemName(item)}`}
        className="justify-start"
      >
        <MessageSquareText aria-hidden />
        Decide
      </Button>
    );
  }
  if (!count) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      fullWidth={fullWidth}
      onClick={() => onOpen(item.key)}
      aria-label={`Past decisions for ${trackerItemName(item)}, ${count}`}
      className="justify-start"
    >
      {count === 1 ? "1 decision" : `${count} decisions`}
    </Button>
  );
}
