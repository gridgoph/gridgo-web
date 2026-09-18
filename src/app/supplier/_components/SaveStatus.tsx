"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/** How long the shop gets to keep typing before the draft goes to the API. */
export const AUTOSAVE_DELAY_MS = 800;

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  /** The draft is waiting on a field the API would refuse; nothing is lost. */
  | { kind: "held"; reason: string }
  | { kind: "error"; message: string };

/** Plain words for how old the last save is; whole minutes, then hours. */
export function savedAgoLine(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "Saved just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Saved ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `Saved ${hours} ${hours === 1 ? "hr" : "hrs"} ago`;
}

export function saveStatusLine(state: SaveState, now: number): string | null {
  switch (state.kind) {
    case "saving":
      return "Saving…";
    case "saved":
      return savedAgoLine(state.at, now);
    case "held":
      return `Not saved yet — ${state.reason}`;
    case "error":
      return "Could not save";
    default:
      return null;
  }
}

type Props = {
  state: SaveState;
  onRetry: () => void;
};

/**
 * Saving is a state, not an action: one quiet line that says where the draft
 * stands, and a retry only when a save actually failed.
 */
export function SaveStatus({ state, onRetry }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.kind !== "saved") return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [state]);

  const line = saveStatusLine(state, now);
  if (!line) return null;
  const failed = state.kind === "error";
  return (
    <div
      role="status"
      aria-live="polite"
      className="text-caption flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1"
    >
      <span className={failed ? "text-destructive" : "text-text-muted"}>
        {failed ? `${line} — ${state.message}` : line}
      </span>
      {failed ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
