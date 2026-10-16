"use client";

import { useParams } from "next/navigation";

import { LegalDocumentHistory } from "@/app/admin/legal/_components/LegalDocumentHistory";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

export default function AdminLegalDocumentPage() {
  const params = useParams<{ documentId: string }>();
  const documentId = decodeURIComponent(params.documentId);
  return (
    <LegalDocumentView
      tree="admin"
      canEdit
      documentId={documentId}
      history={<LegalDocumentHistory documentId={documentId} />}
    />
  );
}
