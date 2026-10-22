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
  const versionId = decodeURIComponent(params.versionId);
  const [document, setDocument] = useState<LegalVersion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSupplierLegalVersion(versionId)
      .then((answer) => {
        if (!cancelled) setDocument(answer.document);
      })
      .catch(() => {
        if (!cancelled) setError("This document did not load.");
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

  if (!document && !error) return <SkeletonCards count={1} lines={4} label="Loading the document" />;
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
      <pre className="text-body text-text-primary m-0 whitespace-pre-wrap font-sans">{document.text}</pre>
      <Button type="button" variant="outline" onClick={() => void openPdf()}>
        Open PDF
      </Button>
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
