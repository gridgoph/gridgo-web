"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Download, PanelRightOpen, Star, X } from "lucide-react";

import { SurveyPulse } from "@/components/survey-responses/SurveyPulse";
import { SurveyResponseSheet, TagList } from "@/components/survey-responses/SurveyResponseSheet";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DataTable, DataTableRowAction, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { downloadSurveyResponses, listOrders, listSurveyResponses } from "@/lib/api/client";
import type { SurveyAggregates, SurveyResponse } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import {
  EMPTY_SURVEY_FILTERS,
  NPS_GROUP_LABEL,
  SCORE_FILTERS,
  TAG_GROUPS,
  type SurveyFilterState,
  datesBackwards,
  filtersFromParams,
  fulfillmentLabel,
  hasNarrowing,
  isLowStars,
  npsGroup,
  priceFeelingLabel,
  rewardLabel,
  scoreFilterCount,
  surveyErrorMessage,
  surveyQuery,
  tagLabel,
  writeFilterParams,
} from "@/lib/survey-responses";
import { formatManila } from "@/lib/vouchers";

const PAGE = 100;
/** The API's largest page; a live refresh re-reads what is loaded, up to this. */
const MAX_PAGE = 500;
const ANY = "__any__";
const MEDIUM = { fontFamily: "var(--font-medium)" } as const;

/**
 * Super Admin's post-order survey responses (SURVEY_API.md): the figures over
 * everything the filters match, then each response with its scores, tags and
 * note, newest first. Filters live in the URL; the CSV holds every match.
 *
 * Clients are named by account ID only, as the order screens do; the order
 * title comes from the order list when it has the order.
 */
