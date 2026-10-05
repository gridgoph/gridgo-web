import { withRequestDeadline } from "@/lib/api/requestDeadline";
/**
 * Typed GRIDGO demo API client.
 *
 * All network calls go through this module — pages never call `fetch` directly.
 * The configured API origin comes from NEXT_PUBLIC_API_URL (default
 * http://127.0.0.1:8787). In `next dev`, the browser talks to that loopback
 * API through same-origin `/api/gridgo` so CORS never applies; production
 * builds still call the configured origin directly.
 *
 * Types are derived from observed responses on the running API. When docs and
 * server disagree, the server wins.
 */

import type {
  Announcement,
  Basket,
  BasketInvoice,
  OrganizationStatement,
  OrganizationSummary,
  StatementPeriod,
  AuthMe,
  AuditEntry,
  CatalogItem,
  Claim,
  CreateSupplierServiceInput,
  CreateZoneInput,
  CreditBalance,
  CreditGrantResult,
  EligibleSuppliersResult,
  Escalation,
  HealthResult,
  Issue,
  LocationPing,
  RiderLocation,
  Notification,
  Order,
  PaymentInstallment,
  PhysicalInvoiceRequest,
  PayoutMilestone,
  PayoutMilestoneCode,
  PlatformSettings,
  PortalRole,
  PortalRoleProjection,
  PostAnnouncementInput,
  StoredFile,
  FileRetentionReport,
  SupplierService,
  PublicCatalogShop,
  PublicCatalogShopSummary,
  ShopRankings,
  Taxonomy,
  TaxonomyCategory,
  TaxonomyDeleteResult,
  TaxonomyFinish,
  TaxonomyMaterial,
  TaxonomySubcategory,
  UpdateSettingsInput,
  UpdateSupplierServiceInput,
  UpdateZoneInput,
  ApprovalCaseDetail,
  ApprovalCaseQueue,
  ApprovalDecisionAction,
  ApprovalDecisionResult,
  User,
  VerificationStatus,
  Zone,
  SupplierPayoutAccount,
  SupplierPayoutAccountPatch,
  IssueReport,
  IssueReportCounts,
  IssueReportStatus,
  RecordTrackerDecisionInput,
  TrackerBoard,
  TrackerItem,
  TrackerStatus,
  RefundDestination,
  RefundKind,
  RefundPreview,
  RefundRequest,
  RefundStatus,
  SettlementInput,
  SeasonPushDryRun,
  SeasonPushSettings,
  SeasonWindow,
  SeasonWindowInput,
  SeasonWindowsEnvelope,
  ProductionLapse,
  RescheduleQueue,
  RescheduleRequest,
  ShopFailureEvent,
  ShopRecovery,
  SupplierProductionLapses,
} from "@/lib/api/types";
import { apiInstallment, normalizeOrder, normalizeOrders } from "@/lib/payments";

const DEFAULT_API_BASE = "http://127.0.0.1:8787";

/** Same-origin prefix the browser uses in `next dev`. */
export const LOCAL_API_PROXY_PREFIX = "/api/gridgo";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The API origin this build was configured to call. Never the local proxy. */
export function getConfiguredApiBase(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "")
      : undefined;
  return fromEnv || DEFAULT_API_BASE;
}

export function isLoopbackApiBase(base: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(base).hostname);
  } catch {
    return false;
  }
}

function nodeEnv(): string {
  // Indexed access so tests can stub NODE_ENV; Vite/Next replace the
  // `process.env.NODE_ENV` member expression at compile time.
  return process.env["NODE_ENV"] ?? "";
}

/**
 * `next dev` only: the browser must not CORS-hit a loopback API. The API
 * answers unlisted origins with `403 origin_not_allowed` and no
 * `Access-Control-Allow-Origin`, which is exactly the local sign-in break.
 * Server code, Vitest, and production builds keep the configured origin.
 */
export function shouldUseLocalApiProxy(): boolean {
  if (nodeEnv() !== "development") return false;
  if (typeof window === "undefined") return false;
  const configured = getConfiguredApiBase();
  if (!isLoopbackApiBase(configured)) return false;
  try {
    return new URL(configured).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function getApiBase(): string {
  if (shouldUseLocalApiProxy()) return LOCAL_API_PROXY_PREFIX;
  return getConfiguredApiBase();
}

/**
 * High-level error category for recovery UI.
 * Prefer `kind` / `code` over string-matching `message`.
 */
export type ApiErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "server"
  | "unknown";

function kindFromStatus(status: number): ApiErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 400 || status === 422) return "validation";
  if (status >= 500) return "server";
  return "unknown";
}

