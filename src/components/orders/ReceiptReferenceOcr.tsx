/**
 * Read the wallet reference off a payment-receipt screenshot and put it next
 * to the Client reference Operations already has.
 *
 * A successful read fills the number when the client sent none, or suggests
 * it when the printed number differs. OCR never confirms a payment.
 */

"use client";

import { useEffect, useState } from "react";

import { getFileDownloadUrl } from "@/lib/api/client";
import {
  OCR_IDLE,
  referenceFromOcr,
  stripReferenceToken,
  type ReceiptOcrState,
} from "@/lib/receiptOcr";
import { recognizeReceiptFromUrl } from "@/lib/receiptOcrRecognize";

type Props = {
  fileId: string;
  submittedReference?: string | null;
};

export function ReceiptReferenceOcr({ fileId, submittedReference }: Props) {
  const [ocr, setOcr] = useState<ReceiptOcrState>(OCR_IDLE);

  useEffect(() => {
    let cancelled = false;
    setOcr({ status: "reading", reference: null });
    void (async () => {
      try {
        const url = await getFileDownloadUrl(fileId);
        if (cancelled) return;
        const raw = await recognizeReceiptFromUrl(url, () => !cancelled);
        if (cancelled) return;
        const reference = referenceFromOcr(raw);
        setOcr(
          reference
            ? { status: "filled", reference }
            : { status: "unreadable", reference: null },
        );
      } catch {
        if (!cancelled) setOcr({ status: "unreadable", reference: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const submitted = submittedReference?.trim() || null;
  const read = ocr.status === "filled" ? ocr.reference : null;
  const display = submitted ?? read;
  const matches = Boolean(
    submitted && read && stripReferenceToken(submitted) === stripReferenceToken(read),
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-x-2">
        <dt className="text-caption text-text-muted m-0">Client reference</dt>
        <dd className="text-caption text-text-primary m-0 font-mono break-all">
          {display ?? "—"}
        </dd>
      </div>
      {ocr.status === "reading" ? (
        <p className="text-caption text-text-muted m-0" role="status">
          Reading the reference from the receipt…
        </p>
      ) : null}
      {matches ? (
        <p className="text-caption text-text-secondary m-0" role="status">
          Receipt reads the same number.
        </p>
      ) : null}
      {read && !submitted ? (
        <p className="text-caption text-text-secondary m-0" role="status">
          Read from the receipt.
        </p>
      ) : null}
      {read && submitted && !matches ? (
        <p className="text-caption text-text-secondary m-0" role="status">
          Receipt suggests{" "}
          <span className="text-text-primary font-mono break-all">{read}</span>
          {" — "}
          different from what the client sent.
        </p>
      ) : null}
      {ocr.status === "unreadable" ? (
        <p className="text-caption text-text-secondary m-0" role="status">
          The number could not be read. Check the picture.
        </p>
      ) : null}
    </div>
  );
}
