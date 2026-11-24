"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getMyShopTeam, setMyTeamAlerts } from "@/lib/api/shop-team";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  readDesktopAlertStatus,
  subscribeDesktopAlerts,
  turnOnDesktopAlerts,
} from "@/lib/live/desktopAlerts";

/**
 * Job alerts on the "Get paid and alerts" step (the shop app's JobAlertsCard).
 *
 * Two different things, both needed: the switch is GRIDGO's record of
 * whether this person is told about new jobs (the team's own member
 * preference, `PATCH /me/shop-team/me`), and the button beneath is this
 * browser's permission to show them. Nothing new is built: both are pieces
 * the portal already has.
 */
export function JobAlertsCard() {
  const auth = useAuth();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const browser = useSyncExternalStore(subscribeDesktopAlerts, readDesktopAlertStatus, () => "unsupported" as const);

  useEffect(() => {
    let live = true;
    void getMyShopTeam()
      .then((team) => {
        const self = team.members.find((member) => member.userId === auth.user?.id);
        if (live) setSaved(self?.jobAlerts ?? true);
      })
      .catch(() => {
        if (live) setSaved(true);
      });
    return () => {
      live = false;
    };
  }, [auth.user?.id]);

  async function change(next: boolean) {
    setOn(next);
    setError(null);
    try {
      await setMyTeamAlerts(next);
    } catch {
      setOn(null);
      setError("GRIDGO did not save that. Try again.");
    }
  }

  const value = on ?? saved ?? true;

  return (
    <section className="gg-card flex flex-col gap-3 p-3" aria-labelledby="job-alerts-heading" data-testid="job-alerts">
      <h3 id="job-alerts-heading" className="text-h3 m-0 text-text-primary">
        Job alerts
      </h3>
      <label className="flex min-h-11 cursor-pointer items-start justify-between gap-4">
        <span className="flex flex-col">
          <span className="text-body text-text-primary">Alert me about new jobs</span>
          <span className="text-caption text-text-muted">Pahibalo-a ko · You have an hour to accept each one.</span>
        </span>
        <Switch checked={value} onCheckedChange={(next) => void change(Boolean(next))} aria-label="Alert me about new jobs" />
      </label>
      {error ? (
        <p className="text-caption m-0 text-error" role="alert">
          {error}
        </p>
      ) : null}
      {value ? (
        browser === "on" ? (
          <p className="text-caption m-0 text-success" role="status">
            This computer shows job alerts.
          </p>
        ) : browser === "blocked" ? (
          <p className="text-caption m-0 text-text-muted">
            This browser blocks alerts from GRIDGO. Allow them in the browser&apos;s site settings.
          </p>
        ) : browser === "unsupported" ? null : (
          <Button variant="outline" className="self-start" onClick={() => void turnOnDesktopAlerts()}>
            Show alerts on this computer
          </Button>
        )
      ) : null}
    </section>
  );
}
