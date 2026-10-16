"use client";

/**
 * Photos of the finished, unpacked work, sent for GRIDGO's review: the shop's
 * first step of a rider-packs handover (`gridgo-api/docs/SHOP_HANDOVER_API.md`).
 * The supplier app has the same step (gridgo-supplier `app/job/[id]/finished.tsx`).
 *
 * Each chosen photo is stored as soon as it is picked. Send puts every stored
 * photo on the job, then asks GRIDGO to review them, which moves the job to
 * review and pauses the shop's production time. A photo on the job stays
 * there, so a send whose review request failed is finished by pressing Send
 * again: only the request is repeated. When GRIDGO sent the last try back,
 * its reason leads, because the photos it already saw cannot be sent again.
 */

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusChip } from "@/components/ui/StatusChip";
import { TakePhotoButton } from "@/components/ui/TakePhotoButton";
import {
  ApiError,
  attachFinishedProductPhoto,
  submitFinishedProducts,
  uploadFinishedProductPhoto,
} from "@/lib/api/client";
import type { FinishedReview, Order } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { photoCount } from "@/lib/shop-handover";
import { uploadErrorMessage } from "@/lib/upload-errors";

type Item = {
  key: string;
  name: string;
  preview: string | null;
  phase: "storing" | "stored" | "on_job" | "failed";
  fileId?: string;
  error?: string;
};

/** The job moved past production while the photos were on their way. */
const MOVED_ON = new Set([
  "finished_product_photo_upload_not_allowed",
  "production_finish_not_available",
  "transition_not_allowed",
]);

export function finishedSendErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return "Network error while sending. Your photos are kept here; send them again.";
  }
  switch (err.code) {
    case "finished_product_photo_required":
      return "Add a photo of the finished, unpacked work first. Photos GRIDGO already reviewed cannot be sent again.";
    case "finished_product_photo_upload_not_allowed":
    case "production_finish_not_available":
    case "transition_not_allowed":
      return "This job has moved past production, so it no longer takes finished-work photos. The page now shows where it stands.";
    case "claim_hold_active":
      return "A client claim is holding this order. The GRIDGO Team must clear it before the work can be reviewed.";
    case "handover_flow_not_available":
      return "This job uses the older handover, so it has no finished-work review. Refresh the page.";
    default:
      return err.kind === "server"
        ? "GRIDGO could not take the photos just now. They are kept here; send them again in a moment."
        : "The photos were not sent. Send them again, and message the GRIDGO Team if it keeps failing.";
  }
}

type Props = {
  job: Order;
  open: boolean;
  /** GRIDGO's answer to the last try, when it was sent back. */
  sendBack: FinishedReview | null;
  onClose: () => void;
  onSent: (order: Order) => void;
  /** The job moved on while the dialog was open: read it again. */
  onMovedOn: (message: string) => void;
};

