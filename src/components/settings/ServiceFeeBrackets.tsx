"use client";

/**
 * Service fee brackets on Operational settings (gridgo-api#220, contract
 * `gridgo-api/docs/SERVICE_FEE_API.md`).
 *
 * The table reads as a ladder: each rate applies only to the part of the shop
 * price inside its bracket. Beside it, the six reference prices under the
 * table in force and under the draft, worked out by the API's read-only
 * preview (`POST /settings/service-fee/preview`), so a change is read as money
 * before it is saved.
 *
 * Only Super Admin saves, through `PATCH /settings` with the complete table,
 * the `expectedVersion` handshake, an optional Manila start time and a reason
 * that goes into the audit log. `canEdit` false draws the table, any scheduled
 * change and the reference prices without controls, for Operations.
 *
 * The card saves on its own, never with "Save settings", and only after a
 * confirmation that restates the table and when it starts, because it prices
 * every order placed afterwards. Orders, open quotes and priced carts keep the
 * table they were priced under.
 */

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { formatRatePercent, percentInputToBps } from "@/components/settings/service-fee";
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
import { Field, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, previewServiceFee, updateSettings } from "@/lib/api/client";
import type { PlatformSettings, ServiceFeeBracket, ServiceFeeSchedule } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  bracketDraft,
  bracketRange,
  bracketSchedule,
  bracketsOf,
  type BracketDraftRow,
  effectiveRate,
  feeChange,
  formatLimit,
  formatManilaStart,
  localPreview,
  manilaDateAfter,
  manilaStart,
  MAX_BRACKETS,
  parseBracketDraft,
  pesosInputToMinor,
  type PreviewRow,
  sameBrackets,
  scheduledChange,
  scheduleInForce,
  scheduleSummary,
  startProblem,
  withBracketAdded,
  withBracketRemoved,
  workingSentence,
} from "@/lib/service-fee-brackets";
import { cn } from "@/lib/utils";

export const SERVICE_FEE_BRACKETS_COPY =
  "GRIDGO’s charge on top of the shop’s own price, in brackets. Each rate applies only to the part of the shop price inside its bracket, so a bigger order never costs less than a smaller one. The shop is paid its price in full. Clients see one printing price with the fee inside it, never the brackets.";

/** Reasons are stored whole in the audit log; keep them readable. */
const REASON_MAX = 500;

const medium = { fontFamily: "var(--font-medium)" } as const;

type Props = {
  settings: PlatformSettings;
  /** False draws the table and its examples without controls. */
  canEdit: boolean;
  /** The settings row after a save, so the page's version stays current. */
  onSaved?: (next: PlatformSettings) => void;
  /** Someone saved first: reload the page's settings underneath. */
  onConflict?: () => Promise<void> | void;
  disabled?: boolean;
  /** For tests: the clock the start time and the scheduled change are read against. */
  now?: () => Date;
};

type StartMode = "now" | "date";

type PreviewState =
  | { status: "idle" }
  | { status: "loading"; rows: PreviewRow[] | null }
  | { status: "ready"; rows: PreviewRow[] }
  | { status: "error"; message: string };

