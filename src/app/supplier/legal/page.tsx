"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SkeletonCards } from "@/components/ui/loading";
import { ApiError } from "@/lib/api/client";
import { listSupplierLegalDocuments } from "@/lib/api/supplier-self";
import { libraryOrder, type LegalVersion } from "@/lib/supplier-legal";

export default function SupplierLegalPage() {
  const [documents, setDocuments] = useState<LegalVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listSupplierLegalDocuments()
      .then((answer) => {
        if (!cancelled) setDocuments(libraryOrder(answer.documents ?? []));
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(
          caught instanceof ApiError && (caught.status === 404 || caught.status === 405)
            ? "GRIDGO is not showing legal documents to shops on this connection yet."
            : "Legal documents did not load.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!documents && !error) return <SkeletonCards count={2} lines={2} label="Loading legal documents" />;
  if (error) {
    return (
      <p className="text-body text-text-primary m-0" role="alert">
        {error}
      </p>
    );
  }

  return (
    <div className="flex max-w-prose flex-col gap-4">
      <h2 className="text-h2 text-text-primary m-0">Legal & privacy</h2>
      <p className="text-body text-text-secondary m-0">The documents published for shops. Open one to read it or its PDF.</p>
      {documents?.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link href={`/supplier/legal/${doc.id}`} className="text-body text-text-primary underline">
                {doc.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-text-secondary m-0">No published documents yet.</p>
      )}
      <Button type="button" variant="outline" onClick={() => window.location.assign("/supplier/legal/review")}>
        Agreements waiting
      </Button>
    </div>
  );
}
