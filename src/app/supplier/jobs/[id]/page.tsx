"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Camera,
  Check,
  History,
  ListChecks,
  Package,
  Scale,
  Wallet,
  X,
} from "lucide-react";

import { PackagingChecklist } from "@/app/supplier/_components/PackagingChecklist";
import { JobFilesDialog } from "@/components/orders/JobFilesDialog";
import { MilestoneList } from "@/components/orders/MilestoneList";
import { OrderMeta } from "@/components/orders/OrderMeta";
import { ProgressGallery, WaitingForPhoto } from "@/components/orders/ProductionProgress";
import { Timeline } from "@/components/orders/Timeline";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonDetail } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  ApiError,
  attachFulfilmentProof,
  attachPackingPhoto,
  attachProductionPhoto,
  getOrder,
  transitionOrder,
  uploadFulfilmentProof,
  uploadPackingPhoto,
  uploadProductionPhoto,
} from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";
import { packagingCheck, stepRefusal } from "@/lib/packaging-readiness";
import {
  PRODUCTION_PHOTO_COPY,
  canAddProgressPhoto,
  productionPhotoMissing,
  productionProgressOf,
  progressPhotoCount,
  progressPhotos,
  progressReached,
} from "@/lib/production-progress";
import { uploadErrorMessage } from "@/lib/upload-errors";
import {
  CLAIM_HOLD_PACKING_REASON,
  actionsForJob,
  packingPhotoOwed,
  productionPhotoOwed,
  shopProofOutstanding,
  supplierWaitingOn,
  type SupplierAction,
} from "@/lib/supplier-actions";
import { jobActivity, relativeTime } from "@/app/supplier/_lib/job-activity";

/** The two shop photos a job takes before packing, each with its own words. */
type PhotoKind = "progress" | "packing";

const PHOTO_WORDS: Record<
  PhotoKind,
  { title: string; hint: string; sent: string; fileLabel: string }
> = {
  progress: {
    title: "Progress photo",
    hint: PRODUCTION_PHOTO_COPY.supplierHint,
    sent: "Photo sent. The client can see it on their order.",
    fileLabel: "Progress photo file",
  },
  packing: {
    title: "Packing photo",
    hint: "Show the finished prints packed and ready for the rider. The client sees it and is told their order is packed.",
    sent: "Packing photo sent. The client has been told their order is packed.",
    fileLabel: "Packing photo file",
  },
};

const PACKING_PHOTO_TOO_LATE =
  "This job has moved on, so it no longer takes a packing photo. The page now shows where it stands.";

function supplierErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return "Network error while updating. Try again.";
  }
  switch (err.code) {
    case "transition_not_allowed":
      return "That step is no longer available for this job. Refresh to see where it stands.";
    case "production_photo_required":
      return PRODUCTION_PHOTO_COPY.supplierRefused;
    case "production_photo_upload_not_allowed":
      return PRODUCTION_PHOTO_COPY.supplierTooLate;
    case "packing_photo_upload_not_allowed":
      return PACKING_PHOTO_TOO_LATE;
    case "claim_hold_active":
      return CLAIM_HOLD_PACKING_REASON;
    case "verification_not_approved":
    case "supplier_not_approved":
      return "Your account is still waiting for approval, so it cannot be given work yet. Operations will be in touch.";
    case "payment_method_not_allowed":
      return "Only digital payment exists on this platform now.";
    default:
      return err.kind === "validation"
        ? "Check the details you entered and try again."
        : "Could not update this job. Try again.";
  }
}

