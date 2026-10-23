"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SkeletonCards } from "@/components/ui/loading";
import { getSupplierLegalPdf, getSupplierLegalVersion } from "@/lib/api/supplier-self";
import type { LegalVersion } from "@/lib/supplier-legal";

export default function SupplierLegalDocumentPage() {
  const params = useParams<{ versionId: string }>();
  const versionId = params.versionId;
  const [read, setRead] = useState<{
    id: string;
    document: LegalVersion | null;
    error: string | null;
  } | null>(null);
  const current = read?.id === versionId ? read : null;
  const document = current?.document ?? null;
  const error = current?.error ?? null;
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPdfError(null);
    void getSupplierLegalVersion(versionId)
      .then((answer) => {
        if (!cancelled)
          setRead({ id: versionId, document: answer.document, error: null });
      })
      .catch(() => {
        if (!cancelled)
          setRead({
            id: versionId,
            document: null,
            error: "This document did not load.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  async function openPdf() {
    setPdfError(null);
    try {
      const pdf = await getSupplierLegalPdf(versionId);
      window.open(pdf.url, "_blank", "noopener,noreferrer");
    } catch {
      setPdfError("The PDF did not open.");
    }
  }

  if (!document && !error)
    return <SkeletonCards count={1} lines={4} label="Loading the document" />;
  if (error || !document) {
    return (
      <p className="text-body text-text-primary m-0" role="alert">
        {error ?? "This document did not load."}
      </p>
    );
  }

  return (
    <article className="flex max-w-prose flex-col gap-4">
      <h2 className="text-h2 text-text-primary m-0">{document.title}</h2>
      <pre className="text-body text-text-primary m-0 whitespace-pre-wrap font-sans">
        {document.text}
      </pre>
      {document.pdfUrl || document.pdfFileId ? (
        <Button type="button" variant="outline" onClick={() => void openPdf()}>
          Open PDF
        </Button>
      ) : null}
      {pdfError ? (
        <p className="text-body text-error m-0" role="alert">
          {pdfError}
        </p>
      ) : null}
      <Link href="/supplier/legal" className="text-body text-text-primary underline">
        All documents
      </Link>
    </article>
  );
}
