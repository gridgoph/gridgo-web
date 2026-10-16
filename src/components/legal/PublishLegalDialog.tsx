"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/StatusChip";
import type { LegalDocument, LegalDraft } from "@/lib/api/types";
import {
  FIRST_USE_AGREEMENTS,
  MATERIAL_REASON_COPY,
  PENALTY_DOCUMENT_ID,
  audienceApp,
  audienceReach,
  currentVersion,
  formatManila,
  latestVersion,
  publishMateriality,
  versionStatusChip,
} from "@/lib/legal";

type Props = {
  open: boolean;
  doc: LegalDocument;
  /** The draft as it will be published (unsaved edits included). */
  draft: LegalDraft;
  /** True when it takes effect the moment it is published. */
  immediate: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The publish confirmation. It says, before the press, exactly who will be
 * stopped and asked to accept again; a material change needs a ticked
 * acknowledgement, not a generic "Are you sure?".
 */
export function PublishLegalDialog({
  open,
  doc,
  draft,
  immediate,
  busy,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const [understood, setUnderstood] = useState(false);
  useEffect(() => {
    if (open) setUnderstood(false);
  }, [open]);

  const now = Date.now();
  const shown = currentVersion(doc, now);
  const nextNumber = (latestVersion(doc)?.version ?? 0) + 1;
  const { material, reason } = publishMateriality(doc, draft);
  const reach = audienceReach(draft.audience);
  const app = audienceApp(draft.audience);
  const firstUse = FIRST_USE_AGREEMENTS.has(doc.id);
  const nextChip = versionStatusChip(draft);
  const realSupplierAgreement = doc.id === PENALTY_DOCUMENT_ID && !draft.placeholder;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto data-[size=default]:max-w-[calc(100vw-2rem)] data-[size=default]:sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Publish version {nextNumber} of {draft.title.trim() || doc.draft.title}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Published versions are kept as evidence and cannot be edited or
            deleted. To change it later, publish another version.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Before and after, as people will read it. */}
        <div
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2"
          aria-label="What changes"
        >
          <div className="flex flex-col gap-1.5 rounded-field border border-outline-subtle p-3">
            <span className="text-caption text-text-muted">People read now</span>
            {shown ? (
              <>
                <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
                  Version {shown.version}
                </span>
                <span>
                  <StatusChip {...versionStatusChip(shown)} />
                </span>
              </>
            ) : (
              <span className="text-body text-text-primary">Nothing yet</span>
            )}
          </div>
          <ArrowRight aria-hidden className="text-text-muted size-5 self-center" />
          <div className="flex flex-col gap-1.5 rounded-field border border-text-primary p-3">
            <span className="text-caption text-text-muted">
              {immediate ? "As soon as you publish" : `From ${formatManila(draft.effectiveAt)}`}
            </span>
            <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
              Version {nextNumber}
            </span>
            <span>
              <StatusChip {...nextChip} />
            </span>
          </div>
        </div>

        {material ? (
          <section
            className="flex flex-col items-start gap-2 rounded-card border-2 border-warning p-3"
            aria-labelledby="publish-consequence"
          >
            <StatusChip tone="warning" icon="triangle-alert" label="Everyone accepts again" />
            <p id="publish-consequence" className="text-body-lg text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
              {capitalise(reach)} will have to accept version {nextNumber} before
              they can keep using {app}.
            </p>
            <p className="text-body text-text-secondary m-0">
              {immediate ? "The next time they open the app" : "From the day it takes effect"},
              it shows them the new text with an unticked box and waits. Their
              earlier acceptances stay on record.
            </p>
            {reason && reason !== "chosen" ? (
              <p className="text-body text-text-secondary m-0">{MATERIAL_REASON_COPY[reason]}</p>
            ) : null}
          </section>
        ) : draft.placeholder ? (
          <section className="flex flex-col items-start gap-2 rounded-card border border-outline p-3">
            <StatusChip tone="neutral" icon="circle-dashed" label="Still a placeholder" />
            <p className="text-body text-text-primary m-0">
              Nobody is asked to accept again because of this version, and
              agreeing to a placeholder does not count as agreeing to the real
              text.
            </p>
          </section>
        ) : (
          <section className="flex flex-col items-start gap-2 rounded-card border border-outline p-3">
            <StatusChip tone="info" icon="circle-dot" label="Notice only" />
            <p className="text-body text-text-primary m-0">
              People who already accepted see a one-time notice. Nobody has to
              accept again.
            </p>
            <p className="text-body text-text-secondary m-0">
              Anyone who skipped an earlier material change is still asked to
              accept.
            </p>
          </section>
        )}

        <ul className="text-body text-text-secondary m-0 flex list-disc flex-col gap-1.5 pl-5">
          {immediate ? (
            <li>It takes effect as soon as you publish, with no app release.</li>
          ) : (
            <li>
              It takes effect on {formatManila(draft.effectiveAt)}, Philippine
              time.{" "}
              {shown
                ? `Until then people keep reading version ${shown.version}.`
                : "Until then nobody sees it."}
            </li>
          )}
          {firstUse ? (
            <li>Anyone signing in for the first time must accept it before they continue.</li>
          ) : null}
          {realSupplierAgreement ? (
            draft.penalties ? (
              <li>
                Late-production deductions apply only to shops that accept this
                version.
              </li>
            ) : (
              <li>No shop can be charged a late-production deduction under this version.</li>
            )
          ) : null}
        </ul>

        {material ? (
          <Field orientation="horizontal">
            <Checkbox
              id="publish-understood"
              checked={understood}
              onCheckedChange={(checked) => setUnderstood(Boolean(checked))}
            />
            <FieldLabel htmlFor="publish-understood" className="font-normal">
              I understand {reach} will have to accept again.
            </FieldLabel>
          </Field>
        ) : null}

        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="primary"
            disabled={busy || (material && !understood)}
            onClick={onConfirm}
          >
            {busy ? "Publishing…" : `Publish version ${nextNumber}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
