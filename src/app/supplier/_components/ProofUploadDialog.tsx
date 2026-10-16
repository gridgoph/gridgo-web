"use client";

/**
 * Add proof photos to one of the shop's own payout stages, several at a time.
 *
 * Contract: "Payout proofs" in gridgo-api `docs/OPERATIONAL_MODEL_V2_API.md`
 * and `POST /files/:fileId/attach` in `docs/STORAGE_API.md` (gridgo-api#254).
 * Each picture is its own upload and its own attach, so each one has its own
 * line here: it uploads as soon as it is chosen, waits until the shop presses
 * File, and then says what happened to it. A picture the stage already has
 * attaches with `200` but is not listed again; the stage's list after the
 * attach is what says so. Past 50 distinct pictures the API answers
 * `409 proof_limit_reached`, and nothing after it is filed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, FileText, ImagePlus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TakePhotoButton } from "@/components/ui/TakePhotoButton";
import {
  ApiError,
  attachFulfilmentProof,
  uploadFulfilmentProof,
} from "@/lib/api/client";
import type { Order, PayoutMilestone } from "@/lib/api/types";
import {
  MAX_PROOFS_PER_STAGE,
  PROOF_LIMIT_COPY,
  filingOutcome,
  proofFilingError,
  shopProofAccess,
  stageProofIds,
} from "@/lib/payout-proofs";
import { uploadErrorMessage } from "@/lib/upload-errors";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

type Status =
  | "queued"
  | "uploading"
  | "ready"
  | "filing"
  | "filed"
  | "repeat"
  | "failed"
  | "over_limit";

type Item = {
  key: string;
  file: File;
  preview: string | null;
  status: Status;
  fileId: string | null;
  message: string | null;
  /** Which step a failure belongs to, so Try again repeats only that one. */
  failedAt: "upload" | "attach" | null;
};

export type ProofWords = {
  /** "Start of production". */
  label: string;
  /** "start-of-production". */
  noun: string;
  hint: string;
};

type Props = {
  open: boolean;
  order: Order;
  milestone: PayoutMilestone | null;
  words: ProofWords | null;
  /** A photo also counts as the progress photo before packing. */
  countsAsProgress?: boolean;
  /** Every attach returns the order; the page shows it at once. */
  onOrder: (order: Order) => void;
  /** Closed. `note` says what was filed, when anything was. */
  onClose: (note: string | null) => void;
};

function itemKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function photoWord(count: number): string {
  return count === 1 ? "1 photo" : `${count} photos`;
}

export function ProofUploadDialog(props: Props) {
  const { milestone, words } = props;
  if (!milestone || !words) return null;
  // A different stage starts with an empty list.
  return <ProofUploadBody key={milestone.code} {...props} milestone={milestone} words={words} />;
}

