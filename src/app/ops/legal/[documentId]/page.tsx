"use client";

import { useParams } from "next/navigation";

import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

export default function OpsLegalDocumentPage() {
  const params = useParams<{ documentId: string }>();
  return <LegalDocumentView tree="ops" canEdit={false} documentId={decodeURIComponent(params.documentId)} />;
}
