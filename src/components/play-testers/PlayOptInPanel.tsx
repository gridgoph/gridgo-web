"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CircleCheck,
  ExternalLink,
  Mail,
  Megaphone,
  MousePointerClick,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Row } from "@/components/play-testers/PlayClockPanel";
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
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import {
  markPlayOptedIn,
  sendPlayOptInBroadcast,
  type PlayOptInStep,
  type PlayOptInSummary,
  type PlayOptInUnfinished,
  type PlayTesterSettingsPatch,
  type TesterApp,
} from "@/lib/api/play-testers";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import {
  PLAY_OPTIN_COPY,
  PLAY_OPTIN_STEP_LABEL,
  PLAY_OPTIN_STEP_ORDER,
  broadcastBlocker,
  broadcastError,
  broadcastReach,
  campaignSettingsError,
  markOptedInError,
  parseTarget,
  REMINDER_HOURS,
  reminderHourLabel,
  testerAppLabel,
  validGroupJoinUrl,
  validOptInUrl,
} from "@/lib/play-testers";
import { cn } from "@/lib/utils";

const STEP_ICON: Record<PlayOptInStep, LucideIcon> = {
  confirm_gmail: MousePointerClick,
  join_group: Mail,
  open_optin: Users,
  install_from_play: ExternalLink,
  opted_in: CircleCheck,
};

type Save = (patch: PlayTesterSettingsPatch) => Promise<void>;

/**
 * The Android opt-in campaign for one app: GRIDGO's "Opted in on Play" count
 * against the target, the campaign controls, the broadcast, and everyone who
 * tapped but has not finished. Remounted per app by the desk.
 */
