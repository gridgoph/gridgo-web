"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CircleCheck, Download, Printer, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonDetail } from "@/components/ui/loading";
import { markExpressReady } from "@/app/supplier/_components/express/express-actions";
import {
  ApiError,
  getFile,
  getFileDownloadUrl,
  getOrder,
  recordShopFileAccess,
} from "@/lib/api/client";
import type { Order, StoredFile } from "@/lib/api/types";
import { supplierWebDeviceId } from "@/lib/device-id";
import { jobFileEvidence } from "@/lib/evidence";
import { rememberDownload } from "@/lib/express-downloads";
import {
  GRIDGO_DELETES_NOTE,
  IF_YOU_DOWNLOAD_NOTE,
  PRINT_HERE_NOTE,
  expressStage,
  expressView,
  fileAccessJobId,
  isExpressDocumentOrder,
  printChips,
  viewerBlobType,
  viewerKind,
  type ExpressPrint,
} from "@/lib/express-shop";
import { fetchRemoteBlob, saveBlob } from "@/lib/file-save";
import { orderReference } from "@/lib/order-reference";
import { useShortcut } from "@/lib/use-shortcut";
import { cn } from "@/lib/utils";

type JobFile = { fileId: string; label: string; print: ExpressPrint | null };

/** Every client file on the job: Express print settings first, else the line artwork. */
function jobFiles(order: Order): JobFile[] {
  const view = expressView(order);
  if (view && view.prints.some((print) => print.fileId)) {
    return view.prints
      .filter((print): print is ExpressPrint & { fileId: string } => Boolean(print.fileId))
      .map((print, index) => ({ fileId: print.fileId, label: `File ${index + 1}`, print }));
  }
  return jobFileEvidence(order).artwork.map((item) => ({
    fileId: item.fileId,
    label: item.label,
    print: null,
  }));
}

type Loaded = {
  fileId: string;
  meta: StoredFile | null;
  blob: Blob | null;
  url: string | null;
  failed: boolean;
};

/**
 * Open files (gridgoph/gridgo-web#327): the client's file in the browser, with
 * Print as the main action and the print settings beside it. Printing from
 * here saves nothing on the PC; Download is the smaller second choice, and
 * GRIDGO remembers it so the shop is reminded to delete it after the job.
 * Word and other files a browser cannot show offer Download only.
 */
