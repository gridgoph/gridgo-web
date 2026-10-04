"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { adminErrorMessage } from "@/app/admin/_lib/errors";
import {
  groupSeasons,
  seasonErrorMessage,
  seasonErrorNeedsReload,
} from "@/app/admin/_lib/season-windows";
import { SeasonCard } from "@/app/admin/season-windows/_components/SeasonCard";
import { SeasonEditor } from "@/app/admin/season-windows/_components/SeasonEditor";
import { SeasonNoticeSwitch } from "@/app/admin/season-windows/_components/SeasonNoticeSwitch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import {
  deleteSeasonWindow,
  getSeasonPushSettings,
  listSeasonWindows,
  seasonPushDryRun,
} from "@/lib/api/client";
import type {
  SeasonPushDryRun,
  SeasonPushSettings,
  SeasonWindow,
  SeasonWindowsEnvelope,
} from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

/**
 * Season windows — Super Admin only.
 *
 * Super Admin names the stretches of the year when shops fill early and
 * writes what clients read about them. Clients see each season shaded on the
 * deadline calendar and, six to four weeks ahead, as a home banner. One
 * pre-season push per season is possible, but only with the notices switch on,
 * which is off until someone deliberately turns it on here.
 */
export default function AdminSeasonWindowsPage() {
  const [envelope, setEnvelope] = useState<SeasonWindowsEnvelope | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SeasonPushSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<SeasonPushDryRun | null>(null);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const [editing, setEditing] = useState<SeasonWindow | "new" | null>(null);
  const [deleting, setDeleting] = useState<SeasonWindow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const recount = useCallback(async () => {
    setChecking(true);
    try {
      setDryRun(await seasonPushDryRun());
      setDryRunError(null);
    } catch (err) {
      setDryRunError(
        seasonErrorMessage(err, "Could not count who would receive a notice. Try Count again."),
      );
    } finally {
      setChecking(false);
    }
  }, []);

  const load = useSerializedLoad(
    useCallback(async () => {
      const [windows, push] = await Promise.allSettled([
        listSeasonWindows(),
        getSeasonPushSettings(),
      ]);
      if (windows.status === "fulfilled") {
        setEnvelope(windows.value);
        setLoadError(null);
      } else {
        setLoadError(
          adminErrorMessage(windows.reason, "Could not load season windows."),
        );
      }
      if (push.status === "fulfilled") {
        setSettings(push.value);
        setSettingsError(null);
      } else {
        setSettings(null);
        setSettingsError(
          seasonErrorMessage(push.reason, "Could not read the notices switch. Refresh to try again."),
        );
      }
      await recount();
    }, [recount]),
  );

  // Every season or switch change publishes a `settings` invalidation.
  useLiveReload(["settings"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupSeasons(envelope?.windows ?? []), [envelope]);
  const dryById = useMemo(
    () => new Map((dryRun?.windows ?? []).map((w) => [w.id, w])),
    [dryRun],
  );
  const pushEnabled = settings?.enabled ?? false;
  const today = envelope?.today ?? "";

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteSeasonWindow(deleting.id, deleting.version);
      setNotice(`${deleting.name} deleted. Clients no longer see it.`);
      setDeleting(null);
      await load();
    } catch (err) {
      setDeleteError(seasonErrorMessage(err, "The season was not deleted. Try again."));
      if (seasonErrorNeedsReload(err)) void load();
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!envelope && loadError) {
    return (
      <ErrorState
        body={loadError}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }
  if (!envelope) return <LoadingBlock label="Loading season windows…" />;

  const sections: { id: string; title: string; windows: SeasonWindow[] }[] = [
    { id: "current", title: "On now", windows: groups.current },
    { id: "upcoming", title: "Upcoming", windows: groups.upcoming },
    { id: "past", title: "Past", windows: groups.past },
  ];
  const any = envelope.windows.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-1">
          <p className="text-body text-text-secondary m-0">
            Name the times of year when print shops fill up early, and tell
            clients in your own words. Each season is shaded on the client
            deadline calendar, and shows as a home banner from six to four weeks
            before it starts.
          </p>
          <p className="text-caption text-text-muted m-0">
            A heads-up only. Seasons never block a date or change a price.
          </p>
        </div>
        <Button variant="primary" onClick={() => { setNotice(null); setEditing("new"); }}>
          Add season window
        </Button>
      </div>

      {notice ? (
        <p className="text-body text-success m-0" role="status">
          {notice}
        </p>
      ) : null}
      {loadError ? (
        <p className="text-body text-error m-0" role="alert">
          {loadError}
        </p>
      ) : null}

      <SeasonNoticeSwitch
        settings={settings}
        settingsError={settingsError}
        dryRun={dryRun}
        dryRunError={dryRunError}
        checking={checking}
        windows={envelope.windows}
        today={today}
        onRecount={() => void recount()}
        onChanged={(next) => {
          if (next) {
            setSettings(next);
            setNotice(next.enabled ? "Pre-season notices are on." : "Pre-season notices are off.");
          }
          void load();
        }}
      />

      {!any ? (
        <EmptyState
          title="No season windows yet"
          body="Add the first one, such as graduation or school opening, so clients plan their printing before shops fill up."
          action={
            <Button variant="secondary" onClick={() => setEditing("new")}>
              Add the first season
            </Button>
          }
        />
      ) : (
        sections
          .filter((section) => section.windows.length > 0)
          .map((section) => (
            <section
              key={section.id}
              aria-labelledby={`seasons-${section.id}`}
              className="flex flex-col gap-2"
            >
              <h2 id={`seasons-${section.id}`} className="text-h3 text-text-primary m-0">
                {section.title}{" "}
                <span className="text-text-muted tabular-nums">{section.windows.length}</span>
              </h2>
              <div className="gg-card-flush divide-y divide-outline-subtle">
                {section.windows.map((window) => (
                  <SeasonCard
                    key={window.id}
                    window={window}
                    today={today}
                    dry={dryById.get(window.id)}
                    pushEnabled={pushEnabled}
                    onEdit={() => {
                      setNotice(null);
                      setEditing(window);
                    }}
                    onDelete={() => {
                      setDeleteError(null);
                      setDeleting(window);
                    }}
                  />
                ))}
              </div>
            </section>
          ))
      )}

      <SeasonEditor
        editing={editing}
        today={today}
        pushEnabled={pushEnabled}
        dryRun={dryRun}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null);
          setNotice(message);
          void load();
        }}
        onStale={() => void load()}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Clients stop seeing it on their calendar and home screen straight
              away. A notice not yet delivered is held; one already on phones
              stays there. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p className="text-body text-error m-0" role="alert">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={deleteBusy} autoFocus>
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              {deleteBusy ? "Deleting…" : "Delete season"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
