/**
 * Shop performance figures, composed from the jobs the API already returns.
 *
 * There is no analytics endpoint, and inventing one here would mean a second
 * client. Everything on the dashboard is therefore derived from `listJobs()`
 * and from fields the server actually sends a supplier: its own price, its own
 * ready-by date, the timestamp it marked the work ready, and the job timeline.
 *
 * Nothing here reads commission or the client total. Those are Operations
 * figures and the supplier route tree is tested against them.
 */

import type { Order } from "@/lib/api/types";
import { presentOrderState } from "@/lib/order-state";

import { weekContaining } from "./schedule";

/**
 * The shop's own journey through a job, in the order the work happens.
 *
 * Several API states collapse into one bar because the distinction is
 * Operations', not the shop's: a job waiting for a downpayment and a job whose
 * downpayment is being checked are both "waiting on payment" from the floor.
 * Order carries the meaning here — the chart is a pipeline, so the bars are
 * never re-sorted by size.
 */
export const PIPELINE_STAGES: readonly { id: string; label: string; states: readonly string[] }[] = [
  { id: "decision", label: "Awaiting your decision", states: ["supplier_assigned"] },
  {
    id: "payment",
    label: "Waiting on payment",
    states: [
      "awaiting_initial_payment",
      "awaiting_downpayment",
      "initial_payment_review",
      "downpayment_review",
    ],
  },
  { id: "ready-to-start", label: "Ready to start", states: ["payment_authorized"] },
  { id: "production", label: "In production", states: ["production"] },
  { id: "qc", label: "In self-QC", states: ["supplier_self_qc"] },
  { id: "dispatch", label: "Waiting for a rider", states: ["ready_for_dispatch"] },
  {
    id: "with-rider",
    label: "With the rider",
    states: ["rider_assigned", "picked_up", "out_for_delivery", "awaiting_collection"],
  },
  { id: "delivered", label: "Delivered", states: ["delivered", "issue_window_open"] },
  { id: "done", label: "Closed", states: ["completed", "payout_released"] },
];

/** States where the job is finished as far as the shop's board is concerned. */
const CLOSED_STATES = new Set(["completed", "payout_released", "cancelled"]);

/** What a job pays this shop. `supplierSubtotalMinor` is the stored field. */
export function jobEarningsMinor(job: Order): number {
  return job.supplierSubtotalMinor ?? job.supplierPriceMinor ?? 0;
}

/** Still on the board: not closed, not cancelled. */
export function isOpenJob(job: Order): boolean {
  return !CLOSED_STATES.has(job.state) && !job.cancelledAt;
}

/** Sum of what every open job pays the shop. */
export function onTheBoardMinor(jobs: Order[]): number {
  return jobs.filter(isOpenJob).reduce((total, job) => total + jobEarningsMinor(job), 0);
}

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : at;
}

/**
 * When the shop started making this job.
 *
 * Read off the timeline rather than `createdAt`, which is when the *client*
 * placed the order — a job that sat in matching for three days would otherwise
 * report three days of shop turnaround it never spent.
 */
export function productionStartedAt(job: Order): number | null {
  const timeline = Array.isArray(job.timeline) ? job.timeline : [];
  let earliest: number | null = null;
  for (const entry of timeline) {
    if (entry?.state !== "production") continue;
    const at = parse(entry.at);
    if (at === null) continue;
    if (earliest === null || at < earliest) earliest = at;
  }
  return earliest;
}

/** When the shop marked the work ready. The only "finished" stamp it owns. */
export function finishedAt(job: Order): number | null {
  return parse(job.readyAt);
}

export type OnTimeSummary = {
  /** Jobs that had both a ready-by date and a finished stamp. */
  measured: number;
  onTime: number;
  /** 0–1, or null when nothing is measurable yet. */
  rate: number | null;
};

/**
 * On-time is measured against `readyBy` — the shop's own date — never the
 * padded date the client was told. A job with no ready-by date is not counted
 * as late; it is not counted at all, and the figure says how many it saw.
 */
