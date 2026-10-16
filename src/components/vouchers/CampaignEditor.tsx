"use client";

import { useState } from "react";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createVoucherCampaign, isApiError, updateVoucherCampaign } from "@/lib/api/client";
import type { VoucherCampaign, VoucherCampaignMode } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  EMPTY_CAMPAIGN_DRAFT,
  MODE_COPY,
  VOUCHER_LIMITS,
  campaignCeilingMinor,
  draftFromCampaign,
  inputFromDraft,
  isoToManilaLocal,
  testerDraft,
  validateCampaignDraft,
  voucherErrorIsStale,
  voucherErrorMessage,
  type CampaignDraft,
  type CampaignDraftErrors,
} from "@/lib/vouchers";

type Props = {
  /** `"new"` to create, a draft campaign to edit, `null` when closed. */
  editing: VoucherCampaign | "new" | null;
  onClose: () => void;
  onSaved: (campaign: VoucherCampaign, created: boolean) => void;
  onStale: () => void;
};

/**
 * Create a campaign, or change a draft's terms. Every campaign starts as a
 * draft; launching it is a separate, confirmed step on its page, and from
 * then on the terms are locked.
 */
export function CampaignEditor(props: Props) {
  const { editing, onClose } = props;
  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {editing !== null ? (
        <EditorBody
          key={editing === "new" ? "new" : `${editing.id}:${editing.updatedAt}`}
          {...props}
          editing={editing}
        />
      ) : null}
    </Dialog>
  );
}

