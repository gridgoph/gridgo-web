"use client";

import { BellOff, BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/api/types";
import { desktopAlertScope, type DesktopAlertStatus } from "@/lib/live/desktopAlerts";
import { useDesktopAlerts } from "@/lib/live/useDesktopAlerts";
import { cn } from "@/lib/utils";

/**
 * Desktop alerts on the Desk: a one-time invitation while the browser has not
 * been asked, and a quiet footer line that always says where things stand.
 * Permission is only ever requested from the "Turn on" press, never on load.
 */

type Copy = { headline: string; detail: string };

export function desktopAlertsCopy(status: DesktopAlertStatus, role: Role): Copy {
  const scope = desktopAlertScope(role);
  switch (status) {
    case "on":
      return {
        headline: "Desktop alerts on",
        detail: `For ${scope} while GRIDGO is in another tab or window`,
      };
    case "blocked":
      return {
        headline: "Desktop alerts blocked",
        detail: "Allow notifications for this site in your browser settings",
      };
    case "unsupported":
      return {
        headline: "Desktop alerts unavailable",
        detail: "This browser can't show them. The bell and sound still work.",
      };
    default:
      return {
        headline: "Desktop alerts off",
        detail: `Turn on to see ${scope} while you're in another tab`,
      };
  }
}

/**
 * Same tile as a Desk slip. Filled means "on" here; the prompt uses the hollow
 * tile in full ink so it never reads as an unread slip.
 */
function StatusIcon({ tone }: { tone: "on" | "off" | "invite" }) {
  const Icon = tone === "off" ? BellOff : BellRing;
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-pill border",
        tone === "on" && "border-primary bg-primary text-primary-foreground",
        tone === "off" && "border-outline-subtle bg-surface text-text-muted",
        tone === "invite" && "border-outline bg-surface text-text-primary",
      )}
    >
      <Icon size={14} strokeWidth={2} />
    </span>
  );
}

/** The one-time invitation. Gone after "Not now" or any answer to the browser. */
export function DesktopAlertsPrompt({ role }: { role: Role }) {
  const { promptVisible, requesting, turnOn, dismissPrompt } = useDesktopAlerts(role);
  if (!promptVisible) return null;
  return (
    <section
      data-slot="desk-alerts-prompt"
      aria-labelledby="desk-alerts-prompt-title"
      className="bg-surface-variant mx-4 mb-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-field p-3"
    >
      <StatusIcon tone="invite" />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <p
            id="desk-alerts-prompt-title"
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            Get desktop alerts
          </p>
          <p className="text-caption text-text-secondary m-0">
            {requesting
              ? "Choose Allow in your browser's prompt."
              : `See ${desktopAlertScope(role)} on your screen while GRIDGO is in another tab or window.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={requesting}
            onClick={() => void turnOn()}
          >
            Turn on
          </Button>
          <Button variant="ghost" size="sm" disabled={requesting} onClick={dismissPrompt}>
            Not now
          </Button>
        </div>
      </div>
    </section>
  );
}

/** The standing control at the foot of the Desk. Hidden while the prompt is up. */
export function DesktopAlertsRow({ role }: { role: Role }) {
  const { status, promptVisible, requesting, turnOn, turnOff } = useDesktopAlerts(role);
  if (promptVisible) return null;
  const { headline, detail } = desktopAlertsCopy(status, role);
  const canTurnOn = status === "ask" || status === "off";

  return (
    <div
      data-slot="desk-alerts"
      data-state={status}
      className="border-outline-subtle grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-t px-4 py-2"
    >
      <StatusIcon tone={status === "on" ? "on" : "off"} />
      <div className="flex min-w-0 flex-col gap-0.5" aria-live="polite">
        <span
          className="text-body text-text-primary"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {headline}
        </span>
        <span className="text-caption text-text-muted">
          {requesting ? "Choose Allow in your browser's prompt." : detail}
        </span>
      </div>
      {status === "on" ? (
        <Button variant="ghost" size="sm" onClick={turnOff}>
          Turn off
        </Button>
      ) : canTurnOn ? (
        <Button
          variant="outline"
          size="sm"
          disabled={requesting}
          onClick={() => void turnOn()}
        >
          Turn on
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}
