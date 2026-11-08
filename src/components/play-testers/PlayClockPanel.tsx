"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import type {
  PlayTesterSettingsPatch,
  PlayTesterStats,
  TesterApp,
} from "@/lib/api/play-testers";
import { manilaToday } from "@/lib/audit";
import {
  RUN_DAYS,
  approvalTimestamp,
  manilaDateOf,
  parseOptedIn,
  playClockDay,
  settingsError,
  shortDay,
  testerAppLabel,
} from "@/lib/play-testers";

type Save = (patch: PlayTesterSettingsPatch) => Promise<void>;

type Field = "clock" | "optedIn" | "approved";

/**
 * Google Play's side, typed in from Play Console: when the closed-test clock
 * started, how many opted in, and whether production was approved. Kept apart
 * from our daily streak on purpose.
 */
export function PlayClockPanel({
  app,
  stats,
  onSave,
}: {
  app: TesterApp;
  stats: PlayTesterStats;
  onSave: Save;
}) {
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"approve" | "clear" | null>(null);
  const mounted = useRef(true);
  const inputId = useId();
  const today = manilaToday();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A different app is a different set of values: drop any open edit.
  useEffect(() => {
    setEditing(null);
    setError(null);
    setConfirm(null);
  }, [app]);

  const clockDay = playClockDay(stats.playClockStartDate, today);
  const approvedDate = stats.productionApprovedAt
    ? manilaDateOf(stats.productionApprovedAt)
    : null;

  function open(field: Field) {
    setError(null);
    setEditing(field);
    setDraft(
      field === "clock"
        ? (stats.playClockStartDate ?? today)
        : field === "optedIn"
          ? stats.optedInCount != null
            ? String(stats.optedInCount)
            : ""
          : (approvedDate ?? today),
    );
  }

  async function save(patch: PlayTesterSettingsPatch) {
    setBusy(true);
    setError(null);
    try {
      await onSave(patch);
      if (!mounted.current) return;
      setEditing(null);
      setConfirm(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(settingsError(err));
      setConfirm(null);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function submit(field: Field) {
    if (field === "clock") {
      if (!draft) return void save({ playClockStartDate: null });
      if (draft > today) return setError("The clock cannot start in the future.");
      return void save({ playClockStartDate: draft });
    }
    if (field === "optedIn") {
      if (draft.trim() === "") return void save({ optedInCount: null });
      const n = parseOptedIn(draft);
      if (n === null) return setError("Enter a whole number, 0 or more.");
      return void save({ optedInCount: n });
    }
    if (!draft) return setError("Choose the approval date.");
    if (draft > today) return setError("Approval cannot be in the future.");
    setConfirm("approve");
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
        {busy ? "Saving…" : field === "approved" ? "Mark approved" : "Save"}
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
    <section className="gg-card flex flex-col gap-3" aria-labelledby={`${inputId}-title`}>
      <div className="flex flex-col gap-0.5">
        <h2 id={`${inputId}-title`} className="text-h3 text-text-primary m-0">
          Google Play
        </h2>
        <p className="text-caption text-text-muted m-0">
          From Play Console. Our missed days never reset it.
        </p>
      </div>

      <dl className="m-0 grid gap-3">
        <Row
          label="Clock started"
          value={
            stats.playClockStartDate ? (
              <>
                {shortDay(stats.playClockStartDate)}
                {clockDay != null ? (
                  <span className="text-text-muted">
                    {clockDay > RUN_DAYS
                      ? ` · ${RUN_DAYS} days passed`
                      : ` · day ${clockDay} of ${RUN_DAYS}`}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-text-muted">Not set</span>
            )
          }
          editing={editing === "clock"}
          onEdit={() => open("clock")}
          editLabel="Edit clock start date"
          editor={editor(
            "clock",
            <Input
              id={`${inputId}-clock`}
              type="date"
              aria-label="Clock start date"
              className="w-auto"
              max={today}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />,
          )}
        />
        <Row
          label="Opted in"
          value={
            stats.optedInCount != null ? (
              <span className="tabular-nums">{stats.optedInCount}</span>
            ) : (
              <span className="text-text-muted">Not set</span>
            )
          }
          editing={editing === "optedIn"}
          onEdit={() => open("optedIn")}
          editLabel="Edit opted-in count"
          editor={editor(
            "optedIn",
            <Input
              id={`${inputId}-opted`}
              inputMode="numeric"
              aria-label="Opted-in testers"
              className="w-24"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />,
          )}
        />
        <Row
          label="Production"
          value={
            approvedDate ? (
              <>Approved {shortDay(approvedDate)}</>
            ) : (
              <span className="text-text-muted">Not approved</span>
            )
          }
          editing={editing === "approved"}
          onEdit={() => open("approved")}
          editLabel={approvedDate ? "Change approval date" : "Mark production approved"}
          extra={
            approvedDate && editing !== "approved" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setError(null);
                  setConfirm("clear");
                }}
              >
                Clear
              </Button>
            ) : null
          }
          editor={editor(
            "approved",
            <Input
              id={`${inputId}-approved`}
              type="date"
              aria-label="Production approval date"
              className="w-auto"
              max={today}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />,
          )}
        />
      </dl>

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(next) => !next && !busy && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "clear"
                ? "Clear production approval?"
                : `Mark the ${testerAppLabel(app)} app approved?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "clear"
                ? "Reminders and check-ins start again for testers still under 14 days."
                : `Every ${testerAppLabel(app)} tester's reminders and check-ins stop.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Keep as is
            </AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "clear" ? "destructive" : "default"}
              disabled={busy}
              onClick={() =>
                void save({
                  productionApprovedAt:
                    confirm === "clear" ? null : approvalTimestamp(draft),
                })
              }
            >
              {busy ? "Saving…" : confirm === "clear" ? "Clear approval" : "Mark approved"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Row({
  label,
  value,
  editing,
  onEdit,
  editLabel,
  editor,
  extra,
}: {
  label: string;
  value: ReactNode;
  editing: boolean;
  onEdit: () => void;
  editLabel: string;
  editor: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="m-0">
        {editing ? (
          editor
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
              {value}
            </span>
            <Button variant="ghost" size="icon" aria-label={editLabel} onClick={onEdit}>
              <Pencil aria-hidden />
            </Button>
            {extra}
          </div>
        )}
      </dd>
    </div>
  );
}
