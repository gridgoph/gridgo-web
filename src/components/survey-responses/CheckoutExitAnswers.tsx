"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, X } from "lucide-react";

import { saveCsv } from "@/components/survey-responses/save-csv";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip } from "@/components/ui/StatusChip";
import { downloadCheckoutExitFeedback, listCheckoutExitFeedback } from "@/lib/api/client";
import type {
  CheckoutExitAnswer,
  CheckoutExitFeedbackFilter,
  CheckoutExitStatus,
} from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  EXIT_REASONS,
  EXIT_STATUS_LABEL,
  type ExitFilterState,
  accountTypeLabel,
  categoryLabel,
  exitAnswerLabel,
  exitFiltersFromParams,
  exitReasonLabel,
  orderSizeLabel,
  pricingErrorMessage,
  writeExitFilterParams,
} from "@/lib/pricing-feedback";
import {
  datesBackwards,
  filtersFromParams,
  pricingQuery,
  sharedFilterCount,
  writeFilterParams,
} from "@/lib/survey-responses";

const PAGE = 100;
const ANY = "__any__";
const MEDIUM = { fontFamily: "var(--font-medium)" } as const;
const STATUSES: CheckoutExitStatus[] = ["answered", "skipped", "unanswered"];

/**
 * Each checkout exit question as it was asked (`GET /admin/checkout-exit-feedback`),
 * newest first, with the client's own words when they chose Other. The shared
 * filters come from above the tabs; status and answer are this list's own.
 * Clients are named by account ID only, as the survey responses are.
 */
