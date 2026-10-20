"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronDown, Minus, Plus } from "lucide-react";

import { SegmentedControl } from "@/app/supplier/_components/SegmentedControl";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { previewProductionTime } from "@/lib/api/client";
import { formatPhp } from "@/lib/format";
import type { SpeedTier } from "@/lib/listings";
import { DEFAULT_DAY_MINUTES, PRODUCTION_DAYS, timeLabel } from "@/lib/production-time";
import {
  choiceLine,
  choiceProblem,
  hoursParts,
  manilaDayLabel,
  normalizePreview,
  presentPreviewDay,
  previewSummary,
  sameDayHourSteps,
  sameDayTooLong,
  startChoice,
  withDays,
  type ProductionTimeChoice,
  type ProductionTimeMode,
  type ProductionTimePreview,
} from "@/lib/production-time-choice";

const MODES = [
  { value: "same_day", label: "Same day" },
  { value: "days", label: "Days" },
] as const;

/** The preview waits for the shop to stop stepping before it asks. */
const PREVIEW_DELAY_MS = 400;

type CountStepperProps = {
  /** Index into `steps`; the figure is `parts(steps[index])`. */
  steps: readonly number[];
  value: number;
  onChange: (value: number) => void;
  parts: (value: number) => { value: string; unit: string };
  /** Names the control: "Hours until ready". */
  label: string;
  disabled?: boolean;
};

/**
 * One figure, stepped through a fixed list: minus, the figure, plus. The
 * figure is a spinbutton: arrow keys step it, Home and End jump to the ends.
 */
