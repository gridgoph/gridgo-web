"use client";

import { useState } from "react";

import { bpsToPercentInput, percentInputToBps } from "@/components/settings/service-fee";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateSettings } from "@/lib/api/client";
import type { PlatformSettings, ShopMoneySettings as Policy } from "@/lib/api/types";
import { formatPhp, minorToPesosInput, pesosToMinor } from "@/lib/format";
import {
  clockWords,
  parseDateList,
  SHOP_MONEY_DEFAULTS,
  shopMoneyChangeSummary,
  shopMoneyErrorMessage,
  shopMoneySettingsProblems,
  WEEKDAYS,
} from "@/lib/shop-money";

type Editable = Omit<Policy, "launchedAt">;

type Draft = {
  payoutTime: string;
  reminderTime: string;
  payDeadline: string;
  minimum: string;
  bonusRate: string;
  bonusDays: string;
  bonusCap: string;
  businessWeekdays: number[];
  holidays: string;
  extraBusinessDates: string;
};

function draftOf(p: Editable): Draft {
  return {
    payoutTime: p.payoutTime,
    reminderTime: p.reminderTime,
    payDeadline: p.payDeadline,
    minimum: minorToPesosInput(p.minimumMinor),
    bonusRate: bpsToPercentInput(p.bonusRateBps),
    bonusDays: String(p.bonusDays),
    bonusCap: minorToPesosInput(p.bonusCapMinor),
    businessWeekdays: [...p.businessWeekdays],
    holidays: p.holidays.join("\n"),
    extraBusinessDates: p.extraBusinessDates.join("\n"),
  };
}

/** The draft as the API's policy, or the first field that cannot be read. */
function readDraft(d: Draft): { policy: Editable; unreadable: Partial<Record<keyof Draft, string>> } {
  const unreadable: Partial<Record<keyof Draft, string>> = {};
  const holidays = parseDateList(d.holidays);
  const extra = parseDateList(d.extraBusinessDates);
  if ("bad" in holidays) unreadable.holidays = `“${holidays.bad}” is not a date like 2026-12-25.`;
  if ("bad" in extra) unreadable.extraBusinessDates = `“${extra.bad}” is not a date like 2026-12-26.`;
  const minimum = pesosToMinor(d.minimum);
  const cap = pesosToMinor(d.bonusCap);
  const rate = percentInputToBps(d.bonusRate);
  const days = /^\d+$/.test(d.bonusDays.trim()) ? Number(d.bonusDays.trim()) : null;
  if (minimum === null) unreadable.minimum = "Pesos, up to two decimals.";
  if (cap === null) unreadable.bonusCap = "Pesos, up to two decimals.";
  if (rate === null) unreadable.bonusRate = "0 to 100, up to two decimals.";
  if (days === null) unreadable.bonusDays = "A whole number of days.";
  return {
    policy: {
      payoutTime: d.payoutTime,
      reminderTime: d.reminderTime,
      payDeadline: d.payDeadline,
      minimumMinor: minimum ?? -1,
      bonusRateBps: rate ?? -1,
      bonusDays: days ?? -1,
      bonusCapMinor: cap ?? -1,
      businessWeekdays: [...d.businessWeekdays].sort(),
      holidays: "dates" in holidays ? holidays.dates : [],
      extraBusinessDates: "dates" in extra ? extra.dates : [],
    },
    unreadable,
  };
}

/**
 * Daily shop payouts on Operational settings (gridgo-api#416): when the run
 * happens, the minimum, the Pay GRIDGO reminder and deadline, the launch-week
 * bonus and the payout calendar. Its own save, through the settings version
 * handshake, with a confirmation that restates every change and a reason for
 * the audit trail. Super Admin only.
 */
