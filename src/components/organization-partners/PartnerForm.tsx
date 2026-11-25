"use client";

import { useState } from "react";

import { ReasonDialog } from "@/components/organization-partners/ReasonDialog";
import { useFocusFirstProblem } from "@/components/organization-partners/useFocusFirstProblem";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  saveOrganizationPartner,
  type OrganizationPartner,
} from "@/lib/api/organization-partners";
import {
  BENEFITS,
  LABEL_MAX,
  manilaDay,
  memberLabel,
  partnerChanged,
  partnerDraft,
  partnerInput,
  partnerProblems,
  type PartnerDraft,
} from "@/lib/organization-partners";

/**
 * Make an organization a partner, change its partnership, or start an ended
 * one again. The short name is what members carry in the app, so it previews
 * as they see it.
 */
export function PartnerForm({
  userId,
  organizationName,
  partner,
  onSaved,
  onStale,
  onCancel,
}: {
  userId: string;
  organizationName: string;
  /** Null when the organization has never been a partner. */
  partner: OrganizationPartner | null;
  onSaved: (partner: OrganizationPartner) => void;
  onStale: (message: string) => void;
  onCancel?: () => void;
}) {
  const today = manilaDay();
  const [draft, setDraft] = useState<PartnerDraft>(() => partnerDraft(partner, today));
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { form, refuse } = useFocusFirstProblem();
  const problems = partnerProblems(draft, today);
  const shown = touched ? problems : {};
  const starting = partner?.status !== "active";
  const changed = !partner || starting || partnerChanged(partner, draft);

  const set = (patch: Partial<PartnerDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  return (
    <form
      ref={form}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (Object.keys(problems).length) return refuse();
        if (!changed) return;
        setConfirming(true);
      }}
    >
      <FieldGroup>
        <Field data-invalid={shown.label ? true : undefined}>
          <FieldLabel htmlFor="partner-label">Short name</FieldLabel>
          <Input
            id="partner-label"
            className="max-w-sm"
            maxLength={LABEL_MAX}
            autoComplete="off"
            value={draft.label}
            aria-invalid={shown.label ? true : undefined}
            aria-describedby="partner-label-help"
            onChange={(event) => set({ label: event.target.value })}
          />
          <FieldDescription id="partner-label-help">
            {draft.label.trim()
              ? `Members show as “${memberLabel(draft.label)}” in the app and at checkout.`
              : "What the organization calls itself. Members carry it in the app and at checkout."}
          </FieldDescription>
          {shown.label ? <FieldError>{shown.label}</FieldError> : null}
        </Field>
        <Field data-invalid={shown.partnerSince ? true : undefined}>
          <FieldLabel htmlFor="partner-since">Partner since</FieldLabel>
          <Input
            id="partner-since"
            type="date"
            className="max-w-48"
            max={today}
            value={draft.partnerSince}
            aria-invalid={shown.partnerSince ? true : undefined}
            onChange={(event) => set({ partnerSince: event.target.value })}
          />
          {shown.partnerSince ? <FieldError>{shown.partnerSince}</FieldError> : null}
        </Field>
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="text-body text-text-primary m-0 pb-1">
            Partner benefits
          </legend>
          {BENEFITS.map(({ key, label, help }) => (
            <Field key={key} orientation="horizontal" className="min-h-11 items-center">
              <Checkbox
                id={`partner-${key}`}
                checked={draft.benefits[key]}
                onCheckedChange={(checked) =>
                  set({ benefits: { ...draft.benefits, [key]: checked === true } })
                }
              />
              <FieldLabel htmlFor={`partner-${key}`} className="font-normal">
                <span>
                  {label}
                  <span className="text-caption text-text-muted block">{help}</span>
                </span>
              </FieldLabel>
            </Field>
          ))}
        </fieldset>
      </FieldGroup>

      {touched && !changed ? (
        <p className="text-body text-text-secondary m-0" role="status">
          Nothing has changed yet.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary">
          {starting ? "Make partner" : "Save partnership"}
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>

      <ReasonDialog
        open={confirming}
        title={
          starting
            ? `Make ${organizationName} a partner?`
            : `Change the partnership with ${organizationName}?`
        }
        description={
          starting
            ? "The organization gets a notice and its officer can invite members. This does not turn on the perk."
            : "The organization and its members see the new details, and the organization gets a notice."
        }
        confirmLabel={starting ? "Make partner" : "Save partnership"}
        onClose={() => setConfirming(false)}
        onStale={(message) => {
          setConfirming(false);
          onStale(message);
        }}
        onConfirm={async (reason) => {
          const saved = await saveOrganizationPartner(userId, {
            ...partnerInput(draft, "active"),
            expectedVersion: partner?.version ?? 0,
            reason,
          });
          setConfirming(false);
          onSaved(saved);
        }}
      />
    </form>
  );
}