export function SurveyResponsesDesk() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const openOrderId = params.get("response");

  const [rows, setRows] = useState<SurveyResponse[] | null>(null);
  const [total, setTotal] = useState(0);
  const [aggregates, setAggregates] = useState<SurveyAggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const [linked, setLinked] = useState<SurveyResponse | null>(null);
  const [scoresOpen, setScoresOpen] = useState(() => scoreFilterCount(filters) > 0);

  const query = useMemo(() => surveyQuery(filters), [filters]);
  const backwards = datesBackwards(filters);
  const loaded = rows?.length ?? 0;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const sequence = useRef(0);

  // Order titles are a courtesy: the list still reads without them.
  useEffect(() => {
    let cancelled = false;
    listOrders()
      .then((orders) => {
        if (cancelled) return;
        setTitles(new Map(orders.filter((order) => order.title).map((order) => [order.id, order.title as string])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const read = useCallback(
    async (limit: number, quiet: boolean) => {
      if (backwards) return;
      const ticket = ++sequence.current;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const page = await listSurveyResponses(query, { limit });
        if (ticket !== sequence.current) return;
        setRows(page.responses);
        setTotal(page.total);
        setAggregates(page.aggregates);
      } catch (err) {
        if (ticket !== sequence.current) return;
        setError(surveyErrorMessage(err, "The survey responses did not load. Try again."));
      } finally {
        if (ticket === sequence.current) setLoading(false);
      }
    },
    [query, backwards],
  );

  useEffect(() => {
    setRows(null);
    setAggregates(null);
    void read(PAGE, false);
  }, [read]);

  // A new submission sends Super Admin a notice; re-read what is on screen.
  const refresh = useCallback(
    () => read(Math.min(MAX_PAGE, Math.max(PAGE, loadedRef.current)), true),
    [read],
  );
  useLegalInboxReload("order_survey_submitted", refresh);

  async function loadMore() {
    setMore(true);
    const ticket = sequence.current;
    try {
      const page = await listSurveyResponses(query, { offset: loaded, limit: PAGE });
      if (ticket !== sequence.current) return;
      setRows((current) => [...(current ?? []), ...page.responses]);
      setTotal(page.total);
      setAggregates(page.aggregates);
    } catch (err) {
      setError(surveyErrorMessage(err, "Older responses did not load. Try again."));
    } finally {
      setMore(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await downloadSurveyResponses(query);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "survey-responses.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(surveyErrorMessage(err, "The CSV could not be downloaded. Try again."));
    } finally {
      setExporting(false);
    }
  }

  const replaceParams = useCallback(
    (next: URLSearchParams) => {
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const setFilter = useCallback(
    <K extends keyof SurveyFilterState>(key: K, value: SurveyFilterState[K]) => {
      replaceParams(writeFilterParams(params, { ...filters, [key]: value }));
    },
    [replaceParams, params, filters],
  );

  function clearFilters(keepFollowUp: boolean) {
    replaceParams(
      writeFilterParams(params, {
        ...EMPTY_SURVEY_FILTERS,
        followUp: keepFollowUp ? filters.followUp : "",
      }),
    );
  }

  const openResponse = useCallback(
    (orderId: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (orderId) next.set("response", orderId);
      else next.delete("response");
      replaceParams(next);
    },
    [params, replaceParams],
  );

  // A notice or shared link may name a response that is not on this page.
  const fromRows = openOrderId ? rows?.find((row) => row.orderId === openOrderId) ?? null : null;
  useEffect(() => {
    if (!openOrderId || fromRows || rows === null) {
      setLinked(null);
      return;
    }
    let cancelled = false;
    listSurveyResponses({ orderId: openOrderId }, { limit: 1 })
      .then((page) => {
        if (!cancelled) setLinked(page.responses[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [openOrderId, fromRows, rows]);
  const selected = fromRows ?? (linked?.orderId === openOrderId ? linked : null);

  const titleOf = useCallback((orderId: string) => titles.get(orderId) ?? null, [titles]);

  const columns = useMemo<DataTableColumn<SurveyResponse>[]>(
    () => [
      {
        id: "submitted",
        header: "Answered",
        sortValue: (row) => Date.parse(row.submittedAt),
        cell: (row) => (
          <span className="text-body text-text-secondary whitespace-nowrap">{formatManila(row.submittedAt)}</span>
        ),
      },
      {
        id: "order",
        header: "Order",
        primary: true,
        sortValue: (row) => titleOf(row.orderId) ?? row.orderId,
        cell: (row) => (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <Link
              href={`/admin/orders/${encodeURIComponent(row.orderId)}`}
              className="text-body text-text-primary max-w-56 truncate underline-offset-2 hover:underline"
              style={MEDIUM}
            >
              {titleOf(row.orderId) ?? `Order ${row.orderId}`}
            </Link>
            <span className="text-caption text-text-muted">
              {fulfillmentLabel(row.fulfillmentKind)}
              {titleOf(row.orderId) ? `, order ${row.orderId}` : ""}
            </span>
            {row.needsFollowUp ? <StatusChip tone="warning" icon="triangle-alert" label="Needs follow-up" /> : null}
          </div>
        ),
      },
      {
        id: "fulfillment",
        header: "Delivery or pick-up",
        sortValue: (row) => row.fulfillmentStars,
        cell: (row) => <StarScore value={row.fulfillmentStars} />,
      },
      {
        id: "ease",
        header: "Ordering",
        sortValue: (row) => row.easeStars,
        cell: (row) => <StarScore value={row.easeStars} />,
      },
      {
        id: "price",
        header: "Price",
        sortValue: (row) => row.priceFeeling,
        cell: (row) => (
          <div className="flex flex-col">
            <span className="text-body text-text-primary whitespace-nowrap">{priceFeelingLabel(row.priceFeeling)}</span>
            {row.expectedPriceMinor != null ? (
              <span className="text-caption text-text-muted whitespace-nowrap">
                Expected {formatPhp(row.expectedPriceMinor)}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "quality",
        header: "Print quality",
        sortValue: (row) => row.qualityStars ?? -1,
        cell: (row) => <StarScore value={row.qualityStars} />,
      },
      {
        id: "recommend",
        header: "Recommend",
        sortValue: (row) => row.recommendScore ?? -1,
        cell: (row) => <RecommendScore value={row.recommendScore} />,
      },
      {
        id: "said",
        header: "Tags and note",
        sortable: false,
        cell: (row) => {
          const tags = [...row.fulfillmentTags, ...row.easeTags];
          if (!tags.length && !row.improvementNote) {
            return <span className="text-body text-text-muted">—</span>;
          }
          return (
            <div className="flex max-w-80 min-w-48 flex-col gap-1.5">
              {row.improvementNote ? (
                <p className="text-body text-text-primary m-0 line-clamp-2 break-words">
                  &ldquo;{row.improvementNote}&rdquo;
                </p>
              ) : null}
              <TagList tags={tags} limit={3} />
            </div>
          );
        },
      },
      {
        id: "reward",
        header: "Reward",
        hideOnMobile: true,
        sortValue: (row) => row.rewardStatus ?? "",
        cell: (row) => (
          <span
            className={
              row.rewardStatus === "issued"
                ? "text-body text-text-secondary whitespace-nowrap"
                : "text-body text-text-muted"
            }
          >
            {rewardLabel(row.rewardStatus)}
          </span>
        ),
      },
    ],
    [titleOf],
  );

  const narrowed = hasNarrowing(filters);
  const scoreCount = scoreFilterCount(filters);
  const followOnly = filters.followUp === "true";
  const allCount = filters.followUp === "" ? total : null;
  const followCount = filters.followUp === "" ? (aggregates?.needsFollowUp ?? null) : followOnly ? total : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          What clients said after an order reached them. Each answer earns the same voucher whatever
          it says, and nothing here changes an order, a payout or a shop&apos;s standing.
        </p>
        <Button variant="outline" disabled={exporting || !total || backwards} onClick={() => void exportCsv()}>
          <Download aria-hidden />
          {exporting ? "Preparing…" : "Export CSV"}
        </Button>
      </div>

      <SurveyPulse aggregates={aggregates} loading={loading} />

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <ToggleGroup
          aria-label="Which responses"
          value={[filters.followUp === "true" ? "follow" : "all"]}
          onValueChange={(values) => {
            const next = values[0];
            if (next === "follow") setFilter("followUp", "true");
            else if (next === "all") setFilter("followUp", "");
          }}
          variant="outline"
        >
          <ToggleGroupItem value="all">
            All responses
            {allCount != null && !loading ? <Count value={allCount} /> : null}
          </ToggleGroupItem>
          <ToggleGroupItem value="follow">
            Needs follow-up
            {followCount != null && !loading ? <Count value={followCount} /> : null}
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-caption text-text-muted m-0 max-w-prose">
          Figures and the CSV cover every response the filters match. Dates are Philippine time and
          include both days.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-full sm:w-44">
          <FieldLabel htmlFor="survey-kind">How it arrived</FieldLabel>
          <Select
            value={filters.kind || ANY}
            onValueChange={(value) =>
              setFilter("kind", value === "delivery" || value === "pickup" ? value : "")
            }
          >
            <SelectTrigger id="survey-kind" className="min-h-11 w-full">
              <SelectValue>
                {(value) => (value === "delivery" ? "Delivery" : value === "pickup" ? "Pick-up" : "Delivery or pick-up")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Delivery or pick-up</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
              <SelectItem value="pickup">Pick-up</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-full sm:w-56">
          <FieldLabel htmlFor="survey-tag">Tag</FieldLabel>
          <Select
            value={filters.tag || ANY}
            onValueChange={(value) => setFilter("tag", !value || value === ANY ? "" : String(value))}
          >
            <SelectTrigger id="survey-tag" className="min-h-11 w-full">
              <SelectValue>{(value) => (!value || value === ANY ? "Any tag" : tagLabel(String(value)))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any tag</SelectItem>
              {TAG_GROUPS.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.tags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tagLabel(tag)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="survey-reward">Reward</FieldLabel>
          <Select
            value={filters.reward || ANY}
            onValueChange={(value) => setFilter("reward", value === "issued" || value === "cooldown" ? value : "")}
          >
            <SelectTrigger id="survey-reward" className="min-h-11 w-full">
              <SelectValue>
                {(value) =>
                  value === "issued" || value === "cooldown" ? rewardLabel(value) : "Any reward"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any reward</SelectItem>
              <SelectItem value="issued">{rewardLabel("issued")}</SelectItem>
              <SelectItem value="cooldown">{rewardLabel("cooldown")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-[calc(50%-0.375rem)] sm:w-44">
          <FieldLabel htmlFor="survey-from">From</FieldLabel>
          <Input
            id="survey-from"
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => setFilter("from", event.target.value)}
          />
        </Field>
        <Field className="w-[calc(50%-0.375rem)] sm:w-44">
          <FieldLabel htmlFor="survey-to">To</FieldLabel>
          <Input
            id="survey-to"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => setFilter("to", event.target.value)}
          />
        </Field>
        {narrowed ? (
          <Button variant="ghost" onClick={() => clearFilters(true)}>
            Clear filters
          </Button>
        ) : null}
      </div>

      <Collapsible open={scoresOpen} onOpenChange={setScoresOpen}>
        <CollapsibleTrigger
          render={<Button variant="ghost" className="-ml-2 self-start" />}
          aria-label={scoreCount ? `Filter by score, ${scoreCount} set` : "Filter by score"}
        >
          <ChevronRight
            aria-hidden
            className={scoresOpen ? "rotate-90 transition-transform motion-reduce:transition-none" : "transition-transform motion-reduce:transition-none"}
          />
          Filter by score
          {scoreCount ? <Count value={scoreCount} /> : null}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-wrap items-end gap-3 pt-2">
            {SCORE_FILTERS.map((score) => (
              <Field key={score.key} className="w-[calc(50%-0.375rem)] sm:w-44">
                <FieldLabel htmlFor={`survey-score-${score.key}`}>{score.label}</FieldLabel>
                <Select
                  value={filters[score.key] || ANY}
                  onValueChange={(value) => setFilter(score.key, !value || value === ANY ? "" : String(value))}
                >
                  <SelectTrigger id={`survey-score-${score.key}`} className="min-h-11 w-full">
                    <SelectValue>
                      {(value) =>
                        !value || value === ANY
                          ? "Any"
                          : (score.options.find((option) => option.value === value)?.label ?? "Any")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any</SelectItem>
                    {score.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </div>
          <p className="text-caption text-text-muted m-0 mt-2">Each score filter matches that exact answer.</p>
        </CollapsibleContent>
      </Collapsible>

      {filters.clientId || filters.orderId ? (
        <div className="flex flex-wrap items-center gap-2">
          {filters.clientId ? (
            <PinnedFilter
              label={`Client ${filters.clientId}`}
              clearLabel="Show every client"
              onClear={() => setFilter("clientId", "")}
            />
          ) : null}
          {filters.orderId ? (
            <PinnedFilter
              label={`Order ${filters.orderId}`}
              clearLabel="Show every order"
              onClear={() => setFilter("orderId", "")}
            />
          ) : null}
        </div>
      ) : null}

      {backwards ? (
        <p className="text-body text-error m-0" role="alert">
          The From date is after the To date.
        </p>
      ) : null}
      {exportError ? (
        <p className="text-body text-error m-0" role="alert">
          {exportError}
        </p>
      ) : null}

      {error && !rows ? (
        <ErrorState
          body={error}
          action={
            <Button variant="secondary" onClick={() => void read(PAGE, false)}>
              Try again
            </Button>
          }
        />
      ) : rows && !rows.length && !loading ? (
        <EmptyState
          title={
            narrowed
              ? "No responses match these filters"
              : followOnly
                ? "Nothing needs follow-up"
                : "No survey responses yet"
          }
          body={
            narrowed
              ? "Widen the dates or clear a filter."
              : followOnly
                ? "No client has given a low score. Responses with a star score of 2 or less, or a recommend score of 6 or less, show here."
                : "A client is asked once an order is delivered or picked up, and has 7 days to answer. Answers show here as they arrive."
          }
          action={
            narrowed ? (
              <Button variant="secondary" onClick={() => clearFilters(true)}>
                Clear filters
              </Button>
            ) : followOnly ? (
              <Button variant="secondary" onClick={() => setFilter("followUp", "")}>
                Show all responses
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows ?? []}
          loading={loading && !rows}
          getRowId={(row) => row.orderId}
          caption="Survey responses"
          itemLabel="responses"
          defaultSortId="submitted"
          defaultSortDirection="desc"
          pageSize={Math.max(PAGE, loaded)}
          rowActions={(row) => (
            <DataTableRowAction
              label={`Open the response for ${titleOf(row.orderId) ?? `order ${row.orderId}`}`}
              icon={PanelRightOpen}
              onClick={() => openResponse(row.orderId)}
            />
          )}
        />
      )}
      {error && rows ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}
      {rows && rows.length < total ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={more} onClick={() => void loadMore()}>
            {more ? "Loading…" : "Show older responses"}
          </Button>
          <span className="text-caption text-text-muted">
            Showing {rows.length.toLocaleString("en-PH")} of {total.toLocaleString("en-PH")}
          </span>
        </div>
      ) : null}

      <SurveyResponseSheet
        response={selected}
        orderTitle={selected ? titleOf(selected.orderId) : null}
        onClose={() => openResponse(null)}
        onShowClient={(clientId) => {
          const next = writeFilterParams(params, { ...filters, clientId });
          next.delete("response");
          replaceParams(next);
        }}
      />
    </div>
  );
}

function Count({ value }: { value: number }) {
  return (
    <span className="text-caption text-text-muted ml-1.5 tabular-nums">{value.toLocaleString("en-PH")}</span>
  );
}

function StarScore({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <span className="text-body text-text-muted" aria-label="Not answered">
        —
      </span>
    );
  }
  const low = isLowStars(value);
  return (
    <span
      className={low ? "text-body text-error inline-flex items-center gap-1" : "text-body text-text-primary inline-flex items-center gap-1"}
      style={low ? MEDIUM : undefined}
      aria-label={`${value} of 5${low ? ", low" : ""}`}
    >
      <span className="tabular-nums">{value}</span>
      <Star aria-hidden className="size-3.5 fill-current" strokeWidth={1.75} />
    </span>
  );
}

function RecommendScore({ value }: { value: number | null }) {
  const group = npsGroup(value);
  if (value == null || !group) {
    return (
      <span className="text-body text-text-muted" aria-label="Not answered">
        —
      </span>
    );
  }
  return (
    <div className="flex flex-col">
      <span
        className={group === "detractor" ? "text-body text-error tabular-nums" : "text-body text-text-primary tabular-nums"}
        style={group === "detractor" ? MEDIUM : undefined}
      >
        {value}
        <span className="text-caption text-text-muted"> / 10</span>
      </span>
      <span className="text-caption text-text-muted">{NPS_GROUP_LABEL[group]}</span>
    </div>
  );
}

function PinnedFilter({ label, clearLabel, onClear }: { label: string; clearLabel: string; onClear: () => void }) {
  return (
    <span className="border-outline text-body text-text-primary inline-flex min-h-11 max-w-full items-center gap-1 rounded-full border pr-1 pl-3">
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={clearLabel}
        className="hover:bg-surface-variant inline-flex size-9 shrink-0 items-center justify-center rounded-full"
        onClick={onClear}
      >
        <X className="size-4" aria-hidden />
      </button>
    </span>
  );
}
