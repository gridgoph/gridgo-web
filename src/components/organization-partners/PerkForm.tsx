"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

import { PerkPreview } from "@/components/organization-partners/PerkPreview";
import { ReasonDialog } from "@/components/organization-partners/ReasonDialog";
import { useFocusFirstProblem } from "@/components/organization-partners/useFocusFirstProblem";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { MemberPerk, MemberPerkInput } from "@/lib/api/organization-partners";
import {
  NEW_ORDERS_NOTE,
  PERK_UNCHANGED_NOTE,
  capAlreadyReached,
  manilaDay,
  perkChanges,
  perkDraft,
  readPerkDraft,
  type PerkDraft,
  type PerkProblems,
} from "@/lib/organization-partners";

/**
 * The perk fields, shared by the standard perk and one organization's own.
 * Blank and off until a Super Admin decides: no field suggests an amount.
 * Nothing saves without a confirmation that restates each change and takes a
 * reason. A refused stale save keeps what was typed and rebases onto the
 * version the page reloads.
 */
export function PerkForm({
  setting,
  startFrom,
  label,
  onOffHelp,
  reach,
  affected,
  confirmTitle,
  cancelHref,
  onSave,
  onStale,
}: {
  /** The row being changed; null to create it. */
  setting: MemberPerk | null;
  /** Figures to start typing from when the row does not exist yet. */
  startFrom: MemberPerk | null;
  /** The organization's short name, or null for the standard perk. */
  label: string | null;
  onOffHelp: { on: string; off: string };
  /** Who the change reaches, in one sentence. */
  reach: string;
  /** Partners on this setting, to warn about a cap they already reached. */
  affected: readonly { label: string; budgetUsedMinor: number }[];
  confirmTitle: string;
  cancelHref: string;
  onSave: (
    input: MemberPerkInput,
    expectedVersion: number,
    reason: string,
  ) => Promise<void>;
  /** Reloads the setting after someone else changed it. */
  onStale: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<PerkDraft>(() => perkDraft(setting ?? startFrom));
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { form, refuse } = useFocusFirstProblem();
  const [stale, setStale] = useState<string | null>(null);

  const base = setting ?? startFrom;
  const { input, problems } = readPerkDraft(draft, base);
  const changes = input ? perkChanges(setting, input) : [];
  const shown: PerkProblems = touched ? problems : {};
  const reached = input?.enabled ? capAlreadyReached(input.budgetCapMinor, affected) : [];
  const capBelowPerk = input !== null && input.budgetCapMinor < input.amountMinor;

  const set = (patch: Partial<PerkDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStale(null);
  };

  return (
    <form
      ref={form}
      noValidate
      className="grid grid-cols-1 gap-3 lg:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!input) return refuse();
        if (changes.length === 0) return;
        setConfirming(true);
      }}
    >
      <section aria-label="Perk settings" className="gg-card flex flex-col gap-4 p-3">
        <FieldGroup>
          <Field>
            <FieldLabel id="perk-enabled-label">Member perk</FieldLabel>
            <RadioGroup
              aria-labelledby="perk-enabled-label"
              value={draft.enabled ? "on" : "off"}
              onValueChange={(value) => set({ enabled: value === "on" })}
              className="gap-1"
            >
              {(["off", "on"] as const).map((value) => (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-center gap-3"
                >
                  <RadioGroupItem value={value} aria-labelledby={`perk-${value}`} />
                  <span id={`perk-${value}`} className="text-body text-text-primary">
                    {onOffHelp[value]}
                  </span>
                </label>
              ))}
            </RadioGroup>
          </Field>

          <MoneyField
            id="perk-amount"
            label="Pesos off an order, at most"
            value={draft.amount}
            error={shown.amount}
            help="The member saves this, or GRIDGO's service fee on that order if it is smaller."
            onChange={(amount) => set({ amount })}
          />

          <Field data-invalid={shown.maxOrders ? true : undefined}>
            <FieldLabel htmlFor="perk-orders">
              Most orders per member each term
            </FieldLabel>
            <Input
              id="perk-orders"
              inputMode="numeric"
              className="max-w-40 tabular-nums"
              value={draft.maxOrders}
              aria-invalid={shown.maxOrders ? true : undefined}
              aria-describedby="perk-orders-help"
              onChange={(event) => set({ maxOrders: event.target.value })}
            />
            <FieldDescription id="perk-orders-help">
              A term is one school year, 1 June to 31 May. One checkout uses one, however
              many shops are in it.
            </FieldDescription>
            {shown.maxOrders ? <FieldError>{shown.maxOrders}</FieldError> : null}
          </Field>

          <Field data-invalid={shown.lastDay ? true : undefined}>
            <FieldLabel htmlFor="perk-last-day">Last day</FieldLabel>
            <Input
              id="perk-last-day"
              type="date"
              className="max-w-48"
              min={manilaDay()}
              value={draft.lastDay}
              aria-invalid={shown.lastDay ? true : undefined}
              aria-describedby="perk-last-day-help"
              onChange={(event) => set({ lastDay: event.target.value })}
            />
            <FieldDescription id="perk-last-day-help">
              Works through the end of this day, Manila time. A membership still ends on
              31 May until the officer renews it.
            </FieldDescription>
            {shown.lastDay ? <FieldError>{shown.lastDay}</FieldError> : null}
          </Field>

          <MoneyField
            id="perk-cap"
            label={
              label
                ? "Budget cap for this organization"
                : "Budget cap for each organization"
            }
            value={draft.budgetCap}
            error={shown.budgetCap}
            help="The most GRIDGO gives one organization's members in total, across every term. Raise it later to add money."
            onChange={(budgetCap) => set({ budgetCap })}
          />
        </FieldGroup>
      </section>

      <div className="flex flex-col gap-3">
        <section
          aria-labelledby="perk-preview-heading"
          className="gg-card flex flex-col gap-3 p-3"
        >
          <h2 id="perk-preview-heading" className="text-h3 text-text-primary m-0">
            What members see
          </h2>
          <PerkPreview perk={input} label={label} />
          {reached.length ? (
            <Note>
              {reached.length === 1
                ? `${reached[0]} has already used this much, so its members would get no perk.`
                : `${reached.join(", ")} have already used this much, so their members would get no perk.`}
            </Note>
          ) : null}
          {capBelowPerk ? (
            <Note>
              The cap is less than one full perk, so some orders would get none.
            </Note>
          ) : null}
          <ul className="text-body text-text-secondary m-0 flex list-disc flex-col gap-1 pl-5">
            <li>{reach}</li>
            <li>{NEW_ORDERS_NOTE}</li>
            <li>{PERK_UNCHANGED_NOTE}</li>
          </ul>
        </section>

        {stale ? (
          <p className="text-body text-error m-0" role="alert">
            {stale}
          </p>
        ) : null}
        {touched && Object.keys(problems).length ? (
          <p className="text-body text-error m-0" role="alert">
            Some fields need a fix before this can be saved.
          </p>
        ) : touched && input && changes.length === 0 ? (
          <p className="text-body text-text-secondary m-0" role="status">
            Nothing is different from what is in force.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary">
            Review and save
          </Button>
          <Button
            variant="secondary"
            nativeButton={false}
            render={<Link href={cancelHref} />}
          >
            Cancel
          </Button>
        </div>
      </div>

      <ReasonDialog
        open={confirming && input !== null}
        title={confirmTitle}
        description={`${reach} ${NEW_ORDERS_NOTE}`}
        confirmLabel="Save perk"
        onClose={() => setConfirming(false)}
        onStale={(message) => {
          setConfirming(false);
          setStale(message);
          void onStale();
        }}
        onConfirm={async (reason) => {
          if (!input) return;
          await onSave(input, setting?.version ?? 0, reason);
          setConfirming(false);
        }}
      >
        <ul
          className="text-body text-text-primary m-0 flex list-disc flex-col gap-1 pl-5"
          data-testid="perk-changes"
        >
          {changes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </ReasonDialog>
    </form>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-body text-text-primary rounded-field border-warning m-0 border p-3"
      role="status"
    >
      {children}
    </p>
  );
}

function MoneyField({
  id,
  label,
  value,
  error,
  help,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error: string | undefined;
  help: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative max-w-48">
        <span
          aria-hidden
          className="text-body text-text-muted pointer-events-none absolute inset-y-0 left-3 flex items-center"
        >
          ₱
        </span>
        <Input
          id={id}
          inputMode="decimal"
          className="pl-7 tabular-nums"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <FieldDescription id={`${id}-help`}>{help}</FieldDescription>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
