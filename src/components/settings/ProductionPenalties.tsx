"use client";

/**
 * Late-production penalties on Operational settings (gridgo-api#123).
 *
 * The three tier rates and the real-deductions switch. Every role that opens
 * settings reads them; only Super Admin changes them — the API answers any
 * other caller `403` — so Operations gets the same card without inputs.
 *
 * The card saves on its own, not with "Save settings": that button sends the
 * fields Operations may write, and adding this object to it would refuse the
 * whole save for Operations. Both go through the same `expectedVersion`
 * handshake. The switch saves the moment it is confirmed, with the rates in
 * force, because it is the one control here that moves real money: turning
 * it on says so in a dialog that cannot be confirmed by reflex.
 */

import { useEffect, useRef, useState } from "react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { formatRatePercent } from "@/components/settings/service-fee";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { ApiError, updateSettings } from "@/lib/api/client";
import type {
  PlatformSettings,
  ProductionPenaltyPolicy,
  ProductionPenaltyTier,
} from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  PENALTY_EXAMPLE_BALANCE_MINOR,
  PENALTY_TIERS,
  TIER_BANDS,
  parsePenaltyRates,
  penaltyChangeReason,
  penaltyDeductionMinor,
  penaltyRateDraft,
  presentTier,
  tierRateBps,
  type PenaltyRateDraft,
} from "@/lib/production-penalties";
import { cn } from "@/lib/utils";

export const PENALTY_COPY = (
  <>
    What a shop loses when it marks a job ready after its ready-by time. Every late job
    gets a warning first that explains the penalty. A deduction comes off what GRIDGO
    still owes the shop on that one order, never more than that, and nothing carries over
    to another order. Recent late jobs also lower the shop&rsquo;s quality ranking in
    matching.
  </>
);

const medium = { fontFamily: "var(--font-medium)" } as const;

type Props = {
  settings: PlatformSettings;
  /** Super Admin. Operations sees the same figures without controls. */
  canEdit: boolean;
  /** The settings row after a save, so the page's version stays current. */
  onSaved: (next: PlatformSettings) => void;
  /** Someone saved first: reload the page's settings underneath. */
  onConflict: () => Promise<void> | void;
  disabled?: boolean;
};