export default function SupplierJobFilesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [readyBusy, setReadyBusy] = useState(false);
  const [readyError, setReadyError] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  const loadOrder = useCallback(async () => {
    try {
      setOrder(await getOrder(orderId));
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This job is not yours any more. It may have gone to another shop."
          : "Could not load this job. Check this PC's connection and try again.",
      );
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const files = useMemo(() => (order ? jobFiles(order) : []), [order]);
  const current = files[Math.min(selected, Math.max(0, files.length - 1))] ?? null;
  const currentId = current?.fileId ?? null;
  const deviceId = useMemo(() => (typeof window === "undefined" ? "" : supplierWebDeviceId()), []);

  // Read the selected file into this page: metadata, then the bytes as a blob
  // on this origin, so the browser can show and print it without saving it.
  useEffect(() => {
    if (!currentId || !order) return;
    let live = true;
    let objectUrl: string | null = null;
    setLoaded({ fileId: currentId, meta: null, blob: null, url: null, failed: false });
    void (async () => {
      try {
        const meta = await getFile(currentId);
        const kind = viewerKind(meta.detectedContentType);
        const safeType = viewerBlobType(kind, meta.detectedContentType);
        if (kind === "download_only" || !safeType) {
          if (live) setLoaded({ fileId: currentId, meta, blob: null, url: null, failed: false });
          return;
        }
        const signed = await getFileDownloadUrl(currentId, { deviceId });
        const raw = await fetchRemoteBlob(signed);
        // Re-typed so the browser only ever renders it as a PDF or a picture.
        const blob = new Blob([raw], { type: safeType });
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ fileId: currentId, meta, blob, url: objectUrl, failed: false });
        void recordShopFileAccess(order.id, currentId, {
          jobId: fileAccessJobId(order, currentId),
          action: "opened",
          deviceId,
        }).catch(() => undefined);
      } catch {
        if (live) setLoaded({ fileId: currentId, meta: null, blob: null, url: null, failed: true });
      }
    })();
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // The order object changes on every reload; the file id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, order?.id, deviceId, attempt]);

  const kind = loaded?.meta ? viewerKind(loaded.meta.detectedContentType) : null;
  const canPrint = Boolean(loaded?.url) && kind !== "download_only";

  function print() {
    const win = frame.current?.contentWindow;
    if (!win || !canPrint) return;
    win.focus();
    win.print();
  }

  // Ctrl+P / Cmd+P prints the file, not this page around it. The listener is
  // added once, on mount, and reads the current print action from a ref set at
  // commit: re-adding it in an effect after every render left a moment, right
  // after the file appeared, when Ctrl+P printed the whole page instead.
  const printRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    printRef.current = canPrint ? print : null;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const printFile = printRef.current;
      if (printFile && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        printFile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function download() {
    if (!order || !current) return;
    setSaving(true);
    setNote(null);
    try {
      const name = loaded?.meta?.originalFilename || `${current.label}`;
      const blob =
        loaded?.fileId === current.fileId && loaded.blob
          ? loaded.blob
          : await fetchRemoteBlob(await getFileDownloadUrl(current.fileId, { deviceId }));
      saveBlob(blob, name);
      rememberDownload(order.id, current.fileId);
      const recorded = await recordShopFileAccess(order.id, current.fileId, {
        jobId: fileAccessJobId(order, current.fileId),
        action: "downloaded",
        deviceId,
      }).catch(() => null);
      if (recorded) setOrder((prev) => (prev ? { ...prev, fileAccesses: recorded } : prev));
      setNote(`Saved ${name}. Delete it after the job; we'll remind you when you hand it over.`);
    } catch {
      setNote("The file did not download. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const working = order ? expressStage(order) === "working" : false;

  async function ready() {
    if (!order || readyBusy) return;
    setReadyBusy(true);
    setReadyError(null);
    const result = await markExpressReady(order);
    setReadyBusy(false);
    if (result.kind === "ready") {
      router.push("/supplier/dashboard");
      return;
    }
    setReadyError(result.message);
    void loadOrder();
  }
  useShortcut("r", () => void ready(), working);

  if (error && !order) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => router.push("/supplier/dashboard")}>
            Back to To do
          </Button>
        }
      />
    );
  }
  if (!order) return <SkeletonDetail label="Opening the client's files" panels={2} />;

  const reference = orderReference(order.id);
  const filename = loaded?.meta?.originalFilename ?? current?.label ?? "No file";
  const chips = current?.print ? printChips(current.print) : [];
  const clientNote = current?.print?.note || null;
  const pages = current?.print?.pages;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-caption text-text-muted m-0">
            {[reference ? `#${reference}` : null, isExpressDocumentOrder(order) ? "Express" : null]
              .filter(Boolean)
              .join(" · ")}
            {" · "}
            <Link href={`/supplier/jobs/${encodeURIComponent(order.id)}`} className="underline">
              Job details
            </Link>
          </p>
          <h2 className="text-h2 text-text-primary m-0 break-all">
            {filename}{" "}
            <span className="text-body text-text-muted whitespace-nowrap">
              {files.length > 1 ? `${selected + 1} of ${files.length} files` : null}
              {files.length > 1 && pages ? " · " : null}
              {pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : null}
            </span>
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {kind === "download_only" ? (
            <Button variant="primary" size="lg" disabled={saving} onClick={() => void download()}>
              <Download data-icon="inline-start" aria-hidden />
              {saving ? "Downloading…" : "Download to print"}
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                size="lg"
                disabled={!canPrint}
                aria-keyshortcuts="Control+P"
                onClick={print}
              >
                <Printer data-icon="inline-start" aria-hidden />
                Print
                <span className="text-caption hidden md:inline">· Ctrl+P</span>
              </Button>
              <Button variant="outline" disabled={saving || !current} onClick={() => void download()}>
                <Download data-icon="inline-start" aria-hidden />
                {saving ? "Downloading…" : "Download"}
              </Button>
            </>
          )}
        </div>
      </header>

      {files.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a file">
          {files.map((file, index) => (
            <Button
              key={file.fileId}
              variant={index === selected ? "default" : "outline"}
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
            >
              {file.label}
            </Button>
          ))}
        </div>
      ) : null}

      {chips.length || clientNote ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Print settings">
          {chips.map((chip) => (
            <li key={chip} className="gg-chip border-outline">
              <span className="text-caption text-text-primary">{chip}</span>
            </li>
          ))}
          {clientNote ? (
            <li className="gg-chip border-outline">
              <span className="text-caption text-text-primary">&ldquo;{clientNote}&rdquo;</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {note ? (
        <p className="text-body text-text-secondary m-0" role="status">
          {note}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div
          className={cn(
            "bg-surface-variant border-outline flex min-h-[60dvh] items-center justify-center overflow-hidden rounded-card border",
            "lg:h-[calc(100dvh-15rem)]",
          )}
        >
          {!current ? (
            <p className="text-body text-text-secondary m-0 p-6 text-center">
              This job has no client file to open.
            </p>
          ) : loaded?.failed ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <p className="text-body text-text-primary m-0">The file did not open.</p>
              <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                Try again
              </Button>
            </div>
          ) : kind === "download_only" ? (
            <p className="text-body text-text-secondary m-0 max-w-prose p-6 text-center">
              This browser cannot show this kind of file, so it cannot print it from here.
              Download it, print it, then delete it after the job.
            </p>
          ) : loaded?.url ? (
            <iframe
              ref={frame}
              key={loaded.url}
              src={loaded.url}
              title={`Client file ${filename}`}
              className="h-full min-h-[60dvh] w-full border-0 bg-white"
            />
          ) : (
            <p className="text-body text-text-muted m-0" role="status">
              Opening the file…
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-3" aria-label="About printing">
          <section className="border-outline rounded-card flex flex-col gap-1 border p-3">
            <h3
              className="text-body m-0 flex items-center gap-2"
              style={{ color: "var(--color-success)", fontFamily: "var(--font-bold)" }}
            >
              <CircleCheck className="size-4" aria-hidden />
              Best: print from here
            </h3>
            <p className="text-body text-text-secondary m-0">{PRINT_HERE_NOTE}</p>
          </section>
          <section className="border-outline rounded-card flex flex-col gap-1 border p-3">
            <h3
              className="text-body text-text-primary m-0 flex items-center gap-2"
              style={{ fontFamily: "var(--font-bold)" }}
            >
              <Trash2 className="size-4" aria-hidden />
              If you download it
            </h3>
            <p className="text-body text-text-secondary m-0">{IF_YOU_DOWNLOAD_NOTE}</p>
          </section>
          <p className="text-caption text-text-muted m-0">{GRIDGO_DELETES_NOTE}</p>
          {working ? (
            <div className="mt-auto flex flex-col gap-2">
              <Button
                variant="default"
                className="h-16 w-full"
                disabled={readyBusy}
                aria-keyshortcuts="R"
                onClick={() => void ready()}
              >
                <span className="flex flex-col items-center leading-tight">
                  <span className="text-body-lg" style={{ fontFamily: "var(--font-bold)" }}>
                    {readyBusy ? "Marking ready…" : "It's ready"}
                  </span>
                  <span className="text-caption">
                    Andam na<span className="hidden md:inline"> · or press R</span>
                  </span>
                </span>
              </Button>
              {readyError ? (
                <p className="text-body text-error m-0" role="alert">
                  {readyError}
                </p>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
