"use client";

/**
 * Record or revise the fault and remedy finding on a problem report
 * (`POST /issues/:id/decision`). The written Operations rules sit beside the
 * form as guidance; the API never decides fault, it only checks that the
 * finding is complete and cites gathered evidence.
 *
 * A Dialog, not an AlertDialog: it is a form, and saving it moves no money.
 * Above ₱1,000 of GRIDGO funding, Operations' finding waits for Super Admin.
 */

import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { FaultParty, FaultRemedy, Issue } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  APPROVAL_LIMIT_TEXT,
  DECISION_TEXT_MAX,
  FAULT_CHOICES,
  ISSUE_EVIDENCE_GROUPS,
  NOT_RECORDED,
  REMEDY_CHOICES,
  WRITTEN_RULES,
  citationLabel,
  decisionAmounts,
  decisionProblems,
  draftFrom,
  evidenceGroup,
  gridgoFundsAll,
  isEmptyEvidence,
  isRefundRemedy,
  needsSuperAdminApproval,
  remediesFor,
  type DecisionDraft,
} from "@/lib/problem-reports";

export function DecisionDialog({
  open,
  issue,
  superAdmin,
  busy,
  error,
  onCancel,
  onSave,
}: {
  open: boolean;
  issue: Issue;
  /** Recording as Super Admin approves the finding as it is saved. */
  superAdmin: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (draft: DecisionDraft) => void;
}) {
  const prefix = useId();
  const [draft, setDraft] = useState<DecisionDraft>(() => draftFrom(issue.faultDecision));
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(draftFrom(issue.faultDecision));
      setTried(false);
    }
    // A reopened dialog starts from the case as it now stands.
  }, [open, issue.faultDecision]);

  const problems = decisionProblems(draft);
  const ready = Object.keys(problems).length === 0;
  const shown = tried ? problems : {};
  const { costMinor, gridgoCostMinor } = decisionAmounts(draft);
  const waitsForApproval = needsSuperAdminApproval(gridgoCostMinor, superAdmin);
  const remedies = remediesFor(draft.fault);

  const citations = useMemo(() => {
    const groups = ISSUE_EVIDENCE_GROUPS.filter((definition) =>
      issue.evidenceSnapshot?.groups.some((group) => group.id === definition.id),
    ).map((definition) => {
      const group = evidenceGroup(issue, definition.id);
      return {
        id: definition.id as string,
        label: definition.title,
        hint: !group || isEmptyEvidence(group.data) ? NOT_RECORDED : null,
      };
    });
    const files = (issue.evidenceSnapshot?.files ?? []).map((file) => ({
      id: file.fileId,
      label: citationLabel(issue, file.fileId),
      hint: file.unavailable ? "Not available" : null,
    }));
    return { groups, files };
  }, [issue]);

  function update(patch: Partial<DecisionDraft>) {
    setDraft((current) => {
      const next = { ...current, ...patch };
      // A fault narrows the remedies: client fault is always "No remedy".
      if (patch.fault !== undefined) {
        const allowed = remediesFor(next.fault);
        if (next.remedy && !allowed.includes(next.remedy as FaultRemedy)) next.remedy = "";
        if (next.fault === "client") next.remedy = "none";
      }
      return next;
    });
  }

  function toggleCitation(id: string, on: boolean) {
    setDraft((current) => ({
      ...current,
      evidenceIds: on
        ? current.evidenceIds.includes(id)
          ? current.evidenceIds
          : [...current.evidenceIds, id]
        : current.evidenceIds.filter((entry) => entry !== id),
    }));
  }

  function submit() {
    setTried(true);
    if (ready) onSave(draft);
  }

  const revising = Boolean(issue.faultDecision);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{revising ? "Revise the finding" : "Record a finding"}</DialogTitle>
          <DialogDescription>
            Who was at fault and the remedy, from the gathered evidence. Saving records the
            finding and tells the client; it does not pay a refund, release a hold or order
            a reprint.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <FieldGroup>
            <FieldSet disabled={busy}>
              <FieldLegend variant="label">Who was at fault</FieldLegend>
              <RadioGroup
                value={draft.fault}
                onValueChange={(value) => update({ fault: value as FaultParty })}
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                aria-invalid={shown.fault ? true : undefined}
              >
                {FAULT_CHOICES.map((choice) => (
                  <label
                    key={choice.value}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-outline bg-surface px-3 py-2 has-[[data-checked]]:border-accent"
                  >
                    {/* Named by its own text; Base UI's default label id has no element. */}
                    <RadioGroupItem
                      value={choice.value}
                      aria-labelledby={`${prefix}-choice-${choice.value}`}
                    />
                    <span id={`${prefix}-choice-${choice.value}`} className="text-body text-text-primary">
                      {choice.label}
                    </span>
                  </label>
                ))}
              </RadioGroup>
              {shown.fault ? <p className="text-caption text-error m-0">{shown.fault}</p> : null}
            </FieldSet>

            <FieldSet disabled={busy || !draft.fault}>
              <FieldLegend variant="label">Remedy</FieldLegend>
              <RadioGroup
                value={draft.remedy}
                onValueChange={(value) => update({ remedy: value as FaultRemedy })}
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                aria-invalid={shown.remedy ? true : undefined}
              >
                {REMEDY_CHOICES.filter((choice) =>
                  draft.fault ? remedies.includes(choice.value) : choice.value !== "none",
                ).map((choice) => (
                  <label
                    key={choice.value}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-outline bg-surface px-3 py-2 has-[[data-checked]]:border-accent"
                  >
                    {/* Named by its own text; Base UI's default label id has no element. */}
                    <RadioGroupItem
                      value={choice.value}
                      aria-labelledby={`${prefix}-choice-${choice.value}`}
                    />
                    <span id={`${prefix}-choice-${choice.value}`} className="text-body text-text-primary">
                      {choice.label}
                    </span>
                  </label>
                ))}
              </RadioGroup>
              <FieldDescription>
                {draft.fault === "client"
                  ? "Client fault has no remedy and costs nothing."
                  : "Consider a reprint or replacement first, then a partial refund, then a full refund."}
              </FieldDescription>
              {shown.remedy ? <p className="text-caption text-error m-0">{shown.remedy}</p> : null}
            </FieldSet>

            <Field data-invalid={shown.reason ? true : undefined}>
              <FieldLabel htmlFor={`${prefix}-reason`}>Finding</FieldLabel>
              <Textarea
                id={`${prefix}-reason`}
                rows={4}
                maxLength={DECISION_TEXT_MAX}
                value={draft.reason}
                disabled={busy}
                aria-invalid={shown.reason ? true : undefined}
                placeholder="e.g. The shop's finished-work photo shows the smudge before the rider collected it."
                onChange={(event) => update({ reason: event.target.value })}
              />
              <FieldDescription>
                The client reads this word for word: explain the finding in plain terms.
              </FieldDescription>
              {shown.reason ? <p className="text-caption text-error m-0">{shown.reason}</p> : null}
            </Field>

            {isRefundRemedy(draft.remedy) ? (
              <Field data-invalid={shown.alternativesReason ? true : undefined}>
                <FieldLabel htmlFor={`${prefix}-alternatives`}>
                  Why a reprint or replacement does not fit
                </FieldLabel>
                <Textarea
                  id={`${prefix}-alternatives`}
                  rows={3}
                  maxLength={DECISION_TEXT_MAX}
                  value={draft.alternativesReason}
                  disabled={busy}
                  aria-invalid={shown.alternativesReason ? true : undefined}
                  onChange={(event) => update({ alternativesReason: event.target.value })}
                />
                {shown.alternativesReason ? (
                  <p className="text-caption text-error m-0">{shown.alternativesReason}</p>
                ) : null}
              </Field>
            ) : null}

            <FieldSet disabled={busy}>
              <FieldLegend variant="label">Evidence you relied on</FieldLegend>
              <FieldDescription>
                Tick what supports the finding. The API keeps the list; it does not read the
                evidence for you.
              </FieldDescription>
              <div className="flex flex-col">
                {[...citations.groups, ...citations.files].map((citation) => {
                  const id = `${prefix}-cite-${citation.id}`;
                  return (
                    <label
                      key={citation.id}
                      htmlFor={id}
                      className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5"
                    >
                      <Checkbox
                        id={id}
                        className="mt-1"
                        checked={draft.evidenceIds.includes(citation.id)}
                        onCheckedChange={(value) => toggleCitation(citation.id, value === true)}
                      />
                      <span className="min-w-0">
                        <span className="block text-body text-text-primary break-words">
                          {citation.label}
                        </span>
                        {citation.hint ? (
                          <span className="block text-caption text-text-muted">{citation.hint}</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              {shown.evidence ? <p className="text-caption text-error m-0">{shown.evidence}</p> : null}
            </FieldSet>

            {draft.fault && draft.fault !== "client" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field data-invalid={shown.cost ? true : undefined}>
                  <FieldLabel htmlFor={`${prefix}-cost`}>Total remedy cost (₱)</FieldLabel>
                  <Input
                    id={`${prefix}-cost`}
                    inputMode="decimal"
                    value={draft.cost}
                    disabled={busy}
                    aria-invalid={shown.cost ? true : undefined}
                    placeholder="0.00"
                    onChange={(event) => update({ cost: event.target.value })}
                  />
                  {shown.cost ? <p className="text-caption text-error m-0">{shown.cost}</p> : null}
                </Field>
                {gridgoFundsAll(draft.fault) ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-body text-text-primary m-0">GRIDGO pays</p>
                    <p className="text-body text-text-secondary m-0 tabular-nums">
                      {costMinor === null ? "The whole cost" : formatPhp(costMinor)}
                    </p>
                    <p className="text-caption text-text-muted m-0">
                      Rider or GRIDGO fault: GRIDGO pays the whole remedy.
                    </p>
                  </div>
                ) : (
                  <Field data-invalid={shown.gridgoCost ? true : undefined}>
                    <FieldLabel htmlFor={`${prefix}-gridgo`}>GRIDGO pays (₱)</FieldLabel>
                    <Input
                      id={`${prefix}-gridgo`}
                      inputMode="decimal"
                      value={draft.gridgoCost}
                      disabled={busy}
                      aria-invalid={shown.gridgoCost ? true : undefined}
                      placeholder="0.00"
                      onChange={(event) => update({ gridgoCost: event.target.value })}
                    />
                    <FieldDescription>
                      Include any amount GRIDGO fronts for the shop. 0 when the shop covers it.
                    </FieldDescription>
                    {shown.gridgoCost ? (
                      <p className="text-caption text-error m-0">{shown.gridgoCost}</p>
                    ) : null}
                  </Field>
                )}
              </div>
            ) : null}

            {waitsForApproval ? (
              <p
                className="rounded-card border border-warning px-3 py-2 text-body text-text-primary m-0"
                role="status"
              >
                GRIDGO pays more than {APPROVAL_LIMIT_TEXT}, so this finding waits for Super
                Admin to approve before anyone carries it out.
              </p>
            ) : null}
          </FieldGroup>

          <WrittenRules />
        </div>

        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        {tried && !ready ? (
          <p className="text-body text-error m-0" role="alert">
            Some answers are missing. They are marked above.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={submit}>
            {busy ? "Saving…" : revising ? "Save the revised finding" : "Save the finding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The contract's written rules, as guidance beside the form. */
export function WrittenRules() {
  return (
    <aside
      aria-labelledby="written-rules-heading"
      className="flex flex-col gap-3 rounded-card bg-surface-variant p-4 lg:sticky lg:top-0 lg:self-start"
    >
      <h3 id="written-rules-heading" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
        Written Operations rules
      </h3>
      <p className="text-caption text-text-muted m-0">
        Guidance for your judgement. The finding is yours.
      </p>
      <dl className="m-0 flex flex-col gap-3">
        {WRITTEN_RULES.map((rule) => (
          <div key={rule.title}>
            <dt className="text-caption text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
              {rule.title}
            </dt>
            <dd className="m-0 text-caption text-text-secondary">{rule.body}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
