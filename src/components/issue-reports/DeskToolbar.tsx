"use client";

import { Pin, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  activeFilters,
  AI_CHOICES,
  categoryFilterLabel,
  clearFilters,
  RECEIVED_CHOICES,
  STATUS_CHOICES,
  TRIAGE_CATEGORIES,
  triageCategoryLabel,
  withoutFilter,
  type AiFilter,
  type DeskView,
  type ReceivedWindow,
  type StatusFilter,
} from "@/components/issue-reports/triage";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import type { IssueReportCounts, IssueReportTriageCategory, IssueReportTriageCounts } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** How long typing pauses before the search applies. */
const SEARCH_DELAY_MS = 250;

type Props = {
  view: DeskView;
  counts: IssueReportCounts | null;
  triageCounts: IssueReportTriageCounts | null;
  busy: boolean;
  onChange: (next: DeskView) => void;
  onRefresh: () => void;
};

function countSuffix(count: number | undefined): string {
  return typeof count === "number" ? ` (${count})` : "";
}

/**
 * The filter selects, in a row on a tablet or desktop and stacked with
 * visible labels in the phone's Filters sheet. `idPrefix` keeps the two
 * copies' ids apart.
 */
function FilterControls({
  view,
  counts,
  triageCounts,
  onChange,
  stacked,
}: Omit<Props, "busy" | "onRefresh"> & { stacked: boolean }) {
  const labels = triageCounts?.labels ?? [];
  const labelChoices =
    view.label && !labels.some((entry) => entry.label === view.label) ? [{ label: view.label, count: 0 }, ...labels] : labels;
  const idPrefix = stacked ? "sheet" : "bar";
  const trigger = cn("h-11", stacked ? "w-full" : "w-auto min-w-[9.5rem] max-w-[14rem]");

  const controls = [
    {
      id: "status",
      label: "Status",
      node: (
        <Select
          value={view.status}
          onValueChange={(value) => {
            if (typeof value === "string") onChange({ ...view, status: value as StatusFilter });
          }}
        >
          <SelectTrigger id={`${idPrefix}-status`} className={trigger} aria-label="Status">
            <SelectValue>
              {view.status === "any" ? "Any status" : STATUS_CHOICES.find((choice) => choice.value === view.status)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="any">Any status</SelectItem>
              {STATUS_CHOICES.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {`${choice.label}${countSuffix(counts?.[choice.value])}`}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "category",
      label: "Category",
      node: (
        <Select
          value={view.category}
          onValueChange={(value) => {
            if (typeof value === "string") onChange({ ...view, category: value as IssueReportTriageCategory | "none" | "any" });
          }}
        >
          <SelectTrigger id={`${idPrefix}-category`} className={trigger} aria-label="Category">
            <SelectValue>{categoryFilterLabel(view.category)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="any">Any category</SelectItem>
              {TRIAGE_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {triageCategoryLabel(category)}
                </SelectItem>
              ))}
              <SelectItem value="none">No category yet</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "label",
      label: "Label",
      node: (
        <Select
          value={view.label ?? "any"}
          onValueChange={(value) => {
            if (typeof value === "string") onChange({ ...view, label: value === "any" ? null : value });
          }}
        >
          <SelectTrigger id={`${idPrefix}-label`} className={trigger} aria-label="Label">
            <SelectValue>{view.label ? `Label: ${view.label}` : "Any label"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="any">Any label</SelectItem>
              {labelChoices.map((entry) => (
                <SelectItem key={entry.label} value={entry.label}>
                  {entry.count ? `${entry.label} (${entry.count})` : entry.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "received",
      label: "Received",
      node: (
        <Select
          value={view.received}
          onValueChange={(value) => {
            if (typeof value === "string") onChange({ ...view, received: value as ReceivedWindow });
          }}
        >
          <SelectTrigger id={`${idPrefix}-received`} className={trigger} aria-label="Received">
            <SelectValue>{RECEIVED_CHOICES.find((choice) => choice.value === view.received)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {RECEIVED_CHOICES.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "ai",
      label: "Suggestion",
      node: (
        <Select
          value={view.ai}
          onValueChange={(value) => {
            if (typeof value === "string") onChange({ ...view, ai: value as AiFilter });
          }}
        >
          <SelectTrigger id={`${idPrefix}-ai`} className={trigger} aria-label="Suggestion">
            <SelectValue>{AI_CHOICES.find((choice) => choice.value === view.ai)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {AI_CHOICES.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ),
    },
  ];

  const pinned = typeof counts?.priorities === "number" ? ` · ${counts.priorities}` : "";

  if (stacked) {
    return (
      <FieldGroup className="gap-4">
        {controls.map((control) => (
          <Field key={control.id} className="gap-1">
            <FieldLabel htmlFor={`sheet-${control.id}`}>
              <span className="text-caption text-text-secondary">{control.label}</span>
            </FieldLabel>
            {control.node}
          </Field>
        ))}
        <Field orientation="horizontal" className="min-h-11 items-center justify-between gap-3">
          <FieldLabel htmlFor="sheet-priority">
            <span className="text-body text-text-primary">Priority only{pinned}</span>
          </FieldLabel>
          <Switch
            id="sheet-priority"
            checked={view.priority}
            onCheckedChange={(checked) => onChange({ ...view, priority: checked })}
          />
        </Field>
      </FieldGroup>
    );
  }

  return (
    <>
      {controls.map((control) => (
        <span key={control.id} className="contents">
          {control.node}
        </span>
      ))}
      <Toggle
        variant="outline"
        pressed={view.priority}
        onPressedChange={(pressed) => onChange({ ...view, priority: pressed })}
        aria-label={`Priority only${pinned ? `, ${counts?.priorities} pinned` : ""}`}
        className="h-11 px-3"
      >
        <Pin aria-hidden />
        <span>Priority{pinned}</span>
      </Toggle>
    </>
  );
}

/**
 * One toolbar for the desk: search, then status, category, label, received
 * date, suggestion and priority. On a phone the filters move into a sheet
 * behind one Filters button. Every filter in force shows below as a chip
 * that removes it, with Clear all.
 */
export function DeskToolbar({ view, counts, triageCounts, busy, onChange, onRefresh }: Props) {
  const [draft, setDraft] = useState(view.q);
  const [applied, setApplied] = useState(view.q);
  const [sheetOpen, setSheetOpen] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The search lands after a pause; by then another filter may have moved.
  const latest = useRef(view);
  const chips = activeFilters(view);
  const sheetCount = chips.filter((chip) => chip.key !== "q").length;

  // A chip or Clear all can empty the search; the box follows, but never
  // overwrites what is being typed with the search it just applied.
  const [syncedQ, setSyncedQ] = useState(view.q);
  if (view.q !== syncedQ) {
    setSyncedQ(view.q);
    if (view.q !== applied) setDraft(view.q);
  }

  useEffect(() => {
    latest.current = view;
  }, [view]);

  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);

  function search(next: string, now = false) {
    setDraft(next);
    if (pending.current) clearTimeout(pending.current);
    const apply = () => {
      pending.current = null;
      const current = latest.current;
      if (next.trim() === current.q.trim()) return;
      setApplied(next);
      onChange({ ...current, q: next });
    };
    if (now) apply();
    else pending.current = setTimeout(apply, SEARCH_DELAY_MS);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="relative min-w-0 flex-1 basis-56"
          onSubmit={(event) => {
            event.preventDefault();
            search(draft, true);
          }}
        >
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
          />
          <Input
            type="search"
            value={draft}
            onChange={(event) => search(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && draft) {
                event.preventDefault();
                search("", true);
              }
            }}
            placeholder="Search text, reference or label"
            aria-label="Search reports"
            maxLength={200}
            autoComplete="off"
            className="h-11 pr-11 pl-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {draft ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Clear search"
              className="absolute top-0 right-0"
              onClick={() => search("", true)}
            >
              <X aria-hidden />
            </Button>
          ) : null}
        </form>

        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <FilterControls view={view} counts={counts} triageCounts={triageCounts} onChange={onChange} stacked={false} />
        </div>

        <Button className="md:hidden" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
          <SlidersHorizontal data-icon="inline-start" aria-hidden />
          {sheetCount ? `Filters (${sheetCount})` : "Filters"}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Refresh reports" disabled={busy} onClick={onRefresh}>
          <RefreshCw aria-hidden />
        </Button>
      </div>

      {chips.length ? (
        <ul aria-label="Filters in use" className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
          {chips.map((chip) => (
            <li key={chip.key} className="inline-flex items-center rounded-[var(--radius-pill)] border border-outline pl-3">
              <span className="text-caption text-text-primary max-w-[16rem] truncate">{chip.label}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="rounded-[var(--radius-pill)]"
                aria-label={`Remove filter ${chip.label}`}
                onClick={() => onChange(withoutFilter(view, chip.key))}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
          <li>
            <Button variant="link" size="sm" onClick={() => onChange(clearFilters(view))}>
              Clear all
            </Button>
          </li>
        </ul>
      ) : null}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-[var(--radius-card)]">
          <SheetHeader className="pr-14">
            <SheetTitle>Filter reports</SheetTitle>
            <SheetDescription>Each choice applies at once. The tab above still picks the verdict.</SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <FilterControls view={view} counts={counts} triageCounts={triageCounts} onChange={onChange} stacked />
          </div>
          <SheetFooter className="flex-row justify-between gap-2">
            <Button disabled={!sheetCount} onClick={() => onChange({ ...clearFilters(view), q: view.q })}>
              Clear filters
            </Button>
            <Button variant="default" onClick={() => setSheetOpen(false)}>
              Show reports
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
