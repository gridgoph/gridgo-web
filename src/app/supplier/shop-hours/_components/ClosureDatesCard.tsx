"use client";

import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";

import { ClosureRows } from "@/components/shop-hours/ClosureRows";
import type { ConfirmRequest } from "@/components/shop-hours/useConfirm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ScheduleClosure } from "@/lib/api/types";
import { closureLabel } from "@/lib/operating-hours";
import {
  closureLengthLabel,
  manilaClock,
  validateClosure,
  withClosure,
  withoutClosure,
} from "@/lib/shop-hours";

type Props = {
  closures: ScheduleClosure[];
  now: number;
  saving: boolean;
  ask: (request: ConfirmRequest) => Promise<boolean>;
  /** Saves the whole closure list; resolves to a refusal, or null once saved. */
  onSave: (closures: ScheduleClosure[]) => Promise<string | null>;
};

type Editing = { replacing: ScheduleClosure | null };

/**
 * Dates the shop is shut (holidays, a maintenance day), saved with GRIDGO so
 * a job is never timed across them. A past closure is kept until removed,
 * because it still counts toward the 90-date limit. A closure is known by its
 * dates (the API keeps no id), so changing one replaces that run.
 */
export function ClosureDatesCard({ closures, now, saving, ask, onSave }: Props) {
  const today = manilaClock(now).dayKey;
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function remove(closure: ScheduleClosure) {
    const confirmed = await ask({
      title: `Remove the closure on ${closureLabel(closure)}?`,
      body: "GRIDGO will count those dates as open days again when it times new jobs.",
      confirmLabel: "Remove closure",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!confirmed) return;
    const refused = await onSave(withoutClosure(closures, closure));
    setNotice(refused ? { tone: "error", text: refused } : { tone: "success", text: "Closure removed." });
  }

  return (
    <section
      className="rounded-card border border-outline bg-surface flex flex-col gap-4 p-4"
      aria-labelledby="closure-dates-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-1">
          <h2 id="closure-dates-heading" className="text-h3 text-text-primary m-0">
            Closure dates
          </h2>
          <p className="text-body text-text-secondary m-0">
            Holidays and other days you are shut. GRIDGO does not count them when it times a job,
            and clients see your shop as closed on them.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={saving}
          onClick={() => {
            setNotice(null);
            setEditing({ replacing: null });
          }}
        >
          <Plus aria-hidden />
          Add closure dates
        </Button>
      </div>

      <ClosureRows
        closures={closures}
        today={today}
        empty="No closure dates. Add one before a holiday so no job is timed across it."
        actions={(closure) => {
          const label = closureLabel(closure);
          return (
            <span className="flex shrink-0">
              <Button
                variant="ghost"
                size="icon"
                disabled={saving}
                aria-label={`Change closure ${label}`}
                onClick={() => {
                  setNotice(null);
                  setEditing({ replacing: closure });
                }}
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={saving}
                aria-label={`Remove closure ${label}`}
                onClick={() => void remove(closure)}
              >
                <X aria-hidden />
              </Button>
            </span>
          );
        }}
      />

      {notice ? (
        <p
          className={notice.tone === "error" ? "text-body text-error m-0" : "text-caption text-success m-0"}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}

      <ClosureDialog
        key={editing ? `${editing.replacing?.startDay ?? "new"}-${editing.replacing?.endDay ?? ""}` : "closed"}
        editing={editing}
        closures={closures}
        today={today}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={async (next) => {
          const refused = await onSave(withClosure(closures, next, editing?.replacing ?? null));
          if (!refused) {
            setEditing(null);
            setNotice({
              tone: "success",
              text: editing?.replacing ? "Closure dates changed." : "Closure dates added.",
            });
          }
          return refused;
        }}
      />
    </section>
  );
}

function ClosureDialog({
  editing,
  closures,
  today,
  saving,
  onClose,
  onSave,
}: {
  editing: Editing | null;
  closures: ScheduleClosure[];
  today: string;
  saving: boolean;
  onClose: () => void;
  onSave: (closure: ScheduleClosure) => Promise<string | null>;
}) {
  const replacing = editing?.replacing ?? null;
  const [startDay, setStartDay] = useState(replacing?.startDay ?? today);
  const [endDay, setEndDay] = useState(replacing?.endDay ?? today);
  const [error, setError] = useState<string | null>(null);
  const candidate = { startDay, endDay };
  // A past closure being changed may keep its first date; a new one starts today or later.
  const earliest = replacing && replacing.startDay < today ? replacing.startDay : today;

  async function save() {
    const problem = validateClosure(candidate, closures, replacing);
    if (problem) {
      setError(problem);
      return;
    }
    setError(await onSave(candidate));
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{replacing ? "Change closure dates" : "Add closure dates"}</DialogTitle>
          <DialogDescription>
            Jobs you already accepted keep their dates. Dates are Philippine dates.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="closure-start">First closed date</FieldLabel>
            <Input
              id="closure-start"
              type="date"
              value={startDay}
              min={earliest}
              disabled={saving}
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                const next = event.target.value;
                setStartDay(next);
                if (next > endDay) setEndDay(next);
                setError(null);
              }}
            />
          </Field>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="closure-end">Last closed date</FieldLabel>
            <Input
              id="closure-end"
              type="date"
              value={endDay}
              min={startDay || earliest}
              disabled={saving}
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                setEndDay(event.target.value);
                setError(null);
              }}
            />
            <FieldDescription>The same date for a one-day closure.</FieldDescription>
          </Field>
        </FieldGroup>
        {startDay && endDay && endDay >= startDay ? (
          <p className="text-body text-text-primary m-0">
            Closed {closureLabel(candidate)}: {closureLengthLabel(candidate)}.
          </p>
        ) : null}
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : replacing ? "Save closure dates" : "Add closure dates"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
