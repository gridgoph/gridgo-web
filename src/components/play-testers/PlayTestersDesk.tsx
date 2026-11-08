"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, MousePointerClick, Trash2, X } from "lucide-react";

import { DayLegend, DayStrip } from "@/components/play-testers/DayStrip";
import { PlayClockPanel } from "@/components/play-testers/PlayClockPanel";
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
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  addPlayTester,
  listPlayTesters,
  removePlayTester,
  updatePlayTesterSettings,
  type PlayTester,
  type PlayTesterRoster,
  type PlayTesterSettingsPatch,
  type TesterApp,
} from "@/lib/api/play-testers";
import { useLiveReload } from "@/lib/live/useLiveReload";
import {
  RUN_DAYS,
  TESTER_APPS,
  addTesterError,
  removeTesterError,
  rosterLoadError,
  manilaDateOf,
  shortDay,
  testerAppFrom,
  testerAppLabel,
} from "@/lib/play-testers";
import { cn } from "@/lib/utils";

/**
 * Google Play's 14-day closed test, per app: who is checking in daily, who
 * stopped, how far Google's own clock has run, and feedback prompts shown,
 * tapped and dismissed (Google never says whether feedback was left).
 * Operations and Super Admin; `?app=` keeps the chosen app in the URL.
 */
