import {
  CircleCheck,
  CircleX,
  Clock,
  SquarePen,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type { TimelineEntry } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  presentOrderState,
  presentTimelineActor,
  type StatusIconName,
  type StatusTone,
} from "@/lib/order-state";

const ICONS: Record<StatusIconName, LucideIcon> = {
  "circle-check": CircleCheck,
  "triangle-alert": TriangleAlert,
  "circle-x": CircleX,
  clock: Clock,
  "square-pen": SquarePen,
};

/** Tone → the marker's ink. Matches StatusChip so one state reads one way. */
const TONE_INK: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  info: "text-info",
  neutral: "text-text-muted",
};

type Props = {
  entries: TimelineEntry[];
  /**
   * Put the most recent event at the top.
   *
   * Off by default because Operations reads an order forwards, as a record of
   * what happened. A supplier opens the same list to answer "where is this
   * now", and the answer was at the bottom of a growing list.
   */
  newestFirst?: boolean;
};

/** Who did what and when, with the state each event moved the order into. */
export function Timeline({ entries, newestFirst = false }: Props) {
  if (!entries.length) {
    return (
      <p className="text-body text-text-muted m-0">No timeline events yet.</p>
    );
  }

  const chronological = [...entries].sort((a, b) => a.at.localeCompare(b.at));
  const latest = chronological[chronological.length - 1];
  const ordered = newestFirst ? [...chronological].reverse() : chronological;

  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {ordered.map((entry, i) => {
        const state = presentOrderState(entry.state);
        const Icon = ICONS[state.icon];
        const isLatest = entry === latest;
        const isLast = i === ordered.length - 1;

        return (
          <li
            key={`${entry.at}-${entry.state}-${i}`}
            className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3"
          >
            {/*
              The rail is drawn per row rather than as one border on the list,
              so the final row can stop the line at its own marker instead of
              trailing past the last event into empty space.
            */}
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-pill border",
                  isLatest
                    ? "border-outline bg-surface-variant"
                    : "border-outline-subtle bg-surface",
                  TONE_INK[state.tone],
                )}
                aria-hidden
              >
                <Icon size={13} strokeWidth={2} />
              </span>
              {!isLast ? (
                <span className="bg-outline-subtle w-px flex-1" aria-hidden />
              ) : null}
            </div>

            <div className={cn("min-w-0", isLast ? "pb-0" : "pb-4")}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p
                  className="text-body text-text-primary m-0"
                  style={{ fontFamily: "var(--font-medium)" }}
                >
                  {state.label}
                </p>
                {isLatest ? (
                  <span className="text-overline text-text-muted rounded-pill border border-outline-subtle px-2 py-0.5 uppercase">
                    Now
                  </span>
                ) : null}
              </div>
              <p className="text-caption text-text-muted m-0 mt-0.5">
                {formatDateTime(entry.at)} · {presentTimelineActor(entry.by)}
              </p>
              {entry.note ? (
                <p className="text-caption text-text-secondary m-0 mt-1">
                  {entry.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