export function PlayOptInPanel({
  app,
  optIn,
  productionApproved,
  onSave,
  onChanged,
}: {
  app: TesterApp;
  optIn: PlayOptInSummary;
  productionApproved: boolean;
  onSave: Save;
  /** Re-read the roster after a mark or send. */
  onChanged: () => void;
}) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [marking, setMarking] = useState<PlayOptInUnfinished | null>(null);
  const [markBusy, setMarkBusy] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function confirmMark() {
    if (!marking) return;
    setMarkBusy(true);
    setMarkError(null);
    try {
      await markPlayOptedIn(marking.app, marking.userId);
      if (!mounted.current) return;
      setNotice(`Marked ${personName(marking)} opted in.`);
      setMarking(null);
      onChanged();
    } catch (err) {
      if (!mounted.current) return;
      setMarkError(markOptedInError(err));
      onChanged();
    } finally {
      if (mounted.current) setMarkBusy(false);
    }
  }

  const columns = useMemo<DataTableColumn<PlayOptInUnfinished>[]>(
    () => [
      {
        id: "person",
        header: "Person",
        primary: true,
        alwaysVisible: true,
        sortValue: (row) => personName(row).toLowerCase(),
        filterValue: (row) => `${row.name ?? ""} ${row.gmail ?? ""}`,
        cell: (row) => (
          <span
            className="text-body text-text-primary"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {row.name || <span className="text-text-muted">No name</span>}
          </span>
        ),
      },
      {
        id: "app",
        header: "App",
        hideOnMobile: true,
        cell: (row) => (
          <span className="text-body text-text-secondary">{testerAppLabel(row.app)}</span>
        ),
      },
      {
        id: "gmail",
        header: "Gmail",
        sortValue: (row) => row.gmail ?? "",
        cell: (row) =>
          row.gmail ? (
            <span className="text-body text-text-primary break-all">{row.gmail}</span>
          ) : (
            <span className="text-caption text-text-muted">Not confirmed</span>
          ),
      },
      {
        id: "step",
        header: "Last step",
        sortValue: (row) => PLAY_OPTIN_STEP_ORDER[row.lastStep] ?? 0,
        cell: (row) => <StepMark step={row.lastStep} />,
      },
      {
        id: "at",
        header: "When",
        sortValue: (row) => row.at,
        cell: (row) => (
          <time
            dateTime={row.at}
            title={formatDateTime(row.at)}
            className="text-body text-text-secondary whitespace-nowrap"
          >
            {formatRelativeTime(row.at)}
          </time>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <OptedInCard
          app={app}
          optIn={optIn}
          productionApproved={productionApproved}
          onSent={onChanged}
        />
        <CampaignCard app={app} optIn={optIn} onSave={onSave} />
      </div>

      <section
        className="flex flex-col gap-3"
        aria-labelledby={`play-optin-unfinished-${app}`}
      >
        <div className="flex flex-col gap-0.5">
          <h2
            id={`play-optin-unfinished-${app}`}
            className="text-h3 text-text-primary m-0"
          >
            Tapped, not finished
          </h2>
          <p className="text-caption text-text-muted m-0">
            Mark opted in only after you see them in Play Console.
          </p>
        </div>
        {notice ? (
          <p className="text-caption text-text-secondary m-0" role="status">
            {notice}
          </p>
        ) : null}
        <DataTable
          columns={columns}
          data={optIn.unfinished}
          getRowId={(row) => `${row.app}:${row.userId}`}
          caption={`${testerAppLabel(app)} people who tapped but did not finish`}
          itemLabel="people"
          pageSize={10}
          empty={
            <EmptyState
              title="Nobody waiting"
              body="People who tap the notice but stop before Play show here."
            />
          }
          rowActions={(row) => (
            <DataTableRowAction
              label="Mark opted in"
              icon={CircleCheck}
              variant="ghost"
              onClick={() => {
                setMarkError(null);
                setMarking(row);
              }}
            />
          )}
        />
      </section>

      <AlertDialog
        open={marking !== null}
        onOpenChange={(next) => !next && !markBusy && setMarking(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark {marking ? personName(marking) : ""} opted in?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Only if Play Console lists {marking?.gmail ?? "them"}. It cannot be undone,
              and their daily check-ins start.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {markError ? (
            <p className="text-body text-error m-0" role="alert">
              {markError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="secondary"
              disabled={markBusy}
              onClick={() => setMarking(null)}
            >
              Not yet
            </AlertDialogCancel>
            <AlertDialogAction
              variant="default"
              disabled={markBusy}
              onClick={() => void confirmMark()}
            >
              {markBusy ? "Marking…" : "Mark opted in"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function personName(row: PlayOptInUnfinished): string {
  return row.name || row.gmail || "this person";
}

function StepMark({ step }: { step: PlayOptInStep }) {
  const Icon = STEP_ICON[step] ?? MousePointerClick;
  return (
    <span className="text-body text-text-primary flex items-center gap-1.5 whitespace-nowrap">
      <Icon size={14} aria-hidden className="text-text-secondary" />
      {PLAY_OPTIN_STEP_LABEL[step] ?? step}
    </span>
  );
}

/** GRIDGO's opted-in count against the target, and the broadcast. */
function OptedInCard({
  app,
  optIn,
  productionApproved,
  onSent,
}: {
  app: TesterApp;
  optIn: PlayOptInSummary;
  productionApproved: boolean;
  /** Re-read after a send; the reach stays on this card. */
  onSent: () => void;
}) {
  const id = useId();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  // Set after a send whose outcome is unknown; it stays until a send succeeds.
  const [uncertain, setUncertain] = useState<string | null>(null);

  const target = optIn.target;
  const count = optIn.optedInCount;
  const blocker = broadcastBlocker(optIn, productionApproved);
  const label = testerAppLabel(app);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const announcement = await sendPlayOptInBroadcast(app);
      if (!mounted.current) return;
      setConfirming(false);
      setUncertain(null);
      setSent(broadcastReach(announcement.notifiedUsers));
      onSent();
    } catch (err) {
      if (!mounted.current) return;
      const failure = broadcastError(err);
      if (failure.uncertain) {
        // Never leave a resend one tap away: close and say so on the card.
        setConfirming(false);
        setUncertain(failure.message);
        onSent();
      } else {
        setError(failure.message);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="gg-card flex flex-col gap-4" aria-labelledby={`${id}-title`}>
      <div className="flex flex-col gap-0.5">
        <h2 id={`${id}-title`} className="text-h3 text-text-primary m-0">
          Opted in on Play
        </h2>
        <p className="text-caption text-text-muted m-0">
          Play installs the app saw, plus staff marks.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="flex flex-col gap-2">
          <span className="text-h2 text-text-primary tabular-nums leading-none">
            {count}
            <span className="text-text-muted"> / {target}</span>
          </span>
          <ol
            className="m-0 flex list-none flex-wrap gap-1 p-0"
            aria-label={`${count} of ${target} ${label} testers opted in on Play`}
          >
            {Array.from({ length: Math.min(Math.max(target, count), 60) }, (_, i) => (
              <li
                key={i}
                aria-hidden
                className={cn(
                  "h-4 w-6 rounded-[4px]",
                  i < count ? "bg-success" : "bg-surface-variant",
                )}
              />
            ))}
          </ol>
        </div>
        <Figure label="Play Console">{optIn.playConsoleOptedInCount}</Figure>
        <Figure label="From Play installs">{optIn.detectedPlayCount}</Figure>
      </div>

      <div className="flex flex-col items-start gap-1">
        <Button
          variant="secondary"
          disabled={blocker !== null}
          onClick={() => {
            setError(null);
            setSent(null);
            setConfirming(true);
          }}
        >
          <Megaphone aria-hidden data-icon="inline-start" />
          Send broadcast
        </Button>
        {blocker ? <p className="text-caption text-text-muted m-0">{blocker}</p> : null}
        {uncertain ? (
          <p className="text-caption text-warning m-0" role="alert">
            {uncertain}
          </p>
        ) : null}
        {sent ? (
          <p className="text-caption text-text-secondary m-0" role="status">
            {sent}
          </p>
        ) : null}
      </div>

      <AlertDialog
        open={confirming}
        onOpenChange={(next) => !next && !busy && setConfirming(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {label} Android users?</AlertDialogTitle>
            <AlertDialogDescription>
              Pushes to every {label} account on the Android APK that has not opted in.
              There is no unsend.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {uncertain ? (
            <p className="text-body text-warning m-0" role="alert">
              The last send may have gone out. Only send again once you have checked.
            </p>
          ) : null}
          <p className="gg-card text-body text-text-primary m-0 flex items-start gap-2">
            <Megaphone size={16} aria-hidden className="mt-0.5 shrink-0" />
            {PLAY_OPTIN_COPY}
          </p>
          {error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Not now
            </AlertDialogCancel>
            <AlertDialogAction
              variant="default"
              disabled={busy}
              onClick={() => void send()}
            >
              {busy ? "Sending…" : "Send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-text-muted">{label}</span>
      <span className="text-h2 text-text-primary tabular-nums leading-none">
        {children}
      </span>
    </div>
  );
}

type Field = "optInUrl" | "groupJoinUrl" | "target" | "reminderHour";

/** The campaign switch, its two links, the target and the daily reminder. */
function CampaignCard({
  app,
  optIn,
  onSave,
}: {
  app: TesterApp;
  optIn: PlayOptInSummary;
  onSave: Save;
}) {
  const id = useId();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<boolean | null>(null);
  const label = testerAppLabel(app);
  // Older APIs send neither field; then the reminder rows stay hidden.
  const reminderEnabled = optIn.dailyReminderEnabled;
  const reminderHour = optIn.dailyReminderHour;
  const hasReminder = typeof reminderEnabled === "boolean" && typeof reminderHour === "number";

  function open(field: Field) {
    setError(null);
    setEditing(field);
    setDraft(
      field === "optInUrl"
        ? optIn.optInUrl
        : field === "groupJoinUrl"
          ? (optIn.groupJoinUrl ?? "")
          : field === "reminderHour"
            ? String(reminderHour ?? "")
            : String(optIn.target),
    );
  }

  async function save(patch: PlayTesterSettingsPatch) {
    setBusy(true);
    setError(null);
    try {
      await onSave(patch);
      if (!mounted.current) return;
      setEditing(null);
      setToggling(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(campaignSettingsError(err));
      setToggling(null);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function submit(field: Field) {
    const value = draft.trim();
    if (field === "optInUrl") {
      if (!validOptInUrl(value)) {
        return setError(
          "Use the Play testing link: https://play.google.com/apps/testing/…",
        );
      }
      return void save({ optInUrl: value });
    }
    if (field === "groupJoinUrl") {
      if (!value) return void save({ groupJoinUrl: null });
      if (!validGroupJoinUrl(value)) {
        return setError("Use the Google Group link: https://groups.google.com/g/…");
      }
      return void save({ groupJoinUrl: value });
    }
    if (field === "reminderHour") {
      const hour = Number(value);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        return setError("Choose an hour from 12:00 AM to 11:00 PM.");
      }
      // Nothing changed: close without a write.
      if (hour === reminderHour) return setEditing(null);
      return void save({ dailyReminderHour: hour });
    }
    const n = parseTarget(value);
    if (n === null) return setError("Enter a whole number from 1 to 10,000.");
    return void save({ target: n });
  }

  const editor = (field: Field, input: ReactNode) => (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit(field);
      }}
    >
      {input}
      <Button type="submit" variant="secondary" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setEditing(null);
          setError(null);
        }}
      >
        Cancel
      </Button>
    </form>
  );

  return (
    <section className="gg-card flex flex-col gap-3" aria-labelledby={`${id}-title`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id={`${id}-title`} className="text-h3 text-text-primary m-0">
            Campaign
          </h2>
          <p className="text-caption text-text-muted m-0">Android APK users only.</p>
        </div>
        <div className="flex min-h-11 items-center gap-2">
          <StatusChip
            tone={optIn.campaignEnabled ? "success" : "neutral"}
            icon={optIn.campaignEnabled ? "circle-check" : "circle-dashed"}
            label={optIn.campaignEnabled ? "On" : "Off"}
          />
          <Switch
            aria-label={`${label} opt-in campaign`}
            checked={optIn.campaignEnabled}
            disabled={busy}
            onCheckedChange={(value) => {
              setError(null);
              setToggling(value);
            }}
          />
        </div>
      </div>

      <dl className="m-0 grid gap-1">
        <Row
          label="Opt-in link"
          value={<UrlValue url={optIn.optInUrl} />}
          editing={editing === "optInUrl"}
          onEdit={() => open("optInUrl")}
          editLabel="Edit Play opt-in link"
          editor={editor(
            "optInUrl",
            <Input
              type="url"
              aria-label="Play opt-in link"
              className="min-w-0 flex-1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />,
          )}
        />
        <Row
          label="Group link"
          value={
            optIn.groupJoinUrl ? (
              <UrlValue url={optIn.groupJoinUrl} />
            ) : (
              <span className="text-text-muted">Not set</span>
            )
          }
          editing={editing === "groupJoinUrl"}
          onEdit={() => open("groupJoinUrl")}
          editLabel="Edit Google Group join link"
          editor={editor(
            "groupJoinUrl",
            <Input
              type="url"
              aria-label="Google Group join link"
              placeholder="https://groups.google.com/g/…"
              className="min-w-0 flex-1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />,
          )}
        />
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-2 min-h-11">
          <dt className="text-caption text-text-muted">Group join</dt>
          <dd className="m-0 text-body text-text-primary">
            {optIn.groupMode === "automatic" ? "Added for them" : "They join by link"}
          </dd>
        </div>
        <Row
          label="Target"
          value={<span className="tabular-nums">{optIn.target}</span>}
          editing={editing === "target"}
          onEdit={() => open("target")}
          editLabel="Edit opt-in target"
          editor={editor(
            "target",
            <Input
              inputMode="numeric"
              aria-label="Opt-in target"
              className="w-24"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />,
          )}
        />
        {hasReminder ? (
          <>
            <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-2 min-h-11">
              <dt className="text-caption text-text-muted">Daily reminder</dt>
              <dd className="m-0 flex items-center gap-2">
                <Switch
                  aria-label={`${label} daily reminder`}
                  checked={reminderEnabled}
                  disabled={busy}
                  onCheckedChange={(value) => {
                    if (value === reminderEnabled) return;
                    void save({ dailyReminderEnabled: value });
                  }}
                />
                <span className="text-body text-text-primary">
                  {reminderEnabled ? "On" : "Off"}
                </span>
              </dd>
            </div>
            <Row
              label="Reminder time"
              value={reminderHourLabel(reminderHour)}
              editing={editing === "reminderHour"}
              onEdit={() => open("reminderHour")}
              editLabel="Edit daily reminder time"
              editor={editor(
                "reminderHour",
                <select
                  aria-label="Daily reminder time (Manila)"
                  className="h-11 min-w-0 rounded-[var(--radius-field)] border border-input bg-card px-3 text-body text-foreground"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                >
                  {REMINDER_HOURS.map((hour) => (
                    <option key={hour} value={String(hour)}>
                      {reminderHourLabel(hour)}
                    </option>
                  ))}
                </select>,
              )}
            />
          </>
        ) : null}
      </dl>

      {hasReminder ? (
        <p className="text-caption text-text-muted m-0">
          Goes out once a day at this time while the campaign is on. A manual broadcast
          counts toward that day&apos;s one send.
        </p>
      ) : null}

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <AlertDialog
        open={toggling !== null}
        onOpenChange={(next) => !next && !busy && setToggling(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggling
                ? `Turn on the ${label} campaign?`
                : `Turn off the ${label} campaign?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggling
                ? `${label} Android APK users who have not opted in see the Home card.`
                : "The Home card hides and broadcasts stop. Progress is kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="secondary"
              disabled={busy}
              onClick={() => setToggling(null)}
            >
              Keep {optIn.campaignEnabled ? "on" : "off"}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="default"
              disabled={busy}
              onClick={() => void save({ campaignEnabled: toggling === true })}
            >
              {busy ? "Saving…" : toggling ? "Turn on" : "Turn off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function UrlValue({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-body text-text-primary break-all underline-offset-2 hover:underline"
    >
      {url.replace(/^https:\/\//, "")}
    </a>
  );
}