export function onTimeSummary(jobs: Order[]): OnTimeSummary {
  let measured = 0;
  let onTime = 0;
  for (const job of jobs) {
    const done = finishedAt(job);
    const due = parse(job.readyBy);
    if (done === null || due === null) continue;
    measured += 1;
    if (done <= due) onTime += 1;
  }
  return { measured, onTime, rate: measured === 0 ? null : onTime / measured };
}

/** Median hours from starting production to marking ready. */
export function medianProductionHours(jobs: Order[]): number | null {
  const spans: number[] = [];
  for (const job of jobs) {
    const started = productionStartedAt(job);
    const done = finishedAt(job);
    if (started === null || done === null || done < started) continue;
    spans.push((done - started) / 3_600_000);
  }
  if (spans.length === 0) return null;
  spans.sort((a, b) => a - b);
  const mid = Math.floor(spans.length / 2);
  return spans.length % 2 === 1 ? spans[mid] : (spans[mid - 1] + spans[mid]) / 2;
}

export type WeekBucket = {
  /** Monday of the week, as epoch ms — the x-axis key. */
  weekStart: number;
  /** Short axis label, e.g. "18 Aug". */
  label: string;
  /** Jobs finished that week. */
  jobs: number;
  /** What those jobs pay the shop, in PHP minor units. */
  earningsMinor: number;
};

function weekLabel(start: Date): string {
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short" }).format(start);
}

/**
 * Work finished per week, for the last `weeks` weeks including this one.
 *
 * Empty weeks are present with a zero rather than skipped: a quiet fortnight is
 * information, and a line that closes the gap would draw a slope the shop never
 * worked.
 */
export function finishedByWeek(
  jobs: Order[],
  weeks = 8,
  now: Date = new Date(),
): WeekBucket[] {
  const buckets = new Map<number, WeekBucket>();

  const thisWeek = weekContaining(now);
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(thisWeek.start);
    start.setDate(start.getDate() - i * 7);
    buckets.set(start.getTime(), {
      weekStart: start.getTime(),
      label: weekLabel(start),
      jobs: 0,
      earningsMinor: 0,
    });
  }

  const earliest = Math.min(...buckets.keys());
  for (const job of jobs) {
    const done = finishedAt(job);
    if (done === null) continue;
    const start = weekContaining(new Date(done)).start.getTime();
    if (start < earliest) continue;
    const bucket = buckets.get(start);
    if (!bucket) continue;
    bucket.jobs += 1;
    bucket.earningsMinor += jobEarningsMinor(job);
  }

  return [...buckets.values()].sort((a, b) => a.weekStart - b.weekStart);
}

export type StageCount = {
  id: string;
  label: string;
  jobs: number;
  earningsMinor: number;
};

/**
 * Jobs per pipeline stage, in pipeline order.
 *
 * Stages the shop has nothing in are dropped, so a small board does not render
 * as nine mostly-empty rows — but the surviving stages keep their pipeline
 * order rather than being ranked by size.
 */
export function stageCounts(jobs: Order[]): StageCount[] {
  const byState = new Map<string, StageCount>();
  const stageFor = new Map<string, string>();
  for (const stage of PIPELINE_STAGES) {
    byState.set(stage.id, { id: stage.id, label: stage.label, jobs: 0, earningsMinor: 0 });
    for (const state of stage.states) stageFor.set(state, stage.id);
  }

  for (const job of jobs) {
    const stageId = stageFor.get(job.state);
    if (!stageId) continue;
    const bucket = byState.get(stageId);
    if (!bucket) continue;
    bucket.jobs += 1;
    bucket.earningsMinor += jobEarningsMinor(job);
  }

  return PIPELINE_STAGES.map((stage) => byState.get(stage.id)!).filter((s) => s.jobs > 0);
}

/**
 * States this shop holds that no pipeline stage claims.
 *
 * The API can move an order into a state the portal has not met yet. Returning
 * them lets the screen say so instead of silently dropping the jobs out of a
 * chart that claims to show the whole board.
 */
export function unmappedStates(jobs: Order[]): string[] {
  const known = new Set(PIPELINE_STAGES.flatMap((stage) => stage.states));
  const missing = new Set<string>();
  for (const job of jobs) {
    if (!known.has(job.state)) missing.add(presentOrderState(job.state).label);
  }
  return [...missing].sort((a, b) => a.localeCompare(b));
}
