"use client";

import { useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getFile } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { jobEarningsMinor } from "@/app/supplier/_lib/dashboard";
import { downloadedFileIds } from "@/lib/express-shop";
import { acknowledgeDeleted, deletedAcknowledged, localDownloads } from "@/lib/express-downloads";
import { formatClock, formatPhp } from "@/lib/format";

/**
 * After the hand-over: a thank-you, what the job adds to the shop's earnings
 * (Owner only), and, only when a client file was downloaded, a reminder to
 * delete it. Opening a file in the browser saves nothing, so it never asks.
 */
export function ExpressDonePanel({
  order,
  open,
  showMoney,
  onClose,
}: {
  order: Order | null;
  open: boolean;
  showMoney: boolean;
  onClose: () => void;
}) {
  const orderId = order?.id ?? "";
  const [names, setNames] = useState<Record<string, string>>({});
  const fileIds =
    order && !deletedAcknowledged(orderId)
      ? downloadedFileIds(order, localDownloads(orderId))
      : [];
  const lastDownload = (order?.fileAccesses ?? [])
    .filter((row) => row.action === "downloaded")
    .map((row) => row.lastAt)
    .sort()
    .at(-1);
  const key = fileIds.join("|");

  useEffect(() => {
    if (!open || !key) return;
    let live = true;
    void Promise.all(
      key.split("|").map((id) =>
        getFile(id)
          .then((file) => [id, file.originalFilename] as const)
          .catch(() => [id, ""] as const),
      ),
    ).then((rows) => {
      if (live) setNames(Object.fromEntries(rows.filter(([, name]) => name)));
    });
    return () => {
      live = false;
    };
  }, [open, key]);

  const earned = order && showMoney ? jobEarningsMinor(order) : 0;
  const fileWords = fileIds.map((id, index) => names[id] || `File ${index + 1}`);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="items-center gap-3 px-4 pt-12 pb-4 text-center">
          <span
            className="flex size-20 items-center justify-center rounded-full border-2"
            style={{ borderColor: "var(--color-success)", color: "var(--color-success)" }}
            aria-hidden
          >
            <Check className="size-10" strokeWidth={2.5} />
          </span>
          <SheetTitle>
            <span className="text-h1 text-text-primary">Handed over. Salamat po!</span>
          </SheetTitle>
          <SheetDescription>
            {earned > 0
              ? `${formatPhp(earned)} is added to your earnings.`
              : "The job is done. The client has it."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          {fileIds.length ? (
            <section
              aria-labelledby="delete-files-heading"
              className="gg-card flex flex-col gap-3 p-4"
            >
              <h3
                id="delete-files-heading"
                className="text-body text-text-primary m-0 flex items-center gap-2"
                style={{ fontFamily: "var(--font-bold)" }}
              >
                <Trash2 className="size-4" aria-hidden />
                Last step: delete the client&rsquo;s files
              </h3>
              <p className="text-body text-text-secondary m-0">
                You downloaded{" "}
                {fileWords.map((name, index) => (
                  <span key={`${name}-${index}`}>
                    {index > 0 ? (index === fileWords.length - 1 ? " and " : ", ") : null}
                    <span className="text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
                      {name}
                    </span>
                  </span>
                ))}
                {lastDownload ? ` at ${formatClock(lastDownload)}` : ""}. Delete{" "}
                {fileIds.length === 1 ? "it" : "them"} from Downloads and empty the Recycle Bin.
                It protects the client&rsquo;s privacy.
              </p>
              <Button
                variant="default"
                size="lg"
                className="w-full"
                onClick={() => {
                  acknowledgeDeleted(orderId);
                  onClose();
                }}
              >
                <Check data-icon="inline-start" aria-hidden />
                I deleted {fileIds.length === 1 ? "it" : "them"}
              </Button>
            </section>
          ) : (
            <Button variant="default" size="lg" className="w-full" onClick={onClose}>
              Back to To do
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
