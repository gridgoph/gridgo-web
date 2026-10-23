/**
 * The shop's own legal documents and privacy requests.
 * `GET /legal/documents?audience=supplier`, `GET /legal/versions/:id`,
 * `GET /me/legal/pending`, `POST /me/legal/accept`, `GET/POST /me/privacy-requests`.
 * Staff routes under `/admin/legal` and `/admin/privacy-requests` are not used.
 */

import { apiRequest as shopRequest } from "@/lib/api/client";
import type { LegalPending, LegalVersion, PrivacyRequest } from "@/lib/supplier-legal";

export function listSupplierLegalDocuments(): Promise<{ documents: LegalVersion[] }> {
  return shopRequest("/legal/documents?audience=supplier");
}

export function getSupplierLegalVersion(
  versionId: string,
): Promise<{ document: LegalVersion }> {
  return shopRequest(`/legal/versions/${encodeURIComponent(versionId)}`);
}

export function getSupplierLegalPdf(
  versionId: string,
): Promise<{ url: string; expiresAt?: string }> {
  return shopRequest(`/legal/versions/${encodeURIComponent(versionId)}/pdf`);
}

export function getSupplierLegalPending(): Promise<LegalPending> {
  return shopRequest("/me/legal/pending");
}

export function acceptSupplierLegal(
  versionIds: string[],
  context: { app: string; device: string },
): Promise<LegalPending> {
  return shopRequest("/me/legal/accept", {
    method: "POST",
    body: JSON.stringify({
      accepted: true,
      versionIds,
      method: "blocking_screen",
      app: context.app,
      device: context.device,
    }),
  });
}

export function listMyPrivacyRequests(
  offset = 0,
): Promise<{ requests: PrivacyRequest[]; nextOffset?: number | null }> {
  return shopRequest(`/me/privacy-requests?offset=${offset}`);
}

export function createMyPrivacyRequest(
  kind: "access" | "correction" | "deletion",
  details?: string,
): Promise<{ request: PrivacyRequest }> {
  const trimmed = details?.trim();
  return shopRequest("/me/privacy-requests", {
    method: "POST",
    body: JSON.stringify({
      kind,
      confirmed: true,
      ...(trimmed ? { details: trimmed } : {}),
    }),
  });
}
