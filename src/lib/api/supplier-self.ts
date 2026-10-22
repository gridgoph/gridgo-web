/**
 * The shop's own legal documents and privacy requests.
 * `GET /legal/documents?audience=supplier`, `GET /legal/versions/:id`,
 * `GET /me/legal/pending`, `POST /me/legal/accept`, `GET/POST /me/privacy-requests`.
 * Staff routes under `/admin/legal` and `/admin/privacy-requests` are not used.
 */

import { withRequestDeadline } from "@/lib/api/requestDeadline";
import { ApiError, getApiBase, getAuthToken, getWorkspaceRole } from "@/lib/api/client";
import type { LegalPending, LegalVersion, PrivacyRequest } from "@/lib/supplier-legal";

async function shopRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return withRequestDeadline(init.signal, async (signal) => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    signal.throwIfAborted();
    const token = await getAuthToken();
    signal.throwIfAborted();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      const role = getWorkspaceRole();
      if (role) headers["X-GRIDGO-Role"] = role;
    }
    const res = await fetch(`${getApiBase()}${path}`, { ...init, headers, signal });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data as T;
  });
}

export function listSupplierLegalDocuments(): Promise<{ documents: LegalVersion[] }> {
  return shopRequest("/legal/documents?audience=supplier");
}

export function getSupplierLegalVersion(versionId: string): Promise<{ document: LegalVersion }> {
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

export function acceptSupplierLegal(versionIds: string[], context: { app: string; device: string }): Promise<LegalPending> {
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

export function listMyPrivacyRequests(): Promise<{ requests: PrivacyRequest[] }> {
  return shopRequest("/me/privacy-requests");
}

export function createMyPrivacyRequest(
  kind: "access" | "correction" | "deletion",
  details?: string,
): Promise<{ request: PrivacyRequest }> {
  const trimmed = details?.trim();
  return shopRequest("/me/privacy-requests", {
    method: "POST",
    body: JSON.stringify({ kind, confirmed: true, ...(trimmed ? { details: trimmed } : {}) }),
  });
}