export function ProductionPenalties({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
}: Props) {
  const stored = settings.productionPenalty;
  const [draft, setDraft] = useState<PenaltyRateDraft | null>(
    stored ? penaltyRateDraft(stored) : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"on" | "off" | null>(null);
  const [understood, setUnderstood] = useState(false);

  // A newer policy from elsewhere replaces the fields unless they were edited here.
  const previous = useRef(stored);
  useEffect(() => {
    const before = previous.current;
    previous.current = stored;
    if (!stored) return;
    setDraft((current) =>
      !current ||
      !before ||
      JSON.stringify(current) === JSON.stringify(penaltyRateDraft(before))
        ? penaltyRateDraft(stored)
        : current,
    );
  }, [stored]);

  if (!stored || !draft) {
    return (
      <PenaltySection>
        <p
          className="text-body text-text-secondary m-0 mt-3 max-w-prose"
          data-testid="penalty-unavailable"
        >
          The API behind this portal does not record late production yet, so no shop is
          warned or charged for a late job. These controls appear once the API is updated.
        </p>
      </PenaltySection>
    );
  }

  const parsed = parsePenaltyRates(draft, stored.deductionsEnabled);
  const typedPolicy = "policy" in parsed ? parsed.policy : stored;
  const dirty = JSON.stringify(draft) !== JSON.stringify(penaltyRateDraft(stored));
  const locked = busy || Boolean(disabled);

  async function save(next: ProductionPenaltyPolicy, success: string) {
    if (!stored) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        productionPenalty: next,
        reason: penaltyChangeReason(stored, next),
      });
      onSaved(saved);
      if (saved.productionPenalty) setDraft(penaltyRateDraft(saved.productionPenalty));
      setOk(success);
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        setError(
          "Someone else saved settings a moment ago. Their values are now shown as in force; check yours against them and save again.",
        );
        await onConflict();
      } else if (err instanceof ApiError && err.code === "invalid_production_penalty") {
        setError(
          "The API refused these rates. Each is 0 to 100%, and no tier may take less than the one before it.",
        );
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change late-production penalties.");
      } else {
        setError(opsErrorMessage(err, "Could not save the penalties. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  function saveRates() {
    if (!("policy" in parsed) || !stored) return;
    void save(
      { ...parsed.policy, deductionsEnabled: stored.deductionsEnabled },
      "Saved. Late jobs from now on are warned at these rates. Lapses already recorded keep the rates they began with.",
    );
  }

  function applySwitch() {
    if (!stored || !confirm) return;
    const turnOn = confirm === "on";
    setConfirm(null);
    setUnderstood(false);
    void save(
      { ...stored, deductionsEnabled: turnOn },
      turnOn
        ? "Real deductions are on. A late job that begins from now on is warned, then loses its tier's share of what GRIDGO still owes the shop."
        : "Real deductions are off. Late jobs are warned only. Pending deductions stop; deductions already taken stay on their orders.",
    );
  }

  return (
    <PenaltySection>
      <div
        className={cn(
          "mt-3 flex flex-wrap items-center justify-between gap-3 rounded-card border p-3",
          stored.deductionsEnabled ? "border-warning" : "border-outline",
        )}
        data-testid="penalty-gate"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-body text-text-primary" style={medium}>
            Real deductions from shop payouts
          </span>
          <span className="text-body text-text-secondary max-w-prose">
            {stored.deductionsEnabled
              ? "On. A late job that began with this on loses its tier's share of what the shop is still owed on it."
              : "Off. A late job is warned and its ranking drops, but no money is taken. A lapse that begins while this is off stays a warning, even after it is turned on."}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip
            tone={stored.deductionsEnabled ? "warning" : "neutral"}
            icon={stored.deductionsEnabled ? "triangle-alert" : "circle-dashed"}
            label={stored.deductionsEnabled ? "Deducting" : "Warnings only"}
          />
          {canEdit ? (
            <Switch
              id="penalty-deductions"
              checked={stored.deductionsEnabled}
              disabled={locked}
              onCheckedChange={(checked) => {
                setUnderstood(false);
                setConfirm(checked ? "on" : "off");
              }}
              aria-label="Deduct from shop payouts"
            />
          ) : null}
        </div>
      </div>

      <ol
        className="m-0 mt-3 grid list-none gap-2 p-0 md:grid-cols-3"
        aria-label="Penalty tiers"
      >
        {PENALTY_TIERS.map((tier) => (
          <TierRate
            key={tier}
            tier={tier}
            value={draft[tier]}
            canEdit={canEdit}
            disabled={locked}
            invalid={"problem" in parsed && parsed.tier === tier}
            inForceBps={tierRateBps(stored, tier)}
            draftBps={tierRateBps(typedPolicy, tier)}
            onChange={(value) =>
              setDraft((current) => (current ? { ...current, [tier]: value } : current))
            }
          />
        ))}
      </ol>
      <p className="text-caption text-text-muted m-0 mt-2 max-w-prose">
        Lateness counts from the shop&rsquo;s ready-by time. Each example is a job with{" "}
        {formatPhp(PENALTY_EXAMPLE_BALANCE_MINOR)} still owed to the shop, rounded half-up
        to the centavo.
        {canEdit
          ? " New rates apply to lapses that begin after saving."
          : " Only Super Admin changes these."}
      </p>

      {"problem" in parsed && dirty ? (
        <p
          className="text-body text-error m-0 mt-2"
          role="alert"
          data-testid="penalty-problem"
        >
          {parsed.problem}
        </p>
      ) : null}
      {ok ? (
        <p className="text-body text-success m-0 mt-2" role="status">
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="text-body text-error m-0 mt-2" role="alert">
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={locked || !dirty || "problem" in parsed}
            onClick={saveRates}
          >
            {busy ? "Saving…" : "Save penalty rates"}
          </Button>
          <Button
            variant="ghost"
            disabled={locked || !dirty}
            onClick={() => {
              setDraft(penaltyRateDraft(stored));
              setError(null);
              setOk(null);
            }}
          >
            Discard
          </Button>
        </div>
      ) : null}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
            setUnderstood(false);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "on"
                ? "Deduct real money from shops' payouts?"
                : "Stop deducting from shops' payouts?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "on"
                ? "This takes real money from shops. Check that the supplier agreement and the warning wording have been approved before turning it on."
                : "Late jobs go back to warnings only."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "on" ? (
            <div className="flex flex-col gap-3">
              <ul
                className="text-body text-text-secondary m-0 flex list-disc flex-col gap-1.5 pl-5"
                data-testid="penalty-confirm-terms"
              >
                <li>
                  A shop that marks a job ready late loses{" "}
                  <span className="text-text-primary tabular-nums" style={medium}>
                    {formatRatePercent(stored.minorBps)} /{" "}
                    {formatRatePercent(stored.moderateBps)} /{" "}
                    {formatRatePercent(stored.severeBps)}
                  </span>{" "}
                  (minor / moderate / severe) of what GRIDGO still owes it on that order.
                </li>
                <li>
                  The money comes off the order&rsquo;s unpaid payout shares, last share
                  first. Operations then pays the shop the reduced amount.
                </li>
                <li>
                  Shops see the deduction on their account. It is not undone by turning
                  this off.
                </li>
                <li>Lapses recorded while deductions were off stay warnings only.</li>
              </ul>
              <Field orientation="horizontal">
                <Checkbox
                  id="penalty-understood"
                  checked={understood}
                  onCheckedChange={(checked) => setUnderstood(Boolean(checked))}
                />
                <FieldLabel htmlFor="penalty-understood" className="font-normal">
                  I understand real money will be deducted from shops&rsquo; payouts.
                </FieldLabel>
              </Field>
            </div>
          ) : (
            <ul className="text-body text-text-secondary m-0 flex list-disc flex-col gap-1.5 pl-5">
              <li>Deductions not yet taken stop, and those orders pay out in full.</li>
              <li>Deductions already taken stay on their orders.</li>
              <li>Warnings and the ranking effect continue.</li>
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">
              {confirm === "on" ? "Keep warnings only" : "Keep deducting"}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "on" ? "danger" : "secondary"}
              disabled={confirm === "on" && !understood}
              onClick={applySwitch}
            >
              {confirm === "on" ? "Turn on deductions" : "Turn off deductions"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PenaltySection>
  );
}

function PenaltySection({ children }: { children: React.ReactNode }) {
  return (
    <section className="gg-card p-3" aria-labelledby="production-penalty-heading">
      <h2 id="production-penalty-heading" className="text-h3 text-text-primary m-0">
        Late-production penalties
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">{PENALTY_COPY}</p>
      {children}
    </section>
  );
}

/**
 * One tier: what lateness it covers, its rate, and the rate as a bite out of
 * the example balance. The bar is the whole balance, so the three tiers read
 * side by side as growing bites of the same job.
 */
function TierRate({
  tier,
  value,
  canEdit,
  disabled,
  invalid,
  inForceBps,
  draftBps,
  onChange,
}: {
  tier: ProductionPenaltyTier;
  value: string;
  canEdit: boolean;
  disabled: boolean;
  invalid: boolean;
  inForceBps: number;
  draftBps: number;
  onChange: (value: string) => void;
}) {
  const present = presentTier(tier);
  const deduction = penaltyDeductionMinor(PENALTY_EXAMPLE_BALANCE_MINOR, draftBps);
  const id = `penalty-rate-${tier}`;
  return (
    <li
      className="rounded-card bg-surface-variant flex min-w-0 flex-col gap-3 p-3"
      data-testid={`penalty-tier-${tier}`}
    >
      <div className="flex flex-col items-start gap-1.5">
        <StatusChip tone={present.tone} icon={present.icon} label={present.label} />
        <span className="text-caption text-text-secondary">{TIER_BANDS[tier]}</span>
      </div>
      {canEdit ? (
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor={id}>Share of what is still owed</FieldLabel>
          <div className="relative max-w-32">
            <Input
              id={id}
              inputMode="decimal"
              className="pr-9"
              value={value}
              disabled={disabled}
              aria-invalid={invalid || undefined}
              onChange={(event) => onChange(event.target.value)}
            />
            <span
              aria-hidden
              className="text-body text-text-muted pointer-events-none absolute inset-y-0 right-3 flex items-center"
            >
              %
            </span>
          </div>
          {draftBps !== inForceBps ? (
            <FieldDescription>In force: {formatRatePercent(inForceBps)}</FieldDescription>
          ) : null}
        </Field>
      ) : (
        <p
          className="text-h3 text-text-primary m-0 tabular-nums"
          data-testid={`penalty-rate-${tier}-value`}
        >
          {formatRatePercent(inForceBps)}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <div
          className="border-outline flex h-2.5 w-full overflow-hidden rounded-pill border"
          aria-hidden
        >
          {/* Taken off the end, as the API takes it from the last unpaid share. */}
          <div className="bg-surface h-full flex-1" />
          <div
            className={cn(
              "h-full",
              present.tone === "error"
                ? "bg-error"
                : present.tone === "warning"
                  ? "bg-warning"
                  : "bg-text-secondary",
            )}
            style={{ width: `${draftBps / 100}%` }}
          />
        </div>
        <p
          className="text-caption text-text-secondary m-0 tabular-nums"
          aria-live="polite"
        >
          {formatPhp(deduction)} off,{" "}
          {formatPhp(PENALTY_EXAMPLE_BALANCE_MINOR - deduction)} still paid
        </p>
      </div>
    </li>
  );
}