export function CheckoutExitAnswers({
  categoryNames,
}: {
  categoryNames: ReadonlyMap<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const shared = useMemo(() => filtersFromParams(params), [params]);
  const own = useMemo(() => exitFiltersFromParams(params), [params]);
  const backwards = datesBackwards(shared);

  const query = useMemo<CheckoutExitFeedbackFilter>(
    () => ({
      ...pricingQuery(shared),
      clientId: shared.clientId || undefined,
      status: own.status || undefined,
      reason: own.reason || undefined,
    }),
    [shared, own],
  );

  const [rows, setRows] = useState<CheckoutExitAnswer[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const sequence = useRef(0);

  const read = useCallback(async () => {
    if (backwards) return;
    const ticket = ++sequence.current;
    setLoading(true);
    setError(null);
    try {
      const page = await listCheckoutExitFeedback(query, { limit: PAGE });
      if (ticket !== sequence.current) return;
      setRows(page.prompts);
      setTotal(page.total);
    } catch (err) {
      if (ticket === sequence.current)
        setError(
          pricingErrorMessage(err, "The checkout answers did not load. Try again."),
        );
    } finally {
      if (ticket === sequence.current) setLoading(false);
    }
  }, [query, backwards]);

  useEffect(() => {
    setRows(null);
    void read();
  }, [read]);

  async function loadMore() {
    setMore(true);
    const ticket = sequence.current;
    try {
      const page = await listCheckoutExitFeedback(query, {
        offset: rows?.length ?? 0,
        limit: PAGE,
      });
      if (ticket !== sequence.current) return;
      setRows((current) => [...(current ?? []), ...page.prompts]);
      setTotal(page.total);
    } catch (err) {
      setError(pricingErrorMessage(err, "Older answers did not load. Try again."));
    } finally {
      setMore(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      saveCsv(await downloadCheckoutExitFeedback(query), "checkout-exit-feedback.csv");
    } catch (err) {
      setExportError(
        pricingErrorMessage(err, "The CSV could not be downloaded. Try again."),
      );
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
  const setOwn = (patch: Partial<ExitFilterState>) =>
    replaceParams(writeExitFilterParams(params, { ...own, ...patch }));
  const showClient = useCallback(
    (clientId: string) =>
      replaceParams(writeFilterParams(params, { ...shared, clientId })),
    [replaceParams, params, shared],
  );

  const columns = useMemo<DataTableColumn<CheckoutExitAnswer>[]>(
    () => [
      {
        id: "asked",
        header: "Asked",
        sortValue: (row) => Date.parse(row.askedAt),
        cell: (row) => <ManilaTime at={row.askedAt} />,
      },
      {
        id: "answer",
        header: "Answer",
        primary: true,
        className: "whitespace-normal min-w-60",
        sortValue: (row) => exitAnswerLabel(row),
        cell: (row) => <AnswerCell row={row} />,
      },
      {
        id: "basket",
        header: "Basket at checkout",
        className: "whitespace-normal min-w-48",
        sortValue: (row) => row.cartTotalMinor ?? -1,
        cell: (row) => (
          <div className="flex flex-col">
            <span className="text-body text-text-primary tabular-nums whitespace-nowrap">
              {row.cartTotalMinor != null
                ? formatPhp(row.cartTotalMinor)
                : "No price yet"}
            </span>
            {row.cartTotalMinor != null ? (
              <span className="text-caption text-text-muted whitespace-nowrap">
                {orderSizeLabel(row.orderSize)}
              </span>
            ) : null}
            {row.categoryCodes.length ? (
              <span className="text-caption text-text-muted">
                {row.categoryCodes
                  .map((code) => categoryLabel(code, categoryNames))
                  .join(", ")}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "client",
        header: "Client",
        sortValue: (row) => `${row.accountType ?? ""} ${row.clientId}`,
        cell: (row) => (
          <div className="flex min-w-0 flex-col items-start">
            <span className="text-body text-text-primary">
              {accountTypeLabel(row.accountType)}
            </span>
            <button
              type="button"
              className="text-caption text-text-muted max-w-48 truncate text-left underline-offset-2 hover:underline"
              onClick={() => showClient(row.clientId)}
              aria-label={`Show only answers from client ${row.clientId}`}
            >
              {row.clientId}
            </button>
          </div>
        ),
      },
      {
        id: "reached",
        header: "Reached checkout",
        hideOnMobile: true,
        sortValue: (row) => Date.parse(row.reachedAt),
        cell: (row) => <ManilaTime at={row.reachedAt} />,
      },
    ],
    [categoryNames, showClient],
  );

  if (backwards) return null;

  const ownSet = Boolean(own.status || own.reason);
  const narrowed = ownSet || Boolean(shared.clientId) || sharedFilterCount(shared) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-text-muted m-0 max-w-prose">
          Each time a client was asked why they left checkout, newest first. The CSV holds
          every answer the filters match.
        </p>
        <Button
          variant="outline"
          disabled={exporting || !total}
          onClick={() => void exportCsv()}
        >
          <Download aria-hidden />
          {exporting ? "Preparing…" : "Export CSV"}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-[calc(50%-0.375rem)] sm:w-56">
          <FieldLabel htmlFor="exit-status">What they did</FieldLabel>
          <Select
            value={own.status || ANY}
            onValueChange={(value) =>
              setOwn({
                status: STATUSES.includes(value as CheckoutExitStatus)
                  ? (value as CheckoutExitStatus)
                  : "",
              })
            }
          >
            <SelectTrigger id="exit-status" className="min-h-11 w-full">
              <SelectValue>
                {(value) =>
                  STATUSES.includes(value as CheckoutExitStatus)
                    ? EXIT_STATUS_LABEL[value as CheckoutExitStatus]
                    : "Any"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any</SelectItem>
              {STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {EXIT_STATUS_LABEL[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-[calc(50%-0.375rem)] sm:w-60">
          <FieldLabel htmlFor="exit-reason">Answer</FieldLabel>
          <Select
            value={own.reason || ANY}
            onValueChange={(value) =>
              setOwn({
                reason: EXIT_REASONS.includes(String(value)) ? String(value) : "",
              })
            }
          >
            <SelectTrigger id="exit-reason" className="min-h-11 w-full">
              <SelectValue>
                {(value) =>
                  EXIT_REASONS.includes(String(value))
                    ? exitReasonLabel(String(value))
                    : "Any answer"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any answer</SelectItem>
              {EXIT_REASONS.map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {exitReasonLabel(reason)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {ownSet ? (
          <Button variant="ghost" onClick={() => setOwn({ status: "", reason: "" })}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {shared.clientId ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="border-outline text-body text-text-primary inline-flex min-h-11 max-w-full items-center gap-1 rounded-full border pr-1 pl-3">
            <span className="truncate">Client {shared.clientId}</span>
            <button
              type="button"
              aria-label="Show every client"
              className="hover:bg-surface-variant inline-flex size-9 shrink-0 items-center justify-center rounded-full"
              onClick={() =>
                replaceParams(writeFilterParams(params, { ...shared, clientId: "" }))
              }
            >
              <X className="size-4" aria-hidden />
            </button>
          </span>
        </div>
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
            <Button variant="secondary" onClick={() => void read()}>
              Try again
            </Button>
          }
        />
      ) : rows && !rows.length && !loading ? (
        <EmptyState
          title={
            narrowed
              ? "No checkout answers match these filters"
              : "No checkout answers yet"
          }
          body={
            narrowed
              ? "Widen the dates or clear a filter."
              : "A client who reaches checkout and leaves without paying is asked why on a later app open. Their answers show here."
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows ?? []}
          loading={loading && !rows}
          getRowId={(row) => row.id}
          caption="Checkout exit answers"
          itemLabel="answers"
          defaultSortId="asked"
          defaultSortDirection="desc"
          pageSize={Math.max(PAGE, rows?.length ?? 0)}
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
            {more ? "Loading…" : "Show older answers"}
          </Button>
          <span className="text-caption text-text-muted">
            Showing {rows.length.toLocaleString("en-PH")} of{" "}
            {total.toLocaleString("en-PH")}
          </span>
        </div>
      ) : rows?.length ? (
        <span className="text-caption text-text-muted">
          {total === 1
            ? "The only answer"
            : `All ${total.toLocaleString("en-PH")} answers`}{" "}
          shown.
        </span>
      ) : null}
    </div>
  );
}

function AnswerCell({ row }: { row: CheckoutExitAnswer }) {
  if (row.status !== "answered") {
    return (
      <StatusChip
        tone="neutral"
        icon={row.status === "skipped" ? "circle-x" : "circle-dashed"}
        label={EXIT_STATUS_LABEL[row.status] ?? "Closed without answering"}
      />
    );
  }
  return (
    <div className="flex max-w-96 flex-col gap-1">
      <span className="text-body text-text-primary" style={MEDIUM}>
        {exitAnswerLabel(row)}
      </span>
      {row.otherText ? (
        <p className="text-body text-text-secondary m-0 break-words">
          &ldquo;{row.otherText}&rdquo;
        </p>
      ) : null}
    </div>
  );
}

function ManilaTime({ at }: { at: string }) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime()))
    return <span className="text-body text-text-secondary">{at}</span>;
  const day = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(date);
  return (
    <span className="flex flex-col whitespace-nowrap">
      <span className="text-body text-text-secondary">{day}</span>
      <span className="text-caption text-text-muted">{time}</span>
    </span>
  );
}
