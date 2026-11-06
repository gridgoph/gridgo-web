"use client";

/**
 * The Quotes desk, shared by Operations (`/ops/quotes`) and Super Admin
 * (`/admin/quotes`). Contract: `gridgo-api/docs/QUOTE_REQUESTS_API.md`.
 *
 * A client asks for a price on custom signage or 3D printing; Operations asks
 * suitable shops outside the app, records their replies, and publishes up to
 * three as anonymous options. The filter is the API's own `status` and lives
 * in the URL; counts come from one unfiltered read (the newest 200).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSettings } from "@/lib/api/client";
import { listQuoteRequests } from "@/lib/api/quote-requests";
import { formatDate } from "@/lib/format";
import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  eventDateWarningCopy,
  formatEventDate,
  isQuoteFilter,
  matchesQuoteFilter,
  money,
  placementLabel,
  presentQuoteStatus,
  productTypeLabel,
  QUOTE_FILTERS,
  quoteFilterCounts,
  quoteNextStep,
  validityDaysInForce,
  type QuoteFilter,
  type QuoteRequest,
} from "@/lib/quote-requests";
import { cn } from "@/lib/utils";

type Tree = "ops" | "admin";

/** The API lists the newest 200. */
const LIST_LIMIT = 200;

type Loaded = {
  all: QuoteRequest[];
  /** The selected filter's own read; the same list when the filter is All. */
  rows: QuoteRequest[];
  validityDays: number | null;
};

export function QuoteQueue({ tree }: { tree: Tree }) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("status");
  const filter: QuoteFilter = isQuoteFilter(raw) ? raw : "open";

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [all, rows, settings] = await Promise.all([
          listQuoteRequests("all"),
          filter === "all" ? null : listQuoteRequests(filter),
          getSettings().catch(() => null),
        ]);
        setData({
          all,
          rows: rows ?? all,
          validityDays:
            settings && settings.quoteValidityDays !== undefined
              ? validityDaysInForce(settings.quoteValidityDays)
              : null,
        });
      } catch (err) {
        setData(null);
        setError(opsErrorMessage(err, "Could not load quote requests. Retry in a moment."));
      } finally {
        setLoading(false);
      }
    }, [filter]),
  );

  useLegalInboxReload("ops_quote_", load);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => quoteFilterCounts(data?.all ?? []), [data]);
  // The filter's own read, kept to its filter in case a row moved since.
  const rows = useMemo(
    () => (data?.rows ?? []).filter((row) => matchesQuoteFilter(row, filter)),
    [data, filter],
  );
  const capped = (data?.all.length ?? 0) >= LIST_LIMIT;

  function choose(next: QuoteFilter) {
    const search = new URLSearchParams(params.toString());
    if (next === "open") search.delete("status");
    else search.set("status", next);
    const query = search.toString();
    router.replace(`/${tree}/quotes${query ? `?${query}` : ""}`);
  }

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

  const pending = loading && !data;
  const filterLabel = QUOTE_FILTERS.find((row) => row.id === filter)?.label ?? "Open";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-1">
          <p className="text-body text-text-secondary m-0">
            A client asks for a price on custom signage or 3D printing. Ask suitable shops,
            record each reply, then publish up to three. The client sees them as options A, B
            and C, with GRIDGO&rsquo;s fee included and no shop names.
          </p>
          {data?.validityDays != null ? (
            <p className="text-caption text-text-muted m-0" data-testid="quote-validity-line">
              Published options stay open for {data.validityDays}{" "}
              {data.validityDays === 1 ? "day" : "days"}.{" "}
              {tree === "admin" ? (
                <Link
                  href="/admin/settings"
                  className="text-text-primary underline underline-offset-2"
                >
                  Change it in Operational settings
                </Link>
              ) : (
                "Super Admin sets this."
              )}
            </p>
          ) : null}
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(value) => choose(value as QuoteFilter)}>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList
            aria-label="Quote requests by status"
            className="h-auto w-max group-data-horizontal/tabs:h-auto"
          >
            {QUOTE_FILTERS.map((option) => {
              const count = data ? counts[option.id] : null;
              return (
                <TabsTrigger
                  key={option.id}
                  value={option.id}
                  aria-label={count === null ? option.label : `${option.label}, ${count}`}
                  className="min-h-11 gap-1.5 px-3"
                >
                  <span>{option.label}</span>
                  <span className="min-w-[2ch] tabular-nums opacity-80">
                    {count === null ? "–" : count}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
      </Tabs>

      {capped ? (
        <p className="text-caption text-text-muted m-0">
          Counts cover the newest {LIST_LIMIT} requests.
        </p>
      ) : null}

      {pending ? (
        <SkeletonCards count={3} lines={2} label="Loading quote requests" className="gap-3" />
      ) : !data?.all.length ? (
        <EmptyState
          title="No quote requests yet"
          body="Clients ask for a quote on custom signage or 3D printing from the GRIDGO app. New requests appear here."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
      ) : !rows.length ? (
        <div className="flex flex-col items-start gap-2 rounded-card border border-dashed border-outline px-4 py-3">
          <p className="text-body text-text-secondary m-0">
            No requests are {filterLabel === "All" ? "here" : `in ${filterLabel}`}.
          </p>
          {filter !== "all" ? (
            <Button variant="ghost" onClick={() => choose("all")}>
              Show all requests
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="gg-card-flush m-0 flex list-none flex-col p-0" aria-label="Quote requests">
          {rows.map((request) => (
            <QuoteRow key={request.id} request={request} tree={tree} />
          ))}
        </ul>
      )}
    </div>
  );
}

const rowLink = cn(
  "group flex min-h-11 items-center gap-3 px-4 py-3 text-text-primary",
  "hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-action-yellow",
);

function QuoteRow({ request, tree }: { request: QuoteRequest; tree: Tree }) {
  const status = presentQuoteStatus(request.status);
  const title = `${productTypeLabel(request)} · ${request.quantity.toLocaleString("en-PH")} × ${request.size}`;
  const warning = eventDateWarningCopy(request.eventDateWarning);
  const live = request.status === "requested" || request.status === "quoting";
  return (
    <li className="border-b border-outline-subtle last:border-b-0">
      <Link
        href={`/${tree}/quotes/${encodeURIComponent(request.id)}`}
        className={rowLink}
        aria-label={`Open the quote request: ${title}`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p
              className="text-body text-text-primary m-0 min-w-0 break-words"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {title}
            </p>
            <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
            {warning && live ? (
              <StatusChip tone="warning" label="Event date" icon="triangle-alert" />
            ) : null}
          </div>
          <p className="text-body text-text-secondary m-0">{quoteNextStep(request)}</p>
          <p className="text-caption text-text-muted m-0">
            {[
              request.client?.name || "Client",
              `${placementLabel(request.placement)}, ${request.use}`,
              request.eventDate ? `event ${formatEventDate(request.eventDate)}` : null,
              request.budgetMinor != null ? `budget ${money(request.budgetMinor)}` : null,
              `asked ${formatDate(request.createdAt)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <ChevronRight
          size={16}
          strokeWidth={2}
          aria-hidden
          className="shrink-0 text-text-muted transition-transform duration-150 motion-reduce:transition-none group-hover:translate-x-0.5"
        />
      </Link>
    </li>
  );
}