function parseErrorCode(body: unknown, status: number): string {
  if (typeof body === "object" && body && "error" in body) {
    return String((body as { error: string }).error);
  }
  return `http_${status}`;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  /** Snake_case code from `{ error: "…" }` when present. */
  code: string;
  kind: ApiErrorKind;

  constructor(status: number, body: unknown) {
    const code = parseErrorCode(body, status);
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.code = code;
    this.kind = kindFromStatus(status);
  }

  /** Extra fields from the error body (e.g. `maxMinor`, `from`, `to`). */
  get details(): Record<string, unknown> {
    if (typeof this.body !== "object" || !this.body) return {};
    const out: Record<string, unknown> = {
      ...(this.body as Record<string, unknown>),
    };
    delete out.error;
    return out;
  }

  /** Typed read of a detail field. */
  detail<T = unknown>(key: string): T | undefined {
    return this.details[key] as T | undefined;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

type TokenProviderOptions = { skipCache?: boolean };
type TokenProvider = (
  options?: TokenProviderOptions,
) => string | null | Promise<string | null>;

let tokenProvider: TokenProvider = () => null;

/** Wire the client to Clerk's rotating session token (called once from AuthProvider). */
export function setTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

/** Fresh Clerk JWT for Authorization. Never put this on a query string. */
export async function getAuthToken(
  options?: TokenProviderOptions,
): Promise<string | null> {
  return tokenProvider(options);
}

function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** Workspace context selects a projection; the server still verifies membership. */
export function getWorkspaceRole(): PortalRole | null {
  if (typeof window === "undefined") return null;
  const tree = window.location.pathname.split("/")[1];
  return tree === "supplier"
    ? "supplier"
    : tree === "ops"
      ? "ops_admin"
      : tree === "admin"
        ? "super_admin"
        : null;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  tokenOptions?: TokenProviderOptions,
): Promise<T> {
  return withRequestDeadline(init.signal, async (signal) => {
    const role = path.startsWith("/auth/") ? null : getWorkspaceRole();
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(role ? { "X-GRIDGO-Role": role } : {}),
      ...(init.headers as Record<string, string> | undefined),
    };
    const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
    if (init.body && !headers["Content-Type"] && !isFormData) {
      headers["Content-Type"] = "application/json";
    }
    signal.throwIfAborted();
    const token = await tokenProvider(tokenOptions);
    signal.throwIfAborted();
    if (token) headers.Authorization = `Bearer ${token}`;

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
    if (!res.ok) {
      const error = new ApiError(res.status, data);
      if (error.kind === "forbidden" && !path.startsWith("/auth/")) notifyForbidden(error);
      throw error;
    }
    return data as T;
  });
}

type ForbiddenListener = (error: ApiError) => void;
const forbiddenListeners = new Set<ForbiddenListener>();

/**
 * Hear every 403 from a workspace endpoint. `RoleGate` uses it to re-check its
 * projection, so access withdrawn mid-session (a suspended shop) ends the
 * workspace instead of being retried by every page and rail count. `/auth/*`
 * denials are excluded: `RoleGate` reads those directly.
 */
export function onForbidden(listener: ForbiddenListener): () => void {
  forbiddenListeners.add(listener);
  return () => {
    forbiddenListeners.delete(listener);
  };
}

function notifyForbidden(error: ApiError): void {
  for (const listener of forbiddenListeners) {
    try {
      listener(error);
    } catch {
      /* A listener never changes the caller's error. */
    }
  }
}

// ---------------------------------------------------------------------------
// Clerk identity + Postgres authorization
// ---------------------------------------------------------------------------

export async function getAuthMe(options?: {
  signal?: AbortSignal;
  refreshToken?: boolean;
}): Promise<AuthMe> {
  return request<AuthMe>(
    "/auth/me",
    { signal: options?.signal },
    options?.refreshToken ? { skipCache: true } : undefined,
  );
}

const PORTAL_PROJECTION_PATH: Record<PortalRole, string> = {
  supplier: "/auth/me/supplier",
  ops_admin: "/auth/me/ops",
  super_admin: "/auth/me/admin",
};

/**
 * Authorize one portal surface from its fixed API projection. The requested
 * role is converted to a path locally and never sent as client-controlled JSON.
 */
export async function getPortalRoleProjection<R extends PortalRole>(
  role: R,
  options?: { refreshToken?: boolean },
): Promise<PortalRoleProjection<R>> {
  return request<PortalRoleProjection<R>>(
    PORTAL_PROJECTION_PATH[role],
    { headers: { "X-GRIDGO-Role": role } },
    options?.refreshToken ? { skipCache: true } : undefined,
  );
}

// ---------------------------------------------------------------------------
// Orders / jobs
// ---------------------------------------------------------------------------

export async function listOrders(): Promise<Order[]> {
  const result = await request<{ orders: Order[] }>("/orders");
  return normalizeOrders(result.orders);
}

/** Supplier job inbox — 403 for non-supplier roles. */
export async function listJobs(): Promise<Order[]> {
  const result = await request<{ jobs: Order[] }>("/jobs");
  return normalizeOrders(result.jobs);
}

export async function getOrder(orderId: string): Promise<Order> {
  const result = await request<{ order: Order }>(`/orders/${orderId}`);
  return normalizeOrder(result.order);
}

export type CreateOrderInput = {
  productId: string;
  title?: string;
  quantity?: number;
  size?: string;
  material?: string;
  finish?: string;
  deadline?: string | null;
  address?: string;
  zone?: string;
  artworkName?: string | null;
  submit?: boolean;
};

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const result = await request<{ order: Order }>("/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return normalizeOrder(result.order);
}

export type TransitionExtra = {
  supplierId?: string;
  riderId?: string;
  matchingServiceIds?: string[];
  /**
   * Legacy quote field. The supplier portal accept path does not send this:
   * an assigned job already has its price. Older callers that still issue a
   * `supplier_accepted` quote may pass the asking price in minor units.
   */
  supplierSubtotalMinor?: number;
  promisedDate?: string | null;
  reason?: string;
  note?: string;
  [key: string]: unknown;
};

export async function transitionOrder(
  orderId: string,
  state: string,
  extra: TransitionExtra = {},
): Promise<Order> {
  const result = await request<{ order: Order }>(`/orders/${orderId}/transition`, {
    method: "POST",
    body: JSON.stringify({ state, ...extra }),
  });
  return normalizeOrder(result.order);
}

/**
 * Release a collected order at the GRIDGO Office counter.
 *
 * The second of a collected order's two endings. The rider's proof said the
 * package reached our shelf; this says it left with the client, which is the
 * point any balance has to be settled and the issue window starts.
 */
export async function recordCollection(
  orderId: string,
  receivedBy: string,
): Promise<Order> {
  const result = await request<{ order: Order }>(`/orders/${orderId}/collection`, {
    method: "POST",
    body: JSON.stringify({ receivedBy }),
  });
  return normalizeOrder(result.order);
}

// ---------------------------------------------------------------------------
// Digital payment — in full at checkout, or a downpayment then the balance
// on an order placed on 75/25. A `not_required` balance answers 409
// `balance_not_required` to submit, confirm and reject alike.
// ---------------------------------------------------------------------------

/**
 * Client only — the owning client submits the QR transfer reference.
 * Included so this module is the complete spine; the portal has no client role.
 */
export async function submitPayment(
  orderId: string,
  installment: PaymentInstallment,
  input: { method?: string; reference: string },
): Promise<Order> {
  const result = await request<{ order: Order }>(
    `/orders/${orderId}/payments/${installment}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ method: input.method ?? "qr_manual", ...input }),
    },
  );
  return normalizeOrder(result.order);
}

/**
 * Ops / Super Admin — when the printed invoice will reach the office.
 * The print job's promised date is a different field. This reloads the order
 * because the promise route returns the request, not the order.
 */
export async function promisePhysicalInvoice(
  orderId: string,
  promisedDeliveryAt: string,
): Promise<Order> {
  await request<{ request: PhysicalInvoiceRequest }>(
    `/orders/${orderId}/physical-invoice`,
    { method: "PATCH", body: JSON.stringify({ promisedDeliveryAt }) },
  );
  return getOrder(orderId);
}

/**
 * Ops / Super Admin — the manual confirmation that lets an order leave payment.
 * Confirming the downpayment (the full payment, on an upfront order) moves the
 * order to `payment_authorized`.
 */
export async function confirmPayment(
  orderId: string,
  installment: PaymentInstallment,
  input: { note?: string } = {},
): Promise<Order> {
  const result = await request<{ order: Order }>(
    `/orders/${orderId}/payments/${apiInstallment(installment)}/confirm`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return normalizeOrder(result.order);
}

/**
 * Ops / Super Admin — the money did not arrive, or the reference does not match.
 * Returns the installment to `not_submitted` so the client can submit again,
 * and carries the reason back to them.
 */
export async function rejectPayment(
  orderId: string,
  installment: PaymentInstallment,
  input: { reason: string },
): Promise<Order> {
  const result = await request<{ order: Order }>(
    `/orders/${orderId}/payments/${apiInstallment(installment)}/reject`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return normalizeOrder(result.order);
}

// ---------------------------------------------------------------------------
// Multi-shop baskets (gridgo-api docs/MULTI_SHOP_CHECKOUT_API.md)
// ---------------------------------------------------------------------------

function normalizeBasket(basket: Basket): Basket {
  return {
    ...basket,
    groups: (basket.groups ?? []).map((group) => ({
      ...group,
      order: normalizeOrder(group.order),
    })),
  };
}

/** Ops / Super Admin: every basket, each with its live groups. */
export async function listBaskets(): Promise<Basket[]> {
  const result = await request<{ baskets: Basket[] }>("/baskets");
  return (result.baskets ?? []).map(normalizeBasket);
}

/** One basket: the single payment and every shop group's own order. */
export async function getBasket(basketId: string): Promise<Basket> {
  const result = await request<{ basket: Basket }>(
    `/baskets/${encodeURIComponent(basketId)}`,
  );
  return normalizeBasket(result.basket);
}

/** The basket's one immutable receipt (the same one every group's invoice route returns). */
export async function getBasketInvoice(basketId: string): Promise<BasketInvoice> {
  const result = await request<{ invoice: BasketInvoice }>(
    `/baskets/${encodeURIComponent(basketId)}/invoice`,
  );
  return result.invoice;
}

/**
 * Ops / Super Admin. Confirms the one transfer for every group at once. A
 * group's own `/orders/:id/payments/...` routes answer `409
 * basket_payment_required`; this is the only way.
 */
export async function confirmBasketPayment(basketId: string): Promise<Basket> {
  const result = await request<{ basket: Basket }>(
    `/baskets/${encodeURIComponent(basketId)}/payment/confirm`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return normalizeBasket(result.basket);
}

/** Ops / Super Admin. Sends the one transfer back for every group; the reason is the client's to read. */
export async function rejectBasketPayment(
  basketId: string,
  input: { reason: string },
): Promise<Basket> {
  const result = await request<{ basket: Basket }>(
    `/baskets/${encodeURIComponent(basketId)}/payment/reject`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return normalizeBasket(result.basket);
}

// ---------------------------------------------------------------------------
// Organizations and statements (gridgo-api docs/ORGANIZATION_MONEY_API.md)
// ---------------------------------------------------------------------------

/** Ops / Super Admin. Up to 50 organizations per page, keyset by user id. */
export async function listOrganizations(
  after?: string,
): Promise<{ organizations: OrganizationSummary[]; nextCursor: string | null }> {
  const result = await request<{
    organizations: (OrganizationSummary | null)[];
    nextCursor: string | null;
  }>(`/ops/organizations${buildQuery({ after })}`);
  return {
    organizations: (result.organizations ?? []).filter(
      (row): row is OrganizationSummary => row !== null,
    ),
    nextCursor: result.nextCursor ?? null,
  };
}

function statementQuery(period: StatementPeriod, format: "json" | "pdf" | "csv"): string {
  return buildQuery(
    period.period === "custom"
      ? { period: "custom", from: period.from, to: period.to, format }
      : { period: period.period, format },
  );
}

/** Ops / Super Admin. The same statement the organization exports, for one period. */
export async function getOrganizationStatement(
  clientId: string,
  period: StatementPeriod,
): Promise<OrganizationStatement> {
  const result = await request<{ statement: OrganizationStatement }>(
    `/ops/organizations/${encodeURIComponent(clientId)}/statements${statementQuery(period, "json")}`,
  );
  return result.statement;
}

/**
 * Ops / Super Admin. The statement as the PDF or CSV file the organization
 * downloads. Generated on demand by the API and never stored.
 */
export async function downloadOrganizationStatement(
  clientId: string,
  period: StatementPeriod,
  format: "pdf" | "csv",
): Promise<Blob> {
  return withRequestDeadline(undefined, async (signal) => {
    const role = getWorkspaceRole();
    const headers: Record<string, string> = {
      Accept: format === "pdf" ? "application/pdf" : "text/csv",
      ...(role ? { "X-GRIDGO-Role": role } : {}),
    };
    const token = await tokenProvider();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(
      `${getApiBase()}/ops/organizations/${encodeURIComponent(clientId)}/statements${statementQuery(period, format)}`,
      { headers, signal },
    );
    if (!res.ok) {
      const text = await res.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        /* keep the text */
      }
      const error = new ApiError(res.status, data);
      if (error.kind === "forbidden") notifyForbidden(error);
      throw error;
    }
    return res.blob();
  });
}

// ---------------------------------------------------------------------------
// Milestone payouts
// ---------------------------------------------------------------------------

/**
 * Ops / Super Admin — release one milestone share of the supplier's own price.
 * `409 pof_required` when no Proof of Fulfilment is attached,
 * `409 milestone_not_reached` when production has not got there yet,
 * `409 payout_held` while a claim holds the order.
 */
export type ReleaseMilestoneInput = {
  note?: string;
  /** The wallet's reference number, as shown on the receipt. Optional. */
  reference?: string;
  /** A ready `payout_receipt` upload from `uploadPayoutReceipt`. Optional. */
  receiptFileId?: string;
};

/**
 * Ops / Super Admin. JPEG, PNG or WebP, 15 MiB. Stores the wallet receipt
 * screenshot; it is bound to a share by passing its id to `releaseMilestone`.
 */
export async function uploadPayoutReceipt(file: File): Promise<StoredFile> {
  const body = new FormData();
  body.append("purpose", "payout_receipt");
  body.append("file", file);
  const uploaded = await request<{ file: StoredFile }>("/files", {
    method: "POST",
    body,
  });
  return uploaded.file;
}

/**
 * Shop evidence for one payout part. JPEG, PNG, WebP, or PDF.
 * The upload alone files nothing; `attachFulfilmentProof` binds it.
 */
export async function uploadFulfilmentProof(file: File): Promise<StoredFile> {
  const body = new FormData();
  body.append("purpose", "fulfilment_proof");
  body.append("file", file);
  const uploaded = await request<{ file: StoredFile }>("/files", {
    method: "POST",
    body,
  });
  return uploaded.file;
}

/** The stages a shop files its own proof for, across every payout plan. */
export type ShopProofMilestoneCode = "production_started" | "printing" | "packaging_qc";

/**
 * Bind an uploaded file to one payout milestone. The order state does not move.
 * A file backs one milestone, so each part needs its own upload. The API
 * accepts only a file-taking stage of the order's own plan
 * (`400 invalid_milestone_code` lists the allowed ones).
 */
export async function attachFulfilmentProof(
  fileId: string,
  orderId: string,
  milestoneCode: ShopProofMilestoneCode | string,
): Promise<{ file: StoredFile; order: Order }> {
  const result = await request<{ file: StoredFile; order: Order }>(
    `/files/${fileId}/attach`,
    {
      method: "POST",
      body: JSON.stringify({ orderId, milestoneCode }),
    },
  );
  return { ...result, order: normalizeOrder(result.order) };
}

/**
 * Supplier. Upload a progress photo of the job (JPEG, PNG or WebP). Like a
 * proof, the upload alone shows nobody anything; `attachProductionPhoto` binds
 * it to the order.
 */
export async function uploadProductionPhoto(file: File): Promise<StoredFile> {
  const body = new FormData();
  body.append("purpose", "production_photo");
  body.append("file", file);
  const uploaded = await request<{ file: StoredFile }>("/files", {
    method: "POST",
    body,
  });
  return uploaded.file;
}

/**
 * Bind a progress photo to the order while it is `production` or
 * `supplier_self_qc` (`409 production_photo_upload_not_allowed` otherwise).
 * It lets the job be packed and shows in the client's gallery; it never
 * satisfies or releases a payout stage.
 */
export async function attachProductionPhoto(
  fileId: string,
  orderId: string,
): Promise<{ file: StoredFile; order?: Order }> {
  const result = await request<{ file: StoredFile; order?: Order }>(
    `/files/${fileId}/attach`,
    {
      method: "POST",
      body: JSON.stringify({ orderId }),
    },
  );
  return result.order ? { ...result, order: normalizeOrder(result.order) } : result;
}

/**
 * Ops / Super Admin. Stores the receipt screenshot first, then releases the
 * share with its id and the reference, so a refused screenshot never leaves
 * a released share with no proof behind it.
 */
export async function releaseMilestoneWithReceipt(
  orderId: string,
  code: PayoutMilestoneCode | string,
  decision: { note: string; reference: string; receipt: File | null },
): Promise<{ order: Order; milestone: PayoutMilestone }> {
  const receipt = decision.receipt ? await uploadPayoutReceipt(decision.receipt) : null;
  return releaseMilestone(orderId, code, {
    note: decision.note,
    ...(decision.reference ? { reference: decision.reference } : {}),
    ...(receipt ? { receiptFileId: receipt.fileId } : {}),
  });
}

export async function releaseMilestone(
  orderId: string,
  code: PayoutMilestoneCode | string,
  input: ReleaseMilestoneInput = {},
): Promise<{ order: Order; milestone: PayoutMilestone }> {
  const result = await request<{ order: Order; milestone: PayoutMilestone }>(
    `/orders/${orderId}/milestones/${code}/release`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return { ...result, order: normalizeOrder(result.order) };
}

// ---------------------------------------------------------------------------
// Notifications / catalog / health
// ---------------------------------------------------------------------------

export async function listNotifications(): Promise<Notification[]> {
  const result = await request<{ notifications: Notification[] }>("/notifications");
  return result.notifications;
}

export async function listCatalog(): Promise<CatalogItem[]> {
  const result = await request<{ catalog: CatalogItem[] }>("/catalog");
  return result.catalog;
}

export async function health(): Promise<HealthResult> {
  return request("/health");
}

// ---------------------------------------------------------------------------
// Platform settings — issue window length and delivery distance bands
// ---------------------------------------------------------------------------

/**
 * The API answers `{ version, settings }`. The version rides along on the
 * settings object because every write has to quote it back: `PATCH /settings`
 * is a compare-and-swap and refuses a stale `expectedVersion` with 409.
 */
type SettingsEnvelope = { version: number; settings: Omit<PlatformSettings, "version"> };

function withVersion(result: SettingsEnvelope): PlatformSettings {
  return { ...result.settings, version: result.version };
}

export async function getSettings(): Promise<PlatformSettings> {
  return withVersion(await request<SettingsEnvelope>("/settings"));
}

/**
 * Super Admin only. Any field may be sent on its own; `expectedVersion` is
 * the version the caller last read, so two people cannot overwrite each other.
 * A 409 `settings_version_conflict` means reload and look again.
 */
export async function updateSettings(
  input: UpdateSettingsInput & { expectedVersion: number },
): Promise<PlatformSettings> {
  return withVersion(
    await request<SettingsEnvelope>("/settings", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  );
}

// ---------------------------------------------------------------------------
// Late-production penalties (gridgo-api docs/PRODUCTION_PENALTIES_API.md)
// ---------------------------------------------------------------------------

/** Ops / Super Admin. One shop's late finishes, newest first. */
export async function listSupplierProductionLapses(
  supplierId: string,
): Promise<SupplierProductionLapses> {
  return request<SupplierProductionLapses>(
    `/users/${encodeURIComponent(supplierId)}/production-lapses`,
  );
}

/**
 * Ops / Super Admin. Records that the shop on an overdue, unfinished order
 * could not be reached, which makes the lapse severe. Audited; the reason is
 * required (`400 reason_required`). `409 production_deadline_not_missed` when
 * the order is finished, not active or not yet late.
 */
export async function recordProductionNoCommunication(
  orderId: string,
  reason: string,
): Promise<ProductionLapse[]> {
  const result = await request<{ lapses: ProductionLapse[] }>(
    `/orders/${encodeURIComponent(orderId)}/production-no-communication`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
  return result.lapses;
}

// ---------------------------------------------------------------------------
// Shop acceptance, recovery and deadline requests
// (gridgo-api SHOP_RECOVERY_API.md, ORDER_RESCHEDULE_API.md)
// ---------------------------------------------------------------------------

/**
 * Ops / Super Admin. Every timeout, decline and cancellation a shop has had,
 * optionally for one shop, each with its order's current recovery.
 */
export async function listShopFailures(
  filter: { supplierId?: string } = {},
): Promise<ShopFailureEvent[]> {
  const query = filter.supplierId
    ? `?supplierId=${encodeURIComponent(filter.supplierId)}`
    : "";
  const result = await request<{ events: ShopFailureEvent[] }>(
    `/ops/shop-failures${query}`,
  );
  return result.events ?? [];
}

/** The order's recovery as this caller may read it; `null` when there is none. */
export async function getShopRecovery(orderId: string): Promise<ShopRecovery | null> {
  const result = await request<{ recovery: ShopRecovery | null }>(
    `/orders/${encodeURIComponent(orderId)}/shop-recovery`,
  );
  return result.recovery ?? null;
}

/**
 * Ops / Super Admin. Deadline requests, newest first. `totalRequests` is the
 * lifetime count for the shop filter, before the status filter.
 */
export async function listRescheduleRequests(
  filter: { status?: string; supplierId?: string } = {},
): Promise<RescheduleQueue> {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.supplierId) params.set("supplierId", filter.supplierId);
  const query = params.toString();
  const result = await request<RescheduleQueue>(
    `/ops/reschedule-requests${query ? `?${query}` : ""}`,
  );
  return { totalRequests: result.totalRequests ?? 0, requests: result.requests ?? [] };
}

/**
 * Ops / Super Admin. Records an agreed continuation under the current terms
 * and releases only this request's hold. The reason is required and audited.
 */
export async function resolveRescheduleRequest(
  orderId: string,
  body: { requestId: string; reason: string },
): Promise<RescheduleRequest> {
  const result = await request<{ request: RescheduleRequest }>(
    `/orders/${encodeURIComponent(orderId)}/reschedule-request/resolve`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return result.request;
}

/** Hosted payment-QR path checkout and this portal fetch without a signed URL. */
export function paymentQrPublicPath(fileId?: string): string {
  return fileId
    ? `/public/payment-qr?v=${encodeURIComponent(fileId)}`
    : "/public/payment-qr";
}

/**
 * Super Admin only. JPEG, PNG or WebP, 5 MiB. Uploads `purpose=payment_qr`
 * then activates that file as the platform receiving plate.
 */
export async function uploadPaymentQr(file: File): Promise<PlatformSettings> {
  const body = new FormData();
  body.append("purpose", "payment_qr");
  body.append("file", file);
  const uploaded = await request<{ file: StoredFile }>("/files", {
    method: "POST",
    body,
  });
  return withVersion(
    await request<SettingsEnvelope>("/settings/payment-qr", {
      method: "POST",
      body: JSON.stringify({
        fileId: uploaded.file.fileId,
        reason: "Replaced the payment QR from the portal",
      }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Where a shop gets paid — the receiving QR the release desk scans
// ---------------------------------------------------------------------------

/** Supplier. `null` until the shop has set one up. */
export async function getMyPayoutAccount(): Promise<SupplierPayoutAccount | null> {
  const result = await request<{ payoutAccount: SupplierPayoutAccount | null }>(
    "/me/payout-account",
  );
  return result.payoutAccount;
}

/**
 * Supplier. Creates the account on a first save (`version` null) and updates
 * it afterwards against the version it was read at; a stale one is
 * `409 payout_account_stale`, never a silent overwrite.
 */
export async function updateMyPayoutAccount(
  version: number | null,
  patch: SupplierPayoutAccountPatch,
): Promise<SupplierPayoutAccount> {
  const result = await request<{ payoutAccount: SupplierPayoutAccount }>(
    "/me/payout-account",
    {
      method: "PATCH",
      headers: version != null ? { "If-Match": String(version) } : undefined,
      body: JSON.stringify({ ...patch, expectedVersion: version }),
    },
  );
  return result.payoutAccount;
}

/** Supplier. Removes the account and retires its plate. */
export async function removeMyPayoutAccount(version: number): Promise<void> {
  await request<{ payoutAccount: null }>("/me/payout-account", {
    method: "DELETE",
    headers: { "If-Match": String(version) },
  });
}

/**
 * Supplier. JPEG, PNG or WebP, 5 MiB. Stores the plate only; it becomes the
 * one Operations scans when its `fileId` is saved as `qrFileId`.
 */
export async function uploadPayoutQr(file: File): Promise<StoredFile> {
  const body = new FormData();
  body.append("purpose", "supplier_payout_qr");
  body.append("file", file);
  const uploaded = await request<{ file: StoredFile }>("/files", {
    method: "POST",
    body,
  });
  return uploaded.file;
}

/** Ops / Super Admin, or the owning supplier. */
export async function getSupplierPayoutAccount(
  userId: string,
): Promise<SupplierPayoutAccount | null> {
  const result = await request<{
    userId: string;
    payoutAccount: SupplierPayoutAccount | null;
  }>(`/users/${encodeURIComponent(userId)}/payout-account`);
  return result.payoutAccount;
}

// ---------------------------------------------------------------------------
// Escalations — a rider failed a pickup check and must not transport
// ---------------------------------------------------------------------------

export async function listEscalations(filters?: {
  status?: string;
  orderId?: string;
}): Promise<Escalation[]> {
  const q = buildQuery({
    status: filters?.status,
    orderId: filters?.orderId,
  });
  const result = await request<{ escalations: Escalation[] }>(`/escalations${q}`);
  return result.escalations;
}

/** Ops / Super Admin. The rider is notified and must repeat all six checks. */
export async function resolveEscalation(
  escalationId: string,
  input: { resolution: string },
): Promise<Escalation> {
  const result = await request<{ escalation: Escalation }>(
    `/escalations/${escalationId}/resolve`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return result.escalation;
}

// ---------------------------------------------------------------------------
// Files — Proof of Fulfilment and pickup-failure evidence
// ---------------------------------------------------------------------------

export async function getFile(fileId: string): Promise<StoredFile> {
  const result = await request<{ file: StoredFile }>(`/files/${fileId}`);
  return result.file;
}

/** Five-minute signed GET for the stored object. */
export async function getFileDownloadUrl(fileId: string): Promise<string> {
  const result = await request<{ url: string }>(`/files/${fileId}/download-url`);
  return result.url;
}

/**
 * Early deletion (contract "DELETE /files/:fileId" in STORAGE_API.md). Super
 * Admin only from this portal, always with a written reason the API keeps in
 * the audit log. Cannot be undone; an open case answers `409 file_retention_hold`.
 */
export async function deleteFileEarly(fileId: string, reason: string): Promise<StoredFile> {
  const result = await request<{ file: StoredFile }>(`/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
  return result.file;
}

/** Super Admin. Read-only counts of what the next retention pass would delete. */
export async function getFileRetention(): Promise<FileRetentionReport> {
  return request<FileRetentionReport>("/admin/files/retention");
}

// ---------------------------------------------------------------------------
// Pilot Credits — a non-cash grant ledger. Never a way to pay for an order.
// ---------------------------------------------------------------------------

export async function creditBalance(clientId?: string): Promise<CreditBalance> {
  const q = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return request(`/credits/balance${q}`);
}

/** Super Admin only. Not a purchase — pilot grant instrument. */
export async function grantCredits(input: {
  clientId: string;
  amountMinor: number;
  reason?: string;
}): Promise<CreditGrantResult> {
  return request("/credits/grant", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Platform announcements — Super Admin only in this portal, and there is no
// unsend. Live contract: POST /announcements. There is no GET list and no
// pre-send audience-count route; do not invent either.
// ---------------------------------------------------------------------------

/**
 * Irreversible. Writes one notification per targeted account and, for
 * `everyone`, also pushes to unclaimed (never-signed-in / signed-out) phones.
 * Push `data` is {type:"announcement"} — no destination URL.
 */
export async function postAnnouncement(
  input: PostAnnouncementInput,
): Promise<Announcement> {
  const payload: PostAnnouncementInput = {
    audience: input.audience,
    title: input.title,
    body: input.body,
  };
  if (input.imageUrl) payload.imageUrl = input.imageUrl;
  const result = await request<{ announcement: Announcement }>("/announcements", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return result.announcement;
}

/** Hosted broadcast picture path FCM and the apps fetch without a signed URL. */
export function announcementImagePublicPath(fileId: string): string {
  return `/public/announcement-images/${fileId}`;
}

/**
 * Super Admin / Operations. JPEG, PNG or WebP, 1 MiB. Returns the path to send
 * as `imageUrl` on POST /announcements.
 */
export async function uploadAnnouncementImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("purpose", "announcement_image");
  body.append("file", file);
  const result = await request<{ file: StoredFile }>("/files", {
    method: "POST",
    body,
  });
  return announcementImagePublicPath(result.file.fileId);
}

// ---------------------------------------------------------------------------
// Season windows — Super Admin only. Contract: gridgo-api
// docs/SEASON_WINDOWS_API.md. Saving a window never notifies a client; only
// the push switch (off by default) lets the scheduler send one notice per
// window when its banner opens.
// ---------------------------------------------------------------------------

/** Every window, past ones included, plus the server's Manila `today`. */
export async function listSeasonWindows(): Promise<SeasonWindowsEnvelope> {
  return request<SeasonWindowsEnvelope>("/admin/season-windows");
}

export async function createSeasonWindow(input: SeasonWindowInput): Promise<SeasonWindow> {
  const result = await request<{ window: SeasonWindow }>("/admin/season-windows", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.window;
}

/** Sends only the changed fields; a stale version is `409 season_window_version_conflict`. */
export async function updateSeasonWindow(
  id: string,
  expectedVersion: number,
  changes: Partial<SeasonWindowInput>,
): Promise<SeasonWindow> {
  const result = await request<{ window: SeasonWindow }>(
    `/admin/season-windows/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ ...changes, expectedVersion }) },
  );
  return result.window;
}

export async function deleteSeasonWindow(id: string, expectedVersion: number): Promise<void> {
  await request<{ ok: true }>(`/admin/season-windows/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion }),
  });
}

export async function getSeasonPushSettings(): Promise<SeasonPushSettings> {
  return request<SeasonPushSettings>("/admin/season-windows/push-settings");
}

/**
 * Turning this on lets the next scheduler tick notify every client with a
 * registered phone for each window whose banner is showing. `reason` is
 * required (1–500 characters) and lands in the audit log.
 */
export async function updateSeasonPushSettings(input: {
  enabled: boolean;
  expectedVersion: number;
  reason: string;
}): Promise<SeasonPushSettings> {
  return request<SeasonPushSettings>("/admin/season-windows/push-settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Who would be notified, counted without sending or changing anything. */
export async function seasonPushDryRun(): Promise<SeasonPushDryRun> {
  return request<SeasonPushDryRun>("/admin/season-windows/push-dry-run", {
    method: "POST",
    body: "{}",
  });
}

// ---------------------------------------------------------------------------
// Users, roles, verification
// ---------------------------------------------------------------------------

export async function listUsers(role?: RoleOrString): Promise<User[]> {
  const q = buildQuery({ role });
  const result = await request<{ users: User[] }>(`/users${q}`);
  return result.users;
}

export async function getUser(userId: string): Promise<User> {
  const result = await request<{ user: User }>(`/users/${userId}`);
  return result.user;
}

/** Super Admin only. */
export async function updateUserRole(
  userId: string,
  input: { role: User["role"]; reason?: string },
): Promise<User> {
  const result = await request<{ user: User }>(`/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return result.user;
}

/** Super Admin only. Reason is required for suspend, remove, and restore. */
export async function updateUserAccount(
  userId: string,
  input: { status: "suspended" | "removed" | "active"; reason: string },
): Promise<User> {
  const result = await request<{ user: User }>(`/users/${userId}/account`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return result.user;
}

export async function listApprovalCases(params?: {
  status?: string;
  kind?: string;
  cursor?: string;
}): Promise<ApprovalCaseQueue> {
  const q = buildQuery({
    status: params?.status,
    kind: params?.kind,
    cursor: params?.cursor,
  });
  return request<ApprovalCaseQueue>(`/approval-cases${q}`);
}

export async function getApprovalCase(caseId: string): Promise<ApprovalCaseDetail> {
  return request<ApprovalCaseDetail>(`/approval-cases/${encodeURIComponent(caseId)}`);
}

export async function decideApprovalCase(
  caseId: string,
  action: ApprovalDecisionAction,
  input: {
    expectedVersion: number;
    requestId: string;
    reason?: string;
    note?: string;
    /** Restore only: suspended-with-account lines to bring back in the same step. */
    restoreServiceIds?: string[];
  },
): Promise<ApprovalDecisionResult> {
  return request<ApprovalDecisionResult>(
    `/approval-cases/${encodeURIComponent(caseId)}/${action}`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

/** Ops / Super Admin — supplier or rider only. */
export async function setUserVerification(
  userId: string,
  input: { status: VerificationStatus; reason?: string; note?: string },
): Promise<User> {
  const result = await request<{ user: User }>(`/users/${userId}/verification`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.user;
}

type RoleOrString = User["role"] | string;

// ---------------------------------------------------------------------------
// Zones & fees
// ---------------------------------------------------------------------------

export async function listZones(): Promise<Zone[]> {
  const result = await request<{ zones: Zone[] }>("/zones");
  return result.zones;
}

/** Super Admin only. */
export async function createZone(input: CreateZoneInput): Promise<Zone> {
  const result = await request<{ zone: Zone }>("/zones", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.zone;
}

/** Super Admin only. `zoneId` may be id or code. */
export async function updateZone(zoneId: string, input: UpdateZoneInput): Promise<Zone> {
  const result = await request<{ zone: Zone }>(`/zones/${zoneId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return result.zone;
}

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

export async function getTaxonomy(): Promise<Taxonomy> {
  const result = await request<{ taxonomy: Taxonomy }>("/taxonomy");
  return result.taxonomy;
}

export async function listCatalogShops(filters?: {
  categoryCode?: string;
  cursor?: string | null;
}): Promise<{ shops: PublicCatalogShopSummary[]; nextCursor: string | null }> {
  const q = buildQuery({
    categoryCode: filters?.categoryCode,
    cursor: filters?.cursor,
  });
  const result = await request<{
    shops?: PublicCatalogShopSummary[];
    nextCursor?: string | null;
  }>(`/catalog/shops${q}`);
  return {
    shops: result.shops ?? [],
    nextCursor: result.nextCursor ?? null,
  };
}

export async function listAllCatalogShops(
  categoryCode?: string,
): Promise<PublicCatalogShopSummary[]> {
  const shops: PublicCatalogShopSummary[] = [];
  let cursor: string | null = null;
  do {
    const page = await listCatalogShops({ categoryCode, cursor });
    shops.push(...page.shops);
    cursor = page.nextCursor;
  } while (cursor);
  return shops;
}

/**
 * Every shop ranked by what clients said — overall, or within one category,
 * where the shop's cheapest listing price rides beside the stars.
 */
export async function getShopRankings(
  categoryCode?: string | null,
): Promise<ShopRankings> {
  const q = buildQuery({ categoryCode: categoryCode || undefined });
  return request<ShopRankings>(`/admin/shop-rankings${q}`);
}

export async function getCatalogShop(supplierId: string): Promise<PublicCatalogShop> {
  const result = await request<{ shop: PublicCatalogShop }>(
    `/catalog/shops/${encodeURIComponent(supplierId)}`,
  );
  return result.shop;
}

export async function createTaxonomyCategory(input: {
  code: string;
  name: string;
  bestFor?: string;
  sortOrder?: number;
  productFamilyIds?: string[];
  active?: boolean;
}): Promise<TaxonomyCategory> {
  const result = await request<{ category: TaxonomyCategory }>("/taxonomy/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.category;
}

export async function updateTaxonomyCategory(
  idOrCode: string,
  input: {
    name?: string;
    bestFor?: string;
    sortOrder?: number;
    productFamilyIds?: string[];
    active?: boolean;
  },
): Promise<TaxonomyCategory> {
  const result = await request<{ category: TaxonomyCategory }>(
    `/taxonomy/categories/${idOrCode}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  return result.category;
}

/**
 * Super Admin only. The API refuses (409) an entry the build ships
 * (`catalog_entry_shipped`) or one shops, orders, or legacy codes still stand
 * on (`catalog_entry_in_use`, with `usage: CatalogEntryUsage`); nothing cascades.
 */
export async function deleteTaxonomyCategory(
  idOrCode: string,
): Promise<TaxonomyDeleteResult> {
  return request<TaxonomyDeleteResult>(
    `/taxonomy/categories/${encodeURIComponent(idOrCode)}`,
    { method: "DELETE" },
  );
}

export async function createTaxonomySubcategory(input: {
  code: string;
  name: string;
  categoryCode: string;
  examples?: string[];
  sortOrder?: number;
  active?: boolean;
}): Promise<TaxonomySubcategory> {
  const result = await request<{ subcategory: TaxonomySubcategory }>(
    "/taxonomy/subcategories",
    { method: "POST", body: JSON.stringify(input) },
  );
  return result.subcategory;
}

export async function updateTaxonomySubcategory(
  idOrCode: string,
  input: {
    name?: string;
    categoryCode?: string;
    examples?: string[];
    sortOrder?: number;
    active?: boolean;
  },
): Promise<TaxonomySubcategory> {
  const result = await request<{ subcategory: TaxonomySubcategory }>(
    `/taxonomy/subcategories/${idOrCode}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  return result.subcategory;
}

/** Super Admin only; same refusals as `deleteTaxonomyCategory`. */
export async function deleteTaxonomySubcategory(
  idOrCode: string,
): Promise<TaxonomyDeleteResult> {
  return request<TaxonomyDeleteResult>(
    `/taxonomy/subcategories/${encodeURIComponent(idOrCode)}`,
    { method: "DELETE" },
  );
}

export async function createTaxonomyMaterial(input: {
  code: string;
  name: string;
  categoryCodes?: string[];
  active?: boolean;
}): Promise<TaxonomyMaterial> {
  const result = await request<{ material: TaxonomyMaterial }>("/taxonomy/materials", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.material;
}

export async function updateTaxonomyMaterial(
  idOrCode: string,
  input: {
    name?: string;
    categoryCodes?: string[];
    active?: boolean;
  },
): Promise<TaxonomyMaterial> {
  const result = await request<{ material: TaxonomyMaterial }>(
    `/taxonomy/materials/${idOrCode}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  return result.material;
}

export async function createTaxonomyFinish(input: {
  code: string;
  name: string;
  categoryCodes?: string[];
  active?: boolean;
}): Promise<TaxonomyFinish> {
  const result = await request<{ finish: TaxonomyFinish }>("/taxonomy/finishes", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.finish;
}

export async function updateTaxonomyFinish(
  idOrCode: string,
  input: {
    name?: string;
    categoryCodes?: string[];
    active?: boolean;
  },
): Promise<TaxonomyFinish> {
  const result = await request<{ finish: TaxonomyFinish }>(
    `/taxonomy/finishes/${idOrCode}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  return result.finish;
}

// ---------------------------------------------------------------------------
// Supplier services
// ---------------------------------------------------------------------------

export async function listSupplierServices(filters?: {
  supplierId?: string;
  state?: string;
}): Promise<SupplierService[]> {
  const q = buildQuery({
    supplierId: filters?.supplierId,
    state: filters?.state,
  });
  const result = await request<{ services: SupplierService[] }>(`/supplier-services${q}`);
  return result.services;
}

export async function getSupplierService(serviceId: string): Promise<SupplierService> {
  const result = await request<{ service: SupplierService }>(
    `/supplier-services/${serviceId}`,
  );
  return result.service;
}

export async function createSupplierService(
  input: CreateSupplierServiceInput,
): Promise<SupplierService> {
  const result = await request<{ service: SupplierService }>("/supplier-services", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.service;
}

export async function updateSupplierService(
  serviceId: string,
  input: UpdateSupplierServiceInput,
): Promise<SupplierService> {
  const result = await request<{ service: SupplierService }>(
    `/supplier-services/${serviceId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  return result.service;
}

export async function submitSupplierService(serviceId: string): Promise<SupplierService> {
  const result = await request<{ service: SupplierService }>(
    `/supplier-services/${serviceId}/submit`,
    { method: "POST" },
  );
  return result.service;
}

export async function verifySupplierService(
  serviceId: string,
  input?: { reason?: string },
): Promise<SupplierService> {
  const result = await request<{ service: SupplierService }>(
    `/supplier-services/${serviceId}/verify`,
    { method: "POST", body: JSON.stringify(input ?? {}) },
  );
  return result.service;
}

export async function suspendSupplierService(
  serviceId: string,
  input: { reason: string },
): Promise<SupplierService> {
  const result = await request<{ service: SupplierService }>(
    `/supplier-services/${serviceId}/suspend`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return result.service;
}

export async function withdrawSupplierService(
  serviceId: string,
): Promise<SupplierService> {
  const result = await request<{ service: SupplierService }>(
    `/supplier-services/${serviceId}/withdraw`,
    { method: "POST" },
  );
  return result.service;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export async function getEligibleSuppliers(
  orderId: string,
): Promise<EligibleSuppliersResult> {
  return request(`/orders/${orderId}/eligible-suppliers`);
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export async function listClaims(filters?: {
  orderId?: string;
  status?: string;
}): Promise<Claim[]> {
  const q = buildQuery({
    orderId: filters?.orderId,
    status: filters?.status,
  });
  const result = await request<{ claims: Claim[] }>(`/claims${q}`);
  return result.claims;
}

export async function getClaim(claimId: string): Promise<Claim> {
  const result = await request<{ claim: Claim }>(`/claims/${claimId}`);
  return result.claim;
}

export async function createClaim(input: {
  orderId: string;
  reason: string;
  /** When false, claim is raised without hold (status `open`). Default holds. */
  hold?: boolean;
}): Promise<Claim> {
  const result = await request<{ claim: Claim }>("/claims", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.claim;
}

export async function holdClaim(
  claimId: string,
  input: { reason: string },
): Promise<Claim> {
  const result = await request<{ claim: Claim }>(`/claims/${claimId}/hold`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.claim;
}

export async function releaseClaim(
  claimId: string,
  input: { reason: string },
): Promise<Claim> {
  const result = await request<{ claim: Claim }>(`/claims/${claimId}/release`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.claim;
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export async function listIssues(filters?: {
  orderId?: string;
  status?: string;
}): Promise<Issue[]> {
  const q = buildQuery({
    orderId: filters?.orderId,
    status: filters?.status,
  });
  const result = await request<{ issues: Issue[] }>(`/issues${q}`);
  return result.issues;
}

export async function getIssue(issueId: string): Promise<Issue> {
  const result = await request<{ issue: Issue }>(`/issues/${issueId}`);
  return result.issue;
}

/** Client only, while order is `issue_window_open`. Auto-creates a payout hold. */
export async function reportOrderIssue(
  orderId: string,
  input: { description?: string; reason?: string; kind?: string },
): Promise<{ issue: Issue; claim: Claim }> {
  return request(`/orders/${orderId}/issues`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function resolveIssue(
  issueId: string,
  input: {
    resolution?: string;
    reason?: string;
    status?: "resolved" | "dismissed";
    releasePayout?: boolean;
  },
): Promise<Issue> {
  const result = await request<{ issue: Issue }>(`/issues/${issueId}/resolve`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.issue;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/**
 * The full log is Super Admin only. Operations may read only its workspace
 * records: `action` of `order.production_override`, `file.early_delete` or
 * `file.retention_delete`, or `entityType: "file"` with an `entityId`; any
 * other scope is `403`. `__tests__/ops-audit-scope.test.ts` holds the call
 * sites outside the admin tree to that.
 */
export async function listAudit(filters?: {
  entityType?: string;
  entityId?: string;
  orderId?: string;
  actorId?: string;
  action?: string;
  limit?: number;
}): Promise<AuditEntry[]> {
  const q = buildQuery({
    entityType: filters?.entityType,
    entityId: filters?.entityId,
    orderId: filters?.orderId,
    actorId: filters?.actorId,
    action: filters?.action,
    limit: filters?.limit,
  });
  const result = await request<{ audit: AuditEntry[] }>(`/audit${q}`);
  return result.audit;
}

// ---------------------------------------------------------------------------
// Dispatch (ops visibility + location read used by portal)
// ---------------------------------------------------------------------------

export async function listDispatchOffers(): Promise<Order[]> {
  const result = await request<{ offers: Order[] }>("/dispatch/offers");
  return normalizeOrders(result.offers);
}

export async function getDispatchLocation(orderId: string): Promise<LocationPing | null> {
  const result = await request<{ ping: LocationPing | null }>(
    `/dispatch/${orderId}/location`,
  );
  return result.ping;
}

export async function listRiderLocations(): Promise<RiderLocation[]> {
  const result = await request<{ riders: RiderLocation[] }>("/ops/riders/locations");
  return result.riders;
}

/** Rider only — included so the client surface is complete. */
export async function acceptDispatchOffer(orderId: string): Promise<Order> {
  const result = await request<{ order: Order }>(`/dispatch/${orderId}/accept`, {
    method: "POST",
  });
  return normalizeOrder(result.order);
}

/** Rider only. */
export async function postDispatchLocation(
  orderId: string,
  input: { lat: number; lng: number; accuracy?: number | null },
): Promise<LocationPing> {
  const result = await request<{ ping: LocationPing }>(`/dispatch/${orderId}/location`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.ping;
}

/**
 * Rider only. Records delivery evidence and atomically opens the issue window.
 * Requires a settled balance (confirmed, or `not_required` on an order paid up
 * front) and a delivered Proof of Fulfilment on the order.
 */
export async function recordDelivery(
  orderId: string,
  input: { evidenceFileId: string; evidenceType?: "photo" | "signature" },
): Promise<Order> {
  const result = await request<{ order: Order }>(`/dispatch/${orderId}/delivery`, {
    method: "POST",
    body: JSON.stringify({ evidenceType: "photo", ...input }),
  });
  return normalizeOrder(result.order);
}

// ---------------------------------------------------------------------------
// Shop listings — /me/catalog-items. Contract: gridgo-api docs/SUPPLIER_CATALOG_API.md
// ---------------------------------------------------------------------------

function versioned(version: number | null, body?: Record<string, unknown>): RequestInit {
  const headers: Record<string, string> = {};
  if (version != null) headers["If-Match"] = String(version);
  const payload =
    body == null
      ? version != null
        ? { expectedVersion: version }
        : undefined
      : { ...body, ...(version != null ? { expectedVersion: version } : {}) };
  return {
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  };
}

export type CatalogListQuery = {
  q?: string | null;
  sort?: string | null;
  subcategoryCode?: string | null;
  active?: boolean | null;
  limit?: number | null;
  cursor?: string | null;
};

export async function listCatalogItems(query: CatalogListQuery = {}): Promise<unknown> {
  const params = new URLSearchParams();
  const q = (query.q ?? "").trim();
  if (q) params.set("q", q);
  if (query.sort) params.set("sort", query.sort);
  if (query.subcategoryCode) params.set("subcategoryCode", query.subcategoryCode);
  if (query.active != null) params.set("active", query.active ? "true" : "false");
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const search = params.toString();
  return request<unknown>(`/me/catalog-items${search ? `?${search}` : ""}`);
}

export async function getCatalogItem(itemId: string): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}`);
}

/** Staff index of every shop's listings. Shop is on each row. */
export type StaffCatalogQuery = {
  q?: string | null;
  subcategoryCode?: string | null;
  supplierId?: string | null;
  minPriceMinor?: number | null;
  maxPriceMinor?: number | null;
  limit?: number | null;
  cursor?: string | null;
};

export async function listStaffCatalogItems(query: StaffCatalogQuery = {}): Promise<unknown> {
  const params = new URLSearchParams();
  const q = (query.q ?? "").trim();
  if (q) params.set("q", q);
  if (query.subcategoryCode) params.set("subcategoryCode", query.subcategoryCode);
  if (query.supplierId) params.set("supplierId", query.supplierId);
  if (query.minPriceMinor != null) params.set("minPriceMinor", String(query.minPriceMinor));
  if (query.maxPriceMinor != null) params.set("maxPriceMinor", String(query.maxPriceMinor));
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const search = params.toString();
  return request<unknown>(`/ops/catalog-items${search ? `?${search}` : ""}`);
}

export async function getStaffCatalogItem(itemId: string): Promise<unknown> {
  return request<unknown>(`/ops/catalog-items/${encodeURIComponent(itemId)}`);
}

export async function suspendStaffCatalogItem(itemId: string, reason: string): Promise<unknown> {
  return request<unknown>(`/catalog-items/${encodeURIComponent(itemId)}/suspend`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function restoreStaffCatalogItem(itemId: string): Promise<unknown> {
  return request<unknown>(`/catalog-items/${encodeURIComponent(itemId)}/restore`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ---------------------------------------------------------------------------
// Listing review (gridgo-api#154). Contract: gridgo-api
// docs/SUPPLIER_CATALOG_API.md#listing-review-and-product-type-picker
// ---------------------------------------------------------------------------

export type ReviewQueueStatus = "pending" | "approved" | "needs_revision";

/** Up to 50 listings in one review state; `after` is the last item id read. */
export async function listCatalogReviews(
  status: ReviewQueueStatus = "pending",
  after?: string | null,
): Promise<unknown> {
  const params = new URLSearchParams({ status });
  if (after) params.set("after", after);
  return request<unknown>(`/ops/catalog-reviews?${params.toString()}`);
}

export type CatalogReviewDecision =
  | { status: "approved"; photosUnbranded: true }
  | { status: "needs_revision"; reason: string };

export async function decideCatalogReview(
  itemId: string,
  expectedVersion: number,
  decision: CatalogReviewDecision,
): Promise<unknown> {
  return request<unknown>(`/ops/catalog-reviews/${encodeURIComponent(itemId)}/decision`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion, ...decision }),
  });
}

/** The approved version clients see now, for comparing a pending change. */
export async function getStaffPublicCatalogItem(itemId: string): Promise<unknown> {
  return request<unknown>(`/ops/catalog/items/${encodeURIComponent(itemId)}`);
}

export async function listProductTypeRequests(
  status?: ReviewQueueStatus | null,
  after?: string | null,
): Promise<unknown> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (after) params.set("after", after);
  const search = params.toString();
  return request<unknown>(`/ops/product-type-requests${search ? `?${search}` : ""}`);
}

export type ProductTypeDecision =
  | { status: "approved"; code: string }
  | { status: "needs_revision"; reason: string };

export async function decideProductTypeRequest(
  requestId: string,
  expectedVersion: number,
  decision: ProductTypeDecision,
): Promise<unknown> {
  return request<unknown>(
    `/ops/product-type-requests/${encodeURIComponent(requestId)}/decision`,
    { method: "POST", body: JSON.stringify({ expectedVersion, ...decision }) },
  );
}

/** Send a listing (back) to Operations. Fails `409 listing_incomplete` with `blockers`. */
export async function submitCatalogItemForReview(
  itemId: string,
  version: number | null,
): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}/submit`, {
    method: "POST",
    ...versioned(version, {}),
  });
}

/** Whether matching can use each of this shop's listings, and the missing steps. */
export async function getSupplierReadiness(): Promise<unknown> {
  return request<unknown>("/me/supplier-readiness");
}

export async function listMySupplierServices(): Promise<unknown> {
  return request<unknown>("/me/supplier-services");
}

export async function createCatalogItem(body: Record<string, unknown>): Promise<unknown> {
  return request<unknown>("/me/catalog-items", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateCatalogItem(
  itemId: string,
  version: number | null,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    ...versioned(version, body),
  });
}

export async function deleteCatalogItem(
  itemId: string,
  version: number | null,
): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    ...versioned(version),
  });
}

export async function putCatalogItemFileFormats(
  itemId: string,
  version: number | null,
  mode: "inherit" | "override",
  formatCodes: string[],
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-items/${encodeURIComponent(itemId)}/file-formats`,
    {
      method: "PUT",
      ...versioned(version, { mode, formatCodes }),
    },
  );
}

export async function createCatalogOptionGroup(
  itemId: string,
  itemVersion: number | null,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-items/${encodeURIComponent(itemId)}/option-groups`,
    {
      method: "POST",
      ...versioned(itemVersion, body),
    },
  );
}

export async function updateCatalogOptionGroup(
  itemId: string,
  groupId: string,
  groupVersion: number | null,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-items/${encodeURIComponent(itemId)}/option-groups/${encodeURIComponent(groupId)}`,
    { method: "PATCH", ...versioned(groupVersion, body) },
  );
}

export async function deleteCatalogOptionGroup(
  itemId: string,
  groupId: string,
  groupVersion: number | null,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-items/${encodeURIComponent(itemId)}/option-groups/${encodeURIComponent(groupId)}`,
    { method: "DELETE", ...versioned(groupVersion) },
  );
}

export async function createCatalogOption(
  groupId: string,
  groupVersion: number | null,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-option-groups/${encodeURIComponent(groupId)}/options`,
    {
      method: "POST",
      ...versioned(groupVersion, body),
    },
  );
}

export async function updateCatalogOption(
  groupId: string,
  optionId: string,
  groupVersion: number | null,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-option-groups/${encodeURIComponent(groupId)}/options/${encodeURIComponent(optionId)}`,
    { method: "PATCH", ...versioned(groupVersion, body) },
  );
}

export async function deleteCatalogOption(
  groupId: string,
  optionId: string,
  groupVersion: number | null,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-option-groups/${encodeURIComponent(groupId)}/options/${encodeURIComponent(optionId)}`,
    { method: "DELETE", ...versioned(groupVersion) },
  );
}

export async function listCatalogItemPrepSteps(itemId: string): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}/prep-steps`);
}

export async function createCatalogItemPrepStep(
  itemId: string,
  version: number | null,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}/prep-steps`, {
    method: "POST",
    ...versioned(version, body),
  });
}

export async function updateCatalogItemPrepStep(
  itemId: string,
  stepId: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-items/${encodeURIComponent(itemId)}/prep-steps/${encodeURIComponent(stepId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export async function deleteCatalogItemPrepStep(
  itemId: string,
  stepId: string,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-items/${encodeURIComponent(itemId)}/prep-steps/${encodeURIComponent(stepId)}`,
    { method: "DELETE" },
  );
}

export async function listListingStarters(subcategoryCode: string): Promise<unknown> {
  const q = buildQuery({ subcategoryCode });
  return request<unknown>(`/listing-starters${q}`);
}

export async function listAcceptedFileFormats(q?: string): Promise<
  Array<{
    code: string;
    displayName: string;
    inputKind: "file" | "url";
    uploadable?: boolean;
  }>
> {
  const search = buildQuery({ q });
  const result = await request<{
    formats?: Array<{
      code: string;
      displayName: string;
      inputKind: "file" | "url";
      uploadable?: boolean;
    }>;
  }>(`/accepted-file-formats${search}`);
  return result.formats ?? [];
}

export async function uploadCatalogItemPhoto(file: File): Promise<StoredFile> {
  const body = new FormData();
  body.append("purpose", "catalog_item_photo");
  body.append("file", file);
  const result = await request<{ file: StoredFile }>("/files", {
    method: "POST",
    body,
  });
  return result.file;
}

export async function attachCatalogItemPhoto(
  fileId: string,
  catalogItemId: string,
  sortOrder: number,
  altText?: string,
): Promise<unknown> {
  const payload: Record<string, unknown> = { catalogItemId, sortOrder };
  if (altText) payload.altText = altText;
  return request<unknown>(`/files/${encodeURIComponent(fileId)}/attach`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Board order of the samples that stay. The first id is the wide sample.
 * A shorter list takes the missing photos off the listing. The stored files
 * stay; this does not call file DELETE.
 */
export async function reorderCatalogPhotos(
  itemId: string,
  fileIds: string[],
  expectedVersion: number,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-items/${encodeURIComponent(itemId)}/photos/reorder`,
    {
      method: "POST",
      ...versioned(expectedVersion, { fileIds }),
    },
  );
}

// ---------------------------------------------------------------------------
// Public issue reports — Operations and Super Admin
// ---------------------------------------------------------------------------

/**
 * Newest first. `limit` (API cap 500) and `before` (the id of the last report
 * already shown) page the list; `counts` are always the totals per status.
 */
export async function listIssueReports(
  status: IssueReportStatus,
  page: { limit?: number; before?: string | null } = {},
): Promise<{ reports: IssueReport[]; counts: IssueReportCounts }> {
  return request(`/ops/issue-reports${buildQuery({ status, limit: page.limit, before: page.before })}`);
}

export async function updateIssueReport(
  id: string,
  input: { status: IssueReportStatus; publishedIn?: string | null; trackerIssueUrl?: string | null },
): Promise<IssueReport> {
  return request<IssueReport>(`/ops/issue-reports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Super Admin Tracker — the captain's sheet, read from GitHub issues by the
// API. Super Admin only; `503 tracker_not_configured` until the server has
// its GitHub token. Contract: gridgo-api docs/TRACKER_API.md.
// ---------------------------------------------------------------------------

/** The tracker's own file purpose: PNG, JPEG, WebP or PDF, 10 MB, 6 per decision. */
export const TRACKER_ATTACHMENT_PURPOSE = "tracker_decision";

function trackerItemPath(item: Pick<TrackerItem, "repo" | "number">): string {
  return `/admin/tracker/${encodeURIComponent(item.repo)}/${encodeURIComponent(String(item.number))}`;
}

/** Writes answer the updated item, bare or as `{ item }`. */
function unwrapTrackerItem(result: TrackerItem | { item: TrackerItem }): TrackerItem {
  return "item" in result ? result.item : result;
}

/** Every tracker item, in report order. `refresh` skips the API's 60 s GitHub cache. */
export async function getTracker(options?: { refresh?: boolean }): Promise<TrackerBoard> {
  return request<TrackerBoard>(
    `/admin/tracker${buildQuery({ refresh: options?.refresh ? 1 : undefined })}`,
  );
}

/** Stores one status label on the GitHub issue (and closes/reopens it). */
export async function setTrackerStatus(
  item: Pick<TrackerItem, "repo" | "number">,
  input: { status: TrackerStatus; note?: string },
): Promise<TrackerItem> {
  const payload: { status: TrackerStatus; note?: string } = { status: input.status };
  const note = input.note?.trim();
  if (note) payload.note = note;
  const result = await request<TrackerItem | { item: TrackerItem }>(
    `${trackerItemPath(item)}/status`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
  return unwrapTrackerItem(result);
}

/** Upload one decision attachment. The upload alone files nothing. */
export async function uploadTrackerAttachment(file: File): Promise<StoredFile> {
  const body = new FormData();
  body.append("purpose", TRACKER_ATTACHMENT_PURPOSE);
  body.append("file", file);
  const uploaded = await request<{ file: StoredFile }>("/files", {
    method: "POST",
    body,
  });
  return uploaded.file;
}

/** Only while the item is `needs-decision`; firstmate is told straight away. */
export async function recordTrackerDecision(
  item: Pick<TrackerItem, "repo" | "number">,
  input: RecordTrackerDecisionInput,
): Promise<TrackerItem> {
  const payload: RecordTrackerDecisionInput = { text: input.text };
  if (input.attachmentIds?.length) payload.attachmentIds = input.attachmentIds;
  if (input.status) payload.status = input.status;
  const result = await request<TrackerItem | { item: TrackerItem }>(
    `${trackerItemPath(item)}/decisions`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  return unwrapTrackerItem(result);
}

/** A short-lived signed link to one decision attachment. Fetch it on click. */
export async function getTrackerAttachmentUrl(
  decisionId: string,
  attachmentId: string,
): Promise<string> {
  const result = await request<{ url: string }>(
    `/admin/tracker/decisions/${encodeURIComponent(decisionId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  return result.url;
}

// ---------------------------------------------------------------------------
// Client refunds (gridgo-api/docs/REFUNDS_API.md)
//
// Approval reserves money; it never sends any. Operations pays by hand to the
// client's own receiving QR and records the wallet screenshot as transfer
// evidence. Every write carries an `Idempotency-Key` (a retry with the same
// key and body replays the saved answer) and, on an existing request, the
// `expectedVersion` the screen was showing (`409 refund_stale` otherwise).
// ---------------------------------------------------------------------------

/** A fresh opaque key for one refund command. Reuse it only to retry the same body. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function refundCommand(key: string, body: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(body),
  };
}

async function refundWrite(
  path: string,
  key: string,
  body: Record<string, unknown>,
): Promise<RefundRequest> {
  const result = await request<{ refund: RefundRequest }>(path, refundCommand(key, body));
  return result.refund;
}

/** Ops / Super Admin see every request; an optional exact status filter. */
export async function listRefunds(status?: RefundStatus): Promise<RefundRequest[]> {
  const result = await request<{ refunds: RefundRequest[] }>(
    `/refund-requests${buildQuery({ status })}`,
  );
  return result.refunds ?? [];
}

export async function listOrderRefunds(orderId: string): Promise<RefundRequest[]> {
  const result = await request<{ refunds: RefundRequest[] }>(
    `/orders/${encodeURIComponent(orderId)}/refund-requests`,
  );
  return result.refunds ?? [];
}

export async function getRefund(refundId: string): Promise<RefundRequest> {
  const result = await request<{ refund: RefundRequest }>(
    `/refund-requests/${encodeURIComponent(refundId)}`,
  );
  return result.refund;
}

/**
 * Operations files for the client (late filing: Super Admin only). Staff never
 * send a destination: only the client can supply their receiving QR.
 */
export async function fileRefundRequest(
  orderId: string,
  input: { kind: RefundKind; reason: string; evidenceFileIds?: string[] },
  key: string,
): Promise<RefundRequest> {
  const result = await request<{ refund: RefundRequest }>(
    `/orders/${encodeURIComponent(orderId)}/refund-requests`,
    refundCommand(key, { ...input, evidenceFileIds: input.evidenceFileIds ?? [] }),
  );
  return result.refund;
}

/** Ops / Super Admin evidence for a request they file. JPEG, PNG or WebP, 15 MiB. */
export async function uploadRefundEvidence(file: File): Promise<StoredFile> {
  return uploadPurpose("refund_evidence", file);
}

/** The wallet screenshot of a client refund transfer. JPEG, PNG or WebP, 15 MiB. */
export async function uploadRefundReceipt(file: File): Promise<StoredFile> {
  return uploadPurpose("refund_receipt", file);
}

async function uploadPurpose(purpose: string, file: File): Promise<StoredFile> {
  const body = new FormData();
  body.append("purpose", purpose);
  body.append("file", file);
  const uploaded = await request<{ file: StoredFile }>("/files", { method: "POST", body });
  return uploaded.file;
}

export async function reviewRefund(
  refund: Pick<RefundRequest, "id" | "version">,
  input: { reason: string; destinationVerified: true; substantiated?: boolean },
  key: string,
): Promise<RefundRequest> {
  return refundWrite(`/refund-requests/${refund.id}/review`, key, {
    expectedVersion: refund.version,
    ...input,
  });
}

/** Read-only calculation; needs no idempotency key. */
export async function previewRefundSettlement(
  refund: Pick<RefundRequest, "id" | "version">,
  input: SettlementInput,
): Promise<RefundPreview> {
  return request<RefundPreview>(`/refund-requests/${refund.id}/settlement-preview`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: refund.version, ...input }),
  });
}

export async function settleRefund(
  refund: Pick<RefundRequest, "id" | "version">,
  input: SettlementInput & {
    totalMinor: number;
    reason: string;
    workStopped: true;
    shopAgreement: string;
    deliveryEvidence: string;
  },
  key: string,
): Promise<RefundRequest> {
  return refundWrite(`/refund-requests/${refund.id}/settle`, key, {
    expectedVersion: refund.version,
    ...input,
  });
}

export async function rejectRefund(
  refund: Pick<RefundRequest, "id" | "version">,
  reason: string,
  key: string,
): Promise<RefundRequest> {
  return refundWrite(`/refund-requests/${refund.id}/reject`, key, {
    expectedVersion: refund.version,
    reason,
  });
}

/** Reserve one payer before anyone sends. `provider`/`sourceWallet` name the sending wallet. */
export async function reserveRefundPayment(
  refund: Pick<RefundRequest, "id" | "version">,
  input: {
    reason: string;
    destinationRevision: RefundDestination["revision"];
    destinationVerified: true;
    provider: string;
    sourceWallet: string;
  },
  key: string,
): Promise<RefundRequest> {
  return refundWrite(`/refund-requests/${refund.id}/payment-attempts`, key, {
    expectedVersion: refund.version,
    ...input,
  });
}

export async function reconcileRefundPayment(
  refund: Pick<RefundRequest, "id" | "version">,
  input:
    | { reason: string; outcome: "unknown" }
    | { reason: string; outcome: "failed"; noTransferConfirmed: true },
  key: string,
): Promise<RefundRequest> {
  return refundWrite(`/refund-requests/${refund.id}/reconcile`, key, {
    expectedVersion: refund.version,
    ...input,
  });
}

export async function recordRefundPayment(
  refund: Pick<RefundRequest, "id" | "version">,
  input: {
    reason: string;
    attemptId: string;
    amountMinor: number;
    reference: string;
    receiptFileId: string;
    paidAt: string;
  },
  key: string,
): Promise<RefundRequest> {
  return refundWrite(`/refund-requests/${refund.id}/payments`, key, {
    expectedVersion: refund.version,
    ...input,
  });
}

/** The shop's separately labelled settlement payout: exact amount, current QR, reference and receipt. */
export async function recordSupplierSettlementPayout(
  refund: Pick<RefundRequest, "id" | "version">,
  input: {
    reason: string;
    amountMinor: number;
    payoutAccountVersion: number;
    destinationVerified: true;
    reference: string;
    receiptFileId: string;
  },
  key: string,
): Promise<RefundRequest> {
  return refundWrite(`/refund-requests/${refund.id}/supplier-payout`, key, {
    expectedVersion: refund.version,
    ...input,
  });
}
