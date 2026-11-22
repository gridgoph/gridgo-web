"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, CalendarClock } from "lucide-react";

import { PhoneAppInvite } from "@/components/pwa/PhoneApp";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { Switch } from "@/components/ui/switch";
import { ExpressDonePanel } from "@/app/supplier/_components/express/ExpressDonePanel";
import { ExpressJobCard } from "@/app/supplier/_components/express/ExpressJobCard";
import { nextSetupStep, shopIsReady } from "@/app/supplier/_lib/home-next";
import {
  afterThat,
  dueToday,
  earnedToday,
  expressQueue,
  greeting,
} from "@/app/supplier/_lib/today";
import { ApiError, getSupplierReadiness, listJobs } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useShopAccess } from "@/lib/auth/shop-access";
import { todoTitle, workLine } from "@/lib/express-shop";
import { formatClock, formatPhp } from "@/lib/format";
import {
  readNotificationSoundEnabled,
  subscribeNotificationSoundEnabled,
  writeNotificationSoundEnabled,
} from "@/lib/live/notificationSound";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { useAcceptDeadlines } from "@/lib/use-accept-clock";

function SoundSwitch() {
  const enabled = useSyncExternalStore(
    subscribeNotificationSoundEnabled,
    readNotificationSoundEnabled,
    () => true,
  );
  return (
    <section aria-labelledby="alerts-heading" className="gg-card flex flex-col gap-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 id="alerts-heading" className="text-h3 text-text-primary m-0 flex items-center gap-2">
          <BellRing className="size-4" aria-hidden />
          Alerts with sound
        </h3>
        <Switch
          checked={enabled}
          aria-labelledby="alerts-heading"
          onCheckedChange={(next) => writeNotificationSoundEnabled(Boolean(next))}
        />
      </div>
      <p className="text-caption text-text-muted m-0">
        {enabled
          ? "A sound plays on this PC when a job comes in."
          : "Off on this PC. New jobs still show on the bell."}
      </p>
    </section>
  );
}

/**
 * Today (gridgoph/gridgo-web#327): the To do section's first page, the same
 * order as the phone. Express jobs first, as cards with one big action each;
 * then everything else; what is due today; the Owner's earnings; the sound.
 */
