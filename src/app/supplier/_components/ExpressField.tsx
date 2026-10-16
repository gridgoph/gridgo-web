"use client";

import { Zap } from "lucide-react";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  EXPRESS_SWITCH_CAUTION,
  EXPRESS_SWITCH_HELP,
  expressStateLine,
} from "@/lib/express";

type Props = {
  /** What the listing holds now; the switch shows `pending` while it saves. */
  on: boolean;
  pending: boolean | null;
  disabled: boolean;
  error: string | null;
  onChange: (next: boolean) => void;
};

/**
 * The shop's Express switch. It saves on its own the moment it is flipped
 * (PATCH `express` with the listing's version) and never opens a review, so
 * it sits apart from the autosaved fields and says so.
 */
export function ExpressField({ on, pending, disabled, error, onChange }: Props) {
  const shown = pending ?? on;
  return (
    <div className="rounded-field border-outline flex flex-col gap-2 border p-3">
      <Field orientation="horizontal" className="items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <Zap
            size={18}
            strokeWidth={2}
            aria-hidden
            className="shrink-0"
            style={{ color: "var(--color-info)" }}
          />
          <FieldLabel htmlFor="listing-express" className="min-h-11">
            Express
          </FieldLabel>
        </span>
        <Switch
          id="listing-express"
          aria-describedby="listing-express-help listing-express-state"
          checked={shown}
          disabled={disabled || pending != null}
          onCheckedChange={(value) => onChange(value)}
        />
      </Field>
      <FieldDescription id="listing-express-help" className="m-0 max-w-prose">
        {EXPRESS_SWITCH_HELP} {EXPRESS_SWITCH_CAUTION}
      </FieldDescription>
      <p
        id="listing-express-state"
        role="status"
        className="text-body text-text-primary m-0"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {pending != null ? "Saving…" : expressStateLine(on)}
      </p>
      {error ? (
        <p className="text-caption text-destructive m-0" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