export function ShopMoneySettings({
  settings,
  onSaved,
  onConflict,
  disabled,
}: {
  settings: PlatformSettings;
  onSaved: (next: PlatformSettings) => void;
  onConflict: () => Promise<void> | void;
  disabled?: boolean;
}) {
  const stored: Editable | undefined = settings.shopMoney
    ? { ...SHOP_MONEY_DEFAULTS, ...settings.shopMoney }
    : undefined;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (!stored) {
    return (
      <section className="gg-card p-3" aria-labelledby="shop-money-heading">
        <h2 id="shop-money-heading" className="text-h3 text-text-primary m-0">
          Daily shop payouts
        </h2>
        <p className="text-body text-text-secondary m-0 mt-1 max-w-prose" data-testid="shop-money-unavailable">
          The API behind this portal does not run daily shop payouts yet. The schedule appears here once it is updated.
        </p>
      </section>
    );
  }

  const d = draft ?? draftOf(stored);
  const { policy, unreadable } = readDraft(d);
  const problems = { ...shopMoneySettingsProblems(policy) };
  const fieldError = (k: keyof Draft, pk?: keyof Policy) => unreadable[k] ?? (pk ? problems[pk] : undefined);
  const invalid = Object.keys(unreadable).length > 0 || Object.keys(problems).length > 0;
  const changes = invalid ? [] : shopMoneyChangeSummary(stored, policy);
  const dirty = changes.length > 0;
  const locked = busy || Boolean(disabled);
  const set = (patch: Partial<Draft>) => {
    setDraft({ ...d, ...patch });
    setOk(null);
    setError(null);
  };

  async function save() {
    if (!dirty || locked) return;
    if (!reason.trim()) {
      setError("Write why for the audit trail.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        shopMoney: policy,
        reason: `Daily shop payouts: ${changes.join("; ")}. ${reason.trim()}`,
      });
      onSaved(saved);
      setDraft(null);
      setConfirm(false);
      setReason("");
      setOk("Saved. The next run uses these settings; jobs already accepted keep their bonus terms.");
    } catch (err) {
      setConfirm(false);
      setError(shopMoneyErrorMessage(err, "Could not save the payout settings. Try again."));
      if (err && typeof err === "object" && "code" in err && err.code === "settings_version_conflict") await onConflict();
    } finally {
      setBusy(false);
    }
  }

  const timeField = (key: "payoutTime" | "reminderTime" | "payDeadline", label: string, help: string) => (
    <Field data-invalid={fieldError(key, key) ? true : undefined}>
      <FieldLabel htmlFor={`shop-money-${key}`}>{label}</FieldLabel>
      <Input
        id={`shop-money-${key}`}
        type="time"
        className="max-w-40"
        value={d[key]}
        disabled={locked}
        aria-invalid={fieldError(key, key) ? true : undefined}
        onChange={(e) => set({ [key]: e.target.value } as Partial<Draft>)}
      />
      <FieldDescription>{fieldError(key, key) ?? help}</FieldDescription>
    </Field>
  );

  return (
    <section className="gg-card p-3" aria-labelledby="shop-money-heading">
      <h2 id="shop-money-heading" className="text-h3 text-text-primary m-0">
        Daily shop payouts
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        Shops are paid what they can be paid at the run on each business day, all Manila time. Smaller
        amounts roll over to the next run. GRIDGO pays the transfer fee. A shop that owes GRIDGO after the
        run pays with Pay GRIDGO by the deadline, or new orders pause.
      </p>

      <FieldGroup className="mt-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {timeField("payoutTime", "Payout run", "The day's net is worked out.")}
          {timeField("reminderTime", "Pay GRIDGO reminder", "For anything still owed.")}
          {timeField("payDeadline", "Pay GRIDGO deadline", "New orders pause after it.")}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <MoneyField id="shop-money-minimum" label="Minimum payout" value={d.minimum} error={fieldError("minimum", "minimumMinor")} help="Smaller amounts roll over." disabled={locked} onChange={(v) => set({ minimum: v })} />
        </div>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="text-body text-text-primary m-0 pb-1">Payout days</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {WEEKDAYS.map((w) => (
              <Field key={w.day} orientation="horizontal" className="w-auto">
                <Checkbox
                  id={`shop-money-day-${w.day}`}
                  checked={d.businessWeekdays.includes(w.day)}
                  disabled={locked}
                  onCheckedChange={(checked) =>
                    set({
                      businessWeekdays: checked
                        ? [...d.businessWeekdays.filter((x) => x !== w.day), w.day]
                        : d.businessWeekdays.filter((x) => x !== w.day),
                    })
                  }
                />
                <FieldLabel htmlFor={`shop-money-day-${w.day}`} className="font-normal" aria-label={w.long}>
                  {w.short}
                </FieldLabel>
              </Field>
            ))}
          </div>
          {problems.businessWeekdays ? <p className="text-caption text-error m-0">{problems.businessWeekdays}</p> : null}
        </fieldset>
        <div className="grid gap-4 md:grid-cols-2">
          <Field data-invalid={unreadable.holidays ? true : undefined}>
            <FieldLabel htmlFor="shop-money-holidays">Holidays (no run)</FieldLabel>
            <Textarea id="shop-money-holidays" rows={3} value={d.holidays} disabled={locked} placeholder="2026-12-25" onChange={(e) => set({ holidays: e.target.value })} />
            <FieldDescription>{unreadable.holidays ?? "One date per line, like 2026-12-25."}</FieldDescription>
          </Field>
          <Field data-invalid={unreadable.extraBusinessDates ? true : undefined}>
            <FieldLabel htmlFor="shop-money-extra">Extra payout days</FieldLabel>
            <Textarea id="shop-money-extra" rows={3} value={d.extraBusinessDates} disabled={locked} placeholder="2026-12-26" onChange={(e) => set({ extraBusinessDates: e.target.value })} />
            <FieldDescription>{unreadable.extraBusinessDates ?? "A run on a day that is normally off; wins over a holiday."}</FieldDescription>
          </Field>
        </div>
        <h3 className="text-body text-text-primary m-0 pt-2" style={{ fontFamily: "var(--font-medium)" }}>
          Launch-week bonus
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field data-invalid={fieldError("bonusRate", "bonusRateBps") ? true : undefined}>
            <FieldLabel htmlFor="shop-money-bonus-rate">Bonus on shop pay</FieldLabel>
            <div className="relative max-w-40">
              <Input id="shop-money-bonus-rate" inputMode="decimal" className="pr-9" value={d.bonusRate} disabled={locked} onChange={(e) => set({ bonusRate: e.target.value })} />
              <span aria-hidden className="text-body text-text-muted pointer-events-none absolute inset-y-0 right-3 flex items-center">
                %
              </span>
            </div>
            <FieldDescription>{fieldError("bonusRate", "bonusRateBps") ?? "Paid by GRIDGO, on top."}</FieldDescription>
          </Field>
          <Field data-invalid={fieldError("bonusDays", "bonusDays") ? true : undefined}>
            <FieldLabel htmlFor="shop-money-bonus-days">For</FieldLabel>
            <div className="relative max-w-40">
              <Input id="shop-money-bonus-days" inputMode="numeric" className="pr-14" value={d.bonusDays} disabled={locked} onChange={(e) => set({ bonusDays: e.target.value })} />
              <span aria-hidden className="text-body text-text-muted pointer-events-none absolute inset-y-0 right-3 flex items-center">
                days
              </span>
            </div>
            <FieldDescription>{fieldError("bonusDays", "bonusDays") ?? "From the shop's first order."}</FieldDescription>
          </Field>
          <MoneyField id="shop-money-bonus-cap" label="Cap per shop" value={d.bonusCap} error={fieldError("bonusCap", "bonusCapMinor")} help="Over the shop's whole life." disabled={locked} onChange={(v) => set({ bonusCap: v })} />
        </div>
      </FieldGroup>

      <p className="text-body text-text-secondary m-0 mt-3" data-testid="shop-money-in-force">
        In force: run at {clockWords(stored.payoutTime)}, minimum {formatPhp(stored.minimumMinor)}, Pay GRIDGO by{" "}
        {clockWords(stored.payDeadline)}, bonus {bpsToPercentInput(stored.bonusRateBps)}% for {stored.bonusDays} days up to{" "}
        {formatPhp(stored.bonusCapMinor)}.
      </p>
      <p className="text-caption text-text-muted m-0 mt-1 max-w-prose">
        Changes apply from the next run. Jobs already accepted keep the bonus terms they were accepted under.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={locked || !dirty} onClick={() => setConfirm(true)}>
          Save payout settings
        </Button>
        <Button
          variant="ghost"
          disabled={locked || draft === null}
          onClick={() => {
            setDraft(null);
            setError(null);
            setOk(null);
          }}
        >
          Discard
        </Button>
      </div>
      {ok ? (
        <p className="text-body text-success m-0 mt-3" role="status">
          {ok}
        </p>
      ) : null}
      {error && !confirm ? (
        <p className="text-body text-error m-0 mt-3" role="alert">
          {error}
        </p>
      ) : null}

      <AlertDialog open={confirm} onOpenChange={(next) => (!next && !busy ? setConfirm(false) : null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Change the daily shop payouts?</AlertDialogTitle>
            <AlertDialogDescription>Every shop is paid on the new terms from the next run.</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="text-body text-text-primary m-0 flex list-disc flex-col gap-1 pl-5" data-testid="shop-money-changes">
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Field>
            <FieldLabel htmlFor="shop-money-reason">Why</FieldLabel>
            <Textarea id="shop-money-reason" rows={2} maxLength={500} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} />
            <FieldDescription>Kept on the audit trail with the changes above.</FieldDescription>
          </Field>
          {error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              {busy ? "Saving…" : "Save payout settings"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function MoneyField({
  id,
  label,
  value,
  error,
  help,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error: string | undefined;
  help: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative max-w-40">
        <span aria-hidden className="text-body text-text-muted pointer-events-none absolute inset-y-0 left-3 flex items-center">
          ₱
        </span>
        <Input id={id} inputMode="decimal" className="pl-7 tabular-nums" value={value} disabled={disabled} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />
      </div>
      <FieldDescription>{error ?? help}</FieldDescription>
    </Field>
  );
}