function ProofUploadBody({
  open,
  order,
  milestone: stage,
  words,
  countsAsProgress = false,
  onOrder,
  onClose,
}: Props & { milestone: PayoutMilestone; words: ProofWords }) {
  const [items, setItems] = useState<Item[]>([]);
  const [filing, setFiling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const live = useRef(true);
  // The latest order, so each attach compares against the list it changed.
  const latest = useRef(order);
  latest.current = order;

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const patch = useCallback((key: string, next: Partial<Item>) => {
    if (!live.current) return;
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...next } : item)));
  }, []);

  // One upload at a time, in the order chosen.
  const uploading = items.some((item) => item.status === "uploading");
  const nextQueued = items.find((item) => item.status === "queued");
  useEffect(() => {
    if (!open || uploading || filing || !nextQueued) return;
    const { key, file } = nextQueued;
    patch(key, { status: "uploading", message: null, failedAt: null });
    uploadFulfilmentProof(file).then(
      (stored) => patch(key, { status: "ready", fileId: stored.fileId }),
      (err) =>
        patch(key, {
          status: "failed",
          failedAt: "upload",
          message: uploadErrorMessage(err, { what: "this photo", notSent: "was not uploaded" }),
        }),
    );
  }, [open, uploading, filing, nextQueued, patch]);

  // Previews are object URLs; let them go with the item.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const kept = new Set(items.map((item) => item.preview).filter(Boolean) as string[]);
    for (const url of previews.current) {
      if (!kept.has(url)) URL.revokeObjectURL?.(url);
    }
    previews.current = kept;
  }, [items]);
  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL?.(url);
    },
    [],
  );

  const current =
    latest.current.payoutMilestones?.find((m) => m.code === stage.code) ?? stage;
  const onFile = stageProofIds(current).length;
  const access = shopProofAccess(latest.current, current);
  const pending = items.filter((item) =>
    ["queued", "uploading", "ready", "filing"].includes(item.status),
  );
  const ready = items.filter((item) => item.status === "ready");
  const busy = filing || uploading;
  const answered = items.some((item) => item.status === "filed" || item.status === "repeat");
  // A filing round is over: nothing left to upload or file.
  const settled = answered && pending.length === 0;
  const room = access.allowed ? Math.max(0, access.remaining - pending.length) : 0;

  function add(files: readonly File[]) {
    setNotice(null);
    const known = new Set(items.map((item) => item.key));
    let space = room;
    let over = 0;
    const added: Item[] = [];
    for (const file of files) {
      const key = itemKey(file);
      // The same file picked twice is one picture.
      if (known.has(key)) continue;
      known.add(key);
      // A preview is a nicety: a browser without object URLs still files.
      const image =
        file.type.startsWith("image/") && typeof URL.createObjectURL === "function";
      const fits = space > 0;
      if (fits) space -= 1;
      else over += 1;
      added.push({
        key,
        file,
        preview: image ? URL.createObjectURL(file) : null,
        status: fits ? "queued" : "over_limit",
        fileId: null,
        message: fits ? null : PROOF_LIMIT_COPY(MAX_PROOFS_PER_STAGE),
        failedAt: null,
      });
    }
    if (over > 0) {
      setNotice(
        `${photoWord(over)} did not fit: a stage takes ${MAX_PROOFS_PER_STAGE} proof photos at most. They were not uploaded.`,
      );
    }
    setItems((existing) => [...existing, ...added]);
  }

  function remove(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  function retry(item: Item) {
    patch(item.key, {
      status: item.failedAt === "attach" ? "ready" : "queued",
      message: null,
      failedAt: null,
    });
  }

  async function fileAll() {
    setFiling(true);
    setNotice(null);
    let stopped: string | null = null;
    for (const item of ready) {
      // The page went away: file nothing more on the shop's behalf.
      if (!live.current) return;
      if (!item.fileId) continue;
      if (stopped) {
        // A full stage refuses it the same way; trying again would not help.
        patch(item.key, { status: "failed", failedAt: null, message: stopped });
        continue;
      }
      patch(item.key, { status: "filing" });
      const before = stageProofIds(
        latest.current.payoutMilestones?.find((m) => m.code === stage.code),
      );
      try {
        const result = await attachFulfilmentProof(item.fileId, order.id, stage.code);
        const after = stageProofIds(
          result.order.payoutMilestones?.find((m) => m.code === stage.code),
        );
        latest.current = result.order;
        if (live.current) onOrder(result.order);
        patch(item.key, { status: filingOutcome(before, after, item.fileId), message: null });
      } catch (err) {
        const message = proofFilingError(err);
        const full = err instanceof ApiError && err.code === "proof_limit_reached";
        patch(item.key, { status: "failed", failedAt: full ? null : "attach", message });
        // A full stage refuses everything after it too.
        if (full) stopped = message;
      }
    }
    if (!live.current) return;
    setFiling(false);
  }

  // Everything filed as a new picture: nothing left to read here.
  useEffectOnSettled(settled, items, filing, () => {
    onClose(closingNote(items, words, stage.status === "released"));
    setItems([]);
  });

  function close() {
    if (busy) return;
    onClose(closingNote(items, words, stage.status === "released"));
    setItems([]);
    setNotice(null);
  }

  const released = stage.status === "released";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{words.label} proof</DialogTitle>
          <DialogDescription>{words.hint}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <p className="text-caption text-text-muted m-0">
            {onFile === 0
              ? "Nothing on file for this stage yet."
              : `${onFile} on file for this stage.`}{" "}
            {access.allowed
              ? `You can add up to ${access.remaining} more.`
              : (access.reason ?? "")}
            {released ? " This part is already released; more photos are kept with its proof." : ""}
          </p>
          <p className="text-caption text-text-muted m-0">
            JPEG, PNG, WebP or PDF. Choose several at once.
            {countsAsProgress ? " A photo also counts as the progress photo you need before packing; a PDF does not." : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={filing || room === 0}
              onClick={() => input.current?.click()}
            >
              <ImagePlus data-icon="inline-start" strokeWidth={1.75} aria-hidden />
              Choose photos
            </Button>
            <TakePhotoButton
              disabled={filing || room === 0}
              inputLabel="Take a photo for this proof"
              onFile={(file) => add([file])}
            />
          </div>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label={`${words.label} proof photos`}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              add(files);
            }}
          />
        </div>

        {notice ? (
          <p className="text-body text-text-primary m-0" role="status">
            {notice}
          </p>
        ) : null}

        {items.length ? (
          <ul
            className="m-0 flex max-h-[45vh] list-none flex-col gap-2 overflow-y-auto p-0"
            aria-label="Photos to file"
          >
            {items.map((item) => (
              <UploadRow
                key={item.key}
                item={item}
                disabled={filing}
                onRemove={() => remove(item.key)}
                onRetry={() => retry(item)}
              />
            ))}
          </ul>
        ) : null}

        <p className="sr-only" role="status" aria-live="polite">
          {progressSentence(items)}
        </p>

        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={close}>
            {answered ? "Done" : "Not yet"}
          </Button>
          {settled ? null : (
            <Button
              variant="primary"
              disabled={busy || ready.length === 0}
              onClick={() => void fileAll()}
            >
              {filing
                ? "Filing…"
                : ready.length
                  ? `File ${photoWord(ready.length)}`
                  : uploading
                    ? "Uploading…"
                    : "File photos"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Close on its own once every picture is filed as new. Anything that was a
 * repeat, failed, or did not fit stays on screen to be read.
 */
function useEffectOnSettled(
  settled: boolean,
  items: readonly Item[],
  filing: boolean,
  done: () => void,
) {
  const clean = settled && !filing && items.every((item) => item.status === "filed");
  const fire = useRef(done);
  fire.current = done;
  useEffect(() => {
    if (clean) fire.current();
  }, [clean]);
}

function closingNote(items: readonly Item[], words: ProofWords, released: boolean): string | null {
  const filed = items.filter((item) => item.status === "filed").length;
  if (filed === 0) return null;
  return released
    ? `${photoWord(filed)} added to your ${words.noun} proof. That part is already paid; the GRIDGO Team keeps them with it.`
    : `${photoWord(filed)} filed as your ${words.noun} proof. The GRIDGO Team reviews the proof before that part is paid.`;
}

function progressSentence(items: readonly Item[]): string {
  const uploading = items.findIndex((item) => item.status === "uploading");
  if (uploading >= 0) return `Uploading photo ${uploading + 1} of ${items.length}.`;
  const filing = items.findIndex((item) => item.status === "filing");
  if (filing >= 0) return `Filing photo ${filing + 1} of ${items.length}.`;
  return "";
}

const STATUS_WORDS: Record<Status, string> = {
  queued: "Waiting to upload",
  uploading: "Uploading…",
  ready: "Uploaded. Ready to file",
  filing: "Filing…",
  filed: "Filed",
  repeat: "Already on file. The same picture is not added twice",
  failed: "Not filed",
  over_limit: "Did not fit",
};

function UploadRow({
  item,
  disabled,
  onRemove,
  onRetry,
}: {
  item: Item;
  disabled: boolean;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const working = item.status === "uploading" || item.status === "filing";
  const removable = ["queued", "ready", "failed", "over_limit"].includes(item.status);
  const problem = item.status === "failed" || item.status === "over_limit";
  const retryable = item.status === "failed" && item.message !== null && item.failedAt !== null;
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-field border p-2",
        problem ? "border-error" : "border-outline-subtle",
      )}
    >
      <span className="bg-surface-variant flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md">
        {item.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.preview} alt="" className="size-full object-cover" />
        ) : (
          <FileText size={20} strokeWidth={1.75} className="text-text-muted" aria-hidden />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-body text-text-primary truncate">{item.file.name}</span>
        <span
          className={cn(
            "text-caption flex items-start gap-1",
            problem ? "text-error" : item.status === "filed" ? "text-success" : "text-text-muted",
          )}
        >
          {item.status === "filed" ? (
            <Check size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
          ) : problem ? (
            <CircleAlert size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
          ) : null}
          <span>
            {STATUS_WORDS[item.status]}
            {item.message ? `. ${item.message}` : ""}
          </span>
        </span>
        {working ? (
          <span className="bg-surface-variant block h-1 w-full overflow-hidden rounded-pill" aria-hidden>
            <span className="bg-text-primary block h-full w-1/2 animate-pulse rounded-pill" />
          </span>
        ) : null}
      </span>
      {retryable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={onRetry}
          aria-label={`Try ${item.file.name} again`}
        >
          <RotateCcw strokeWidth={1.75} aria-hidden />
        </Button>
      ) : null}
      {removable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Remove ${item.file.name}`}
        >
          <X strokeWidth={1.75} aria-hidden />
        </Button>
      ) : null}
    </li>
  );
}
