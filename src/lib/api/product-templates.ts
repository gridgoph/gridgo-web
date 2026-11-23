/**
 * Product templates (gridgo-supplier#268; gridgo-api PR 435, contract
 * `docs/PRODUCT_TEMPLATES_API.md`). Only the calls that PR lists: the shop's
 * three-step flow, setup requests, and the GRIDGO team's catalogue editor,
 * request inbox, prepared products, request resolution and migration.
 *
 * An API without these routes answers 404/405; `isTemplatesAbsent` tells a
 * screen to hide its entry points and keep today's builder. A 404 that names a
 * code (`catalog_item_not_found`, `product_template_not_found`) is the API
 * refusing, not a missing route.
 */

import { ApiError, apiRequest } from "@/lib/api/client";
import type { StoredFile } from "@/lib/api/types";

export function isTemplatesAbsent(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 405) return true;
  return error.status === 404 && (!error.code || error.code === "not_found");
}

/* ---------------------------------------------------------------- shop --- */

export type TemplateCatalogueQuery = { q?: string; group?: string; machines?: string[] };

function catalogueSearch(query: TemplateCatalogueQuery): string {
  const params = new URLSearchParams();
  const q = (query.q ?? "").trim();
  if (q) params.set("q", q.slice(0, 120));
  if (query.group) params.set("group", query.group);
  if (query.machines?.length) params.set("machines", query.machines.join(","));
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** `{templates, readyTimes, checkYourProducts}` for the signed-in shop. */
export async function listMyProductTemplates(
  query: TemplateCatalogueQuery = {},
): Promise<unknown> {
  return apiRequest<unknown>(`/me/product-templates${catalogueSearch(query)}`);
}

/** Client view and ready-by example for a table not saved yet. Saves nothing. */
export async function previewTemplateProduct(
  body: Record<string, unknown>,
): Promise<unknown> {
  return apiRequest<unknown>("/me/template-products/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** `201 {item}`; `409 template_already_added` means edit the existing one. */
export async function createTemplateProduct(
  body: Record<string, unknown>,
): Promise<unknown> {
  return apiRequest<unknown>("/me/template-products", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** `{item, prices}`. */
export async function getTemplateProduct(itemId: string): Promise<unknown> {
  return apiRequest<unknown>(`/me/template-products/${encodeURIComponent(itemId)}`);
}

/** Replaces the whole table; on a GRIDGO-prepared product this also confirms it. */
export async function updateTemplateProduct(
  itemId: string,
  expectedVersion: number,
  body: Record<string, unknown>,
): Promise<unknown> {
  return apiRequest<unknown>(`/me/template-products/${encodeURIComponent(itemId)}`, {
    method: "PUT",
    body: JSON.stringify({ ...body, expectedVersion }),
  });
}

/** Ready-by example for a saved product under another chip. */
export async function templateReadyPreview(
  itemId: string,
  readyTime: string,
): Promise<unknown> {
  return apiRequest<unknown>(
    `/me/template-products/${encodeURIComponent(itemId)}/ready-preview`,
    { method: "POST", body: JSON.stringify({ readyTime }) },
  );
}

/** Confirm GRIDGO-prepared prices. Queues the price check; does not approve. */
export async function confirmTemplateProduct(
  itemId: string,
  expectedVersion: number,
): Promise<unknown> {
  return apiRequest<unknown>(
    `/me/template-products/${encodeURIComponent(itemId)}/confirm`,
    {
      method: "POST",
      body: JSON.stringify({ expectedVersion }),
    },
  );
}

export type SetupRequestBody =
  | { kind: "template"; requestedName: string; message: string }
  | { kind: "setup"; message?: string; fileIds?: string[] };

export async function createProductSetupRequest(
  body: SetupRequestBody,
): Promise<unknown> {
  return apiRequest<unknown>("/me/product-setup-requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listMyProductSetupRequests(status?: string): Promise<unknown> {
  const search = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiRequest<unknown>(`/me/product-setup-requests${search}`);
}

/**
 * A price-list photo, PDF or voice note for "Let GRIDGO set it up". 20 MiB;
 * the shop and the GRIDGO team read it back through `/files/:id`.
 */
export async function uploadProductSetupFile(file: File): Promise<StoredFile> {
  const body = new FormData();
  body.append("purpose", "product_setup");
  body.append("file", file);
  const uploaded = await apiRequest<{ file: StoredFile }>("/files", {
    method: "POST",
    body,
  });
  return uploaded.file;
}

/* -------------------------------------------------------- GRIDGO team --- */

/** Every template, retired ones included. */
export async function listStaffProductTemplates(
  query: { q?: string; group?: string } = {},
): Promise<unknown> {
  return apiRequest<unknown>(`/ops/product-templates${catalogueSearch(query)}`);
}

/** Full definition. `expectedVersion` is omitted only for a new id. */
export async function saveProductTemplate(
  templateId: string,
  template: Record<string, unknown>,
  expectedVersion: number | null,
): Promise<unknown> {
  return apiRequest<unknown>(`/ops/product-templates/${encodeURIComponent(templateId)}`, {
    method: "PUT",
    body: JSON.stringify(
      expectedVersion == null ? { template } : { expectedVersion, template },
    ),
  });
}

/** Close pending product-type requests (A3 and the like) against this template. */
export async function resolveRequestsWithTemplate(
  templateId: string,
  requests: { id: string; expectedVersion: number }[],
): Promise<unknown> {
  return apiRequest<unknown>(
    `/ops/product-templates/${encodeURIComponent(templateId)}/resolve-requests`,
    { method: "POST", body: JSON.stringify({ requests }) },
  );
}

export async function listStaffProductSetupRequests(status?: string): Promise<unknown> {
  const search = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiRequest<unknown>(`/ops/product-setup-requests${search}`);
}

export type SetupRequestDecision = {
  status: "completed" | "needs_revision";
  reason: string;
  templateId?: string;
};

export async function decideProductSetupRequest(
  requestId: string,
  expectedVersion: number,
  decision: SetupRequestDecision,
): Promise<unknown> {
  return apiRequest<unknown>(
    `/ops/product-setup-requests/${encodeURIComponent(requestId)}/decision`,
    { method: "POST", body: JSON.stringify({ expectedVersion, ...decision }) },
  );
}

/** Prepare a product for a shop. It stays hidden until the shop confirms. */
export async function prepareShopTemplateProduct(
  supplierId: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return apiRequest<unknown>(
    `/ops/shops/${encodeURIComponent(supplierId)}/template-products`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

/** Revise a prepared product. Asks the shop for a fresh confirmation. */
export async function reviseShopTemplateProduct(
  supplierId: string,
  itemId: string,
  expectedVersion: number,
  body: Record<string, unknown>,
): Promise<unknown> {
  return apiRequest<unknown>(
    `/ops/shops/${encodeURIComponent(supplierId)}/template-products/${encodeURIComponent(itemId)}`,
    { method: "PUT", body: JSON.stringify({ ...body, expectedVersion }) },
  );
}

export type MigrationChoices = {
  templateMatches?: Record<string, string>;
  mergeGroups?: {
    keepId: string;
    sourceIds: string[];
    labels?: Record<string, string>;
  }[];
};

/** Read-only preview. Never changes a product. */
export async function previewShopMigration(
  supplierId: string,
  choices: MigrationChoices = {},
): Promise<unknown> {
  return apiRequest<unknown>(
    `/ops/shops/${encodeURIComponent(supplierId)}/template-migration`,
    {
      method: "POST",
      body: JSON.stringify({ ...choices, dryRun: true }),
    },
  );
}

/**
 * Apply the previewed plan. Needs the version of every product the preview
 * would change; a stale one is `409 catalog_item_stale`. Products with open
 * orders are never changed, and there is no override.
 */
export async function applyShopMigration(
  supplierId: string,
  choices: MigrationChoices,
  expectedVersions: Record<string, number>,
): Promise<unknown> {
  return apiRequest<unknown>(
    `/ops/shops/${encodeURIComponent(supplierId)}/template-migration`,
    {
      method: "POST",
      body: JSON.stringify({ ...choices, dryRun: false, expectedVersions }),
    },
  );
}
