import { Circle, CircleCheck } from "lucide-react";

import { Progress, ProgressLabel } from "@/components/ui/progress";
import type { FoundingTesterProgress } from "@/lib/api/types";
import { MISSIONS, MISSION_COUNT, progressText } from "@/lib/founding-testers";

function summary(progress: FoundingTesterProgress): string {
  const done = MISSIONS.filter((m) => progress.missions[m.key]).map((m) =>
    m.label.toLowerCase(),
  );
  return done.length
    ? `${progressText(progress)} missions done: ${done.join(", ")}`
    : `${progressText(progress)} missions done`;
}

/**
 * The three missions as a row of marks with the count beside them, for a
 * table cell. Each mark is a check or an empty circle, never colour alone.
 */
export function MissionMeter({ progress }: { progress: FoundingTesterProgress }) {
  return (
    <span
      className="inline-flex items-center gap-2"
      aria-label={summary(progress)}
      role="img"
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {MISSIONS.map((mission) =>
          progress.missions[mission.key] ? (
            <CircleCheck
              key={mission.key}
              size={16}
              strokeWidth={2}
              className="text-success"
            />
          ) : (
            <Circle
              key={mission.key}
              size={16}
              strokeWidth={2}
              className="text-text-muted"
            />
          ),
        )}
      </span>
      <span className="text-body text-text-primary tabular-nums" aria-hidden>
        {progressText(progress)}
      </span>
    </span>
  );
}

/** The missions in order, each with what proves it and whether it is done. */
export function MissionList({ progress }: { progress: FoundingTesterProgress }) {
  const done = Math.min(progress.completedCount, MISSION_COUNT);
  return (
    <div className="flex flex-col gap-3">
      <Progress
        value={done}
        max={MISSION_COUNT}
        getAriaValueText={() => `${progressText(progress)} missions done`}
      >
        <ProgressLabel>
          <span className="text-body text-text-primary">Missions done</span>
        </ProgressLabel>
        <span className="text-body text-text-primary ml-auto tabular-nums">
          {progressText(progress)}
        </span>
      </Progress>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {MISSIONS.map((mission, index) => {
          const complete = progress.missions[mission.key];
          return (
            <li
              key={mission.key}
              className="border-outline flex items-start gap-3 rounded-field border px-3 py-2"
            >
              {complete ? (
                <CircleCheck
                  size={20}
                  strokeWidth={2}
                  className="text-success mt-0.5 shrink-0"
                  aria-hidden
                />
              ) : (
                <Circle
                  size={20}
                  strokeWidth={2}
                  className="text-text-muted mt-0.5 shrink-0"
                  aria-hidden
                />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="text-body text-text-primary m-0"
                  style={{ fontFamily: "var(--font-medium)" }}
                >
                  {index + 1}. {mission.label}
                </p>
                <p className="text-caption text-text-muted m-0 mt-0.5">{mission.proof}</p>
              </div>
              <span
                className={`text-caption shrink-0 ${complete ? "text-success" : "text-text-muted"}`}
              >
                {complete ? "Done" : "Not yet"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