export function FinishedWorkDialog({
  job,
  open,
  sendBack,
  onClose,
  onSent,
  onMovedOn,
}: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const previews = useRef(new Set<string>());

  // The previews are local blobs; let them go with the dialog.
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL?.(url);
      urls.clear();
    };
  }, []);

  function patch(key: string, next: Partial<Item>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...next } : item)),
    );
  }

  async function add(files: File[]) {
    setError(null);
    for (const file of files) {
      const key = `photo-${nextKey.current++}`;
      const preview =
        typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
      if (preview) previews.current.add(preview);
      setItems((current) => [...current, { key, name: file.name, preview, phase: "storing" }]);
      try {
        const stored = await uploadFinishedProductPhoto(file);
        patch(key, { phase: "stored", fileId: stored.fileId });
      } catch (err) {
        patch(key, { phase: "failed", error: uploadErrorMessage(err, { what: "this photo" }) });
      }
    }
  }

  function remove(key: string) {
    setItems((current) => {
      const item = current.find((entry) => entry.key === key);
      if (item?.preview) {
        URL.revokeObjectURL?.(item.preview);
        previews.current.delete(item.preview);
      }
      return current.filter((entry) => entry.key !== key);
    });
  }

  function close() {
    if (sending) return;
    setError(null);
    // Photos already on the job stay there; only unsent ones are let go.
    setItems((current) => current.filter((item) => item.phase === "on_job"));
    onClose();
  }

  const ready = items.filter((item) => item.phase === "stored" || item.phase === "on_job");
  const storing = items.some((item) => item.phase === "storing");
  const count = ready.length;

  async function send() {
    if (!count || storing || sending) return;
    setSending(true);
    setError(null);
    try {
      for (const item of ready) {
        if (item.phase === "on_job" || !item.fileId) continue;
        await attachFinishedProductPhoto(item.fileId, job.id);
        patch(item.key, { phase: "on_job" });
      }
      const order = await submitFinishedProducts(job.id);
      setItems([]);
      onSent(order);
    } catch (err) {
      const message = finishedSendErrorMessage(err);
      if (err instanceof ApiError && MOVED_ON.has(err.code)) {
        setItems([]);
        onMovedOn(message);
      } else {
        setError(message);
      }
    } finally {
      setSending(false);
    }
  }

  const busy = sending || storing;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {sendBack ? "Send new photos of the finished work" : "Send finished work for review"}
          </DialogTitle>
          <DialogDescription>
            Photograph every finished piece out of its packing, in good light, close
            enough to see the print and the quantity. Do not pack yet: the rider checks
            the unpacked items first.
          </DialogDescription>
        </DialogHeader>

        {sendBack ? (
          <section
            aria-label="Why GRIDGO sent it back"
            className="border-outline bg-surface-variant rounded-field flex flex-col gap-2 border p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusChip tone="warning" label="GRIDGO asked for a fix" icon="triangle-alert" />
              <span className="text-caption text-text-muted">
                {formatDateTime(sendBack.at)}
              </span>
            </div>
            <blockquote className="border-outline text-body text-text-primary m-0 border-l-2 pl-3">
              {sendBack.note || "No reason was written. Message the GRIDGO Team to ask."}
            </blockquote>
            <p className="text-caption text-text-muted m-0">
              Fix it, then photograph the work again. GRIDGO cannot take the photos it
              already saw.
            </p>
          </section>
        ) : null}

        <div className="flex flex-col gap-2">
          {items.length ? (
            <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3">
              {items.map((item) => (
                <li
                  key={item.key}
                  className="border-outline bg-surface rounded-field relative flex min-w-0 flex-col overflow-hidden border"
                >
                  {item.preview ? (
                    // A local photo before upload: next/image cannot serve a blob URL.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.preview}
                      alt={`Finished work, ${item.name}`}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div className="bg-surface-variant flex aspect-[4/3] items-center justify-center">
                      <Camera className="text-text-muted size-6" aria-hidden />
                    </div>
                  )}
                  <div className="flex min-h-11 items-center justify-between gap-1 px-2 py-1">
                    <span
                      className={
                        item.phase === "failed"
                          ? "text-caption text-error min-w-0 truncate"
                          : "text-caption text-text-secondary min-w-0 truncate"
                      }
                    >
                      {item.phase === "storing"
                        ? "Saving…"
                        : item.phase === "failed"
                          ? "Not saved"
                          : item.phase === "on_job"
                            ? "On the job"
                            : "Ready to send"}
                    </span>
                    {item.phase === "stored" || item.phase === "failed" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={sending}
                        aria-label={`Remove ${item.name}`}
                        onClick={() => remove(item.key)}
                      >
                        <X aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                  {item.error ? (
                    <p className="text-caption text-error m-0 px-2 pb-2" role="alert">
                      {item.error}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-outline rounded-card flex flex-col items-center gap-1 border border-dashed px-4 py-6 text-center">
              <Camera className="text-text-muted size-6" aria-hidden />
              <span
                className="text-body text-text-primary"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                No photo yet
              </span>
              <span className="text-caption text-text-muted">
                The finished work, unpacked. Add as many photos as it takes.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={sending}
              onClick={() => picker.current?.click()}
            >
              {items.length ? "Add more photos" : "Choose photos"}
            </Button>
            <TakePhotoButton
              disabled={sending}
              label="Take a photo"
              inputLabel="Take a photo of the finished work"
              onFile={(file) => void add([file])}
            />
          </div>
          <input
            ref={picker}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-label="Photos of the finished work"
            disabled={sending}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void add(files);
            }}
          />
          <p className="text-caption text-text-muted m-0">
            JPEG, PNG or WebP. GRIDGO reviews them before a rider is called, and your
            production time is paused until it answers.
          </p>
        </div>

        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="secondary" disabled={sending} onClick={close}>
            Not yet
          </Button>
          <Button variant="primary" disabled={busy || !count} onClick={() => void send()}>
            {sending
              ? "Sending…"
              : count
                ? `Send ${photoCount(count)} for review`
                : "Send for review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
