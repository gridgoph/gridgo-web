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
  Notification,
  Order,
  PaymentInstallment,
  PayoutMilestone,
  PayoutMilestoneCode,
  PlatformSettings,
  PortalRole,
  PortalRoleProjection,
  PostAnnouncementInput,
  StoredFile,
  SupplierService,
  Taxonomy,
  TaxonomyCategory,
  TaxonomyFinish,
  TaxonomyMaterial,
  UpdateSettingsInput,
  UpdateSupplierServiceInput,
  UpdateZoneInput,
  User,
  VerificationStatus,
  Zone,
} from "@/lib/api/types";
import { normalizeOrder, normalizeOrders } from "@/lib/payments";

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

async function request<T>(
  path: string,
  init: RequestInit = {},
  tokenOptions?: TokenProviderOptions,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !headers["Content-Type"] && !isFormData) {
    headers["Content-Type"] = "application/json";
  }
  const token = await tokenProvider(tokenOptions);
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
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
    {},
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
   * Required with `state: "supplier_accepted"`. The supplier's own asking price
   * in minor units; the server derives commission, totals and the installments.
   */
  supplierPriceMinor?: number;
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

// ---------------------------------------------------------------------------
// Split digital payment — 75% downpayment, then the 25% balance
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
 * Ops / Super Admin — the manual confirmation that lets an order leave payment.
 * Confirming the downpayment moves the order to `payment_authorized`.
 */
export async function confirmPayment(
  orderId: string,
  installment: PaymentInstallment,
  input: { note?: string } = {},
): Promise<Order> {
  const result = await request<{ order: Order }>(
    `/orders/${orderId}/payments/${installment}/confirm`,
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
    `/orders/${orderId}/payments/${installment}/reject`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return normalizeOrder(result.order);
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
export async function releaseMilestone(
  orderId: string,
  code: PayoutMilestoneCode | string,
  input: { note?: string } = {},
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

export async function getSettings(): Promise<PlatformSettings> {
  const result = await request<{ settings: PlatformSettings }>("/settings");
  return result.settings;
}

/** Ops / Super Admin. Either field may be sent on its own. */
export async function updateSettings(
  input: UpdateSettingsInput,
): Promise<PlatformSettings> {
  const result = await request<{ settings: PlatformSettings }>("/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return result.settings;
}

/** Hosted payment-QR path checkout and this portal fetch without a signed URL. */
export function paymentQrPublicPath(fileId?: string): string {
  return fileId
    ? `/public/payment-qr?v=${encodeURIComponent(fileId)}`
    : "/public/payment-qr";
}

/**
 * Ops / Super Admin. JPEG, PNG or WebP, 5 MiB. Uploads `purpose=payment_qr`
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
  const result = await request<{ settings: PlatformSettings }>("/settings/payment-qr", {
    method: "POST",
    body: JSON.stringify({
      fileId: uploaded.file.fileId,
      reason: "Replaced the payment QR from the portal",
    }),
  });
  return result.settings;
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

export async function createTaxonomyCategory(input: {
  code: string;
  name: string;
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
 * Requires a confirmed balance and a delivered Proof of Fulfilment on the order.
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
