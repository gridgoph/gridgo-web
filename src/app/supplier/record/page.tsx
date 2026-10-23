"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { SkeletonCards } from "@/components/ui/loading";
import { getSettings, listJobs } from "@/lib/api/client";
import * as recordApi from "@/lib/api/supplier-record";
import { formatDateTime } from "@/lib/format";
import {
  FAILURE_LABELS,
  NO_MONEY_TAKEN,
  NOT_OPEN_YET,
  deadlineLabel,
  formatStars,
  lapseStandingLine,
  standingLine,
  whyMatchingWaits,
  normalizeLapses,
  normalizeRescheduleRequests,
  normalizeReviews,
  normalizeShopFailures,
  readFeed,
  starWord,
  type DeadlineRequest,
  type FeedRead,
  type MyReviews,
  type ProductionLapse,
  type ShopFailure,
} from "@/lib/shop-record";

type RecordRead<T> = FeedRead<T> & { stale?: boolean };

type RecordState = {
  reviews: RecordRead<MyReviews>;
  lapses: RecordRead<ProductionLapse[]>;
  failures: RecordRead<ShopFailure[]>;
  requests: RecordRead<DeadlineRequest[]>;
  deductionsEnabled: boolean;
  titles: Record<string, string>;
};

function keepLoaded<T>(
  previous: RecordRead<T> | undefined,
  next: FeedRead<T>,
): RecordRead<T> {
  if (next.status === "failed" && previous?.status === "loaded")
    return { ...previous, stale: true };
  return next;
}

async function loadFeed<T>(
  load: () => Promise<unknown>,
  normalize: (body: unknown) => T | null,
): Promise<FeedRead<T>> {
  try {
    return readFeed(normalize(await load()));
  } catch (error) {
    return readFeed<T>(null, error);
  }
}

export default function SupplierRecordPage() {
  const [data, setData] = useState<RecordState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      const [reviews, lapses, failures, requests, settings, jobs] = await Promise.all([
        loadFeed(recordApi.getMyReviews, normalizeReviews),
        loadFeed(recordApi.getMyProductionLapses, normalizeLapses),
        loadFeed(recordApi.getMyShopFailures, normalizeShopFailures),
        loadFeed(recordApi.getMyRescheduleRequests, normalizeRescheduleRequests),
        getSettings().catch(() => null),
        listJobs()
          .then((jobs) => ({ ok: true as const, jobs }))
          .catch(() => ({ ok: false as const, jobs: [] })),
      ]);
      setData((previous) => ({
        reviews: keepLoaded(previous?.reviews, reviews),
        lapses: keepLoaded(previous?.lapses, lapses),
        failures: keepLoaded(previous?.failures, failures),
        requests: keepLoaded(previous?.requests, requests),
        deductionsEnabled:
          settings?.productionPenalty?.deductionsEnabled === true ||
          (settings == null && previous?.deductionsEnabled === true),
        titles: jobs.ok
          ? Object.fromEntries(jobs.jobs.map((job) => [job.id, job.title]))
          : (previous?.titles ?? {}),
      }));
      setLoading(false);
    }, []),
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data)
    return <SkeletonCards count={3} lines={2} label="Loading your record" />;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh record
        </Button>
      </div>
      <section className="flex flex-col gap-3" aria-label="Reviews">
        <h2
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          Reviews
        </h2>
        <StaleNotice read={data.reviews} label="Reviews" onRetry={() => void load()} />
        <Reviews read={data.reviews} titles={data.titles} onRetry={() => void load()} />
      </section>

      <section
        className="flex max-w-prose flex-col gap-2"
        aria-label="When a job is ready late"
      >
        <h2
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          When a job is ready late
        </h2>
        <p className="text-body text-text-secondary m-0">
          Every job carries a ready-by time. If it is not ready by then, GRIDGO records it
          and tells you.
        </p>
        {data.deductionsEnabled ? (
          <p className="text-body text-text-secondary m-0">
            A warning is not a charge. Money is named only after a deduction was already
            taken.
          </p>
        ) : (
          <>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {NO_MONEY_TAKEN}
            </p>
            <p className="text-body text-text-secondary m-0">
              A job ready late gets a warning and a written notice. Nothing comes off your
              payout for it.
            </p>
          </>
        )}
      </section>

      <Feed
        label="Your late jobs"
        read={data.lapses}
        emptyTitle="No late jobs"
        emptyBody="Every job so far was ready by its ready-by time."
        failed="Your late jobs did not load. Check the connection and try again."
        onRetry={() => void load()}
        render={(lapse) => (
          <JobLink
            orderId={lapse.orderId}
            title={data.titles[lapse.orderId]}
            detail={`${lapse.tier} lateness. ${lapseStandingLine(lapse)}`}
          />
        )}
      />

      <Feed
        label="Jobs you let go"
        read={data.failures}
        emptyTitle="None"
        emptyBody="Every job offered to your shop was answered and kept."
        failed="This part of your record did not load. Check the connection and try again."
        onRetry={() => void load()}
        render={(failure) => (
          <JobLink
            orderId={failure.orderId}
            title={data.titles[failure.orderId]}
            detail={FAILURE_LABELS[failure.kind]}
          />
        )}
      />

      <Feed
        label="Deadline requests"
        read={data.requests}
        emptyTitle="None"
        emptyBody="You have not asked a client to move a deadline."
        failed="Your deadline requests did not load. Check the connection and try again."
        onRetry={() => void load()}
        render={(request) => (
          <JobLink
            orderId={request.orderId}
            title={data.titles[request.orderId]}
            detail={deadlineLabel(request.status)}
          />
        )}
      />
    </div>
  );
}