export function PlayTestersDesk({ tree }: { tree: "ops" | "admin" }) {
  const router = useRouter();
  const search = useSearchParams();
  const app = testerAppFrom(search.get("app"));

  const [roster, setRoster] = useState<PlayTesterRoster | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<PlayTester | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  // Only the latest read for the app on screen may land. A save, add or
  // remove that finishes after the app was switched never reads or commits.
  const generation = useRef(0);
  const activeApp = useRef(app);
  activeApp.current = app;
  const isActive = (forApp: TesterApp) => mounted.current && activeApp.current === forApp;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const forApp = app;
    if (!isActive(forApp)) return;
    const mine = ++generation.current;
    const current = () => isActive(forApp) && mine === generation.current;
    setLoading(true);
    try {
      const next = await listPlayTesters(forApp);
      if (!current() || next.app !== forApp) return;
      setRoster(next);
      setLoadError(null);
    } catch (err) {
      if (!current()) return;
      setLoadError(rosterLoadError(err));
    } finally {
      if (current()) setLoading(false);
    }
  }, [app]);

  useEffect(() => {
    setRoster((current) => (current?.app === app ? current : null));
    setNotice(null);
    void load();
  }, [app, load]);

  useLiveReload(["identity", "notifications"], load);

  const choose = useCallback(
    (next: TesterApp) => {
      router.replace(
        next === "client" ? `/${tree}/play-testers` : `/${tree}/play-testers?app=${next}`,
        { scroll: false },
      );
    },
    [router, tree],
  );

  const saveSettings = useCallback(
    async (patch: PlayTesterSettingsPatch) => {
      await updatePlayTesterSettings(app, patch);
      if (isActive(app)) await load();
    },
    [app, load],
  );

  async function confirmRemove() {
    if (!removing) return;
    const forApp = app;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await removePlayTester(forApp, removing.userId);
      if (!isActive(forApp)) return;
      setNotice(`Removed ${removing.name || removing.email}.`);
      setRemoving(null);
      void load();
    } catch (err) {
      if (!isActive(forApp)) return;
      setRemoveError(removeTesterError(err));
      void load();
    } finally {
      if (mounted.current) setRemoveBusy(false);
    }
  }

  const rows = roster?.app === app ? roster.testers : null;
  const stats = roster?.app === app ? roster.stats : null;

  const columns = useMemo<DataTableColumn<PlayTester>[]>(
    () => [
      {
        id: "tester",
        header: "Tester",
        primary: true,
        alwaysVisible: true,
        sortValue: (row) => (row.name || row.email).toLowerCase(),
        filterValue: (row) => `${row.name} ${row.email}`,
        cell: (row) => (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <span
              className="text-body text-text-primary"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {row.name || row.email}
            </span>
            {row.name ? (
              <span className="text-caption text-text-muted break-all">{row.email}</span>
            ) : null}
            {row.stoppedCheckingIn ? (
              <StatusChip tone="neutral" icon="clock" label="Stopped checking in" />
            ) : null}
          </div>
        ),
      },
      {
        id: "days",
        header: `Last ${RUN_DAYS} days`,
        cell: (row) => <DayStrip days={row.days} />,
      },
      {
        id: "day",
        header: "Day",
        sortValue: (row) => row.day,
        cell: (row) =>
          row.streak >= RUN_DAYS ? (
            <StatusChip tone="success" icon="circle-check" label={`${RUN_DAYS} straight days`} />
          ) : (
            <div className="flex flex-col whitespace-nowrap">
              <span className="text-body text-text-primary tabular-nums">
                Day {row.day}
                <span className="text-text-muted">/{RUN_DAYS}</span>
              </span>
              <span className="text-caption text-text-muted tabular-nums">
                Streak {row.streak}
              </span>
            </div>
          ),
      },
      {
        id: "last",
        header: "Last check-in",
        sortValue: (row) => row.lastCheckInDate ?? "",
        cell: (row) =>
          row.lastCheckInDate ? (
            <div className="flex flex-col whitespace-nowrap">
              <span className="text-body text-text-primary">{shortDay(row.lastCheckInDate)}</span>
              {row.latestVersion ? (
                <span className="text-caption text-text-muted">v{row.latestVersion}</span>
              ) : null}
            </div>
          ) : (
            <span className="text-caption text-text-muted">Never</span>
          ),
      },
      {
        id: "feedback",
        header: "Play feedback",
        sortValue: (row) => (row.feedback.tappedAt ? 1000 : 0) + row.feedback.shownCount,
        cell: (row) => <FeedbackMarks feedback={row.feedback} />,
      },
    ],
    [],
  );

  if (loadError && !roster) {
    return (
      <div className="flex flex-col gap-3">
        <AppSwitch app={app} onChange={choose} />
        <ErrorState
          body={loadError}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AppSwitch app={app} onChange={choose} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <StreakPanel stats={stats} />
        {stats ? (
          <PlayClockPanel key={app} app={app} stats={stats} onSave={saveSettings} />
        ) : (
          <div className="gg-card" aria-busy>
            <Skeleton className="h-32 w-full" />
          </div>
        )}
      </div>

      <section className="flex flex-col gap-3" aria-label={`${testerAppLabel(app)} testers`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <AddTester
            key={app}
            app={app}
            onAdded={(forApp, email) => {
              if (!isActive(forApp)) return;
              setNotice(`Added ${email}.`);
              void load();
            }}
          />
          <DayLegend />
        </div>

        {notice ? (
          <p className="text-caption text-text-secondary m-0" role="status">
            {notice}
          </p>
        ) : null}
        {loadError && roster ? (
          <p className="text-body text-error m-0" role="alert">
            {loadError}
          </p>
        ) : null}

        <DataTable
          columns={columns}
          data={rows ?? []}
          loading={loading && !rows}
          getRowId={(row) => row.userId}
          caption={`${testerAppLabel(app)} testers`}
          itemLabel="testers"
          pageSize={25}
          empty={
            <EmptyState
              title={`No ${testerAppLabel(app)} testers yet`}
              body="Add each Play tester by the email on their GRIDGO account."
            />
          }
          rowActions={(row) => (
            <DataTableRowAction
              label="Remove tester"
              icon={Trash2}
              variant="ghost"
              onClick={() => {
                setRemoveError(null);
                setRemoving(row);
              }}
            />
          )}
        />
      </section>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(next) => !next && !removeBusy && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing?.name || removing?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Their reminders stop. Check-ins and feedback stay on record. Adding them
              again starts at Day 1.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError ? (
            <p className="text-body text-error m-0" role="alert">
              {removeError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="secondary"
              disabled={removeBusy}
              onClick={() => setRemoving(null)}
            >
              Keep
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeBusy}
              onClick={() => void confirmRemove()}
            >
              {removeBusy ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AppSwitch({ app, onChange }: { app: TesterApp; onChange: (app: TesterApp) => void }) {
  return (
    <ToggleGroup
      value={[app]}
      onValueChange={(values) => {
        const next = values[0] as TesterApp | undefined;
        if (next) onChange(next);
      }}
      variant="outline"
      spacing={0}
      aria-label="App"
      className="self-start"
    >
      {TESTER_APPS.map((choice) => (
        <ToggleGroupItem key={choice.app} value={choice.app} className="min-w-20">
          {choice.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * Our side: daily opens. The 12 squares are the testers Google needs; each
 * filled one is a tester who finished 14 straight days.
 */
function StreakPanel({ stats }: { stats: PlayTesterRoster["stats"] | null }) {
  const id = useId();
  const needed = stats?.needed ?? 12;
  const full = stats?.fullStreak ?? 0;
  return (
    <section className="gg-card flex flex-col gap-4" aria-labelledby={`${id}-title`}>
      <div className="flex flex-col gap-0.5">
        <h2 id={`${id}-title`} className="text-h3 text-text-primary m-0">
          GRIDGO check-ins
        </h2>
        <p className="text-caption text-text-muted m-0">
          Our daily streak. A missed day restarts it at Day 1.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="flex flex-col gap-2">
          <span className="text-caption text-text-muted">{RUN_DAYS} straight days</span>
          {stats ? (
            <>
              <span className="text-h2 text-text-primary tabular-nums leading-none">
                {full}
                <span className="text-text-muted"> / {needed}</span>
              </span>
              <ol
                className="m-0 flex list-none flex-wrap gap-1 p-0"
                aria-label={`${full} of ${needed} testers finished ${RUN_DAYS} straight days`}
              >
                {Array.from({ length: Math.max(needed, full) }, (_, i) => (
                  <li
                    key={i}
                    aria-hidden
                    className={cn(
                      "h-4 w-6 rounded-[4px]",
                      i < full ? "bg-success" : "bg-surface-variant",
                    )}
                  />
                ))}
              </ol>
            </>
          ) : (
            <Skeleton className="h-12 w-40" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-caption text-text-muted">Checked in today</span>
          {stats ? (
            <span className="text-h2 text-text-primary tabular-nums leading-none">
              {stats.activeToday}
            </span>
          ) : (
            <Skeleton className="h-8 w-12" />
          )}
        </div>
      </div>
    </section>
  );
}

function FeedbackMarks({ feedback }: { feedback: PlayTester["feedback"] }) {
  const tapped = feedback.tappedAt ? shortDay(manilaDateOf(feedback.tappedAt)) : null;
  const label = `Feedback card shown ${feedback.shownCount} ${
    feedback.shownCount === 1 ? "time" : "times"
  }, ${tapped ? `tapped ${tapped}` : "not tapped"}, dismissed ${feedback.dismissedCount}`;
  return (
    <span
      className="text-body text-text-secondary flex items-center gap-3 whitespace-nowrap tabular-nums"
      aria-label={label}
      title={label}
    >
      <span className="flex items-center gap-1">
        <Eye size={14} aria-hidden />
        {feedback.shownCount}
      </span>
      <span
        className={cn("flex items-center gap-1", tapped ? "text-text-primary" : "text-text-muted")}
      >
        <MousePointerClick size={14} aria-hidden />
        {tapped ?? "—"}
      </span>
      <span className="flex items-center gap-1">
        <X size={14} aria-hidden />
        {feedback.dismissedCount}
      </span>
    </span>
  );
}

function AddTester({
  app,
  onAdded,
}: {
  app: TesterApp;
  /** Called with the app the tester was added to; the desk ignores a switched-away app. */
  onAdded: (app: TesterApp, email: string) => void;
}) {
  // This form's own lifetime: it remounts per app, so a late reply never
  // reaches a form that is gone.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const id = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const value = email.trim();
    if (!value) {
      setError("Enter the tester's account email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addPlayTester(app, value);
      if (!mounted.current) return;
      setEmail("");
      onAdded(app, value);
    } catch (err) {
      if (!mounted.current) return;
      setError(addTesterError(err, app));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <form
      className="flex w-full max-w-xl flex-col gap-1"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={`${id}-email`}>Add a {testerAppLabel(app)} tester</FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={`${id}-email`}
            type="email"
            autoComplete="off"
            placeholder="Account email"
            value={email}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
          />
          <Button type="submit" variant="primary" disabled={busy} className="shrink-0">
            {busy ? "Adding…" : "Add tester"}
          </Button>
        </div>
        {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      </Field>
    </form>
  );
}