function CountStepper({ steps, value, onChange, parts, label, disabled }: CountStepperProps) {
  const index = Math.max(0, steps.indexOf(value));
  const atStart = index === 0;
  const atEnd = index === steps.length - 1;
  const shown = parts(value);
  const move = (delta: number) =>
    onChange(steps[Math.min(steps.length - 1, Math.max(0, index + delta))]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const moves: Record<string, () => void> = {
      ArrowUp: () => move(1),
      ArrowRight: () => move(1),
      ArrowDown: () => move(-1),
      ArrowLeft: () => move(-1),
      Home: () => onChange(steps[0]),
      End: () => onChange(steps[steps.length - 1]),
    };
    const action = moves[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  return (
    <div className="border-border bg-card inline-flex h-12 max-w-full items-stretch self-start rounded-[var(--radius-field)] border">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-full rounded-r-none"
        aria-label={`Fewer: ${label.toLowerCase()}`}
        disabled={disabled || atStart}
        onClick={() => move(-1)}
      >
        <Minus aria-hidden />
      </Button>
      <div
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={steps[0]}
        aria-valuemax={steps[steps.length - 1]}
        aria-valuenow={value}
        aria-valuetext={`${shown.value} ${shown.unit}`}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className="border-border flex min-w-32 flex-1 items-baseline justify-center gap-1.5 border-x px-3 py-2.5"
      >
        <span
          className="text-h3 text-text-primary tabular-nums"
          style={{ fontFamily: "var(--font-bold)" }}
        >
          {shown.value}
        </span>
        <span className="text-body text-text-secondary">{shown.unit}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-full rounded-l-none"
        aria-label={`More: ${label.toLowerCase()}`}
        disabled={disabled || atEnd}
        onClick={() => move(1)}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}

const DAY_STEPS = Array.from(
  { length: PRODUCTION_DAYS.max - PRODUCTION_DAYS.min + 1 },
  (_, index) => PRODUCTION_DAYS.min + index,
);

function dayParts(days: number) {
  return { value: String(days), unit: days === 1 ? "working day" : "working days" };
}

type Props = {
  /** The listing the preview reads against. */
  itemId: string;
  /** Null while the listing has no production time: the shop picks a side first. */
  choice: ProductionTimeChoice | null;
  onChange: (choice: ProductionTimeChoice) => void;
  /** The shop's working day from GRIDGO; its ten-hour default when not sent. */
  dayMinutes?: number;
  /** Faster price options the listing already offers. Shown, never changed here. */
  speedTiers: readonly SpeedTier[];
  /** How many listings the shop has, so the bulk confirmation can say it. */
  listingCount: number | null;
  /** True while a save is in flight or this listing has unsaved edits. */
  applyBlocked: boolean;
  applying: boolean;
  applyError: string | null;
  applyNotice: string | null;
  onApplyToAll: () => void | Promise<void>;
  /** Fixed in tests so the preview never waits. */
  previewDelayMs?: number;
};

/**
 * "How long does this take?" The shop answers Same day (ready in X hours) or
 * Days (from X to Y working days) and sees, under it, the dates a client
 * would be offered with that answer. Faster price options and "Use for all
 * my listings" sit under More options.
 */
export function HowLongField({
  itemId,
  choice,
  onChange,
  dayMinutes = DEFAULT_DAY_MINUTES,
  speedTiers,
  listingCount,
  applyBlocked,
  applying,
  applyError,
  applyNotice,
  onApplyToAll,
  previewDelayMs = PREVIEW_DELAY_MS,
}: Props) {
  const last = useRef<Partial<Record<ProductionTimeMode, ProductionTimeChoice>>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!choice) {
    return (
      <div className="flex flex-col gap-2">
        <h3
          id="how-long-heading"
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          How long does this take?
        </h3>
        <p className="text-caption text-text-secondary m-0 max-w-prose">
          No production time yet, so clients cannot be offered a date. Pick one.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="how-long-heading">
          {MODES.map((mode) => (
            <Button key={mode.value} type="button" onClick={() => onChange(startChoice(mode.value))}>
              {mode.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  const problem = choiceProblem(choice, dayMinutes);
  const tooLong = sameDayTooLong(choice, dayMinutes);
  const current = choice;

  function switchTo(mode: ProductionTimeMode) {
    if (mode === current.mode) return;
    last.current[current.mode] = current;
    onChange(last.current[mode] ?? startChoice(mode));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h3
          id="how-long-heading"
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          How long does this take?
        </h3>
        <SegmentedControl
          id="how-long-mode"
          aria-labelledby="how-long-heading"
          options={MODES}
          value={choice.mode}
          onChange={switchTo}
        />
      </div>

      {choice.mode === "same_day" ? (
        <div className="flex flex-col gap-1.5">
          <span id="how-long-hours" className="text-caption text-text-secondary">
            Ready in
          </span>
          <CountStepper
            steps={sameDayHourSteps(dayMinutes, choice.hours)}
            value={choice.hours}
            onChange={(hours) => onChange({ mode: "same_day", hours })}
            parts={hoursParts}
            label="Hours until ready"
          />
          <p className="text-caption text-text-muted m-0 max-w-prose">
            Counted in your open hours. A job that runs past closing finishes the next
            working day.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-text-secondary">From</span>
            <CountStepper
              steps={DAY_STEPS}
              value={choice.minDays}
              onChange={(days) => onChange(withDays(choice, "min", days))}
              parts={dayParts}
              label="Shortest working days"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-text-secondary">To</span>
            <CountStepper
              steps={DAY_STEPS}
              value={choice.maxDays}
              onChange={(days) => onChange(withDays(choice, "max", days))}
              parts={dayParts}
              label="Longest working days"
            />
          </div>
        </div>
      )}

      {tooLong ? (
        <p className="text-caption text-text-secondary m-0 max-w-prose" role="note">
          This listing still holds a time longer than one working day. Choose Days to set
          it in working days.
        </p>
      ) : problem ? (
        <p className="text-caption text-destructive m-0 max-w-prose" role="alert">
          {problem}
        </p>
      ) : null}

      <DatesPreview
        itemId={itemId}
        choice={choice}
        valid={!problem}
        delayMs={previewDelayMs}
      />

      <Collapsible className="flex flex-col gap-3">
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className="group/more self-start px-2"
            />
          }
        >
          More options
          <ChevronDown
            aria-hidden
            className="transition-transform group-data-[panel-open]/more:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4">
          <div className="rounded-field border-outline flex flex-col gap-2 border p-3">
            <h4
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              Use for all my listings
            </h4>
            <p className="text-caption text-text-secondary m-0 max-w-prose">
              Puts this answer ({choiceLine(choice)}) on every listing you have, hidden
              ones and drafts included. Prices and faster options stay as they are.
            </p>
            <div>
              <Button
                type="button"
                disabled={Boolean(problem) || applyBlocked || applying}
                onClick={() => setConfirmOpen(true)}
              >
                {applying ? "Applying…" : "Use for all my listings"}
              </Button>
            </div>
            {applyBlocked && !applying ? (
              <p className="text-caption text-text-muted m-0">
                Waits until this listing&apos;s changes are saved.
              </p>
            ) : null}
            {applyNotice ? (
              <p className="text-caption text-text-primary m-0" role="status">
                {applyNotice}
              </p>
            ) : null}
            {applyError ? (
              <p className="text-caption text-destructive m-0" role="alert">
                {applyError}
              </p>
            ) : null}
          </div>
          <FasterOptions tiers={speedTiers} />
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Use {choiceLine(choice)} for all your listings?</AlertDialogTitle>
            <AlertDialogDescription>
              {listingCount != null
                ? `All ${listingCount} of your listings`
                : "Every listing you have"}
              , hidden ones and drafts included, will take this production time. New
              orders get dates from it straight away. Orders already placed keep their
              dates, and your prices and faster options do not change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void onApplyToAll();
              }}
            >
              Use for all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * The next two weeks as a client would see them with this answer. It asks
 * GRIDGO with the unsaved answer, so it moves as the shop steps.
 */
function DatesPreview({
  itemId,
  choice,
  valid,
  delayMs,
}: {
  itemId: string;
  choice: ProductionTimeChoice;
  valid: boolean;
  delayMs: number;
}) {
  const key = JSON.stringify(choice);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; key: string; preview: ProductionTimePreview }
    | { kind: "error" }
  >({ kind: "loading" });

  useEffect(() => {
    if (!valid) return;
    let live = true;
    const wanted = JSON.parse(key) as ProductionTimeChoice;
    const timer = window.setTimeout(() => {
      previewProductionTime(itemId, wanted)
        .then((body) => {
          if (live) setState({ kind: "ready", key, preview: normalizePreview(body) });
        })
        .catch(() => {
          if (live) setState({ kind: "error" });
        });
    }, delayMs);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [itemId, key, valid, delayMs]);

  const stale = state.kind === "ready" && state.key !== key;

  return (
    <section
      aria-labelledby="dates-preview-heading"
      className="gg-panel flex flex-col gap-3 p-3"
      aria-busy={state.kind === "loading" || stale || undefined}
    >
      <div className="flex items-start gap-3">
        <CalendarDays className="text-text-secondary mt-0.5 size-[18px] shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <h4
            id="dates-preview-heading"
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            Dates clients will see
          </h4>
          {!valid ? (
            <p className="text-caption text-text-muted m-0">
              Fix the time above to see the dates.
            </p>
          ) : state.kind === "error" ? (
            <p className="text-caption text-text-secondary m-0" role="status">
              The dates could not be loaded. They will show when you change the time again.
            </p>
          ) : state.kind === "ready" ? (
            <p className="text-caption text-text-secondary m-0" role="status">
              {previewSummary(choice, state.preview)}
            </p>
          ) : null}
        </div>
      </div>
      {valid && state.kind === "loading" ? (
        <Skeleton className="h-40 w-full" />
      ) : valid && state.kind === "ready" ? (
        <ul
          className={`m-0 grid list-none gap-1.5 p-0 sm:grid-cols-2 ${stale ? "opacity-60" : ""}`}
          aria-label="The next two weeks"
        >
          {state.preview.days.map((day) => {
            const shown = presentPreviewDay(day);
            return (
              <li
                key={day.day}
                className="border-outline flex min-w-0 flex-col gap-1 rounded-md border px-2.5 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className="text-body text-text-primary tabular-nums"
                    style={{ fontFamily: "var(--font-medium)" }}
                  >
                    {manilaDayLabel(day.day)}
                  </span>
                  <StatusChip tone={shown.tone} icon={shown.icon} label={shown.label} />
                </div>
                {shown.detail ? (
                  <span className="text-caption text-text-secondary">{shown.detail}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="text-caption text-text-muted m-0 max-w-prose">
        Counted from an order placed now, with GRIDGO&apos;s file check, your open days and
        the jobs already ahead of it. Tight dates fall between your shortest and longest
        time. It is a preview: nothing is reserved.
      </p>
    </section>
  );
}

/** The listing's faster price options, read-only: this page never changes them. */
function FasterOptions({ tiers }: { tiers: readonly SpeedTier[] }) {
  return (
    <div className="rounded-field border-outline flex flex-col gap-2 border p-3">
      <h4 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
        Faster price options
      </h4>
      {tiers.length ? (
        <>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {tiers.map((tier) => (
              <li key={tier.id} className="text-body text-text-primary">
                {tier.label} · {timeLabel(tier.turnaround)} ·{" "}
                {tier.priceMinor != null
                  ? formatPhp(tier.priceMinor)
                  : tier.surchargeMinor != null
                    ? `${formatPhp(tier.surchargeMinor)} more`
                    : "No price"}
              </li>
            ))}
          </ul>
          <p className="text-caption text-text-muted m-0 max-w-prose">
            A client sees these as Rush, costs more on dates only a faster option reaches.
            Change them in the shop app.
          </p>
        </>
      ) : (
        <p className="text-caption text-text-secondary m-0 max-w-prose">
          None on this listing. Add one in the shop app if you can finish faster for
          a higher price.
        </p>
      )}
    </div>
  );
}
