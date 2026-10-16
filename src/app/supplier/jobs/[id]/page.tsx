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

import { ChangeRequestCard } from "@/app/supplier/_components/ChangeRequestCard";
import { DeclineJobDialog } from "@/app/supplier/_components/DeclineJobDialog";
import { FinishedWorkDialog } from "@/app/supplier/_components/FinishedWorkDialog";
import { ProofUploadDialog } from "@/app/supplier/_components/ProofUploadDialog";
import { PackagingChecklist } from "@/app/supplier/_components/PackagingChecklist";
import { RequestChangeDialog } from "@/app/supplier/_components/RequestChangeDialog";
import {
  ColourCorrectionDialog,
  correctableColourLines,
} from "@/app/supplier/_components/ColourCorrectionDialog";
import { originalColourOf } from "@/components/orders/ColourCorrectionPages";
import { SpecialInstructionsCard } from "@/app/supplier/_components/SpecialInstructionsCard";
import { JobFilesDialog } from "@/components/orders/JobFilesDialog";
import { MilestoneList } from "@/components/orders/MilestoneList";
import { OrderMeta } from "@/components/orders/OrderMeta";
import { ProgressGallery, WaitingForPhoto } from "@/components/orders/ProductionProgress";
import { Timeline } from "@/components/orders/Timeline";
import { Confirmation } from "@/components/refunds/dialogs";
import { Button } from "@/components/ui/button";
import { TakePhotoButton } from "@/components/ui/TakePhotoButton";
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
import { ExpressChip } from "@/components/ui/ExpressChip";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  ApiError,
  attachPackingPhoto,
  attachProductionPhoto,
  declineJob,
  getOrder,
  transitionOrder,
  uploadPackingPhoto,
  uploadProductionPhoto,
} from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { EXPRESS_JOB_NOTE, isExpressOrder } from "@/lib/express";
import { formatDateTime, formatPhp } from "@/lib/format";
import {
  canRequestChange,
  changeRequestsOf,
  currentChangeRequest,
  hasSpecialInstructions,
  instructionsReadAt,
  itemInstructions,
  shopChangeErrorMessage,
  type DeclineReasonId,
} from "@/lib/order-changes";
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
import { shopProofFileIds } from "@/lib/payout-proofs";
import { uploadErrorMessage } from "@/lib/upload-errors";
import {
  DO_NOT_PACK_YET,
  ridersPack,
  shopFinishedStep,
  shopHandoverChip,
  shopTimelineState,
} from "@/lib/shop-handover";
import {
  CLAIM_HOLD_PACKING_REASON,
  actionsForJob,
  packingPhotoOwed,
  productionPhotoOwed,
  shopLetJobGo,
  shopProofOutstanding,
  shopProofWords,
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
  const changeCopy = shopChangeErrorMessage(err);
  if (changeCopy) return changeCopy;
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
  // The decline dialog, opened on a reason when "Not possible?" opened it.
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState<DeclineReasonId | null>(null);
  const [declineError, setDeclineError] = useState<string | null>(null);
  // Always starts unticked: a box ticked for the shop records nothing it did.
  const [instructionsRead, setInstructionsRead] = useState(false);
  const [tickMissing, setTickMissing] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  /** The colour-priced line being corrected; null when the dialog is shut. */
  const [colourLine, setColourLine] = useState<string | null>(null);
  // The payout stage whose proof photos are being added, if any.
  const [proofStage, setProofStage] = useState<string | null>(null);
  const [filedNote, setFiledNote] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoKind, setPhotoKind] = useState<PhotoKind>("progress");
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // The API refused to pack for want of a photo: the error offers that upload.
  const [photoRefused, setPhotoRefused] = useState<PhotoKind | null>(null);
  // Rider-packs: the finished, unpacked work, sent for GRIDGO's review.
  const [finishedOpen, setFinishedOpen] = useState(false);

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
    if (action.kind === "send_finished_photos") {
      if (action.blockedReason) return;
      setActionError(null);
      setFiledNote(null);
      setFinishedOpen(true);
      return;
    }
    if (action.kind === "add_proof" || action.targetState === null) {
      setActionError(null);
      setFiledNote(null);
      setProofStage(action.milestoneCode ?? null);
      return;
    }
    if (action.blockedReason) return;
    if (action.kind === "ready_for_pickup" && shopProofOutstanding(job)) return;
    if (action.kind === "decline") {
      openDecline(null);
      return;
    }
    // GRIDGO refuses the acceptance until the shop ticks that it read the notes.
    const needsTick = action.kind === "accept" && hasSpecialInstructions(job);
    if (needsTick && !instructionsRead) {
      setTickMissing(true);
      return;
    }
    setActing(action.kind);
    setActionError(null);
    setPhotoRefused(null);
    try {
      const note =
        action.kind === "accept"
          ? "Accepted"
          : action.kind === "ready_for_pickup"
            ? ridersPack(job)
              ? "Ready for rider pickup. Packing materials prepared; nothing packed until the rider checks the items."
              : "Packaging ready — packed and staged for joint pickup checks with the rider"
            : action.label;
      setJob(
        await transitionOrder(
          job.id,
          action.targetState,
          // The tick is recorded with the time, against the notes as they stand.
          needsTick ? { note, specialInstructionsRead: true } : { note },
        ),
      );
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

  function openDecline(reason: DeclineReasonId | null) {
    setDeclineError(null);
    setDeclineReason(reason);
    setDeclineOpen(true);
  }

  async function decline(reason: string) {
    if (!job) return;
    setActing("decline");
    setDeclineError(null);
    try {
      await declineJob(job.id, reason);
      setDeclineOpen(false);
      await load().catch(() => undefined);
    } catch (err) {
      setDeclineError(supplierErrorMessage(err));
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

  const status = shopHandoverChip(job) ?? presentOrderState(job.state);
  const activity = jobActivity(job);
  const actions = actionsForJob(job);
  const proofMilestone =
    job.payoutMilestones?.find((milestone) => milestone.code === proofStage) ?? null;
  const primary = actions.find((a) => a.primary);
  const secondary = actions.filter((a) => !a.primary);
  const waiting = supplierWaitingOn(job.state, job);
  const confirmedMinor = job.supplierSubtotalMinor ?? job.supplierPriceMinor;
  const confirmedDate = job.readyBy ?? job.promisedDate ?? job.deadline;
  const progress = productionProgressOf(job);
  // A shop proof photo is also a progress photo; it is shown once, under
  // Your payout, where it counts.
  const proofIds = shopProofFileIds(job);
  const allPhotos = progressPhotos(job);
  const photos = allPhotos.filter((photo) => !proofIds.has(photo.fileId));
  const proofPhotos = allPhotos.length - photos.length;
  const photoMissing = productionPhotoMissing(job);
  const photoOpenState = canAddProgressPhoto(job);
  const check = packagingCheck(job);
  const riderPacks = ridersPack(job);
  const finished = shopFinishedStep(job);
  const heldByChecklist = Boolean(primary?.blockedReason && check);
  const packingPhotos = (job.packingProgress?.photos ?? []).filter(
    (photo) => photo?.fileId,
  );
  const packingOwed = packingPhotoOwed(job);
  const photoWords = PHOTO_WORDS[photoKind];
  const notes = itemInstructions(job);
  const needsTick = primary?.kind === "accept" && hasSpecialInstructions(job);
  const changeAllowed = canRequestChange(job);
  const changeRequest = currentChangeRequest(job);
  const earlierChanges = changeRequestsOf(job).filter((row) => row.id !== changeRequest?.id);

  return (
    <div className="flex w-full flex-col gap-3">
      <header className="gg-card flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h2 text-text-primary m-0">{job.title}</h2>
            <p className="text-caption text-text-muted m-0 mt-1">Order {job.id}</p>
            {isExpressOrder(job) ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <ExpressChip />
                <span className="text-caption text-text-secondary">{EXPRESS_JOB_NOTE}</span>
              </div>
            ) : null}
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
                    ? heldByChecklist
                      ? "packaging-hold-reason"
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
          {/*
            With the checklist on the page, its row carries GRIDGO's reason
            (and the way to Operations); here it is only pointed to, so the
            sentence is not said twice. An older API has no checklist, so the
            reason stays under the button.
          */}
          {heldByChecklist && !actionError ? (
            <p className="text-body text-text-secondary m-0 flex max-w-prose items-start gap-2">
              <Scale className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              Waiting on Operations. The list below says why.
            </p>
          ) : null}
          {primary?.blockedReason && !heldByChecklist ? (
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
          {primary?.kind === "ready_for_pickup" && riderPacks ? (
            <p className="text-body text-text-secondary m-0 max-w-prose">{DO_NOT_PACK_YET}</p>
          ) : null}
          {primary?.kind === "add_progress_photo" && !check ? (
            <p className="text-caption text-text-muted m-0 max-w-prose">
              {PRODUCTION_PHOTO_COPY.supplierRule}
            </p>
          ) : null}
          {needsTick ? (
            <div className="flex max-w-prose flex-col gap-1">
              <Confirmation
                id="special-instructions-read"
                checked={instructionsRead}
                disabled={acting !== null}
                onChange={(next) => {
                  setInstructionsRead(next);
                  setTickMissing(false);
                  setActionError(null);
                }}
              >
                I&rsquo;ve read the special instructions
                <span className="text-caption text-text-muted block">
                  GRIDGO records when you ticked it. Your shop makes the job with them.
                </span>
              </Confirmation>
              {tickMissing && !instructionsRead ? (
                <p className="text-body text-error m-0" role="alert">
                  Tick that you read the special instructions to accept.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-x-4">
                {changeAllowed ? (
                  <Button variant="link" className="px-0" onClick={() => setChangeOpen(true)}>
                    They cost more? Request a change
                  </Button>
                ) : null}
                <Button
                  variant="link"
                  className="px-0"
                  onClick={() => openDecline("special_instructions")}
                >
                  Not possible? Decline this job
                </Button>
              </div>
            </div>
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
          {actionError && !declineOpen && proofStage === null && !photoOpen && !changeOpen && colourLine == null ? (
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
          {check ? <PackagingChecklist check={check} finished={finished} /> : null}

          {/*
            The client's own words come before the docket: they are the part of
            the job nobody picked from a list. On an offer the tick sits with
            Accept above; once accepted the card says when it was ticked.
          */}
          {notes.length ? (
            <SpecialInstructionsCard
              notes={notes}
              readAt={instructionsReadAt(job)}
              offer={job.state === "supplier_assigned" && !shopLetJobGo(job)}
              onRequestChange={
                changeAllowed && !needsTick ? () => setChangeOpen(true) : undefined
              }
            />
          ) : null}

          {changeRequest ? (
            <ChangeRequestCard
              request={changeRequest}
              earlier={earlierChanges}
              originalColour={originalColourOf(job, changeRequest.lineItemId)}
            />
          ) : null}

          <section className="gg-card p-3" aria-labelledby="spec-heading">
            <h3
              id="spec-heading"
              className="text-h3 text-text-primary m-0 mb-3 flex items-center gap-2"
            >
              <ListChecks size={18} strokeWidth={1.75} aria-hidden />
              Spec
            </h3>
            <OrderMeta order={job} showMoney={false} fromJobDetails />
            {changeAllowed && !needsTick
              ? correctableColourLines(job).map(({ item }) => (
                  <div
                    key={item.id}
                    className="border-outline-subtle mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3"
                  >
                    <p className="text-body text-text-secondary m-0 max-w-prose">
                      {correctableColourLines(job).length > 1 ? `${item.itemName}: a` : "A"} page
                      clearly in another colour tier? Ask the client to approve the corrected
                      price before you print it.
                    </p>
                    <Button variant="secondary" onClick={() => setColourLine(item.id)}>
                      Correct the colour price
                    </Button>
                  </div>
                ))
              : null}
          </section>

          {/*
            A rider-packs job owes no progress photo, so the empty frame that
            asks for one is not drawn; any photo it has is still shown.
          */}
          {progress && progressReached(job) && (!riderPacks || !photoMissing) ? (
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
                  : photos.length === 0 && proofPhotos > 0
                    ? "The client sees your photos on their order."
                    : `${progressPhotoCount(photos.length)} on this job. The client sees these on their order.`}
                {proofPhotos > 0
                  ? ` Your ${proofPhotos === 1 ? "proof photo is" : `${proofPhotos} proof photos are`} under Your payout, not repeated here.`
                  : ""}
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
            <Timeline
              entries={job.timeline}
              newestFirst
              presentState={(state) => shopTimelineState(job, state)}
            />
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
            <p className="text-body text-text-secondary m-0 mt-1 mb-1 max-w-prose">
              {/*
                Counted, not asserted. Orders placed under the escrow plan have
                three stages and older ones four, so a hardcoded count is wrong
                on one of them.
              */}
              {job.payoutMilestones.length === 1
                ? "One release of your own price, paid by Operations once they have seen the proof."
                : `${job.payoutMilestones.length} parts of your own price, each released by Operations once they have seen the proof for that stage.`}
            </p>
            <p className="text-caption text-text-muted m-0 mb-3 max-w-prose">
              Add as many proof photos as you like to your own stages, even after a
              part is paid. The client sees your photos on their order too.
            </p>
            <MilestoneList
              order={job}
              onAddProof={(milestone) => {
                setActionError(null);
                setFiledNote(null);
                setProofStage(milestone.code);
              }}
              addDisabled={acting !== null}
            />
          </section>
        ) : null}
      </div>

      <ProofUploadDialog
        open={proofMilestone !== null}
        order={job}
        milestone={proofMilestone}
        words={proofMilestone ? shopProofWords(proofMilestone) : null}
        countsAsProgress={Boolean(progress && !riderPacks)}
        onOrder={setJob}
        onClose={(note) => {
          setProofStage(null);
          if (note) setFiledNote(note);
        }}
      />

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
              <TakePhotoButton
                disabled={acting !== null}
                inputLabel="Take a progress photo"
                onFile={(file) => void onPhotoFile(file)}
              />
              <span className="text-caption text-text-secondary min-w-0 basis-full truncate sm:basis-auto">
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

      {riderPacks ? (
        <FinishedWorkDialog
          job={job}
          open={finishedOpen}
          sendBack={finished?.stage === "to_send" ? finished.sendBack : null}
          onClose={() => setFinishedOpen(false)}
          onSent={(order) => {
            setFinishedOpen(false);
            setJob(order);
            setFiledNote("Sent for review.");
            void load().catch(() => undefined);
          }}
          onMovedOn={(message) => {
            setFinishedOpen(false);
            setActionError(message);
            void load().catch(() => undefined);
          }}
        />
      ) : null}

      <DeclineJobDialog
        open={declineOpen}
        initialReason={declineReason}
        busy={acting === "decline"}
        error={declineError}
        onCancel={() => setDeclineOpen(false)}
        onDecline={(reason) => void decline(reason)}
      />

      <ColourCorrectionDialog
        job={job}
        lineItemId={colourLine}
        open={colourLine != null}
        onClose={() => setColourLine(null)}
        onSent={async (message) => {
          setColourLine(null);
          setFiledNote(message);
          await load().catch(() => undefined);
        }}
      />

      <RequestChangeDialog
        job={job}
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        onSent={async (message) => {
          setChangeOpen(false);
          setFiledNote(message);
          await load().catch(() => undefined);
        }}
      />
    </div>
  );
}
