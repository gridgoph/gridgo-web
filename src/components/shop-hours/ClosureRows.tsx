import type { ReactNode } from "react";

import type { ScheduleClosure } from "@/lib/api/types";
import { closureLabel } from "@/lib/operating-hours";
import {
  MAX_CLOSED_DAYS,
  closedDayCount,
  closureLengthLabel,
} from "@/lib/shop-hours";
import { cn } from "@/lib/utils";

/**
 * A shop's closure dates, soonest first, each with its length and whether it
 * is past or running today, and the count against the API's 90-date limit.
 * Past closures stay listed because they still count toward that limit.
 * `actions` puts the shop's own Change / Remove controls on each row.
 */
export function ClosureRows({
  closures,
  today,
  actions,
  empty,
}: {
  closures: readonly ScheduleClosure[];
  today: string;
  actions?: (closure: ScheduleClosure) => ReactNode;
  empty: string;
}) {
  if (!closures.length) {
    return <p className="text-body text-text-secondary m-0">{empty}</p>;
  }
  const used = closedDayCount(closures);
  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Closure dates">
        {closures.map((closure) => {
          const past = closure.endDay < today;
          const running = !past && closure.startDay <= today;
          return (
            <li
              key={`${closure.startDay}-${closure.endDay}`}
              className="rounded-field border border-outline flex min-h-11 items-center gap-2 py-2 pr-1 pl-3"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn("text-body", past ? "text-text-muted" : "text-text-primary")}
                  style={past ? undefined : { fontFamily: "var(--font-medium)" }}
                >
                  {closureLabel(closure)}
                </span>
                <span className="text-caption text-text-muted">
                  {closureLengthLabel(closure)}
                  {past ? ", passed" : running ? ", closed today" : ""}
                </span>
              </span>
              {actions ? actions(closure) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-text-muted m-0 tabular-nums">
        {used} of {MAX_CLOSED_DAYS} closure dates used.
      </p>
    </div>
  );
}
