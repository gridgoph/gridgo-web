"use client";

import { SlidersHorizontal } from "lucide-react";

import {
  DEFAULT_FILTERS,
  isDefaultFilters,
  moreFilterCount,
  orderedValidities,
  TRIAGE_CATEGORIES,
  triageCategoryLabel,
  VALIDITY,
  VALIDITIES,
  type AiFilter,
  type TriageFilters as Filters,
} from "@/components/issue-reports/triage";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusMark } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { IssueReportTriageCategory, IssueReportTriageCounts, IssueReportValidity } from "@/lib/api/types";

const AI_CHOICES: { value: AiFilter; label: string }[] = [
  { value: "any", label: "AI reviewed or not" },
  { value: "reviewed", label: "AI reviewed" },
  { value: "not_reviewed", label: "Not AI reviewed" },
];

type Props = {
  filters: Filters;
  triageCounts: IssueReportTriageCounts | null;
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
  onChange: (next: Filters) => void;
};

/**
 * Which reports the list shows, beside the status tabs. The verdict toggles
 * are always in view (spam starts hidden); category, label and AI review sit
 * behind More filters.
 */
export function TriageFilters({ filters, triageCounts, moreOpen, onMoreOpenChange, onChange }: Props) {
  const extra = moreFilterCount(filters);
  const labels = triageCounts?.labels ?? [];
  const labelChoices =
    filters.label && !labels.some((entry) => entry.label === filters.label)
      ? [{ label: filters.label, count: 0 }, ...labels]
      : labels;
  const spamHidden = !filters.validity.includes("spam") && (triageCounts?.validity.spam ?? 0) > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          multiple
          value={filters.validity}
          onValueChange={(values) => {
            const next = orderedValidities(values as IssueReportValidity[]);
            // At least one verdict stays on; an empty list would show nothing.
            if (next.length) onChange({ ...filters, validity: next });
          }}
          variant="outline"
          spacing={0}
          aria-label="Show reports by verdict"
          className="flex flex-wrap gap-1"
        >
          {VALIDITIES.map((value) => (
            <ToggleGroupItem key={value} value={value} aria-label={VALIDITY[value].label}>
              <StatusMark {...VALIDITY[value]} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-caption text-text-muted m-0 min-w-0">
          {triageCounts ? triageSummary(triageCounts) : null}
          {spamHidden ? " Tab counts include hidden spam." : ""}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {!isDefaultFilters(filters) ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onChange({ ...DEFAULT_FILTERS, validity: [...DEFAULT_FILTERS.validity] })}
            >
              Reset filters
            </Button>
          ) : null}
          <Button
            size="sm"
            aria-expanded={moreOpen}
            aria-controls="issue-report-more-filters"
            onClick={() => onMoreOpenChange(!moreOpen)}
          >
            <SlidersHorizontal data-icon="inline-start" aria-hidden />
            {extra ? `More filters (${extra})` : "More filters"}
          </Button>
        </div>
      </div>

      {moreOpen ? (
        <div id="issue-report-more-filters" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <Select
            value={filters.category}
            onValueChange={(value) => {
              if (typeof value === "string")
                onChange({ ...filters, category: value as IssueReportTriageCategory | "none" | "any" });
            }}
          >
            <SelectTrigger className="h-11 w-full" aria-label="Category">
              <SelectValue>
                {filters.category === "any"
                  ? "Any category"
                  : filters.category === "none"
                    ? "No category yet"
                    : triageCategoryLabel(filters.category)}
              </SelectValue>
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
          <Select
            value={filters.label ?? "any"}
            onValueChange={(value) => {
              if (typeof value === "string") onChange({ ...filters, label: value === "any" ? null : value });
            }}
          >
            <SelectTrigger className="h-11 w-full" aria-label="Label">
              <SelectValue>{filters.label ? `Label: ${filters.label}` : "Any label"}</SelectValue>
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
          <Select
            value={filters.ai}
            onValueChange={(value) => {
              if (typeof value === "string") onChange({ ...filters, ai: value as AiFilter });
            }}
          >
            <SelectTrigger className="h-11 w-full" aria-label="AI review">
              <SelectValue>{AI_CHOICES.find((choice) => choice.value === filters.ai)?.label}</SelectValue>
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
        </div>
      ) : null}
    </div>
  );
}

/** "4 reports wait for a verdict, 2 with an AI suggestion." Across every tab. */
export function triageSummary(counts: IssueReportTriageCounts): string {
  const waiting = counts.validity.unreviewed ?? 0;
  if (!waiting) return "Every report has a verdict.";
  const head = waiting === 1 ? "1 report waits for a verdict" : `${waiting} reports wait for a verdict`;
  const ai = counts.aiAwaitingHuman ?? 0;
  return ai ? `${head}, ${ai} with an AI suggestion.` : `${head}.`;
}
