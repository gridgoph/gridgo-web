"use client";

import { useEffect, useState } from "react";

import { SamplePhoto, ZoomablePhoto } from "@/app/supplier/_components/SamplePhoto";
import { PinMap } from "@/components/riders/RiderMap";
import { FileDownload, saveRemoteFile } from "@/components/orders/EvidencePreview";
import { QaChecklistFields, type QaPanelStatus } from "@/components/orders/QaChecklist";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  downloadOrderArtwork,
  getFile,
  getFileDownloadUrl,
  postQaClientAction,
  recordQaTick,
} from "@/lib/api/client";
import type { Order, StoredFile } from "@/lib/api/types";
import { fileLooksLikeImage } from "@/lib/evidence";
import { formatDateTime } from "@/lib/format";
import {
  acceptedUploadWarning,
  addressFacts,
  fileDetailFacts,
  hasProblem,
  quantityFacts,
  specComparison,
  type Grade,
} from "@/lib/qa-grade";

function artworkIds(order: Order): string[] {
  const ids: string[] = [];
  const push = (id: string | null | undefined) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  for (const id of order.artworkFileIds || []) push(id);
  for (const line of order.productionItems || []) push(line.artworkFileId);
  return ids;
}

function GradeMark({ grade }: { grade: Grade }) {
  if (grade === "good") return <StatusChip label="Good" tone="success" icon="circle-check" />;
  if (grade === "warning") return <StatusChip label="Warning" tone="warning" icon="triangle-alert" />;
  return <StatusChip label="Problem" tone="error" icon="circle-x" />;
}