export default function SupplierJobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const [job, setJob] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [proofFileId, setProofFileId] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const proofInput = useRef<HTMLInputElement>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [filedNote, setFiledNote] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoKind, setPhotoKind] = useState<PhotoKind>("progress");
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // The API refused to pack for want of a photo: the error offers that upload.
  const [photoRefused, setPhotoRefused] = useState<PhotoKind | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        setJob(await getOrder(orderId));
      } catch (err) {
        setJob(null);
        if (err instanceof ApiError) {
          setError(
            err.status === 404
              ? "This job is not in your inbox. It may have been given to another supplier."
              : "Could not load this job. Retry when the API responds.",
          );
        } else {
          setError("Network error loading this job. Retry when the API is reachable.");
        }
      } finally {
        setLoading(false);
      }
    }, [orderId]),
  );

  useLiveReload("jobs", load, { matchId: orderId });

  useEffect(() => {
    void load();
  }, [load]);

  function closeProof() {
    setProofOpen(false);
    setProofFileId(null);
    setProofFileName(null);
    setProofError(null);
    if (proofInput.current) proofInput.current.value = "";
    setActing(null);
  }

  function openPhoto(kind: PhotoKind = "progress") {
    setActionError(null);
    setPhotoRefused(null);
    setPhotoKind(kind);
    setPhotoError(null);
    setPhotoFileId(null);
    setPhotoFileName(null);
    setPhotoOpen(true);
  }

  function closePhoto() {
    setPhotoOpen(false);
    setPhotoFileId(null);
    setPhotoFileName(null);
    setPhotoError(null);
    if (photoInput.current) photoInput.current.value = "";
    setActing(null);
  }

  async function runAction(action: SupplierAction) {
    if (!job) return;
    if (action.kind === "add_progress_photo") {
      openPhoto("progress");
      return;
    }
    if (action.kind === "add_packing_photo") {
      openPhoto("packing");
      return;
    }
    if (action.kind === "add_proof" || action.targetState === null) {
      setActionError(null);
      setProofError(null);
      setProofFileId(null);
      setProofFileName(null);
      setProofOpen(true);
      return;
    }
    if (action.blockedReason) return;
    if (action.kind === "ready_for_pickup" && shopProofOutstanding(job)) return;
    if (action.destructive && !confirmDecline) {
      setConfirmDecline(true);
      return;
    }
    setActing(action.kind);
    setActionError(null);
    setPhotoRefused(null);
    try {
      const note =
        action.kind === "decline"
          ? "Supplier declined — returned for rematch"
          : action.kind === "accept"
            ? "Accepted"
            : action.kind === "ready_for_pickup"
              ? "Packaging ready — packed and staged for joint pickup checks with the rider"
              : action.label;
      setJob(await transitionOrder(job.id, action.targetState, { note }));
      setConfirmDecline(false);
    } catch (err) {
      // GRIDGO's own sentence for a refused step, even when the checklist
      // said it would pass: the step is checked again when pressed.
      const refusal = stepRefusal(err);
      setActionError(refusal?.message ?? supplierErrorMessage(err));
      const owed = refusal?.missing.map((item) => item.kind) ?? [];
      const code = err instanceof ApiError ? err.code : "";
      setPhotoRefused(
        owed.includes("production_photo") || code === "production_photo_required"
          ? "progress"
          : owed.includes("packing_photo") || code === "packing_photo_required"
            ? "packing"
            : null,
      );
      await load().catch(() => undefined);
    } finally {
      setActing(null);
    }
  }

  async function onPhotoFile(file: File | undefined) {
    if (!file) return;
    setActing("add_progress_photo");
    setPhotoError(null);
    setPhotoFileId(null);
    setPhotoFileName(file.name);
    try {
      const stored =
        photoKind === "packing"
          ? await uploadPackingPhoto(file)
          : await uploadProductionPhoto(file);
      setPhotoFileId(stored.fileId);
    } catch (err) {
      setPhotoError(uploadErrorMessage(err, { what: "this photo" }));
    } finally {
      setActing(null);
    }
  }

  async function sendPhoto() {
    if (!job || !photoFileId) return;
    setActing("add_progress_photo");
    setPhotoError(null);
    try {
      if (photoKind === "packing") await attachPackingPhoto(photoFileId, job.id);
      else await attachProductionPhoto(photoFileId, job.id);
      setJob(await getOrder(job.id));
      setFiledNote(PHOTO_WORDS[photoKind].sent);
      closePhoto();
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === "production_photo_upload_not_allowed" ||
          err.code === "packing_photo_upload_not_allowed")
      ) {
        // The job moved on while the dialog was open. Show where it is now.
        closePhoto();
        setActionError(supplierErrorMessage(err));
        await load();
        return;
      }
      setPhotoError(supplierErrorMessage(err));
      setActing(null);
    }
  }

  async function onProofFile(file: File | undefined) {
    if (!file) return;
    setActing("add_proof");
    setProofError(null);
    setProofFileId(null);
    setProofFileName(file.name);
    try {
      const stored = await uploadFulfilmentProof(file);
      setProofFileId(stored.fileId);
    } catch (err) {
      setProofError(
        uploadErrorMessage(err, { what: "this evidence", notSent: "was not filed" }),
      );
    } finally {
      setActing(null);
    }
  }

  async function fileProof(action: SupplierAction) {
    if (!job || !proofFileId || !action.milestoneCode) return;
    setActing("add_proof");
    setProofError(null);
    try {
      await attachFulfilmentProof(proofFileId, job.id, action.milestoneCode);
      const reloaded = await getOrder(job.id);
      setJob(reloaded);
      const part = action.proofNoun ?? "stage";
      setFiledNote(
        `GRIDGO has your ${part} evidence. Operations reviews it before that part is paid.`,
      );
      closeProof();
    } catch (err) {
      setProofError(supplierErrorMessage(err));
      setActing(null);
    }
  }

  if (loading && !job) {
    return <SkeletonDetail label="Loading order workspace" panels={3} />;
  }
  if (error || !job) {
    return (
      <ErrorState
        body={error ?? "Job not found."}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
            <Button variant="secondary" onClick={() => router.push("/supplier/jobs")}>
              Back to inbox
            </Button>
          </div>
        }
      />
    );
  }

  const status = presentOrderState(job.state);
  const activity = jobActivity(job);
  const actions = actionsForJob(job);
  const proofAction = actions.find((action) => action.kind === "add_proof") ?? null;
  const primary = actions.find((a) => a.primary);
  const secondary = actions.filter((a) => !a.primary);
  const waiting = supplierWaitingOn(job.state, job);
  const confirmedMinor = job.supplierSubtotalMinor ?? job.supplierPriceMinor;
  const confirmedDate = job.readyBy ?? job.promisedDate ?? job.deadline;
  const progress = productionProgressOf(job);
  const photos = progressPhotos(job);
  const photoMissing = productionPhotoMissing(job);
  const photoOpenState = canAddProgressPhoto(job);
  const check = packagingCheck(job);
  const packingPhotos = (job.packingProgress?.photos ?? []).filter(
    (photo) => photo?.fileId,
  );
  const packingOwed = packingPhotoOwed(job);
  const photoWords = PHOTO_WORDS[photoKind];

  return (
    <div className="flex w-full flex-col gap-3">
      <header className="gg-card flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h2 text-text-primary m-0">{job.title}</h2>
            <p className="text-caption text-text-muted m-0 mt-1">Order {job.id}</p>
            {confirmedMinor !== undefined ? (
              <p className="text-caption text-text-muted m-0 mt-1">
                You earn {formatPhp(confirmedMinor)} on this job
              </p>
            ) : null}
          </div>
          <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
        </div>

        {/*
          What just happened, at the top.

          The state chip says where the job stands; it does not say what moved
          it there or when. That was only readable by scrolling to the bottom
          of the timeline, which is the wrong end of a growing list for the one
          question a shop opens this page with.
        */}
        {activity.at !== null ? (
          <div className="border-outline-subtle bg-surface-variant rounded-field flex flex-wrap items-baseline gap-x-2 gap-y-1 border px-3 py-2">
            <span className="text-overline text-text-muted uppercase">Latest</span>
            <span
              className="text-body text-text-primary"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {activity.what}
            </span>
            <span className="text-caption text-text-muted">
              {relativeTime(activity.at)}
              {activity.who ? ` · ${activity.who}` : ""}
              {activity.iso ? ` · ${formatDateTime(activity.iso)}` : ""}
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-outline-subtle pt-3">
          <div
            className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"
            role="group"
            aria-label="Job actions"
          >
            {primary ? (
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto sm:min-w-40"
                disabled={acting !== null || Boolean(primary.blockedReason)}
                aria-describedby={
                  primary.blockedReason
                    ? check
                      ? "primary-blocked-reason packaging-checklist-heading"
                      : "primary-blocked-reason"
                    : undefined
                }
                onClick={() => void runAction(primary)}
              >
                {primary.kind === "accept" ? (
                  <Check data-icon="inline-start" aria-hidden />
                ) : null}
                {acting === primary.kind
                  ? primary.kind === "accept"
                    ? "Accepting…"
                    : "Working…"
                  : primary.label}
              </Button>
            ) : null}
            {secondary.map((action) => (
              <Button
                key={action.kind}
                variant={action.destructive ? "danger" : "secondary"}
                size="lg"
                className="w-full sm:w-auto sm:min-w-40"
                disabled={acting !== null}
                onClick={() => void runAction(action)}
              >
                {action.destructive ? <X data-icon="inline-start" aria-hidden /> : null}
                {action.label}
              </Button>
            ))}
            <JobFilesDialog order={job} />
          </div>
          {!primary && !secondary.length ? (
            <p className="text-body text-text-secondary m-0">
              {waiting ??
                "Nothing for you to do on this job right now. The timeline below shows where it has got to."}
            </p>
          ) : null}
          {primary?.blockedReason ? (
            <p
              id="primary-blocked-reason"
              className="text-body text-text-primary m-0 flex max-w-prose items-start gap-2"
            >
              <Scale className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              {primary.blockedReason}
            </p>
          ) : null}
          {primary && waiting ? (
            <p className="text-caption text-text-muted m-0">{waiting}</p>
          ) : null}
          {primary?.kind === "add_progress_photo" && !check ? (
            <p className="text-caption text-text-muted m-0 max-w-prose">
              {PRODUCTION_PHOTO_COPY.supplierRule}
            </p>
          ) : null}
          {primary?.kind === "accept" ? (
            <div className="flex max-w-prose flex-col gap-1">
              <p className="text-body text-text-secondary m-0">
                Your shop commits to this job at the price already on your board, by the
                date GRIDGO already promised the client.
              </p>
              <p className="text-caption text-text-muted m-0">
                {confirmedMinor !== undefined
                  ? `Price: ${formatPhp(confirmedMinor)}`
                  : "Price already set on your board"}
              </p>
              {confirmedDate ? (
                <p className="text-caption text-text-muted m-0">
                  Date: {formatDateTime(confirmedDate)}
                </p>
              ) : null}
            </div>
          ) : null}
          {filedNote ? (
            <p className="text-body text-text-secondary m-0">{filedNote}</p>
          ) : null}
          {actionError && !confirmDecline && !proofOpen && !photoOpen ? (
            <div className="flex flex-col items-start gap-2" role="alert">
              <p className="text-body text-error m-0">{actionError}</p>
              {photoRefused === "progress" &&
              photoOpenState &&
              primary?.kind !== "add_progress_photo" ? (
                <Button variant="secondary" onClick={() => openPhoto("progress")}>
                  <Camera size={16} strokeWidth={1.75} aria-hidden />
                  Add a progress photo
                </Button>
              ) : null}
              {photoRefused === "packing" &&
              photoOpenState &&
              primary?.kind !== "add_packing_photo" ? (
                <Button variant="secondary" onClick={() => openPhoto("packing")}>
                  <Package size={16} strokeWidth={1.75} aria-hidden />
                  Add a packing photo
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {/*
        Two explicit columns rather than one auto-flowing grid. Spec, payout and
        timeline flowing in sequence put the timeline under the spec and left
        the whole right column empty below the payout — a screen of nothing
        beside the thing a shop scrolls to read.
      */}
      <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          {check ? <PackagingChecklist check={check} /> : null}

          <section className="gg-card p-3" aria-labelledby="spec-heading">
            <h3
              id="spec-heading"
              className="text-h3 text-text-primary m-0 mb-3 flex items-center gap-2"
            >
              <ListChecks size={18} strokeWidth={1.75} aria-hidden />
              Spec
            </h3>
            <OrderMeta order={job} showMoney={false} fromJobDetails />
          </section>

          {progress && progressReached(job) ? (
            <section className="gg-card p-3" aria-labelledby="progress-heading">
              <h3
                id="progress-heading"
                className="text-h3 text-text-primary m-0 mb-1 flex items-center gap-2"
              >
                <Camera size={18} strokeWidth={1.75} aria-hidden />
                Progress photos
              </h3>
              <p className="text-caption text-text-muted m-0 mb-3 max-w-prose">
                {photoMissing
                  ? "The client sees these on their order."
                  : `${progressPhotoCount(photos.length)} on this job. The client sees these on their order.`}
              </p>
              {photoMissing ? (
                <WaitingForPhoto
                  tone={photoOpenState ? "attention" : "neutral"}
                  body={
                    photoOpenState
                      ? "Once one photo of this job on your floor is here, the packing photo comes next."
                      : "This job left production without a progress photo."
                  }
                />
              ) : (
                <ProgressGallery
                  photos={photos}
                  onAdd={photoOpenState ? () => openPhoto("progress") : undefined}
                  addDisabled={acting !== null}
                />
              )}
            </section>
          ) : null}

          {job.packingProgress && (packingPhotos.length || packingOwed) ? (
            <section className="gg-card p-3" aria-labelledby="packing-heading">
              <h3
                id="packing-heading"
                className="text-h3 text-text-primary m-0 mb-1 flex items-center gap-2"
              >
                <Package size={18} strokeWidth={1.75} aria-hidden />
                Packing photos
              </h3>
              <p className="text-caption text-text-muted m-0 mb-3 max-w-prose">
                The finished prints, packed for the rider. The client sees these on their
                order.
              </p>
              {packingPhotos.length ? (
                <ProgressGallery
                  photos={packingPhotos}
                  label="Packing photo"
                  addLabel="Add another packing photo"
                  onAdd={photoOpenState ? () => openPhoto("packing") : undefined}
                  addDisabled={acting !== null}
                />
              ) : (
                <WaitingForPhoto
                  tone={productionPhotoOwed(job) ? "neutral" : "attention"}
                  title="No packing photo yet"
                  body="Once the job is packed, add one photo of it here before you mark it ready for pickup."
                />
              )}
            </section>
          ) : null}

          <section className="gg-card p-3" aria-labelledby="timeline-heading">
            <h3
              id="timeline-heading"
              className="text-h3 text-text-primary m-0 mb-1 flex items-center gap-2"
            >
              <History size={18} strokeWidth={1.75} aria-hidden />
              Timeline
            </h3>
            <p className="text-caption text-text-muted m-0 mb-3">Most recent first.</p>
            <Timeline entries={job.timeline} newestFirst />
          </section>
        </div>

        {job.payoutMilestones?.length ? (
          <section
            className="gg-card p-3 lg:sticky lg:top-3"
            aria-labelledby="payout-heading"
          >
            <h3
              id="payout-heading"
              className="text-h3 text-text-primary m-0 flex items-center gap-2"
            >
              <Wallet size={18} strokeWidth={1.75} aria-hidden />
              Your payout
            </h3>
            <p className="text-body text-text-secondary m-0 mt-1 mb-3 max-w-prose">
              {/*
                Counted, not asserted. Orders placed under the escrow plan have
                three stages and older ones four, so a hardcoded count is wrong
                on one of them.
              */}
              {job.payoutMilestones.length === 1
                ? "One release of your own price, paid by Operations once they have seen the proof."
                : `${job.payoutMilestones.length} parts of your own price, each released by Operations once they have seen the proof for that stage.`}
            </p>
            <MilestoneList order={job} />
          </section>
        ) : null}
      </div>

      <Dialog
        open={proofOpen && proofAction !== null}
        onOpenChange={(open) => {
          if (!open) closeProof();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{proofAction?.proofLabel ?? "Proof"}</DialogTitle>
            <DialogDescription>{proofAction?.proofHint ?? ""}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <p className="text-caption text-text-muted m-0">
              JPEG, PNG, WebP, or PDF.
              {progress
                ? " A photo also counts as the progress photo you need before packing; a PDF does not."
                : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={acting !== null}
                onClick={() => proofInput.current?.click()}
              >
                Choose file
              </Button>
              <span className="text-caption text-text-secondary min-w-0 truncate">
                {proofFileName ?? "No file chosen"}
              </span>
            </div>
            <input
              ref={proofInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              tabIndex={-1}
              disabled={acting !== null}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onProofFile(file);
              }}
            />
          </div>
          {proofError ? (
            <p className="text-body text-error m-0" role="alert">
              {proofError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" disabled={acting !== null} onClick={closeProof}>
              Not yet
            </Button>
            <Button
              variant="primary"
              disabled={acting !== null || !proofFileId || !proofAction}
              onClick={() => {
                if (proofAction) void fileProof(proofAction);
              }}
            >
              {acting === "add_proof" ? "Filing…" : "File this evidence"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={photoOpen}
        onOpenChange={(open) => {
          if (!open) closePhoto();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{photoWords.title}</DialogTitle>
            <DialogDescription>{photoWords.hint}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <p className="text-caption text-text-muted m-0">
              JPEG, PNG, or WebP. It does not release any part of your payout.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={acting !== null}
                onClick={() => photoInput.current?.click()}
              >
                Choose photo
              </Button>
              <span className="text-caption text-text-secondary min-w-0 truncate">
                {photoFileName ?? "No photo chosen"}
              </span>
            </div>
            <input
              ref={photoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-label={photoWords.fileLabel}
              disabled={acting !== null}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onPhotoFile(file);
              }}
            />
          </div>
          {photoError ? (
            <p className="text-body text-error m-0" role="alert">
              {photoError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" disabled={acting !== null} onClick={closePhoto}>
              Not yet
            </Button>
            <Button
              variant="primary"
              disabled={acting !== null || !photoFileId}
              onClick={() => void sendPhoto()}
            >
              {acting === "add_progress_photo" && photoFileId ? "Sending…" : "Send photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDecline}
        onOpenChange={(open) => {
          if (!open) setConfirmDecline(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this job?</AlertDialogTitle>
            <AlertDialogDescription>
              It goes back to Operations to be given to another supplier, and you lose
              this assignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={acting !== null}>
              Keep job
            </AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={acting !== null}
              onClick={() => {
                const decline = secondary.find((action) => action.destructive);
                if (decline) void runAction(decline);
              }}
            >
              {acting === "decline" ? "Declining…" : "Confirm decline"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