function EditorBody({
  editing,
  onClose,
  onSaved,
  onStale,
}: Props & { editing: VoucherCampaign | "new" }) {
  const isNew = editing === "new";
  const [draft, setDraft] = useState<CampaignDraft>(
    isNew ? EMPTY_CAMPAIGN_DRAFT : draftFromCampaign(editing),
  );
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<CampaignDraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localErrors = validateCampaignDraft(draft);
  const errors: CampaignDraftErrors = { ...(attempted ? localErrors : {}), ...serverErrors };
  const input = inputFromDraft(draft);
  const ceiling =
    input.valueMinor > 0 && input.totalLimit > 0
      ? campaignCeilingMinor(input.valueMinor, input.totalLimit)
      : null;

  function set<K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setServerErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function save() {
    setAttempted(true);
    if (Object.keys(localErrors).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const saved = isNew
        ? await createVoucherCampaign(input)
        : await updateVoucherCampaign(editing.id, input);
      onSaved(saved, isNew);
    } catch (err) {
      if (isApiError(err) && err.code === "voucher_code_exists") {
        setServerErrors({ code: voucherErrorMessage(err, "") });
      } else if (isApiError(err) && err.code === "invalid_voucher_validity") {
        setServerErrors(
          draft.validity === "date"
            ? { endsAt: "Pick a time that is still ahead." }
            : { days: `Enter 1 to ${VOUCHER_LIMITS.validityDaysMax} days.` },
        );
      } else {
        setError(voucherErrorMessage(err, "The campaign could not be saved. Try again."));
        if (voucherErrorIsStale(err)) onStale();
      }
    } finally {
      setBusy(false);
    }
  }

  const minEnd = isoToManilaLocal(new Date(Date.now() + 60_000).toISOString());

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{isNew ? "New voucher campaign" : `Edit ${editing.name}`}</DialogTitle>
        <DialogDescription>
          A campaign starts as a draft. Nothing reaches a client until you launch it and,
          for a campaign GRIDGO issues, send it to a list.
        </DialogDescription>
      </DialogHeader>

      {isNew ? (
        <div className="gg-panel flex flex-wrap items-center justify-between gap-3">
          <p className="text-body text-text-secondary m-0 max-w-prose">
            Thanking soft-launch testers? Start from ₱15, issued by GRIDGO, 7 days from issue.
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => setDraft(testerDraft())}>
            Use tester voucher
          </Button>
        </div>
      ) : null}

      <FieldGroup>
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="campaign-name">Name</FieldLabel>
          <Input
            id="campaign-name"
            value={draft.name}
            maxLength={VOUCHER_LIMITS.nameMax}
            disabled={busy}
            aria-invalid={errors.name ? true : undefined}
            placeholder="e.g. Soft-launch tester thanks"
            onChange={(event) => set("name", event.target.value)}
          />
          <FieldDescription>Clients see this name on the voucher in their wallet.</FieldDescription>
          {errors.name ? <FieldError>{errors.name}</FieldError> : null}
        </Field>

        <Field data-invalid={errors.value ? true : undefined}>
          <FieldLabel htmlFor="campaign-value">Value</FieldLabel>
          <div className="flex max-w-xs items-center gap-2">
            <span className="text-body text-text-secondary" aria-hidden>
              ₱
            </span>
            <Input
              id="campaign-value"
              inputMode="decimal"
              value={draft.value}
              disabled={busy}
              aria-invalid={errors.value ? true : undefined}
              placeholder="15.00"
              onChange={(event) => set("value", event.target.value)}
            />
          </div>
          <FieldDescription>
            A flat amount GRIDGO pays: it comes off GRIDGO&rsquo;s service fee first, then
            delivery, never the shop&rsquo;s price. Any part an order cannot use is lost, never
            paid out.
          </FieldDescription>
          {errors.value ? <FieldError>{errors.value}</FieldError> : null}
        </Field>

        <Field>
          <FieldLabel id="campaign-mode-label">How clients get it</FieldLabel>
          <RadioGroup
            aria-labelledby="campaign-mode-label"
            value={draft.mode}
            disabled={busy}
            onValueChange={(value) => set("mode", String(value) as VoucherCampaignMode)}
            className="gap-1"
          >
            {(Object.keys(MODE_COPY) as VoucherCampaignMode[]).map((mode) => (
              <label key={mode} className="flex min-h-11 cursor-pointer items-start gap-2 py-1">
                <RadioGroupItem
                  value={mode}
                  aria-labelledby={`campaign-mode-${mode}`}
                  aria-describedby={`campaign-mode-${mode}-body`}
                  className="mt-1"
                />
                <span className="flex min-w-0 flex-col">
                  <span id={`campaign-mode-${mode}`} className="text-body text-text-primary">
                    {MODE_COPY[mode].label}
                  </span>
                  <span id={`campaign-mode-${mode}-body`} className="text-caption text-text-muted">
                    {MODE_COPY[mode].body}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </Field>

        {draft.mode === "shared" ? (
          <Field data-invalid={errors.code ? true : undefined}>
            <FieldLabel htmlFor="campaign-code">Code</FieldLabel>
            <Input
              id="campaign-code"
              value={draft.code}
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              aria-invalid={errors.code ? true : undefined}
              placeholder="Leave blank for a generated code"
              className="max-w-sm uppercase"
              onChange={(event) => set("code", event.target.value)}
            />
            <FieldDescription>
              4 to 40 letters, numbers or hyphens; clients can type it in any case. Five wrong
              tries in an hour lock a client out for 15 minutes.
            </FieldDescription>
            {errors.code ? <FieldError>{errors.code}</FieldError> : null}
          </Field>
        ) : null}

        <Field>
          <FieldLabel id="campaign-validity-label">How long each voucher lasts</FieldLabel>
          <RadioGroup
            aria-labelledby="campaign-validity-label"
            value={draft.validity}
            disabled={busy}
            onValueChange={(value) => set("validity", String(value) as CampaignDraft["validity"])}
            className="gap-1"
          >
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <RadioGroupItem value="days" aria-labelledby="campaign-validity-days" />
              <span id="campaign-validity-days" className="text-body text-text-primary">
                A number of days from issue
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <RadioGroupItem value="date" aria-labelledby="campaign-validity-date" />
              <span id="campaign-validity-date" className="text-body text-text-primary">
                Until a fixed end date
              </span>
            </label>
          </RadioGroup>
        </Field>

        {draft.validity === "days" ? (
          <Field data-invalid={errors.days ? true : undefined}>
            <FieldLabel htmlFor="campaign-days">Days</FieldLabel>
            <Input
              id="campaign-days"
              inputMode="numeric"
              value={draft.days}
              disabled={busy}
              aria-invalid={errors.days ? true : undefined}
              className="max-w-32"
              onChange={(event) => set("days", event.target.value)}
            />
            <FieldDescription>
              Counted from the moment each person is issued one. Testers get 7.
            </FieldDescription>
            {errors.days ? <FieldError>{errors.days}</FieldError> : null}
          </Field>
        ) : (
          <Field data-invalid={errors.endsAt ? true : undefined}>
            <FieldLabel htmlFor="campaign-ends">Ends (Philippine time)</FieldLabel>
            <Input
              id="campaign-ends"
              type="datetime-local"
              value={draft.endsAt}
              min={minEnd}
              disabled={busy}
              aria-invalid={errors.endsAt ? true : undefined}
              className="max-w-xs"
              onChange={(event) => set("endsAt", event.target.value)}
            />
            <FieldDescription>Every voucher in the campaign stops working at this time.</FieldDescription>
            {errors.endsAt ? <FieldError>{errors.endsAt}</FieldError> : null}
          </Field>
        )}

        <Field data-invalid={errors.totalLimit ? true : undefined}>
          <FieldLabel htmlFor="campaign-limit">How many accounts can get one</FieldLabel>
          <Input
            id="campaign-limit"
            inputMode="numeric"
            value={draft.totalLimit}
            disabled={busy}
            aria-invalid={errors.totalLimit ? true : undefined}
            className="max-w-40"
            placeholder="100"
            onChange={(event) => set("totalLimit", event.target.value)}
          />
          <FieldDescription>
            One per account. A voided or expired voucher still counts toward this limit.
            {ceiling !== null
              ? ` At most ${formatPhp(ceiling)} if every voucher is used in full.`
              : ""}
          </FieldDescription>
          {errors.totalLimit ? <FieldError>{errors.totalLimit}</FieldError> : null}
        </Field>
      </FieldGroup>

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="default" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : isNew ? "Save as draft" : "Save changes"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