function PdfView({ fileId, filename }: { fileId: string; filename: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let gone = false;
    setFailed(false);
    void getFileDownloadUrl(fileId)
      .then((next) => {
        if (!gone) setUrl(next);
      })
      .catch(() => {
        if (!gone) setFailed(true);
      });
    return () => {
      gone = true;
    };
  }, [fileId]);

  if (failed) {
    return <p className="text-body text-text-secondary m-0">Preview unavailable. Download the file to view it.</p>;
  }
  if (!url) {
    return <div className="h-36 w-full max-w-sm animate-pulse rounded-card bg-surface-variant" aria-hidden />;
  }
  return (
    <>
      <button
        type="button"
        className="text-body text-text-primary m-0 cursor-zoom-in text-left underline decoration-outline underline-offset-4"
        onClick={() => setOpen(true)}
      >
        Open {filename}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(960px,calc(100%-2rem))] max-w-none p-4 sm:max-w-none">
          <DialogTitle>{filename}</DialogTitle>
          <DialogDescription>Pinch or scroll to look closer.</DialogDescription>
          <ZoomablePhoto alt={filename}>
            <iframe title={filename} src={url} className="pointer-events-none h-full w-full border-0" />
          </ZoomablePhoto>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function QualityReview({
  order,
  checked,
  onCheck,
  disabled,
  note,
  onNote,
  onRequestFile,
}: {
  order: Order;
  checked: Record<string, boolean>;
  onCheck: (next: Record<string, boolean>) => void;
  disabled: boolean;
  note: string;
  onNote: (value: string) => void;
  onRequestFile: () => void;
}) {
  const idKey = artworkIds(order).join("|");
  const [files, setFiles] = useState<StoredFile[] | null>(idKey ? null : []);
  const [fileFailed, setFileFailed] = useState(false);
  const place = addressFacts(order);
  const [mapStatus, setMapStatus] = useState<QaPanelStatus>(place.pin ? "loading" : "ready");
  const [tickError, setTickError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadAllFailed, setDownloadAllFailed] = useState(false);

  useEffect(() => {
    const ids = idKey ? idKey.split("|") : [];
    if (!ids.length) {
      setFiles([]);
      setFileFailed(false);
      return;
    }
    let gone = false;
    setFiles(null);
    setFileFailed(false);
    Promise.all(ids.map((id) => getFile(id)))
      .then((loaded) => {
        if (!gone) setFiles(loaded);
      })
      .catch(() => {
        if (!gone) setFileFailed(true);
      });
    return () => {
      gone = true;
    };
  }, [idKey]);

  useEffect(() => {
    setMapStatus(place.pin ? "loading" : "ready");
  }, [place.pin?.lat, place.pin?.lng]);

  const loadedFiles = files ?? [];
  const facts = fileDetailFacts(loadedFiles, order);
  const comparison = specComparison(order, loadedFiles);
  const money = quantityFacts(order);
  const warning = acceptedUploadWarning(loadedFiles);
  const problem = hasProblem(facts, comparison.rows);
  const fileStatus: QaPanelStatus = fileFailed ? "failed" : files ? "ready" : "loading";
  const panels: Record<string, QaPanelStatus> = {
    artwork: fileStatus,
    spec: fileStatus,
    quantity: "ready",
    address: mapStatus,
  };

  async function onToggle(next: Record<string, boolean>) {
    const changed = Object.keys(next).find((id) => Boolean(next[id]) !== Boolean(checked[id]));
    if (!changed) return;
    setTickError(null);
    try {
      await recordQaTick(order.id, changed, next[changed] === true);
      onCheck(next);
    } catch {
      setTickError("That check was not saved. Try again.");
    }
  }

  async function downloadAll() {
    setDownloadAllFailed(false);
    setDownloadingAll(true);
    try {
      const result = await downloadOrderArtwork(order.id, { all: true });
      for (const file of result.files) {
        await saveRemoteFile(file.url, file.filename);
      }
    } catch {
      setDownloadAllFailed(true);
    } finally {
      setDownloadingAll(false);
    }
  }

  async function tellClient(action: "message" | "hold") {
    setActionError(null);
    setActionNote(null);
    try {
      await postQaClientAction(order.id, action, note.trim());
      setActionNote(action === "hold" ? "The order is on hold. The client was told in support chat." : "Sent in the client's support chat.");
    } catch {
      setActionError("The client was not told. Try again.");
    }
  }

  const artworkPanel = (
    <div className="flex flex-col gap-3">
      <h3 className="text-body text-text-primary m-0">Artwork</h3>
      {fileStatus === "loading" ? (
        <div className="h-36 w-full max-w-sm animate-pulse rounded-card bg-surface-variant" aria-hidden />
      ) : null}
      {fileStatus === "failed" ? (
        <p className="text-body text-error m-0" role="alert">Could not load the artwork.</p>
      ) : null}
      {fileStatus === "ready" && loadedFiles.length === 0 ? (
        <p className="text-body text-text-secondary m-0">No file was uploaded with this order.</p>
      ) : null}
      {loadedFiles.map((file) => {
        const image = fileLooksLikeImage(file);
        const name = file.originalFilename || "Artwork";
        return (
          <div key={file.fileId} className="flex max-w-sm flex-col gap-2">
            {image ? (
              <SamplePhoto fileId={file.fileId} alt={name} />
            ) : (
              <PdfView fileId={file.fileId} filename={name} />
            )}
            <FileDownload
              fileId={file.fileId}
              filename={name}
              featured={false}
              resolveUrl={async () => {
                const result = await downloadOrderArtwork(order.id, { fileId: file.fileId });
                const saved = result.files[0];
                if (!saved?.url) throw new Error("download failed");
                return saved.url;
              }}
            />
          </div>
        );
      })}
      {loadedFiles.length > 1 ? (
        <div className="max-w-sm">
          <Button type="button" variant="secondary" disabled={downloadingAll || disabled} onClick={() => void downloadAll()}>
            {downloadingAll ? "Downloading…" : "Download all"}
          </Button>
          {downloadAllFailed ? (
            <p className="text-caption text-error m-0 mt-1" role="alert">Could not download these files. Try again.</p>
          ) : null}
        </div>
      ) : null}
      <h3 className="text-body text-text-primary m-0">File details</h3>
      {facts.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {facts.map((fact) => (
            <li key={fact.id} className="flex flex-wrap items-start justify-between gap-2">
              <span className="text-body text-text-secondary min-w-0 flex-1">
                <span className="text-text-muted">{fact.label}. </span>
                {fact.value}
              </span>
              <GradeMark grade={fact.grade} />
            </li>
          ))}
        </ul>
      ) : fileStatus === "ready" ? (
        <p className="text-body text-text-secondary m-0">The file did not include measurements to grade.</p>
      ) : null}
      {warning ? (
        <p className="text-body text-text-secondary m-0" role="status">
          The client accepted a warning at upload ({formatDateTime(warning.at)}): {warning.text}
        </p>
      ) : null}
    </div>
  );

  const specPanel = (
    <div className="flex flex-col gap-2">
      <h3 className="text-body text-text-primary m-0">Specifications</h3>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-outline-subtle">
            {["Item", "Ordered", "File", "Match"].map((heading) => (
              <th key={heading} scope="col" className="text-caption text-text-muted py-1.5 pr-3 [font-weight:inherit]">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.item} className="border-b border-outline-subtle align-baseline">
              <th scope="row" className="text-body text-text-secondary py-2 pr-3 [font-weight:inherit]">{row.item}</th>
              <td className="text-body text-text-secondary py-2 pr-3">{row.ordered}</td>
              <td className="text-body text-text-secondary py-2 pr-3">{row.file}</td>
              <td className="text-body text-text-primary py-2">{row.match}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {comparison.instructions ? (
        <p className="text-body text-text-secondary m-0 whitespace-pre-wrap">
          <span className="text-text-muted">Special instructions. </span>
          {comparison.instructions}
        </p>
      ) : (
        <p className="text-caption text-text-muted m-0">No special instructions on this order.</p>
      )}
    </div>
  );

  const quantityPanel = (
    <div className="flex flex-col gap-2">
      <h3 className="text-body text-text-primary m-0">Quantity</h3>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {(
          [
            ["Quantity", money.quantity],
            ["Unit price", money.unitPrice],
            ["Total", money.total],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-caption text-text-muted">{label}</dt>
            <dd className="text-body text-text-secondary m-0 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  const addressPanel = (
    <div className="flex flex-col gap-2">
      <h3 className="text-body text-text-primary m-0">Delivery</h3>
      <p className="text-body text-text-secondary m-0">{place.address}</p>
      {place.zone ? <p className="text-body text-text-secondary m-0">Zone {place.zone}</p> : null}
      {place.distance ? <p className="text-body text-text-secondary m-0">{place.distance}</p> : null}
      {place.landmark ? (
        <p className="text-body text-text-secondary m-0">Landmark: {place.landmark}</p>
      ) : null}
      {place.pinStatus ? <p className="text-body text-text-secondary m-0">{place.pinStatus}</p> : null}
      {place.warning ? (
        <p className="text-body text-warning m-0" role="status">{place.warning}</p>
      ) : null}
      {place.pin ? (
        <PinMap
          point={place.pin}
          label={place.pin.label || "Delivery pin"}
          onReady={() => setMapStatus("ready")}
          onFailed={() => setMapStatus("failed")}
        />
      ) : (
        <p className="text-body text-text-secondary m-0">No delivery pin on this order.</p>
      )}
      {mapStatus === "failed" ? (
        <p className="text-body text-error m-0" role="alert">Could not load the map.</p>
      ) : null}
    </div>
  );

  const before = (check: { id: string }) => {
    if (check.id === "artwork") return artworkPanel;
    if (check.id === "spec") return specPanel;
    if (check.id === "quantity") return quantityPanel;
    if (check.id === "address") return addressPanel;
    return null;
  };

  return (
    <div className="flex flex-col gap-3">
      {order.qaHold ? (
        <p className="text-body text-text-secondary m-0" role="status">
          On hold since {formatDateTime(order.qaHold.at)}. {order.qaHold.reason}
        </p>
      ) : null}
      <QaChecklistFields
        order={order}
        checked={checked}
        onCheck={(next) => void onToggle(next)}
        disabled={disabled}
        panels={panels}
        before={before}
      />
      {tickError ? <p className="text-body text-error m-0" role="alert">{tickError}</p> : null}
      <Textarea
        value={note}
        onChange={(event) => onNote(event.target.value)}
        placeholder="What the client needs to change, or why this is being cancelled"
        rows={2}
        aria-label="Note to the client"
      />
      {problem ? (
        <div className="flex flex-col gap-2">
          <p className="text-body text-text-secondary m-0">
            Something on this file is a problem. The client is told.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={disabled || !note.trim()} onClick={onRequestFile}>
              Ask for a new file
            </Button>
            <Button type="button" variant="secondary" disabled={disabled || !note.trim()} onClick={() => void tellClient("message")}>
              Message the client
            </Button>
            <Button type="button" variant="secondary" disabled={disabled || !note.trim()} onClick={() => void tellClient("hold")}>
              Hold the order
            </Button>
          </div>
          {actionNote ? <p className="text-body text-text-secondary m-0" role="status">{actionNote}</p> : null}
          {actionError ? <p className="text-body text-error m-0" role="alert">{actionError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
