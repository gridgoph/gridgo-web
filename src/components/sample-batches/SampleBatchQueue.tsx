"use client";

/**
 * Sample batches, shared by Operations (`/ops/sample-batches`) and Super Admin
 * (`/admin/sample-batches`). Contract: `gridgo-api/docs/SAMPLE_FIRST_API.md`.
 *
 * Read-only: the client approves, rejects and orders the batch in the GRIDGO
 * app. The page shows where each sampled batch stands and how long its price
 * is held. One read of the latest 200 drafts; the tab filters it here and
 * lives in the URL.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { useAccountNames } from "@/components/sample-batches/useAccountNames";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSettings } from "@/lib/api/client";
import { listSampleBatches } from "@/lib/api/sample-batches";
import type { SampleBatch } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  holdClock,
  holdDaysWord,
  isSampleBatchFilter,
  matchesSampleBatchFilter,
  presentSampleBatchStatus,
  SAMPLE_BATCH_FILTERS,
  sampleBatchFilterCounts,
  sortSampleBatches,
  type SampleBatchFilter,
} from "@/lib/sample-first";
import { cn } from "@/lib/utils";

type Tree = "ops" | "admin";

/** The API lists the latest 200. */
const LIST_LIMIT = 200;

type Loaded = { rows: SampleBatch[]; holdDays: number | null };

export function SampleBatchQueue({ tree }: { tree: Tree }) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("status");
  const filter: SampleBatchFilter = isSampleBatchFilter(raw) ? raw : "open";

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [rows, settings] = await Promise.all([
          listSampleBatches(),
          getSettings().catch(() => null),
        ]);
        setData({
          rows,
          holdDays:
            typeof settings?.sampleBatchHoldDays === "number" ? settings.sampleBatchHoldDays : null,
        });
      } catch (err) {
        setData(null);
        setError(opsErrorMessage(err, "Could not load sample batches. Retry in a moment."));
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLegalInboxReload("sample_", load);
  // A sample's delivery starts its hold clock.
  useLiveReload("orders", load);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => sampleBatchFilterCounts(data?.rows ?? []), [data]);
  const rows = useMemo(
    () => sortSampleBatches((data?.rows ?? []).filter((row) => matchesSampleBatchFilter(row, filter))),
    [data, filter],
  );
  const names = useAccountNames(rows.flatMap((row) => [row.clientId, row.supplierId]));
  const capped = (data?.rows.length ?? 0) >= LIST_LIMIT;

  function choose(next: SampleBatchFilter) {
    const search = new URLSearchParams(params.toString());
    if (next === "open") search.delete("status");
    else search.set("status", next);
    const query = search.toString();
    router.replace(`/${tree}/sample-batches${query ? `?${query}` : ""}`);
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
  const filterLabel = SAMPLE_BATCH_FILTERS.find((row) => row.id === filter)?.label ?? "Open";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-1">
          <p className="text-body text-text-secondary m-0">
            A client ordered one paid sample before the full batch. Once the sample is
            delivered and approved, the client can order the batch at the shop&rsquo;s price
            from when the sample was ordered. Clients decide in the GRIDGO app.
          </p>
          {data?.holdDays != null ? (
            <p className="text-caption text-text-muted m-0" data-testid="sample-hold-line">
              The batch price is held for {holdDaysWord(data.holdDays)} after delivery.{" "}
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

      <Tabs value={filter} onValueChange={(value) => choose(value as SampleBatchFilter)}>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList
            aria-label="Sample batches by status"
            className="h-auto w-max group-data-horizontal/tabs:h-auto"
          >
            {SAMPLE_BATCH_FILTERS.map((option) => {
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
          Counts cover the latest {LIST_LIMIT} sampled batches.
        </p>
      ) : null}

      {pending ? (
        <SkeletonCards count={3} lines={2} label="Loading sample batches" className="gap-3" />
      ) : !data?.rows.length ? (
        <EmptyState
          title="No samples ordered yet"
          body="When a client orders a sample from a shop that offers one, its batch appears here."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
      ) : !rows.length ? (
        <div className="flex flex-col items-start gap-2 rounded-card border border-dashed border-outline px-4 py-3">
          <p className="text-body text-text-secondary m-0">
            Nothing is in {filterLabel === "All" ? "this list" : filterLabel}.
          </p>
          {filter !== "all" ? (
            <Button variant="ghost" onClick={() => choose("all")}>
              Show all sample batches
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="gg-card-flush m-0 flex list-none flex-col p-0" aria-label="Sample batches">
          {rows.map((row) => (
            <SampleBatchRow key={row.id} row={row} tree={tree} names={names} />
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

function SampleBatchRow({
  row,
  tree,
  names,
}: {
  row: SampleBatch;
  tree: Tree;
  names: Record<string, string>;
}) {
  const status = presentSampleBatchStatus(row.status);
  const clock = holdClock(row);
  const title = `${row.itemName || "Listing"} · batch of ${row.batch.quantity.toLocaleString("en-PH")}`;
  const client = (row.clientId && names[row.clientId]) || "Client";
  const shop = (row.supplierId && names[row.supplierId]) || "Shop";
  const showClock = row.status === "approved" || row.status === "awaiting_sample";
  return (
    <li className="border-b border-outline-subtle last:border-b-0">
      <Link
        href={`/${tree}/sample-batches/${encodeURIComponent(row.id)}`}
        className={rowLink}
        aria-label={`Open the sample batch: ${title}`}
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
            {showClock ? (
              <StatusChip tone={clock.tone} label={clock.label} icon={clock.icon} />
            ) : null}
          </div>
          <p className="text-body text-text-secondary m-0">{clock.line}</p>
          <p className="text-caption text-text-muted m-0">
            {[client, shop, `sample ordered ${formatDate(row.createdAt)}`].join(" · ")}
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
