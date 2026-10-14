"use client";

import { useEffect, useState } from "react";

import {
  PRODUCTION_TIME_HINT,
  ProductionTimePicker,
} from "@/app/supplier/_components/ProductionTimeField";
import {
  serviceLineDayMinutes,
  serviceLineDraft,
  serviceLinePatch,
  serviceLineProblem,
  type ServiceLineDraft,
} from "@/app/supplier/_lib/capacity";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isApiError, updateSupplierService } from "@/lib/api/client";
import type { SupplierService } from "@/lib/api/types";

type Props = {
  service: SupplierService | null;
  /** The line's category, in the shop's words. */
  categoryName: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (service: SupplierService) => void;
};

function saveErrorMessage(err: unknown): string {
  if (!isApiError(err))
    return "Could not reach GRIDGO. Check your connection and try again.";
  switch (err.code) {
    case "invalid_service":
      return "GRIDGO could not take that production time. Hours must stay under one of your working days; use working days for anything longer.";
    case "production_day_length_unavailable":
      return "Your shop's open hours are not set in a way GRIDGO can count a working day from. Check your schedule, then try again.";
    case "service_withdrawn":
      return "This line has been withdrawn, so it cannot be changed. Refresh to see it.";
    case "forbidden":
      return "This line belongs to another shop account.";
    default:
      return err.kind === "server"
        ? "GRIDGO could not save this just now. Try again in a moment."
        : "Could not save this line. Refresh and try again.";
  }
}

/**
 * One live line's capacity and usual production time — the time a listing
 * follows while it uses "Your usual time". Neither change sends the line back
 * to verification; only widening what it prints does, and that is not here.
 */
export function ServiceLineDialog({
  service,
  categoryName,
  onOpenChange,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<ServiceLineDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(service ? serviceLineDraft(service) : null);
    setError(null);
  }, [service]);

  const dayMinutes = service ? serviceLineDayMinutes(service) : undefined;
  const problem = draft ? serviceLineProblem(draft, dayMinutes) : null;

  async function save() {
    if (!service || !draft || problem) return;
    setSaving(true);
    setError(null);
    try {
      const patch = serviceLinePatch(service, draft);
      const saved = Object.keys(patch).length
        ? await updateSupplierService(service.id, patch)
        : service;
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={service !== null}
      onOpenChange={(open) => !saving && onOpenChange(open)}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{categoryName}</DialogTitle>
          <DialogDescription>
            How much this line takes on, and how long it usually takes. Listings on
            &ldquo;Your usual time&rdquo; follow this time.
          </DialogDescription>
        </DialogHeader>
        {draft ? (
          <FieldGroup className="gap-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="line-daily">Daily capacity</FieldLabel>
                <Input
                  id="line-daily"
                  inputMode="numeric"
                  value={draft.capacityDaily}
                  placeholder="Units per day"
                  onChange={(event) =>
                    setDraft({ ...draft, capacityDaily: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="line-weekly">Weekly capacity</FieldLabel>
                <Input
                  id="line-weekly"
                  inputMode="numeric"
                  value={draft.capacityWeekly}
                  placeholder="Units per week"
                  onChange={(event) =>
                    setDraft({ ...draft, capacityWeekly: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Usual production time</FieldLabel>
              <FieldDescription>{PRODUCTION_TIME_HINT}</FieldDescription>
              <ProductionTimePicker
                time={draft.turnaround}
                onChange={(turnaround) => setDraft({ ...draft, turnaround })}
                dayMinutes={dayMinutes}
                label="Usual production time"
                unitLabel={`Count ${categoryName} production time in`}
                disabled={saving}
              />
            </Field>
            {problem || error ? <FieldError>{problem ?? error}</FieldError> : null}
          </FieldGroup>
        ) : null}
        <DialogFooter>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={saving || Boolean(problem)}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save line"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
