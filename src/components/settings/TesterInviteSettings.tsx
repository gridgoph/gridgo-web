"use client";

import { useState } from "react";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, updateSettings } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  FORM_URL_MAX,
  budgetInputFrom,
  budgetSettingText,
  formUrlExample,
  formUrlProblem,
  parseBudgetPesos,
  testerErrorText,
} from "@/lib/tester-program";

type Props = {
  settings: PlatformSettings;
  canEdit: boolean;
  onSaved: (next: PlatformSettings) => void;
  /** Resolves false when the settings could not be re-read after a conflict. */
  onConflict: () => Promise<boolean | void> | boolean | void;
  disabled?: boolean;
  /** The last re-read failed: what is shown may not be in force any more. */
  stale?: boolean;
};

/**
 * An edit and the stored value it started from. A field is edited only while
 * its text means something other than that starting value, so a field typed
 * and then put back never rides along on a later save, even after the stored
 * value moves under it.
 */
type Draft = { text: string; base: string };

function sameBudget(a: string, b: string): boolean {
  const x = parseBudgetPesos(a);
  const y = parseBudgetPesos(b);
  return "minor" in x && "minor" in y ? x.minor === y.minor : a.trim() === b.trim();
}

function sameForm(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

/**
 * The Founding Tester monthly voucher budget and the tester sign-up form link
 * (gridgo-client#323; contract "Operational Settings and monthly budget" in
 * gridgo-api docs/FOUNDING_TESTER_API.md). The budget is typed in pesos and
 * sent as whole centavos or null (no limit). The form link carries `{code}`
 * where each client's invite code goes. Both save together on their own,
 * through the same `expectedVersion` handshake with an audited reason, and are
 * never carried in the page's "Save settings". Only fields that really differ
 * from the value they were edited from are sent.
 */
export function TesterInviteSettings({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
  stale = false,
}: Props) {
  const storedBudget = settings.testerMonthlyBudgetMinor;
  const storedForm = settings.testerSignupFormUrlTemplate;
  // Untouched fields follow refreshed settings; a real edit stays a draft.
  const [budgetDraft, setBudgetDraft] = useState<Draft | null>(null);
  const [formDraft, setFormDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const storedBudgetText = budgetInputFrom(storedBudget);
  const storedFormText = storedForm ?? "";
  const budgetEdited =
    budgetDraft !== null && !sameBudget(budgetDraft.text, budgetDraft.base);
  const formEdited = formDraft !== null && !sameForm(formDraft.text, formDraft.base);
  const budgetText = budgetEdited ? budgetDraft.text : storedBudgetText;
  const formText = formEdited ? formDraft.text : storedFormText;
  const budget = parseBudgetPesos(budgetText);
  const budgetProblem = "problem" in budget ? budget.problem : null;
  const formProblem = formUrlProblem(formText);
  const nextBudget = "minor" in budget ? budget.minor : null;
  const nextForm = formText.trim() === "" ? null : formText.trim();
  const budgetChanged =
    budgetEdited && !budgetProblem && nextBudget !== (storedBudget ?? null);
  const formChanged = formEdited && nextForm !== (storedForm ?? null);
  const dirty =
    (budgetChanged || formChanged) && !budgetProblem && !formProblem && !stale;
  const locked = busy || Boolean(disabled);
  const inForce = stale ? "Last read (may be out of date):" : "In force right now:";

  function editBudget(text: string) {
    setBudgetDraft({ text, base: budgetEdited ? budgetDraft.base : storedBudgetText });
    clearMessages();
  }

  function editForm(text: string) {
    setFormDraft({ text, base: formEdited ? formDraft.base : storedFormText });
    clearMessages();
  }
  const unavailable = storedBudget === undefined || storedForm === undefined;

  function clearMessages() {
    setError(null);
    setBudgetError(null);
    setFormError(null);
    setOk(null);
  }

  function reasonText(): string {
    const parts: string[] = [];
    if (budgetChanged) {
      const from = storedBudget == null ? "no limit" : formatPhp(storedBudget);
      const to = nextBudget == null ? "no limit" : formatPhp(nextBudget);
      parts.push(`monthly budget ${from} to ${to}`);
    }
    if (formChanged)
      parts.push(nextForm ? "sign-up form link set" : "sign-up form link cleared");
    return `Founding Tester invites: ${parts.join("; ")}`;
  }

  async function save() {
    if (!canEdit || locked || !dirty) return;
    setBusy(true);
    clearMessages();
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        ...(budgetChanged ? { testerMonthlyBudgetMinor: nextBudget } : {}),
        ...(formChanged ? { testerSignupFormUrlTemplate: nextForm } : {}),
        reason: reasonText(),
      });
      onSaved(saved);
      setBudgetDraft(null);
      setFormDraft(null);
      setOk("Saved. New rewards use these from now on.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        setError(
          "Someone else saved settings a moment ago. Check the current values and yours before saving again.",
        );
        const fresh = await onConflict();
        if (fresh === false) {
          setError(
            "Someone else saved settings a moment ago, and the latest settings could not be read. Retry reading them before saving again.",
          );
        }
      } else if (
        err instanceof ApiError &&
        err.code === "invalid_tester_monthly_budget"
      ) {
        setBudgetError(testerErrorText(err));
      } else if (
        err instanceof ApiError &&
        err.code === "invalid_tester_signup_form_url"
      ) {
        setFormError(testerErrorText(err));
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change these settings.");
      } else {
        setError(opsErrorMessage(err, "Could not save. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  const shownBudgetError = budgetProblem ?? budgetError;
  const shownFormError = formProblem ?? formError;

  return (
    <section className="gg-card p-3" aria-labelledby="tester-invites-heading">
      <h2 id="tester-invites-heading" className="text-h3 text-text-primary m-0">
        Founding Tester invites and budget
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        Each client can share a personal link to the tester sign-up form. When the friend
        they invited finishes all five steps, both get a voucher. Every Founding Tester
        voucher counts against the monthly budget.
      </p>

      {unavailable ? (
        <p className="text-body text-text-secondary m-0 mt-3">
          These settings are not available yet. They appear here once the service is
          updated.
        </p>
      ) : (
        <>
          <FieldGroup className="mt-3">
            <Field
              data-invalid={shownBudgetError ? true : undefined}
              data-disabled={locked || undefined}
            >
              <FieldLabel htmlFor="tester-monthly-budget">
                Monthly voucher budget (pesos)
              </FieldLabel>
              {canEdit ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="tester-monthly-budget"
                    inputMode="decimal"
                    value={budgetText}
                    disabled={locked}
                    placeholder="No limit"
                    aria-invalid={shownBudgetError ? true : undefined}
                    aria-describedby="tester-monthly-budget-help"
                    className="max-w-48"
                    onChange={(event) => editBudget(event.target.value)}
                  />
                  <Button
                    variant="ghost"
                    disabled={locked || budgetText === ""}
                    onClick={() => editBudget("")}
                  >
                    No limit
                  </Button>
                </div>
              ) : null}
              <FieldDescription id="tester-monthly-budget-help">
                {inForce} {budgetSettingText(storedBudget)} Counts every mission and
                invite voucher issued in the Manila calendar month, used or not. Leave it
                empty for no limit; 0 pauses every new reward. A paused reward waits for
                Super Admin to resume it, one at a time, even after the month changes.
              </FieldDescription>
              {shownBudgetError ? <FieldError>{shownBudgetError}</FieldError> : null}
            </Field>

            <Field
              data-invalid={shownFormError ? true : undefined}
              data-disabled={locked || undefined}
            >
              <FieldLabel htmlFor="tester-signup-form">
                Tester sign-up form link
              </FieldLabel>
              {canEdit ? (
                <Input
                  id="tester-signup-form"
                  type="url"
                  value={formText}
                  disabled={locked}
                  maxLength={FORM_URL_MAX}
                  placeholder="https://docs.google.com/forms/d/e/…/viewform?entry.123={code}"
                  aria-invalid={shownFormError ? true : undefined}
                  aria-describedby="tester-signup-form-help"
                  onChange={(event) => editForm(event.target.value)}
                />
              ) : null}
              <FieldDescription id="tester-signup-form-help">
                {storedForm
                  ? `${inForce} set.`
                  : `${inForce} not set. Clients can see their invite code but cannot copy or share a link.`}{" "}
                Use the form&rsquo;s prefilled link and put {"{code}"} where the invite
                code goes. The form must ask for the friend&rsquo;s email: Operations
                records each response on the Founding Testers page.
              </FieldDescription>
              {shownFormError ? <FieldError>{shownFormError}</FieldError> : null}
              {!shownFormError && nextForm ? (
                <p className="text-caption text-text-muted m-0 break-all">
                  A client shares a link like: {formUrlExample(nextForm)}
                </p>
              ) : null}
            </Field>
          </FieldGroup>

          {canEdit && stale && (budgetEdited || formEdited) ? (
            <p className="text-body text-text-primary m-0 mt-3 max-w-prose" role="note">
              The latest settings could not be read. Retry reading them before saving, so
              your change does not land on values you have not seen.
            </p>
          ) : null}
          {canEdit ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={locked || !dirty}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save invites and budget"}
              </Button>
              <Button
                variant="ghost"
                disabled={locked || (!budgetEdited && !formEdited)}
                onClick={() => {
                  setBudgetDraft(null);
                  setFormDraft(null);
                  clearMessages();
                }}
              >
                Discard
              </Button>
            </div>
          ) : (
            <p className="text-caption text-text-muted m-0 mt-3">
              Only Super Admin changes these.
            </p>
          )}
        </>
      )}
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
    </section>
  );
}
