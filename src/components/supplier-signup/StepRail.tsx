"use client";

import { Check, Clock } from "lucide-react";

import {
  canOpenMission,
  doneCount,
  minutesLabel,
  minutesLeft,
  missionStates,
  MISSIONS,
  REQUIRED_MISSIONS,
  type GuidedSignup,
  type Mission,
  type MissionId,
  type MissionState,
  type RequiredMissionId,
} from "@/lib/guided-signup";
import { cn } from "@/lib/utils";

type Props = {
  signup: GuidedSignup | null;
  /** The step whose content is open beside the rail, if any. */
  active?: MissionId | null;
  onOpen: (id: MissionId) => void;
  /** Whether the optional verification is already done. */
  verified?: boolean;
  /** False before the shop exists: verification needs a shop to verify. */
  verifyOpen?: boolean;
};

/**
 * "Set up your shop in 5 minutes": the whole sign-up as one route.
 *
 * Each step is a stop on one line, so a shop owner sees where they are, what
 * is behind them and how little is left. The stop to do now is the only
 * yellow thing on the line; done stops are filled and say "Done" in words
 * too. Every stop carries its time, because "about a minute" is what gets a
 * busy owner to start one more. The same component is the left column at
 * 1280px and wider and the whole screen below it, like the shop app's map.
 */
export function StepRail({ signup, active = null, onOpen, verified = false, verifyOpen = true }: Props) {
  const states = missionStates(signup);
  const done = doneCount(signup);
  const total = REQUIRED_MISSIONS.length;
  const left = minutesLeft(signup);
  const verify = MISSIONS.find((mission) => mission.id === "verify");

  return (
    <nav aria-label="Sign-up steps" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-body m-0 text-text-primary" style={{ fontFamily: "var(--font-medium)" }} data-testid="mission-count">
          {done === total ? `All ${total} done` : `${done} of ${total} done · about ${left} min left`}
        </p>
        <div
          role="progressbar"
          aria-label={`${done} of ${total} steps done`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="h-2 overflow-hidden rounded-full bg-outline"
        >
          <div
            className="h-2 rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      </div>

      <ol className="m-0 flex list-none flex-col p-0">
        {REQUIRED_MISSIONS.map((mission, index) => (
          <Stop
            key={mission.id}
            mission={mission}
            number={index + 1}
            state={states[mission.id as RequiredMissionId]}
            active={active === mission.id}
            last={index === total - 1}
            onOpen={() => onOpen(mission.id)}
          />
        ))}
      </ol>

      {verify ? (
        <div className="flex flex-col gap-2">
          <p className="text-body m-0 text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
            Optional
          </p>
          <ol className="m-0 list-none p-0">
            <Stop
              mission={verify}
              number={null}
              state={verified ? "done" : "later"}
              openable={verifyOpen && !verified}
              active={active === "verify"}
              last
              onOpen={() => onOpen("verify")}
            />
          </ol>
          <p className="text-caption m-0 text-text-muted">
            {verifyOpen
              ? "Send your papers any time. Verified shops show a badge to clients."
              : "Opens once your shop is set up."}
          </p>
        </div>
      ) : null}
    </nav>
  );
}

function Stop({
  mission,
  number,
  state,
  active,
  last,
  openable,
  onOpen,
}: {
  mission: Mission;
  number: number | null;
  state: MissionState;
  active: boolean;
  last: boolean;
  openable?: boolean;
  onOpen: () => void;
}) {
  const canOpen = openable ?? canOpenMission(state);
  const status =
    state === "done" ? "Done" : state === "waiting" ? "Waiting for owner" : minutesLabel(mission.minutes);

  return (
    <li className="flex">
      <button
        type="button"
        onClick={canOpen ? onOpen : undefined}
        disabled={!canOpen}
        aria-current={active ? "step" : undefined}
        aria-label={`${mission.title}, ${status}`}
        data-testid={`mission-${mission.id}`}
        data-state={state}
        className={cn(
          "group flex w-full min-h-11 gap-3 rounded-field px-2 text-left",
          canOpen ? "cursor-pointer hover:bg-overlay-hover" : "cursor-default",
          active && "bg-surface-variant",
        )}
      >
        {/* The line and its stop. */}
        <span className="flex w-8 flex-col items-center pt-2" aria-hidden>
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              state === "done" && "bg-primary text-primary-foreground",
              state === "current" && "bg-action-yellow text-action-yellow-on",
              (state === "later" || state === "waiting") && "border border-outline bg-surface text-text-muted",
            )}
          >
            {state === "done" ? (
              <Check className="size-4" strokeWidth={3} />
            ) : state === "waiting" ? (
              <Clock className="size-4" />
            ) : (
              <span className="text-caption" style={{ fontFamily: "var(--font-bold)" }}>
                {number ?? "+"}
              </span>
            )}
          </span>
          {last ? null : (
            <span className={cn("w-0.5 flex-1 min-h-4", state === "done" ? "bg-primary" : "bg-outline")} />
          )}
        </span>
        <span className={cn("flex min-w-0 flex-1 items-start gap-3 pt-2", last ? "pb-2" : "pb-5")}>
          <span className="min-w-0 flex-1">
            <span
              className={cn("text-body-lg block", state === "later" ? "text-text-muted" : "text-text-primary")}
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {mission.title}
            </span>
            <span className="text-caption block text-text-muted">{mission.local}</span>
          </span>
          <span
            className={cn(
              "text-caption pt-1 shrink-0",
              state === "done" ? "text-success" : state === "current" ? "text-text-primary" : "text-text-muted",
            )}
            style={state === "current" ? { fontFamily: "var(--font-bold)" } : undefined}
          >
            {status}
          </span>
        </span>
      </button>
    </li>
  );
}