export function ServiceFeeBrackets({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
  now = () => new Date(),
}: Props) {
  const clock = now();
  const inForce = scheduleInForce(settings, clock);
  const pending = scheduledChange(settings, clock);
  const inForceBrackets = bracketsOf(inForce);

  const [rows, setRows] = useState<BracketDraftRow[]>(() => bracketDraft(inForceBrackets));
  const [startMode, setStartMode] = useState<StartMode>("now");
  const [startDate, setStartDate] = useState(() => manilaDateAfter(clock));
  const [startTime, setStartTime] = useState("00:00");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  /** "Withdraw this change": save today's table now, which clears the scheduled one. */
  const [withdrawing, setWithdrawing] = useState(false);

  // A newer table from elsewhere replaces the ladder unless it was edited here.
  const inForceKey = JSON.stringify(inForceBrackets);
  const previousKey = useRef(inForceKey);
  useEffect(() => {
    const before = previousKey.current;
    previousKey.current = inForceKey;
    if (before === inForceKey) return;
    const stored = JSON.parse(inForceKey) as ServiceFeeBracket[];
    setRows((current) =>
      JSON.stringify(current) === JSON.stringify(bracketDraft(JSON.parse(before)))
        ? bracketDraft(stored)
        : current,
    );
  }, [inForceKey]);

  const parsed = parseBracketDraft(rows);
  const draftBrackets = "brackets" in parsed ? parsed.brackets : null;
  const startIso = startMode === "date" ? manilaStart(startDate, startTime) : null;
  const startIssue = startMode === "date" ? startProblem(startIso, clock) : null;
  const tableChanged = draftBrackets !== null && !sameBrackets(draftBrackets, inForceBrackets);
  const dirty = tableChanged || startMode === "date" || (withdrawing && Boolean(pending));
  const reasonText = reason.trim();
  const locked = busy || Boolean(disabled);

  // The preview the API worked out for this draft; the local one only for read-only views.
  const draftKey = draftBrackets ? JSON.stringify(draftBrackets) : null;
  const previewStart = startMode === "date" && !startIssue ? startIso : null;
  const request = useRef(0);
  useEffect(() => {
    if (!canEdit) return;
    if (!draftKey || !tableChanged) {
      setPreview({ status: "idle" });
      return;
    }
    const ticket = ++request.current;
    setPreview((current) => ({
      status: "loading",
      rows: current.status === "ready" ? current.rows : null,
    }));
    const timer = setTimeout(() => {
      void previewServiceFee({
        expectedVersion: settings.version,
        serviceFeeBrackets: JSON.parse(draftKey) as ServiceFeeBracket[],
        ...(previewStart ? { serviceFeeEffectiveFrom: previewStart } : {}),
      })
        .then((result) => {
          if (ticket !== request.current) return;
          setPreview({ status: "ready", rows: result.examples });
        })
        .catch(async (err: unknown) => {
          if (ticket !== request.current) return;
          if (err instanceof ApiError && err.code === "settings_version_conflict") {
            setPreview({
              status: "error",
              message: "Settings changed a moment ago. Loading them, then the preview runs again.",
            });
            await onConflict?.();
            return;
          }
          setPreview({
            status: "error",
            message: opsErrorMessage(err, "Could not work out the preview. Check the table and try again."),
          });
        });
    }, 300);
    return () => clearTimeout(timer);
    // `tableChanged` follows from `draftKey` and the stored table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, draftKey, inForceKey, previewStart, settings.version]);

  const readOnlyRows = useMemo(
    () => localPreview(inForce, pending ?? inForce),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(inForce), JSON.stringify(pending)],
  );

  function edit(next: BracketDraftRow[]) {
    setWithdrawing(false);
    setRows(next);
  }

  function discard() {
    setWithdrawing(false);
    setRows(bracketDraft(inForceBrackets));
    setStartMode("now");
    setReason("");
    setError(null);
    setOk(null);
  }

  function askToSave() {
    setError(null);
    setOk(null);
    if ("problem" in parsed) {
      setError(parsed.problem.message);
      return;
    }
    if (startIssue) {
      setError(startIssue);
      return;
    }
    if (!reasonText) {
      setError("Write why the fee is changing. It is saved with the change in the audit log.");
      return;
    }
    setConfirming(true);
  }

  async function save() {
    if (!draftBrackets) return;
    setConfirming(false);
    setBusy(true);
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        serviceFeeBrackets: draftBrackets,
        ...(startMode === "date" && startIso ? { serviceFeeEffectiveFrom: startIso } : {}),
        reason: reasonText,
      });
      onSaved?.(saved);
      setWithdrawing(false);
      const savedPending = scheduledChange(saved, now());
      setRows(bracketDraft(bracketsOf(scheduleInForce(saved, now()))));
      setStartMode("now");
      setReason("");
      setOk(
        savedPending?.effectiveFrom
          ? `Scheduled. Orders priced from ${formatManilaStart(savedPending.effectiveFrom)} (Manila) use ${scheduleSummary(savedPending)}. Until then nothing changes.`
          : `Saved. Orders priced from now on use ${scheduleSummary(scheduleInForce(saved, now()))}. Orders, open quotes and priced carts keep the fee they were given.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        setError(
          "Someone else saved settings a moment ago. Their values are now shown as in force; check your table against them and save again.",
        );
        await onConflict?.();
      } else if (err instanceof ApiError && err.code === "invalid_service_fee_schedule") {
        setError(
          `The API refused this table. Use 1 to ${MAX_BRACKETS} brackets, limits that only go up, the last bracket open, and rates from 0 to 100%.`,
        );
      } else if (err instanceof ApiError && err.code === "invalid_service_fee_effective_from") {
        setError("The API refused that start time. Pick a time that has not passed yet.");
      } else if (err instanceof ApiError && err.code === "settings_reason_required") {
        setError("Write why the fee is changing. It is saved with the change in the audit log.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change the service fee.");
      } else {
        setError(opsErrorMessage(err, "Could not save the service fee. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gg-card p-3" aria-labelledby="service-fee-brackets-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="service-fee-brackets-heading" className="text-h3 text-text-primary m-0">
          Service fee
        </h2>
        {pending ? (
          <StatusChip tone="info" icon="clock" label="Change scheduled" />
        ) : null}
      </div>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        {SERVICE_FEE_BRACKETS_COPY}
      </p>

      {pending?.effectiveFrom ? (
        <ScheduledNotice
          pending={pending}
          inForce={inForce}
          canEdit={canEdit}
          disabled={locked}
          onWithdraw={() => {
            setRows(bracketDraft(inForceBrackets));
            setWithdrawing(true);
            setStartMode("now");
            setReason(`Withdraw the change scheduled for ${formatManilaStart(pending.effectiveFrom!)}`);
            setError(null);
            setOk(null);
          }}
        />
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          {canEdit ? (
            <BracketLadder
              rows={rows}
              stored={inForceBrackets}
              problem={"problem" in parsed ? parsed.problem : null}
              disabled={locked}
              onChange={edit}
            />
          ) : (
            <BracketTable schedule={inForce} caption="In force" />
          )}
          {canEdit ? (
            <p className="text-body text-text-secondary m-0" data-testid="service-fee-in-force">
              In force right now:{" "}
              <span className="text-text-primary" style={medium}>
                {scheduleSummary(inForce)}
              </span>
            </p>
          ) : (
            <p className="text-caption text-text-muted m-0">
              Only Super Admin changes the service fee.
            </p>
          )}
        </div>

        {canEdit ? (
          <EditorPreview
            preview={preview}
            tableChanged={tableChanged}
            fallback={localPreview(inForce, inForce)}
            afterLabel={
              previewStart ? `From ${formatManilaStart(previewStart)}` : "After saving"
            }
          />
        ) : (
          <PreviewTable
            rows={readOnlyRows}
            compare={Boolean(pending)}
            afterLabel={
              pending?.effectiveFrom ? `From ${formatManilaStart(pending.effectiveFrom)}` : "Fee"
            }
            caption={
              pending
                ? "The six reference prices today and once the scheduled change starts."
                : "The six reference prices under the table in force."
            }
          />
        )}
      </div>

      {canEdit ? (
        <div className="border-outline mt-4 flex flex-col gap-4 border-t pt-4 lg:grid lg:grid-cols-2 lg:items-start">
          <Field>
            <FieldTitle id="service-fee-start-label">When it starts</FieldTitle>
            <RadioGroup
              aria-labelledby="service-fee-start-label"
              value={startMode}
              onValueChange={(next) => {
                setWithdrawing(false);
                setStartMode(next === "date" ? "date" : "now");
              }}
              disabled={locked}
              className="gap-2"
            >
              <StartOption value="now" label="As soon as it is saved" />
              <StartOption value="date" label="On a date and time (Manila)" />
            </RadioGroup>
            {startMode === "date" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  className={cn("w-44", startIssue && "border-error")}
                  aria-label="Start date"
                  aria-invalid={startIssue ? true : undefined}
                  min={manilaDateAfter(clock, 0)}
                  value={startDate}
                  disabled={locked}
                  onChange={(event) => setStartDate(event.target.value)}
                />
                <Input
                  type="time"
                  className={cn("w-32", startIssue && "border-error")}
                  aria-label="Start time"
                  aria-invalid={startIssue ? true : undefined}
                  value={startTime}
                  disabled={locked}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </div>
            ) : null}
            <FieldDescription>
              {startMode === "date" && startIssue
                ? startIssue
                : "Orders, open quotes and carts already priced keep the fee they were given. A new date replaces any change already scheduled."}
            </FieldDescription>
          </Field>

          <Field data-invalid={error && !reasonText && dirty ? true : undefined}>
            <FieldLabel htmlFor="service-fee-reason">Why the fee is changing</FieldLabel>
            <Textarea
              id="service-fee-reason"
              value={reason}
              maxLength={REASON_MAX}
              rows={3}
              disabled={locked}
              placeholder="For example: Report 5A07D2C2, brackets agreed with the captain"
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>
              Saved in the audit log with the old and new table and who changed it.
            </FieldDescription>
          </Field>
        </div>
      ) : null}

      {ok ? (
        <p className="text-body text-success m-0 mt-3" role="status">
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="text-body text-error m-0 mt-3" role="alert">
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={locked || !dirty || !draftBrackets}
            onClick={askToSave}
          >
            {busy ? "Saving…" : "Save service fee"}
          </Button>
          <Button variant="ghost" disabled={locked || (!dirty && !reason)} onClick={discard}>
            Discard
          </Button>
        </div>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {withdrawing && !tableChanged
                ? "Withdraw the scheduled change?"
                : startMode === "date" && startIso
                  ? `Change the service fee from ${formatManilaStart(startIso)}?`
                  : "Change the service fee now?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {withdrawing && !tableChanged
                ? "Today's table stays in force and the scheduled one is dropped."
                : `Every order priced ${startMode === "date" && startIso ? "from then" : "from now"} on uses this table.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {draftBrackets ? (
            <div className="flex flex-col gap-3">
              <BracketTable schedule={bracketSchedule(draftBrackets)} caption="New table" />
              <ul
                className="text-body text-text-secondary m-0 flex list-disc flex-col gap-1.5 pl-5"
                data-testid="service-fee-confirm-terms"
              >
                <li>
                  Orders, open quotes and carts already priced keep the fee they were given.
                </li>
                <li>Clients see one printing price with the fee inside it, never the brackets.</li>
                <li>
                  The audit log records the old and new table with your reason: &ldquo;
                  {reasonText}&rdquo;
                </li>
              </ul>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="secondary" onClick={() => void save()}>
              {withdrawing && !tableChanged
                ? "Withdraw the change"
                : startMode === "date"
                  ? "Schedule the change"
                  : "Change the fee now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function StartOption({ value, label }: { value: StartMode; label: string }) {
  const id = `service-fee-start-${value}`;
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-outline bg-surface px-3 py-2 has-[[data-checked]]:border-accent">
      <RadioGroupItem value={value} aria-labelledby={id} />
      <span id={id} className="text-body text-text-primary">
        {label}
      </span>
    </label>
  );
}

/**
 * The table as an editable ladder. Each row is a sentence: the range it
 * covers, then the rate on that part. The next row starts where this one
 * ends, so the starts follow the typed limits.
 */
function BracketLadder({
  rows,
  stored,
  problem,
  disabled,
  onChange,
}: {
  rows: BracketDraftRow[];
  stored: ServiceFeeBracket[];
  problem: { row: number; field: "upTo" | "rate"; message: string } | null;
  disabled: boolean;
  onChange: (rows: BracketDraftRow[]) => void;
}) {
  const baseId = useId();
  const update = (index: number, patch: Partial<BracketDraftRow>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  return (
    <div className="flex flex-col gap-2">
      <ol className="m-0 flex list-none flex-col p-0" aria-label="Service fee brackets">
        {rows.map((row, index) => {
          const last = index === rows.length - 1;
          const fromMinor = index === 0 ? 0 : pesosInputToMinor(rows[index - 1].upTo);
          const storedBand = stored[index];
          const limitInvalid = problem?.row === index && problem.field === "upTo";
          const rateInvalid = problem?.row === index && problem.field === "rate";
          const rateId = `${baseId}-rate-${index}`;
          const limitId = `${baseId}-limit-${index}`;
          const fromWords =
            fromMinor === null ? "the limit above" : formatLimit(fromMinor);
          return (
            <li
              key={index}
              className="border-outline relative flex flex-col gap-2 border-l-2 py-2 pl-3"
              data-testid={`service-fee-bracket-${index}`}
            >
              <span className="text-caption text-text-muted">
                {last
                  ? rows.length === 1
                    ? "Every peso of the shop price"
                    : `Everything above ${fromWords}`
                  : index === 0
                    ? "The first part of the shop price"
                    : `From ${fromWords}`}
              </span>
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                {!last ? (
                  <Field className="w-auto" data-invalid={limitInvalid || undefined}>
                    <FieldLabel htmlFor={limitId}>
                      <span className="text-caption text-text-secondary">Up to</span>
                    </FieldLabel>
                    <div className="relative w-36">
                      <span
                        aria-hidden
                        className="text-body text-text-muted pointer-events-none absolute inset-y-0 left-3 flex items-center"
                      >
                        ₱
                      </span>
                      <Input
                        id={limitId}
                        inputMode="decimal"
                        className="pl-7 tabular-nums"
                        value={row.upTo}
                        disabled={disabled}
                        aria-label={`Up to, bracket ${index + 1}, in pesos`}
                        aria-invalid={limitInvalid || undefined}
                        onChange={(event) => update(index, { upTo: event.target.value })}
                      />
                    </div>
                  </Field>
                ) : null}
                <Field className="w-auto" data-invalid={rateInvalid || undefined}>
                  <FieldLabel htmlFor={rateId}>
                    <span className="text-caption text-text-secondary">Rate on that part</span>
                  </FieldLabel>
                  <div className="relative w-28">
                    <Input
                      id={rateId}
                      inputMode="decimal"
                      className="pr-8 tabular-nums"
                      value={row.rate}
                      disabled={disabled}
                      aria-label={`Rate on that part, bracket ${index + 1}`}
                      aria-invalid={rateInvalid || undefined}
                      onChange={(event) => update(index, { rate: event.target.value })}
                    />
                    <span
                      aria-hidden
                      className="text-body text-text-muted pointer-events-none absolute inset-y-0 right-3 flex items-center"
                    >
                      %
                    </span>
                  </div>
                </Field>
                {rows.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    disabled={disabled}
                    aria-label={`Remove bracket ${index + 1}`}
                    onClick={() => onChange(withBracketRemoved(rows, index))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                ) : null}
              </div>
              {storedBand && bandMoved(storedBand, row, last) ? (
                <span className="text-caption text-text-muted">
                  In force:{" "}
                  {storedBand.upToMinor !== null
                    ? `${formatRatePercent(storedBand.rateBps)} up to ${formatLimit(storedBand.upToMinor)}`
                    : `${formatRatePercent(storedBand.rateBps)} above`}
                </span>
              ) : null}
              {problem?.row === index ? (
                <span className="text-caption text-error" role="alert">
                  {problem.message}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {rows.length < MAX_BRACKETS ? (
        <Button
          variant="ghost"
          className="self-start"
          disabled={disabled}
          onClick={() => onChange(withBracketAdded(rows))}
        >
          <Plus aria-hidden />
          Add a bracket
        </Button>
      ) : null}
    </div>
  );
}

/** Has this row moved off the stored bracket at the same position? */
function bandMoved(stored: ServiceFeeBracket, row: BracketDraftRow, last: boolean): boolean {
  const limit = last ? null : pesosInputToMinor(row.upTo);
  return stored.rateBps !== percentInputToBps(row.rate) || stored.upToMinor !== limit;
}

/** A stored table, read-only: one row per bracket. */
export function BracketTable({
  schedule,
  caption,
}: {
  schedule: ServiceFeeSchedule;
  caption: string;
}) {
  const brackets = bracketsOf(schedule);
  let from = 0;
  return (
    <div className="rounded-card bg-surface-variant flex flex-col gap-1 p-3">
      <p className="text-caption text-text-muted m-0">{caption}</p>
      <dl className="m-0 flex flex-col gap-1">
        {brackets.map((band, index) => {
          const range = bracketRange(from, band.upToMinor);
          from = band.upToMinor ?? from;
          return (
            <div key={index} className="flex items-baseline justify-between gap-x-3">
              <dt className="text-body text-text-secondary m-0">{range}</dt>
              <dd className="text-body text-text-primary m-0 tabular-nums" style={medium}>
                {formatRatePercent(band.rateBps)}
              </dd>
            </div>
          );
        })}
      </dl>
      {schedule.version === 1 ? (
        <p className="text-caption text-text-muted m-0">One flat rate on the whole shop price.</p>
      ) : null}
    </div>
  );
}

function EditorPreview({
  preview,
  tableChanged,
  fallback,
  afterLabel,
}: {
  preview: PreviewState;
  tableChanged: boolean;
  fallback: PreviewRow[];
  afterLabel: string;
}) {
  if (!tableChanged || preview.status === "idle") {
    return (
      <PreviewTable
        rows={fallback}
        compare={false}
        afterLabel="Fee"
        caption="The six reference prices under the table in force. Change a rate or a limit to compare."
      />
    );
  }
  if (preview.status === "error") {
    return (
      <div className="rounded-card bg-surface-variant p-3" data-testid="service-fee-preview">
        <p className="text-body text-error m-0" role="alert">
          {preview.message}
        </p>
      </div>
    );
  }
  if (preview.status === "loading" && !preview.rows) {
    return (
      <div className="rounded-card bg-surface-variant p-3" data-testid="service-fee-preview">
        <p className="text-body text-text-secondary m-0" role="status">
          Working out the six reference prices…
        </p>
      </div>
    );
  }
  return (
    <PreviewTable
      rows={preview.rows ?? []}
      compare
      afterLabel={afterLabel}
      caption={
        preview.status === "loading"
          ? "Updating…"
          : "Today's table against yours, worked out by the API on six reference prices."
      }
      busy={preview.status === "loading"}
    />
  );
}

/**
 * The reference prices as a table on tablet and up, and as one block per
 * price on a phone. With `compare`, today's fee, the new fee and the change;
 * the new fee's working sits under it either way, with its share of the price
 * so the missing cliff can be read down the column.
 */
function PreviewTable({
  rows,
  compare,
  afterLabel,
  caption,
  busy = false,
}: {
  rows: PreviewRow[];
  compare: boolean;
  afterLabel: string;
  caption: string;
  busy?: boolean;
}) {
  return (
    <div
      className="rounded-card bg-surface-variant flex min-w-0 flex-col gap-2 p-3"
      data-testid="service-fee-preview"
      aria-busy={busy || undefined}
    >
      <p className="text-caption text-text-muted m-0" aria-live="polite">
        {caption}
      </p>
      <table className={cn("hidden w-full border-collapse md:table", busy && "opacity-60")}>
        <thead>
          <tr className="text-caption text-text-muted text-left">
            <th scope="col" className="pb-1 font-normal">
              Shop price
            </th>
            {compare ? (
              <th scope="col" className="pb-1 text-right font-normal">
                Today
              </th>
            ) : null}
            <th scope="col" className="pb-1 text-right font-normal">
              {afterLabel}
            </th>
            {compare ? (
              <th scope="col" className="pb-1 text-right font-normal">
                Change
              </th>
            ) : null}
            <th scope="col" className="pb-1 text-right font-normal">
              Share of price
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const before = row.previous.grossServiceFeeMinor;
            const after = row.next.grossServiceFeeMinor;
            return (
              <tr key={row.shopPriceMinor} className="border-outline border-t align-top">
                <th
                  scope="row"
                  className="text-body text-text-primary py-1.5 pr-2 text-left tabular-nums"
                  style={medium}
                >
                  {formatPhp(row.shopPriceMinor)}
                </th>
                {compare ? (
                  <td className="text-body text-text-secondary py-1.5 pl-2 text-right tabular-nums">
                    {formatPhp(before)}
                  </td>
                ) : null}
                <td className="py-1.5 pl-2 text-right">
                  <span className="text-body text-text-primary block tabular-nums" style={medium}>
                    {formatPhp(after)}
                  </span>
                  <span className="text-caption text-text-muted block">
                    {workingSentence(row.next.serviceFeeWorking)}
                  </span>
                </td>
                {compare ? (
                  <td
                    className={cn(
                      "text-body py-1.5 pl-2 text-right whitespace-nowrap tabular-nums",
                      after === before ? "text-text-muted" : "text-text-primary",
                    )}
                  >
                    {feeChange(before, after)}
                  </td>
                ) : null}
                <td className="text-body text-text-secondary py-1.5 pl-2 text-right tabular-nums">
                  {effectiveRate(row.shopPriceMinor, after)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul className={cn("m-0 flex list-none flex-col p-0 md:hidden", busy && "opacity-60")}>
        {rows.map((row) => {
          const before = row.previous.grossServiceFeeMinor;
          const after = row.next.grossServiceFeeMinor;
          return (
            <li key={row.shopPriceMinor} className="border-outline flex flex-col gap-0.5 border-t py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body text-text-primary tabular-nums" style={medium}>
                  {formatPhp(row.shopPriceMinor)}
                </span>
                <span className="text-body text-text-primary tabular-nums" style={medium}>
                  {compare ? `${formatPhp(before)} → ${formatPhp(after)}` : formatPhp(after)}
                </span>
              </div>
              <span className="text-caption text-text-muted">
                {workingSentence(row.next.serviceFeeWorking)}
              </span>
              <span className="text-caption text-text-secondary">
                {compare ? `${feeChange(before, after)}, ` : ""}
                {effectiveRate(row.shopPriceMinor, after)} of the price
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ScheduledNotice({
  pending,
  inForce,
  canEdit,
  disabled,
  onWithdraw,
}: {
  pending: ServiceFeeSchedule & { effectiveFrom?: string };
  inForce: ServiceFeeSchedule;
  canEdit: boolean;
  disabled: boolean;
  onWithdraw: () => void;
}) {
  return (
    <div
      className="border-info mt-3 flex flex-col gap-2 rounded-card border p-3"
      data-testid="service-fee-scheduled"
    >
      <p className="text-body text-text-primary m-0" style={medium}>
        From {formatManilaStart(pending.effectiveFrom!)} (Manila): {scheduleSummary(pending)}
      </p>
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Until then new orders are priced at {scheduleSummary(inForce)}. Saving another table
        replaces this change.
      </p>
      {canEdit ? (
        <Button variant="ghost" className="self-start" disabled={disabled} onClick={onWithdraw}>
          Withdraw this change
        </Button>
      ) : null}
    </div>
  );
}
