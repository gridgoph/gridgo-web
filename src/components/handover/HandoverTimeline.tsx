"use client";

/**
 * The shop-to-rider handover as the steps this order's flow has, in the order
 * they happen (`handoverSteps` in `src/lib/shop-handover.ts`). Numbered,
 * because it is a sequence. Every state carries a word as well as a mark, so
 * it reads in greyscale.
 */

import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import type { Order } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import {
  FORCED_BY_GRIDGO,
  handoverFlowOf,
  handoverSteps,
  type HandoverStepStatus,
} from "@/lib/shop-handover";
import { cn } from "@/lib/utils";

const MARK: Record<
  HandoverStepStatus,
  { icon: LucideIcon; word: string; className: string }
> = {
  done: { icon: CircleCheck, word: "Done", className: "text-success" },
  current: { icon: CircleDot, word: "Now", className: "text-text-primary" },
  upcoming: { icon: Circle, word: "Next", className: "text-text-muted" },
  forced: { icon: ShieldAlert, word: FORCED_BY_GRIDGO, className: "text-warning" },
  not_recorded: {
    icon: CircleDashed,
    word: "Not on record",
    className: "text-text-muted",
  },
};

export function HandoverTimeline({
  order,
  audience = "staff",
}: {
  order: Order;
  /** Staff read "you" as Operations. A shop reads the same steps in its own words. */
  audience?: "staff" | "shop";
}) {
  const flow = handoverFlowOf(order);
  const steps = handoverSteps(order, formatDateTime, audience);
  if (!flow || steps.length === 0) return null;
  const arrivedPacked = order.shopHandover?.arrivedPacked ?? [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-muted m-0">
        {flow === "rider_packs"
          ? "New handover: GRIDGO approves the finished work, then the rider checks it unpacked and packs it in front of the shop."
          : "Older handover: the shop packs the job itself, then the rider counts and checks it at pickup."}
      </p>
      <ol className="m-0 flex list-none flex-col p-0" aria-label="Handover steps">
        {steps.map((step, index) => {
          const mark = MARK[step.status];
          const Icon = mark.icon;
          const last = index === steps.length - 1;
          return (
            <li key={step.id} className="relative flex gap-3 pb-3 last:pb-0">
              {!last ? (
                <span
                  aria-hidden
                  className="border-outline-subtle absolute top-7 bottom-0 left-3 border-l"
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "bg-surface relative flex size-6 shrink-0 items-center justify-center",
                  mark.className,
                )}
              >
                <Icon size={18} strokeWidth={2} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={cn(
                      "text-body",
                      step.status === "upcoming"
                        ? "text-text-secondary"
                        : "text-text-primary",
                    )}
                    style={{
                      fontFamily:
                        step.status === "current"
                          ? "var(--font-bold)"
                          : "var(--font-medium)",
                    }}
                  >
                    {index + 1}. {step.label}
                  </span>
                  <span className={cn("text-caption", mark.className)}>{mark.word}</span>
                </div>
                {step.at ? (
                  <span className="text-caption text-text-muted">
                    {formatDateTime(step.at)}
                  </span>
                ) : null}
                {step.detail ? (
                  <span className="text-body text-text-secondary">{step.detail}</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {audience === "staff" &&
      arrivedPacked.length &&
      typeof order.shopArrivedPackedCount === "number" ? (
        <p className="text-caption text-text-muted m-0">
          {order.shopArrivedPackedCount === 1
            ? "This is the only time this shop has presented a job already packed."
            : `This shop has presented ${order.shopArrivedPackedCount} jobs already packed, across its orders. It is a record, not a deduction.`}
        </p>
      ) : null}
    </div>
  );
}
