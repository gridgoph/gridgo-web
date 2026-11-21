/**
 * The shop's Today page (gridgoph/gridgo-web#327): Express first, then
 * everything else in the order To do already ranks it, then what is due today
 * and, for the Owner, what today's finished work earned. Pure, so it is tested
 * without React.
 */
import type { Order } from "@/lib/api/types";
import { expressStage, isExpressDocumentOrder, type ExpressStage } from "@/lib/express-shop";

import { finishedAt, isOpenJob, jobEarningsMinor } from "./dashboard";
import { nextObligations, type NextObligation } from "./home-next";

const STAGE_RANK: Record<ExpressStage, number> = { offer: 0, counter: 1, working: 2, rider: 3 };

/** Express jobs that want the shop now, offers first and the soonest clock first. */
export function expressQueue(jobs: readonly Order[]): Order[] {
  return jobs
    .filter((job) => expressStage(job) !== null)
    .sort((a, b) => {
      const rank = STAGE_RANK[expressStage(a)!] - STAGE_RANK[expressStage(b)!];
      if (rank) return rank;
      const at = (job: Order) => Date.parse(job.shopAcceptance?.deadlineAt ?? job.readyBy ?? "") || 0;
      return at(a) - at(b);
    });
}

/** "After that": every other job's next step, ranked as before. */
export function afterThat(jobs: readonly Order[], now: Date): NextObligation[] {
  return nextObligations(
    jobs.filter((job) => !isExpressDocumentOrder(job)),
    now,
  );
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Open jobs whose own ready-by falls today, earliest first. */
export function dueToday(jobs: readonly Order[], now: Date): Order[] {
  return jobs
    .filter((job) => {
      if (!isOpenJob(job)) return false;
      const at = Date.parse(job.readyBy ?? job.deadline ?? "");
      return Number.isFinite(at) && sameDay(new Date(at), now) && !job.readyAt;
    })
    .sort((a, b) => Date.parse(a.readyBy ?? a.deadline ?? "") - Date.parse(b.readyBy ?? b.deadline ?? ""));
}

/** Work marked ready today, at what each job pays the shop. Owner only. */
export function earnedToday(
  jobs: readonly Order[],
  now: Date,
): { minor: number; jobs: number; express: number } {
  let minor = 0;
  let count = 0;
  let express = 0;
  for (const job of jobs) {
    const at = finishedAt(job);
    if (at === null || !sameDay(new Date(at), now) || job.state === "cancelled") continue;
    minor += jobEarningsMinor(job);
    count += 1;
    if (isExpressDocumentOrder(job)) express += 1;
  }
  return { minor, jobs: count, express };
}

/** A greeting by the clock, as the phone app says it. */
export function greeting(now: Date, name: string | null | undefined): string {
  const hour = now.getHours();
  const part = hour < 12 ? "Magandang umaga" : hour < 18 ? "Magandang hapon" : "Magandang gabi";
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? `${part}, ${first}!` : `${part}!`;
}
