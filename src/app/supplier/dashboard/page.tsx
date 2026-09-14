"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import { Banknote, CircleCheck, PackageCheck, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatCard } from "@/components/ui/StatCard";
import { ApiError, listJobs } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatPhp } from "@/lib/format";

import {
  finishedByWeek,
  medianProductionHours,
  onTheBoardMinor,
  onTimeSummary,
  stageCounts,
  unmappedStates,
} from "../_lib/dashboard";

const WEEKS = 8;

/*
  One series per chart, so neither needs a legend and neither leans on colour to
  tell things apart.

  That is a constraint, not a preference: GRIDGO's chart ramp is a monochrome
  scale plus the brand gold, which cannot carry categorical meaning, and the
  palette is not ours to extend. So the charts are built not to ask it to — the
  week chart is a single line, and the pipeline chart puts identity in the row
  label rather than in the bar's fill.
*/
const weekChartConfig = {
  earningsMinor: { label: "Work finished", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

const stageChartConfig = {
  jobs: { label: "Jobs", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

/** Whole hours below two days, then days — a shop does not plan in 37.4 hours. */
function formatDuration(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/** Compact peso for an axis, where the full figure would collide. */
function axisPhp(minor: number): string {
  const pesos = minor / 100;
  if (pesos >= 1000) return `₱${Math.round(pesos / 1000)}k`;
  return `₱${Math.round(pesos)}`;
}

export default function SupplierDashboardPage() {
  const [jobs, setJobs] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        setJobs(await listJobs());
      } catch (err) {
        setJobs(null);
        if (err instanceof ApiError) {
          setError(
            err.status === 403
              ? "This dashboard is only available to supplier accounts."
              : `Could not load your jobs (${err.code}). Check the API and try again.`,
          );
        } else {
          setError(
            "Network error loading your jobs. Confirm the demo API is running, then retry.",
          );
        }
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload("jobs", load);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => jobs ?? [], [jobs]);
  const weeks = useMemo(() => finishedByWeek(rows, WEEKS), [rows]);
  const stages = useMemo(() => stageCounts(rows), [rows]);
  const onTime = useMemo(() => onTimeSummary(rows), [rows]);
  const median = useMemo(() => medianProductionHours(rows), [rows]);
  const unmapped = useMemo(() => unmappedStates(rows), [rows]);

  const thisWeek = weeks[weeks.length - 1];
  const finishedThisWeek = thisWeek?.earningsMinor ?? 0;
  const anyFinished = weeks.some((week) => week.jobs > 0);

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

  if (loading && !jobs) {
    return <LoadingBlock label="Loading your shop's figures" />;
  }

  if (!rows.length) {
    return (
      <EmptyState
        title="Nothing to measure yet"
        body="Your first assigned job starts this dashboard. Earnings, on-time delivery and production time all come from the jobs you work."
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="On the board"
          value={formatPhp(onTheBoardMinor(rows))}
          hint="Every job you are still working"
          icon={Banknote}
        />
        <StatCard
          label="Finished this week"
          value={formatPhp(finishedThisWeek)}
          hint={`${thisWeek?.jobs ?? 0} job${thisWeek?.jobs === 1 ? "" : "s"} marked ready`}
          icon={PackageCheck}
        />
        <StatCard
          label="On time"
          value={formatRate(onTime.rate)}
          hint={
            onTime.measured === 0
              ? "No finished job has a ready-by date yet"
              : `${onTime.onTime} of ${onTime.measured} met your ready-by date`
          }
          icon={CircleCheck}
        />
        <StatCard
          label="Typical production"
          value={formatDuration(median)}
          hint={
            median === null
              ? "Measured once you finish a job you started"
              : "Median, from starting to marking ready"
          }
          icon={Timer}
        />
      </div>

      <section className="gg-card" aria-labelledby="finished-heading">
        <h2 id="finished-heading" className="text-h3 text-text-primary m-0 mb-1">
          What you finished
        </h2>
        <p className="text-body text-text-secondary m-0 mb-3">
          The last {WEEKS} weeks, valued at what each job pays your shop, counted on the
          day you marked it ready. This is work completed, not money released — milestone
          payouts live on the Payouts screen.
        </p>
        {anyFinished ? (
          <ChartContainer
            config={weekChartConfig}
            className="h-64 w-full"
            aria-label={`Value of work finished each week for the last ${WEEKS} weeks`}
          >
            <AreaChart data={weeks} accessibilityLayer margin={{ left: 4, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(value) => axisPhp(Number(value))}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => `Week of ${label}`}
                    formatter={(value) => formatPhp(Number(value))}
                  />
                }
              />
              <Area
                dataKey="earningsMinor"
                type="monotone"
                stroke="var(--color-earningsMinor)"
                strokeWidth={2}
                fill="var(--color-earningsMinor)"
                fillOpacity={0.12}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <p className="text-body text-text-muted m-0">
            Nothing marked ready in the last {WEEKS} weeks. The line starts with your
            first finished job.
          </p>
        )}
      </section>

      <section className="gg-card" aria-labelledby="pipeline-heading">
        <h2 id="pipeline-heading" className="text-h3 text-text-primary m-0 mb-1">
          Where your jobs are
        </h2>
        <p className="text-body text-text-secondary m-0 mb-3">
          Every job on your board, at the stage it has reached. Read top to bottom — this
          is the order the work happens in, not a ranking.
        </p>
        {stages.length ? (
          <ChartContainer
            config={stageChartConfig}
            className="w-full"
            style={{ height: Math.max(160, stages.length * 44 + 40) }}
            aria-label="Number of jobs at each stage of your pipeline"
          >
            <BarChart
              data={stages}
              layout="vertical"
              accessibilityLayer
              margin={{ left: 4, right: 32 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                tickLine={false}
                axisLine={false}
                width={168}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) => {
                      const worth = (item?.payload as { earningsMinor?: number })
                        ?.earningsMinor;
                      const jobs = `${value} job${Number(value) === 1 ? "" : "s"}`;
                      return worth ? `${jobs} · ${formatPhp(worth)}` : jobs;
                    }}
                  />
                }
              />
              <Bar
                dataKey="jobs"
                fill="var(--color-jobs)"
                radius={[0, 4, 4, 0]}
                barSize={20}
              >
                <LabelList
                  dataKey="jobs"
                  position="right"
                  className="fill-text-secondary"
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="text-body text-text-muted m-0">
            No job is at a tracked stage right now.
          </p>
        )}
        {unmapped.length ? (
          <p className="text-caption text-text-muted m-0 mt-3">
            Not shown above: {unmapped.join(", ")}. These jobs sit at a stage this chart
            does not track yet.
          </p>
        ) : null}
      </section>
    </div>
  );
}
