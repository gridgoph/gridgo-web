"use client";

import { useState } from "react";

import { AudiencePicker } from "@/components/legal/AudiencePicker";
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
import { createLegalDocument } from "@/lib/api/client";
import type { LegalAudience } from "@/lib/api/types";
import {
  LEGAL_LIMITS,
  documentIdError,
  documentIdFromTitle,
  legalErrorMessage,
  newDocumentDraft,
} from "@/lib/legal";

type Props = {
  open: boolean;
  takenIds: readonly string[];
  onClose: () => void;
  onCreated: (id: string) => void;
};

/**
 * A document beyond the eight launch slots. It starts as a placeholder draft
 * that nobody sees until it is published.
 */
export function NewLegalDocumentDialog({ open, takenIds, onClose, onCreated }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {open ? <Body takenIds={takenIds} onClose={onClose} onCreated={onCreated} /> : null}
    </Dialog>
  );
}

function Body({ takenIds, onClose, onCreated }: Omit<Props, "open">) {
  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [audience, setAudience] = useState<LegalAudience | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveId = idTouched ? id : documentIdFromTitle(title);
  const titleError = !title.trim() ? "Give the document a title." : null;
  const idError = documentIdError(effectiveId, takenIds);
  const audienceError = audience ? null : "Choose who it applies to.";

  async function create() {
    setAttempted(true);
    if (titleError || idError || !audience) return;
    setBusy(true);
    setError(null);
    try {
      await createLegalDocument(effectiveId, newDocumentDraft(title.trim(), audience, new Date()));
      onCreated(effectiveId);
    } catch (err) {
      setError(legalErrorMessage(err, "The document was not created. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>New legal document</DialogTitle>
        <DialogDescription>
          It starts as a placeholder draft. Nobody sees it until you write it
          and publish it.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={attempted && titleError ? true : undefined}>
          <FieldLabel htmlFor="legal-new-title">Title</FieldLabel>
          <Input
            id="legal-new-title"
            value={title}
            maxLength={LEGAL_LIMITS.title}
            aria-invalid={attempted && titleError ? true : undefined}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="For example, Refund Policy"
            autoComplete="off"
          />
          {attempted && titleError ? <FieldError>{titleError}</FieldError> : null}
        </Field>
        <Field data-invalid={attempted && idError ? true : undefined}>
          <FieldLabel htmlFor="legal-new-id">Document ID</FieldLabel>
          <Input
            id="legal-new-id"
            value={effectiveId}
            maxLength={80}
            aria-invalid={attempted && idError ? true : undefined}
            onChange={(e) => {
              setIdTouched(true);
              setId(e.target.value.trim().toLowerCase());
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <FieldDescription>
            The permanent name apps and links use. It cannot be changed later.
          </FieldDescription>
          {attempted && idError ? <FieldError>{idError}</FieldError> : null}
        </Field>
        <Field data-invalid={attempted && audienceError ? true : undefined}>
          <FieldLabel id="legal-new-audience">Applies to</FieldLabel>
          <AudiencePicker
            labelledBy="legal-new-audience"
            value={audience}
            onChange={setAudience}
          />
          {attempted && audienceError ? <FieldError>{audienceError}</FieldError> : null}
        </Field>
      </FieldGroup>
      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void create()}>
          {busy ? "Creating…" : "Create draft"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