function StaleNotice({
  read,
  label,
  onRetry,
}: {
  read: RecordRead<unknown>;
  label: string;
  onRetry: () => void;
}) {
  if (read.status !== "loaded" || !read.stale) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-body text-text-secondary m-0" role="alert">
        Could not refresh {label.toLowerCase()}. Showing the last loaded information.
      </p>
      <Button
        type="button"
        variant="outline"
        aria-label={`Refresh ${label}`}
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  );
}

function Reviews({
  read,
  titles,
  onRetry,
}: {
  read: FeedRead<MyReviews>;
  titles: Record<string, string>;
  onRetry: () => void;
}) {
  if (read.status === "not_open_yet")
    return <p className="text-body text-text-muted m-0">{NOT_OPEN_YET}</p>;
  if (read.status === "failed") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-body text-text-primary m-0" role="alert">
          Reviews did not load.
        </p>
        <Button type="button" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  const { summary, ranking, reviews } = read.value;
  if (summary.count === 0) {
    return (
      <div>
        <p
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          No reviews yet
        </p>
        <p className="text-body text-text-secondary m-0">
          Clients rate a job for quality, speed and value once it is finished. Your first
          review puts you on the board against every other shop on GRIDGO.
        </p>
      </div>
    );
  }
  const onTimeCount =
    summary.onTime && summary.onTime.count > 0
      ? Math.round(summary.onTime.rate * summary.onTime.count)
      : null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-primary m-0">
        Clients gave you {standingLine(summary, ranking)}.
      </p>
      <p className="text-body text-text-secondary m-0">{starWord(summary.overall)}</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        <li className="text-body text-text-secondary">
          Quality {formatStars(summary.quality)} — the print itself
        </li>
        <li className="text-body text-text-secondary">
          Speed {formatStars(summary.speed)} — delivered by the promised date
        </li>
        <li className="text-body text-text-secondary">
          Value {formatStars(summary.value)} — worth what the client paid
        </li>
        {onTimeCount != null ? (
          <li className="text-body text-text-secondary">
            On time {onTimeCount} of {summary.onTime?.count}. Measured from your own
            ready-by date, not the client&apos;s deadline.
          </li>
        ) : null}
      </ul>
      <p className="text-caption text-text-muted m-0">
        {whyMatchingWaits(summary.reviewsUntilMatching)}
      </p>
      {ranking.byCategory.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Where you rank">
          {ranking.byCategory.map((standing) => (
            <li key={standing.categoryCode} className="text-body text-text-secondary">
              {standing.categoryName}:{" "}
              {standing.position != null ? `#${standing.position}` : "—"} of {standing.of}
              , {formatStars(standing.overall)} from{" "}
              {standing.count === 1 ? "1 review" : `${standing.count} reviews`}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {reviews.map((review) => (
          <li key={review.id}>
            <JobLink
              orderId={review.orderId}
              title={titles[review.orderId] || review.itemName || undefined}
              detail={`Quality ${review.qualityStars}, speed ${review.speedStars}, value ${review.valueStars}${review.comment ? `. ${review.comment}` : ""}`}
              when={review.createdAt}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Feed<T extends { id: string }>({
  label,
  read,
  emptyTitle,
  emptyBody,
  failed,
  onRetry,
  render,
}: {
  label: string;
  read: RecordRead<T[]>;
  emptyTitle: string;
  emptyBody: string;
  failed: string;
  onRetry: () => void;
  render: (row: T) => ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={label}>
      <h2 className="text-overline text-text-muted m-0 uppercase">{label}</h2>
      <StaleNotice read={read} label={label} onRetry={onRetry} />
      {read.status === "not_open_yet" ? (
        <p className="text-body text-text-muted m-0">{NOT_OPEN_YET}</p>
      ) : null}
      {read.status === "failed" ? (
        <div className="flex flex-col gap-2">
          <p className="text-body text-text-primary m-0" role="alert">
            {failed}
          </p>
          <Button type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
      {read.status === "loaded" && read.value.length === 0 ? (
        <div>
          <p
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {emptyTitle}
          </p>
          <p className="text-body text-text-secondary m-0">{emptyBody}</p>
        </div>
      ) : null}
      {read.status === "loaded" && read.value.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {read.value.map((row) => (
            <li key={row.id}>{render(row)}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function JobLink({
  orderId,
  title,
  detail,
  when,
}: {
  orderId: string;
  title?: string;
  detail: string;
  when?: string;
}) {
  const name = title || `Order ${orderId}`;
  return (
    <Link
      href={`/supplier/jobs/${orderId}`}
      className="border-outline-subtle flex min-h-11 flex-col gap-1 rounded-field border px-3 py-2"
      aria-label={`${name}. ${detail}`}
    >
      <span
        className="text-body text-text-primary"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {name}
      </span>
      <span className="text-caption text-text-secondary">{detail}</span>
      {when ? (
        <span className="text-caption text-text-muted">{formatDateTime(when)}</span>
      ) : null}
    </Link>
  );
}