export default function SupplierTodayPage() {
  const { user } = useAuth();
  const { staff, worker } = useShopAccess();
  const [jobs, setJobs] = useState<Order[] | null>(null);
  const [readiness, setReadiness] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<Order | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      try {
        const [nextJobs, nextReadiness] = await Promise.allSettled([
          listJobs(),
          // Readiness is the Owner's (Staff are refused it).
          staff ? Promise.resolve(null) : getSupplierReadiness(),
        ]);
        if (nextReadiness.status === "fulfilled") setReadiness(nextReadiness.value);
        if (nextJobs.status === "rejected") throw nextJobs.reason;
        setJobs(nextJobs.value);
        setError(null);
      } catch (err) {
        setError(
          err instanceof ApiError && err.status === 403
            ? "Today is only for shop accounts."
            : "Could not load your jobs. Check this PC's connection and try again.",
        );
      } finally {
        setLoading(false);
      }
    }, [staff]),
  );

  useLiveReload("jobs", load);
  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => jobs ?? [], [jobs]);
  const now = useAcceptDeadlines(rows);
  const express = useMemo(() => expressQueue(rows), [rows]);
  const others = useMemo(() => afterThat(rows, now), [rows, now]);
  const due = useMemo(() => dueToday(rows, now), [rows, now]);
  const earned = useMemo(() => earnedToday(rows, now), [rows, now]);
  const setup = staff || shopIsReady(readiness) ? null : nextSetupStep(readiness);

  const replace = useCallback(
    (id: string, next: Order | null) => {
      setJobs((current) => {
        if (!current) return current;
        if (!next) return current.filter((job) => job.id !== id);
        return current.map((job) => (job.id === id ? next : job));
      });
      void load();
    },
    [load],
  );

  if (error && !jobs) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (loading && !jobs) return <LoadingBlock label="Loading today's jobs" />;

  const things = express.length + others.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-body text-text-muted m-0">{greeting(now, worker?.name ?? user?.name)}</p>
        <h2 className="text-h1 text-text-primary m-0">{todoTitle(things)}</h2>
      </div>

      {error ? (
        <p role="alert" className="text-body text-text-secondary m-0">
          Could not refresh. What you see is from the last load.{" "}
          <Button variant="link" className="px-0" onClick={() => void load()}>
            Try again
          </Button>
        </p>
      ) : null}

      {express.map((job, index) => (
        <ExpressJobCard
          key={job.id}
          order={job}
          showMoney={!staff}
          shortcuts={index === 0}
          onChanged={(next) => replace(job.id, next)}
          onHandedOver={(handed) => {
            setDone(handed);
            replace(job.id, handed);
          }}
        />
      ))}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <section aria-labelledby="after-heading" className="gg-card flex flex-col gap-2 p-4">
          <h3 id="after-heading" className="text-h3 text-text-primary m-0">
            {express.length ? "After that" : "To do"}
          </h3>
          {setup ? (
            <Link href={setup.href} className="text-body text-text-primary underline">
              {setup.message}
            </Link>
          ) : null}
          {others.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {others.slice(0, 8).map((item) => (
                <li
                  key={item.id}
                  className="border-outline-subtle flex items-center gap-3 border-b py-2 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-body text-text-primary m-0 truncate"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {item.title}
                    </p>
                    <p className="text-caption text-text-muted m-0">Regular · {item.detail}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={item.href} />}
                    nativeButton={false}
                    aria-label={`Open ${item.title}`}
                  >
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-text-secondary m-0">
              {express.length ? "Nothing else waiting on you." : "Nothing waiting on you right now. New jobs show here."}
            </p>
          )}
          <p className="text-caption text-text-muted m-0 mt-auto pt-2">
            Regular jobs keep GRIDGO&rsquo;s check and photos. Express jobs don&rsquo;t.
          </p>
          <Link href="/supplier/jobs" className="text-body text-text-primary flex min-h-11 items-center gap-1 underline">
            All jobs
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </section>

        <section aria-labelledby="due-heading" className="gg-card flex flex-col gap-2 p-4">
          <h3 id="due-heading" className="text-h3 text-text-primary m-0 flex items-center gap-2">
            <CalendarClock className="size-4" aria-hidden />
            Due today
          </h3>
          {due.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {due.slice(0, 6).map((job) => (
                <li key={job.id} className="flex items-baseline justify-between gap-3">
                  <span
                    className="text-body text-text-primary tabular-nums"
                    style={{ fontFamily: "var(--font-medium)" }}
                  >
                    {formatClock(job.readyBy ?? job.deadline)}
                  </span>
                  <Link
                    href={`/supplier/jobs/${encodeURIComponent(job.id)}`}
                    className="text-body text-text-secondary min-w-0 truncate underline"
                  >
                    {workLine(job)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-text-secondary m-0">Nothing else is due today.</p>
          )}
          {staff ? null : (
            <Link href="/supplier/schedule" className="text-body text-text-primary min-h-11 underline">
              Open the schedule
            </Link>
          )}
        </section>

        <div className="flex flex-col gap-4">
          {staff ? null : (
            <Link
              href="/supplier/payouts"
              className="gg-card flex flex-col gap-1 p-4 no-underline hover:bg-overlay-hover"
            >
              <span className="text-caption text-text-muted">You earned today</span>
              <span className="text-h1 text-text-primary tabular-nums">{formatPhp(earned.minor)}</span>
              <span className="text-caption text-text-muted">
                {earned.jobs === 0
                  ? "Nothing marked ready yet today · see Money"
                  : `${earned.jobs} ${earned.jobs === 1 ? "job" : "jobs"} marked ready · see Money`}
              </span>
            </Link>
          )}
          <SoundSwitch />
        </div>
      </div>

      <PhoneAppInvite />

      <ExpressDonePanel
        order={done}
        open={done !== null}
        showMoney={!staff}
        onClose={() => setDone(null)}
      />
    </div>
  );
}
