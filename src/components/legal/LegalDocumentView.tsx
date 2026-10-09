"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Paperclip, Trash2, X } from "lucide-react";

import { AudiencePicker } from "@/components/legal/AudiencePicker";
import { PublishLegalDialog } from "@/components/legal/PublishLegalDialog";
import { useLegalInboxReload } from "@/components/legal/useLegalInboxReload";
import { LegalReader, VersionLedger } from "@/components/legal/VersionLedger";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  deleteLegalDocument,
  getFileDownloadUrl,
  getLegalDocument,
  publishLegalDocument,
  updateLegalDraft,
  uploadLegalPdf,
} from "@/lib/api/client";
import type { LegalDocument, LegalDraft, LegalVersion } from "@/lib/api/types";
import {
  LEGAL_LIMITS,
  MATERIAL_REASON_COPY,
  PENALTY_DOCUMENT_ID,
  audienceLabel,
  changedDraftFields,
  currentVersion,
  draftIsUnpublished,
  hasRealVersion,
  isoToManilaInput,
  latestVersion,
  legalErrorMessage,
  legalErrorNeedsReload,
  manilaInputToIso,
  publishMateriality,
  validateLegalDraft,
  versionStatusChip,
  type DraftErrors,
} from "@/lib/legal";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { uploadErrorMessage } from "@/lib/upload-errors";

type Props = {
  documentId: string;
  tree: "admin" | "ops";
  canEdit: boolean;
  /** Super Admin's audit trail for this document, rendered by the admin tree. */
  history?: ReactNode;
};

type Timing = "now" | "date";

function timingOf(draft: LegalDraft, now: number): Timing {
  return Date.parse(draft.effectiveAt) > now ? "date" : "now";
}

