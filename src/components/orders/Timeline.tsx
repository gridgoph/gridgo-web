import type { TimelineEntry } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { presentOrderState, presentTimelineActor } from "@/lib/order-state";

type Props = {
  entries: TimelineEntry[];
};

/** Chronological accountability: who did what and when. */
export function Timeline({ entries }: Props) {
  if (!entries.length) {
    return (
      <p className="text-body text-text-muted m-0">No timeline events yet.</p>
    );
  }

  const ordered = [...entries].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {ordered.map((entry, i) => {
        const state = presentOrderState(entry.state);
        return (
          <li
            key={`${entry.at}-${entry.state}-${i}`}
            className="flex gap-3 border-l-2 border-outline pl-3"
          >
            <div className="min-w-0">
              <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                {state.label}
              </p>
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
