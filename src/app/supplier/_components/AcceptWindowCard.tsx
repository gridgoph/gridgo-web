"use client";

import { StatusChip } from "@/components/ui/StatusChip";
import {
  acceptWindow,
  answerByTime,
  formatCountdown,
  type AcceptWindowOrder,
} from "@/lib/supplier-accept-window";

/**
 * The shop's hour to answer, as the shop app shows it.
 *
 * The time left is said in words as well as figures. When the hour reaches
 * past closing it stops while the shop is shut, so this card names the moment
 * it runs out instead of counting.
 */
export function AcceptWindowCard({
  order,
  now,
}: {
  order: AcceptWindowOrder;
  now: Date;
}) {
  const window = acceptWindow(order, now);
  if (window.kind === "none") return null;

  if (window.kind === "expired") {
    return (
      <section
        className="border-error bg-surface flex flex-col gap-2 rounded-card border p-3"
        data-testid="accept-window"
        aria-label="The hour to answer has run out"
      >
        <div className="flex">
          <StatusChip tone="error" label="Not answered in time" icon="circle-x" />
        </div>
        <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          The hour to answer has run out
        </p>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          GRIDGO is passing this job on to another shop. It goes on your shop&apos;s record as not
          answered in time.
        </p>
      </section>
    );
  }

  if (window.kind === "spans_closed") {
    return (
      <section
        className="border-warning bg-surface flex flex-col gap-2 rounded-card border p-3"
        data-testid="accept-window"
        aria-label={`Accept or decline by ${answerByTime(window.deadlineAt, now)}. The hour pauses while your shop is closed.`}
      >
        <div className="flex">
          <StatusChip tone="warning" label="Pauses while you are closed" icon="clock" />
        </div>
        <div>
          <p className="text-caption text-text-muted m-0">Accept or decline by</p>
          <p className="text-h2 text-text-primary m-0 mt-1">{answerByTime(window.deadlineAt, now)}</p>
        </div>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          You have one hour of your opening time to answer. Your shop closes before the hour is up,
          so it stops while you are closed and carries on when you open. Not answering by then counts
          as a decline and goes on your shop&apos;s record.
        </p>
      </section>
    );
  }

  const minutesLeft = Math.ceil(window.remainingMs / 60_000);
  const left = 1 - window.elapsed;
  return (
    <section
      className={
        window.closing
          ? "border-error bg-surface flex flex-col gap-2 rounded-card border p-3"
          : "border-warning bg-surface flex flex-col gap-2 rounded-card border p-3"
      }
      data-testid="accept-window"
      aria-label={`${minutesLeft} minutes left to accept or decline this job. Not answering counts as a decline.`}
    >
      <p className="text-caption text-text-muted m-0">Time left to accept or decline</p>
      <p
        className={
          window.closing
            ? "text-h1 text-error m-0 tabular-nums"
            : "text-h1 text-text-primary m-0 tabular-nums"
        }
      >
        {formatCountdown(window.remainingMs)}
      </p>
      <div className="bg-outline h-1.5 w-full overflow-hidden rounded-full" aria-hidden>
        <div
          className={window.closing ? "bg-error h-full" : "bg-accent h-full"}
          style={{ width: `${Math.round(left * 100)}%` }}
        />
      </div>
      <p className="text-body text-text-secondary m-0 max-w-prose">
        {window.closing ? "Under ten minutes left. " : ""}
        Not answering by {answerByTime(window.deadlineAt, now)} counts as a decline and goes on your
        shop&apos;s record. The hour only counts while your shop is open.
      </p>
    </section>
  );
}