export function LegalDocumentView({ documentId, tree, canEdit, history }: Props) {
  const router = useRouter();
  const [doc, setDoc] = useState<LegalDocument | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The editor's working copy. `base` is the saved draft it started from.
  const [form, setForm] = useState<LegalDraft | null>(null);
  const [timing, setTiming] = useState<Timing>("now");
  const [dateInput, setDateInput] = useState("");
  const [remoteChanged, setRemoteChanged] = useState(false);
  const formRef = useRef<{ doc: LegalDocument | null; dirty: boolean }>({ doc: null, dirty: false });

  const adopt = useCallback((next: LegalDocument) => {
    const at = Date.now();
    setDoc(next);
    setNow(at);
    setForm(next.draft);
    setTiming(timingOf(next.draft, at));
    setDateInput(isoToManilaInput(next.draft.effectiveAt));
    setRemoteChanged(false);
    setSelectedId((current) =>
      current && next.versions.some((v) => v.id === current)
        ? current
        : (currentVersion(next, at) ?? latestVersion(next))?.id ?? null,
    );
  }, []);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoadError(null);
      try {
        const next = await getLegalDocument(documentId);
        if (!next) {
          setMissing(true);
          return;
        }
        const held = formRef.current;
        // Keep unsaved typing; say the saved copy moved underneath it.
        if (held.dirty && held.doc && held.doc.revision !== next.revision) {
          setDoc(next);
          setNow(Date.now());
          setRemoteChanged(true);
          return;
        }
        if (held.doc && held.doc.revision === next.revision && held.dirty) {
          setDoc(next);
          return;
        }
        adopt(next);
      } catch (err) {
        setLoadError(legalErrorMessage(err, "This document did not load. Try again."));
      }
    }, [adopt, documentId]),
  );

  useEffect(() => {
    void load();
  }, [load]);
  useLegalInboxReload("legal.", load);

  // ---- derived -------------------------------------------------------------
  const nowIso = new Date(now).toISOString();
  const dateIso = manilaInputToIso(dateInput);
  const working: LegalDraft | null = useMemo(() => {
    if (!form || !doc) return null;
    let effectiveAt = dateIso;
    if (timing === "now") {
      effectiveAt = Date.parse(doc.draft.effectiveAt) <= now ? doc.draft.effectiveAt : nowIso;
    }
    return { ...form, effectiveAt };
  }, [form, doc, timing, dateIso, now, nowIso]);
  const changes = useMemo(
    () => (doc && working ? changedDraftFields(doc.draft, working) : {}),
    [doc, working],
  );
  const dirty = Object.keys(changes).length > 0;
  formRef.current = { doc, dirty };

  // ---- save ------------------------------------------------------------------
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const errors: DraftErrors = useMemo(
    () => (doc && working ? validateLegalDraft(doc, working) : {}),
    [doc, working],
  );
  const shownErrors = attempted ? errors : {};

  function set<K extends keyof LegalDraft>(key: K, value: LegalDraft[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setPublishErrors({});
  }

  async function saveDraft(): Promise<LegalDocument | null> {
    if (!doc || !working) return null;
    setAttempted(true);
    if (Object.keys(errors).length > 0) return null;
    if (!dirty) return doc;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await updateLegalDraft(doc.id, doc.revision, changes);
      const next = { ...doc, revision: saved.revision, draft: saved.draft };
      adopt(next);
      toast.add({ type: "success", title: "Draft saved", description: "People still see the published version." });
      return next;
    } catch (err) {
      setSaveError(legalErrorMessage(err, "The draft was not saved. Try again."));
      if (legalErrorNeedsReload(err)) {
        formRef.current = { doc, dirty: false };
        void load();
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  // ---- publish ---------------------------------------------------------------
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishDraft, setPublishDraft] = useState<LegalDraft | null>(null);
  const [publishErrors, setPublishErrors] = useState<DraftErrors>({});

  function startPublish() {
    if (!doc || !working) return;
    setAttempted(true);
    const draft = timing === "now" ? { ...working, effectiveAt: new Date().toISOString() } : working;
    const problems = validateLegalDraft(doc, draft, { forPublish: true });
    setPublishErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setPublishDraft(draft);
    setPublishError(null);
    setPublishOpen(true);
  }

  async function confirmPublish() {
    if (!doc || !publishDraft) return;
    setPublishBusy(true);
    setPublishError(null);
    try {
      // Publishing snapshots the saved draft, so save the exact text first.
      const final = timing === "now" ? { ...publishDraft, effectiveAt: new Date().toISOString() } : publishDraft;
      const pending = changedDraftFields(doc.draft, final);
      let revision = doc.revision;
      if (Object.keys(pending).length > 0) {
        revision = (await updateLegalDraft(doc.id, doc.revision, pending)).revision;
      }
      const result = await publishLegalDocument(doc.id, revision);
      setPublishOpen(false);
      formRef.current = { doc, dirty: false };
      const fresh = await getLegalDocument(doc.id);
      if (fresh) adopt(fresh);
      setSelectedId(result.document.id);
      toast.add({
        type: "success",
        title: `Version ${result.document.version} published`,
        description: result.document.material
          ? "Everyone it applies to will be asked to accept it."
          : "People who already accepted see a notice.",
      });
    } catch (err) {
      setPublishError(legalErrorMessage(err, "It was not published. Try again."));
      if (legalErrorNeedsReload(err)) {
        formRef.current = { doc, dirty: false };
        void load();
      }
    } finally {
      setPublishBusy(false);
    }
  }

  // ---- PDF -------------------------------------------------------------------
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pdfNames, setPdfNames] = useState<Record<string, string>>({});

  async function attachPdf(file: File) {
    setUploadError(null);
    if (file.type && file.type !== "application/pdf") {
      setUploadError("Choose a PDF file.");
      return;
    }
    if (file.size > LEGAL_LIMITS.pdfBytes) {
      setUploadError("The PDF is over 20 MB. Compress it and try again.");
      return;
    }
    setUploading(true);
    try {
      const stored = await uploadLegalPdf(file);
      setPdfNames((names) => ({ ...names, [stored.fileId]: stored.originalFilename || file.name }));
      set("pdfFileId", stored.fileId);
    } catch (err) {
      setUploadError(uploadErrorMessage(err, { what: "this PDF" }));
    } finally {
      setUploading(false);
    }
  }

  async function openDraftPdf(fileId: string) {
    const tab = window.open("", "_blank");
    try {
      const url = await getFileDownloadUrl(fileId);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else window.location.assign(url);
    } catch {
      tab?.close();
      setUploadError("The PDF did not open. Try again.");
    }
  }

  // ---- delete ----------------------------------------------------------------
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!doc) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteLegalDocument(doc.id, doc.revision);
      toast.add({ type: "success", title: `${doc.draft.title} deleted` });
      router.push(`/${tree}/legal`);
    } catch (err) {
      setDeleteError(legalErrorMessage(err, "It was not deleted. Try again."));
      if (legalErrorNeedsReload(err)) void load();
    } finally {
      setDeleteBusy(false);
    }
  }

  // ---- render ----------------------------------------------------------------
  if (missing) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          title="This document does not exist"
          body="It may have been deleted, or the link is wrong. The library lists every document."
          action={
            <Button variant="secondary" render={<Link href={`/${tree}/legal`} />} nativeButton={false}>
              Open the library
            </Button>
          }
        />
      </div>
    );
  }
  if (loadError && !doc) {
    return (
      <div className="flex flex-col gap-3">
        <ErrorState
          body={loadError}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }
  if (!doc || !form || !working) return <LoadingBlock label="Loading the document…" />;

  const shown = currentVersion(doc, now);
  const latest = latestVersion(doc);
  const nextNumber = (latest?.version ?? 0) + 1;
  const selected: LegalVersion | null =
    doc.versions.find((v) => v.id === selectedId) ?? shown ?? latest ?? null;
  const materiality = publishMateriality(doc, working);
  const forced = materiality.reason && materiality.reason !== "chosen" ? materiality.reason : null;
  const realPublished = hasRealVersion(doc);
  const hasSomethingToPublish = dirty || draftIsUnpublished(doc);
  const pdfName = form.pdfFileId ? pdfNames[form.pdfFileId] ?? "Attached PDF" : null;
  const deletable = !doc.launchSlot && doc.versions.length === 0;
  const combinedErrors = { ...shownErrors, ...publishErrors };

  const header = (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-h2 text-text-primary m-0">{shown?.title ?? doc.draft.title}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {shown ? (
          <StatusChip {...versionStatusChip(shown)} label={`${versionStatusChip(shown).label}, version ${shown.version}`} />
        ) : (
          <StatusChip tone="neutral" icon="circle-dashed" label="Not published yet" />
        )}
        <span className="text-body text-text-secondary">
          For {audienceLabel(shown?.audience ?? doc.draft.audience).toLowerCase()}
        </span>
        <span className="text-caption text-text-muted break-all">ID {doc.id}</span>
      </div>
    </header>
  );

  const versionsPanel = (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="gg-card flex flex-col gap-3" aria-labelledby="legal-versions">
        <h3 id="legal-versions" className="text-h3 text-text-primary m-0">
          Versions
        </h3>
        <VersionLedger doc={doc} now={now} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
      </section>
      {selected ? (
        <section className="gg-card" aria-label="Selected version">
          <LegalReader version={selected} />
        </section>
      ) : null}
      {history}
    </div>
  );

  if (!canEdit) {
    const unpublished = draftIsUnpublished(doc);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="text-caption text-text-muted m-0 max-w-prose">
          Only Super Admin can edit and publish legal documents.
        </p>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {versionsPanel}
          <section className="gg-card flex min-w-0 flex-col gap-3" aria-labelledby="legal-draft">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="legal-draft" className="text-h3 text-text-primary m-0">
                Draft
              </h3>
              {unpublished ? (
                <StatusChip tone="warning" icon="square-pen" label="Not published" />
              ) : (
                <StatusChip tone="neutral" icon="circle-check" label={`Same as version ${latest?.version ?? 1}`} />
              )}
            </div>
            {unpublished ? (
              <>
                <p className="text-body text-text-secondary m-0">{doc.draft.changeSummary}</p>
                {doc.draft.text ? (
                  <div className="text-body text-text-primary max-h-[24rem] overflow-y-auto whitespace-pre-wrap break-words rounded-field border border-dashed border-outline p-3" tabIndex={0} aria-label="Draft text">
                    {doc.draft.text}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-body text-text-muted m-0">Nothing waiting to be published.</p>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header}

      {remoteChanged ? (
        <div className="flex flex-col items-start gap-2 rounded-card border border-warning p-3 md:flex-row md:items-center" role="alert">
          <StatusChip tone="warning" icon="triangle-alert" label="Changed elsewhere" />
          <p className="text-body text-text-primary m-0 flex-1">
            Someone else saved or published this document while you were editing.
            Saving now would be refused.
          </p>
          <Button variant="secondary" onClick={() => adopt(doc)}>
            Load their version
          </Button>
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="gg-card flex min-w-0 flex-col gap-4" aria-labelledby="legal-editor">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="legal-editor" className="text-h3 text-text-primary m-0">
              Draft for version {nextNumber}
            </h3>
            {dirty ? (
              <StatusChip tone="warning" icon="square-pen" label="Unsaved changes" />
            ) : draftIsUnpublished(doc) ? (
              <StatusChip tone="info" icon="circle-dot" label="Saved, not published" />
            ) : (
              <StatusChip tone="neutral" icon="circle-check" label={`Same as version ${latest?.version ?? 1}`} />
            )}
          </div>
          <p className="text-body text-text-secondary m-0 -mt-2">
            Nobody sees the draft. People keep reading{" "}
            {shown ? `version ${shown.version}` : "nothing"} until you publish.
          </p>

          <FieldGroup>
            <Field data-invalid={combinedErrors.title ? true : undefined}>
              <FieldLabel htmlFor="legal-title">Title</FieldLabel>
              <Input
                id="legal-title"
                value={form.title}
                maxLength={LEGAL_LIMITS.title}
                aria-invalid={combinedErrors.title ? true : undefined}
                onChange={(e) => set("title", e.target.value)}
                autoComplete="off"
              />
              {combinedErrors.title ? <FieldError>{combinedErrors.title}</FieldError> : null}
            </Field>

            <Field data-invalid={combinedErrors.audience ? true : undefined}>
              <FieldLabel id="legal-audience">Applies to</FieldLabel>
              {doc.launchSlot ? (
                <p className="text-body text-text-primary m-0">
                  {audienceLabel(form.audience)}
                  <span className="text-caption text-text-muted block">
                    Launch documents keep their audience.
                  </span>
                </p>
              ) : (
                <AudiencePicker
                  labelledBy="legal-audience"
                  value={form.audience}
                  onChange={(audience) => set("audience", audience)}
                />
              )}
              {combinedErrors.audience ? <FieldError>{combinedErrors.audience}</FieldError> : null}
            </Field>

            <Field data-invalid={combinedErrors.content ? true : undefined}>
              <FieldLabel htmlFor="legal-text">Text</FieldLabel>
              <Textarea
                id="legal-text"
                value={form.text}
                rows={14}
                aria-invalid={combinedErrors.content ? true : undefined}
                onChange={(e) => set("text", e.target.value)}
                className="min-h-64 text-body-lg"
              />
              <FieldDescription>
                Plain text: line breaks are kept, formatting marks are shown as
                typed. {form.text.length.toLocaleString("en-PH")} of{" "}
                {LEGAL_LIMITS.text.toLocaleString("en-PH")} characters.
              </FieldDescription>
              {combinedErrors.content ? <FieldError>{combinedErrors.content}</FieldError> : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="legal-pdf">PDF</FieldLabel>
              <FieldDescription>
                Optional. It can sit beside the text or replace it. PDF only, up
                to 20 MB. A published PDF is kept as legal evidence.
              </FieldDescription>
              <input
                ref={fileInput}
                id="legal-pdf"
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void attachPdf(file);
                }}
              />
              {form.pdfFileId ? (
                <div className="flex flex-wrap items-center gap-2 rounded-field border border-outline-subtle p-2">
                  <FileText aria-hidden className="text-text-secondary ml-1 size-5 shrink-0" />
                  <span className="text-body text-text-primary min-w-0 flex-1 truncate">{pdfName}</span>
                  <Button variant="ghost" onClick={() => void openDraftPdf(form.pdfFileId as string)}>
                    Open
                  </Button>
                  <Button variant="ghost" disabled={uploading} onClick={() => fileInput.current?.click()}>
                    Replace
                  </Button>
                  <Button variant="ghost" aria-label="Remove the PDF from the draft" onClick={() => set("pdfFileId", null)}>
                    <X aria-hidden />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  className="self-start"
                  disabled={uploading}
                  onClick={() => fileInput.current?.click()}
                >
                  <Paperclip aria-hidden data-icon="inline-start" />
                  {uploading ? "Uploading…" : "Attach a PDF"}
                </Button>
              )}
              {uploadError ? (
                <p className="text-body text-error m-0" role="alert">
                  {uploadError}
                </p>
              ) : null}
            </Field>

            <Field orientation="horizontal" data-invalid={combinedErrors.placeholder ? true : undefined}>
              <Checkbox
                id="legal-placeholder"
                checked={form.placeholder}
                disabled={realPublished && !form.placeholder}
                onCheckedChange={(checked) => {
                  const placeholder = Boolean(checked);
                  setForm((current) =>
                    current
                      ? { ...current, placeholder, penalties: placeholder ? false : current.penalties }
                      : current,
                  );
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor="legal-placeholder" className="font-normal">
                  This is still placeholder text
                </FieldLabel>
                <FieldDescription>
                  {realPublished
                    ? "Real text is published, so this document cannot go back to a placeholder."
                    : "Untick when this is the reviewed legal text. Publishing it then asks everyone it applies to to accept."}
                </FieldDescription>
                {combinedErrors.placeholder ? <FieldError>{combinedErrors.placeholder}</FieldError> : null}
              </FieldContent>
            </Field>

            {doc.id === PENALTY_DOCUMENT_ID ? (
              <Field orientation="horizontal" data-invalid={combinedErrors.penalties ? true : undefined}>
                <Checkbox
                  id="legal-penalties"
                  checked={form.penalties}
                  disabled={form.placeholder}
                  onCheckedChange={(checked) => set("penalties", Boolean(checked))}
                />
                <FieldContent>
                  <FieldLabel htmlFor="legal-penalties" className="font-normal">
                    This agreement includes late-production deductions
                  </FieldLabel>
                  <FieldDescription>
                    {form.placeholder
                      ? "Only real text can carry money penalties."
                      : "A shop can be charged a deduction only after accepting a version with this ticked. Changing it asks every shop to accept again."}
                  </FieldDescription>
                  {combinedErrors.penalties ? <FieldError>{combinedErrors.penalties}</FieldError> : null}
                </FieldContent>
              </Field>
            ) : null}

            {!form.placeholder ? (
              <Field>
                <FieldLabel id="legal-material">Does this change what people agreed to?</FieldLabel>
                {forced ? (
                  <div className="flex flex-col items-start gap-2 rounded-field border border-warning p-3">
                    <StatusChip tone="warning" icon="triangle-alert" label="Everyone accepts again" />
                    <p className="text-body text-text-primary m-0">{MATERIAL_REASON_COPY[forced]}</p>
                  </div>
                ) : (
                  <RadioGroup
                    aria-labelledby="legal-material"
                    value={form.material ? "material" : "editorial"}
                    onValueChange={(value) => set("material", value === "material")}
                  >
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-field border border-outline-subtle px-3 py-2.5">
                      <RadioGroupItem value="material" className="mt-1" />
                      <span className="min-w-0">
                        <span className="text-body text-text-primary block" style={{ fontFamily: "var(--font-medium)" }}>
                          Yes, a material change
                        </span>
                        <span className="text-caption text-text-muted block">
                          Everyone it applies to must accept the new version before using the app again.
                        </span>
                      </span>
                    </label>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-field border border-outline-subtle px-3 py-2.5">
                      <RadioGroupItem value="editorial" className="mt-1" />
                      <span className="min-w-0">
                        <span className="text-body text-text-primary block" style={{ fontFamily: "var(--font-medium)" }}>
                          No, an editorial fix
                        </span>
                        <span className="text-caption text-text-muted block">
                          Wording or typos. People see a one-time notice; nobody accepts again.
                        </span>
                      </span>
                    </label>
                  </RadioGroup>
                )}
              </Field>
            ) : null}

            <Field data-invalid={combinedErrors.changeSummary ? true : undefined}>
              <FieldLabel htmlFor="legal-summary">What changed</FieldLabel>
              <Textarea
                id="legal-summary"
                value={form.changeSummary}
                rows={3}
                maxLength={LEGAL_LIMITS.changeSummary}
                aria-invalid={combinedErrors.changeSummary ? true : undefined}
                onChange={(e) => set("changeSummary", e.target.value)}
                placeholder="For example, Clarified how refunds are paid back."
              />
              <FieldDescription>
                Apps show this beside the new version, so write it for the people
                reading it.
              </FieldDescription>
              {combinedErrors.changeSummary ? <FieldError>{combinedErrors.changeSummary}</FieldError> : null}
            </Field>

            <Field data-invalid={combinedErrors.effectiveAt ? true : undefined}>
              <FieldLabel id="legal-timing">Takes effect</FieldLabel>
              <RadioGroup
                aria-labelledby="legal-timing"
                value={timing}
                onValueChange={(value) => {
                  const next = value === "date" ? "date" : "now";
                  setTiming(next);
                  if (next === "date" && !manilaInputToIso(dateInput)) {
                    setDateInput(isoToManilaInput(new Date(Date.now() + 7 * 86_400_000).toISOString()));
                  }
                }}
                className="grid gap-2 sm:grid-cols-2"
              >
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-outline-subtle px-3 py-2.5">
                  <RadioGroupItem value="now" />
                  <span className="text-body text-text-primary">As soon as I publish</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-outline-subtle px-3 py-2.5">
                  <RadioGroupItem value="date" />
                  <span className="text-body text-text-primary">On a later date</span>
                </label>
              </RadioGroup>
              {timing === "date" ? (
                <>
                  <Input
                    id="legal-effective"
                    type="datetime-local"
                    aria-label="Date and time it takes effect, Philippine time"
                    value={dateInput}
                    aria-invalid={combinedErrors.effectiveAt ? true : undefined}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="sm:max-w-xs"
                  />
                  <FieldDescription>
                    Philippine time. Until then people keep reading the current version.
                  </FieldDescription>
                </>
              ) : null}
              {combinedErrors.effectiveAt ? <FieldError>{combinedErrors.effectiveAt}</FieldError> : null}
            </Field>
          </FieldGroup>

          {saveError ? (
            <p className="text-body text-error m-0" role="alert">
              {saveError}
            </p>
          ) : null}

          <div className="border-outline-subtle flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap sm:items-center">
            <Button variant="primary" disabled={saving || publishBusy || !hasSomethingToPublish} onClick={startPublish}>
              Publish version {nextNumber}
            </Button>
            <Button variant="secondary" disabled={saving || !dirty} onClick={() => void saveDraft()}>
              {saving ? "Saving…" : "Save draft"}
            </Button>
            {dirty ? (
              <Button variant="ghost" disabled={saving} onClick={() => adopt(doc)}>
                Discard changes
              </Button>
            ) : null}
            {!hasSomethingToPublish ? (
              <p className="text-caption text-text-muted m-0 sm:ml-auto">
                Nothing new to publish. Edit the draft first.
              </p>
            ) : null}
          </div>

          {deletable ? (
            <div className="border-outline-subtle flex flex-col items-start gap-2 border-t pt-4">
              <p className="text-body text-text-secondary m-0">
                Never published, so it can still be deleted.
              </p>
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 aria-hidden data-icon="inline-start" />
                Delete document
              </Button>
            </div>
          ) : null}
        </section>

        {versionsPanel}
      </div>

      <PublishLegalDialog
        open={publishOpen}
        doc={doc}
        draft={publishDraft ?? working}
        immediate={timing === "now"}
        busy={publishBusy}
        error={publishError}
        onCancel={() => setPublishOpen(false)}
        onConfirm={() => void confirmPublish()}
      />

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {doc.draft.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              It was never published, so nobody has seen or accepted it. The
              draft is removed and its ID ({doc.id}) becomes free again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p className="text-body text-error m-0" role="alert">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={deleteBusy} autoFocus>
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleteBusy} onClick={() => void confirmDelete()}>
              {deleteBusy ? "Deleting…" : "Delete document"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
