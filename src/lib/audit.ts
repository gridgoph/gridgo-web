/**
 * The permanent audit log (contract `gridgo-api/docs/AUDIT_API.md`): who did
 * what, from which app, what it changed and why. Entries are append-only; the
 * portal only reads, searches and exports them.
 *
 * Super Admin reads everything (`GET /audit`). Operations reads only the
 * correction and deletion records, and on an order only those
 * (`GET /orders/:id/audit`, which the API scopes itself).
 *
 * `before` and `after` are often whole snapshots of the item (the entire order
 * or every setting), so the screens lead with the fields that changed and keep
 * the rest folded away. Values are shown in words, never as raw codes, with
 * the recorded JSON one click away for exactness.
 */

import { isApiError } from "@/lib/api/client";
import type { AuditEntry } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";

// ---- Filters ---------------------------------------------------------------

/** What the Audit log screen filters by, as typed. Dates are Manila days. */
export type AuditFilters = {
  /** Free text: name, action, item or order ID, or reason. */
  q: string;
  /** Part of the person's name or GRIDGO user ID. */
  person: string;
  /** One exact action code. */
  action: string;
  /** One exact order ID. */
  orderId: string;
  /** One exact item type. */
  entityType: string;
  /** `YYYY-MM-DD`, read as Asia/Manila. */
  from: string;
  /** `YYYY-MM-DD`, read as Asia/Manila; the whole day is included. */
  to: string;
};

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  q: "",
  person: "",
  action: "",
  orderId: "",
  entityType: "",
  from: "",
  to: "",
};

const FILTER_KEYS = Object.keys(EMPTY_AUDIT_FILTERS) as (keyof AuditFilters)[];

export function auditFiltersFromSearchParams(params: URLSearchParams): AuditFilters {
  const filters = { ...EMPTY_AUDIT_FILTERS };
  for (const key of FILTER_KEYS) filters[key] = params.get(key)?.trim() ?? "";
  return filters;
}

/** `?q=…&from=…` for the screen's own URL; empty filters are left out. */
export function auditSearchFromFilters(filters: AuditFilters): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function auditFiltersAreSet(filters: AuditFilters): boolean {
  return FILTER_KEYS.some((key) => filters[key].trim() !== "");
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDay(day: string): boolean {
  if (!DAY_PATTERN.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

/** 00:00 of a Manila day, as the UTC timestamp the API takes. */
export function manilaDayStart(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - MANILA_OFFSET_MS).toISOString();
}

/** The last millisecond of a Manila day, as a UTC timestamp. */
export function manilaDayEnd(day: string): string {
  return new Date(Date.parse(`${day}T23:59:59.999Z`) - MANILA_OFFSET_MS).toISOString();
}

/** Today in Manila, `YYYY-MM-DD`. */
export function manilaToday(now: number = Date.now()): string {
  return new Date(now + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** The query the API reads for these filters. */
export type AuditQuery = {
  q?: string;
  person?: string;
  action?: string;
  orderId?: string;
  entityType?: string;
  from?: string;
  to?: string;
};

/**
 * Filters → API query, or the reason they cannot be sent. Manila days become
 * UTC timestamps, because a date-only `from` would start the API's day at
 * 08:00 Manila time and drop the morning.
 */
export function auditQuery(filters: AuditFilters): { query: AuditQuery } | { error: string } {
  const from = filters.from.trim();
  const to = filters.to.trim();
  if (from && !validDay(from)) return { error: "Enter the From date as a full date." };
  if (to && !validDay(to)) return { error: "Enter the To date as a full date." };
  if (from && to && from > to) return { error: "The From date is after the To date." };
  for (const [key, label] of [
    ["q", "Search"],
    ["person", "Person"],
    ["orderId", "Order"],
  ] as const) {
    if (filters[key].trim().length > 200) return { error: `${label} is too long; use at most 200 characters.` };
  }
  const query: AuditQuery = {};
  if (filters.q.trim()) query.q = filters.q.trim();
  if (filters.person.trim()) query.person = filters.person.trim();
  if (filters.action.trim()) query.action = filters.action.trim();
  if (filters.orderId.trim()) query.orderId = filters.orderId.trim();
  if (filters.entityType.trim()) query.entityType = filters.entityType.trim();
  if (from) query.from = manilaDayStart(from);
  if (to) query.to = manilaDayEnd(to);
  return { query };
}

/**
 * The fixed upper bound for a multi-page export: the end of the To day, or
 * now when that is later. Pinning it keeps entries written during the export
 * from shifting the page boundaries (AUDIT_API.md, Reads and export).
 */
export function exportUpperBound(query: AuditQuery, now: number = Date.now()): string {
  const nowIso = new Date(now).toISOString();
  if (!query.to) return nowIso;
  return Date.parse(query.to) < now ? query.to : nowIso;
}

/** `gridgo-audit-2026-10-15.csv`, or with the order ID for one order. */
export function auditCsvFilename(orderId?: string, now: number = Date.now()): string {
  const safeOrder = orderId?.replace(/[^A-Za-z0-9_-]/g, "");
  return safeOrder
    ? `gridgo-audit-${safeOrder}-${manilaToday(now)}.csv`
    : `gridgo-audit-${manilaToday(now)}.csv`;
}

// ---- Actions -----------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  // Orders
  "order.created": "Created order",
  "order.transition": "Moved order to a new step",
  "order.transition_refused": "Refused a step change",
  "order.production_override": "Moved job on for the shop",
  "order.file_check": "Checked the artwork file",
  // The quality review's own records (Ven's QA review, gridgo-api#253).
  "order.qa_tick": "Ticked or cleared a quality check",
  "order.qa_message": "Messaged the client about the file",
  "order.qa_hold": "Held the order and told the client",
  "order.qa_request_file": "Asked the client for a new file",
  "order.artwork_download": "Downloaded the artwork",
  "order.artwork_download_all": "Downloaded all the artwork",
  "order.supplier_assigned": "Assigned a shop",
  "order.supplier_changed": "Changed the shop",
  "order.rider_assigned": "Changed the rider",
  "order.commercial_commitment": "Committed the order price",
  "order.quote_superseded": "Replaced the quote",
  "order.confirm_delivery": "Confirmed delivery",
  "order.dropoff_confirmed": "Confirmed the drop-off pin",
  "order.dropoff_review_requested": "Asked to review the drop-off pin",
  "order.physical_invoice_requested": "Asked for a paper invoice",
  "order.physical_invoice_promised": "Promised the paper invoice",
  "order.rated": "Rated the order",
  "order.reschedule_requested": "Asked to move the deadline",
  "order.reschedule_resolved": "Resolved a deadline request",
  "order.shop_timed_out": "Shop did not accept in time",
  "order.shop_declined": "Shop declined the order",
  "order.shop_cancelled": "Shop cancelled the order",
  "order.shop_recovery_accept": "Client accepted a replacement shop",
  "order.shop_recovery_refund": "Client chose a refund over a new shop",
  "order_match.checkout": "Checked out",
  "basket.checkout": "Checked out a multi-shop basket",
  "basket.payment_confirm": "Confirmed the basket payment",
  "basket.payment_reject": "Rejected the basket payment",
  "dispatch.milestone": "Recorded a delivery step",
  "pickup_checklist.escalate": "Escalated the counter check",
  "pickup_checklist.handoff_signed": "Shop signed the counter check",
  "pickup_escalation.resolve": "Resolved a counter escalation",
  "production_lapse.no_communication": "Recorded a late job with no word from the shop",
  "production_lapse.warning": "Warned a shop about a late job",
  "production_lapse.deduction": "Deducted for a late job",
  // Payments and payouts
  "payment.initial_submit": "Sent a payment reference",
  "payment.initial_confirm": "Confirmed a payment",
  "payment.initial_reject": "Rejected a payment",
  "payment.final_online_submit": "Sent a balance reference",
  "payment.final_online_confirm": "Confirmed the balance",
  "payment.final_online_reject": "Rejected the balance",
  "payout_milestone.release": "Released a shop payout",
  "credits.grant": "Granted Pilot Credits",
  // Refunds, claims and issues
  "refund.requested": "Requested a refund",
  "refund.reviewed": "Reviewed a refund",
  "refund.approved": "Approved a refund",
  "refund.rejected": "Declined a refund",
  "refund.withdrawn": "Withdrew a refund request",
  "refund.destination": "Replaced the refund QR",
  "refund.settled": "Settled a refund",
  "refund.attempt": "Reserved a refund transfer",
  "refund.unknown": "Marked a refund transfer unconfirmed",
  "refund.failed": "Recorded a failed refund transfer",
  "refund.supplier_paid": "Paid a shop its settlement share",
  "refund.paid": "Recorded a refund transfer",
  "claim.raise": "Raised a claim",
  "claim.create": "Raised a claim",
  "claim.hold": "Held payouts for a claim",
  "claim.release": "Released a claim hold",
  "issue.report": "Client reported an issue",
  "issue.resolve": "Resolved an issue",
  // Vouchers
  "voucher.campaign_create": "Created a voucher campaign",
  "voucher.campaign_update": "Changed a voucher campaign",
  "voucher.issued": "Issued a voucher",
  "voucher.bulk_issue": "Issued vouchers in bulk",
  "voucher.void": "Voided a voucher",
  "voucher.redeemed": "Voucher used at checkout",
  "voucher.restored": "Voucher given back",
  // People and staff
  "user.created": "Created an account",
  "user.deleted": "Deleted an account",
  "user.updated": "Changed an account",
  "user.role_change": "Changed a role",
  "user.role_update": "Changed user role",
  "user.role": "Changed user role",
  "user.verification": "Updated verification",
  "user.account_suspend": "Suspended an account",
  "user.account_remove": "Removed an account",
  "user.account_restore": "Restored an account",
  "user.shop_update": "Changed shop details",
  "staff.sign_in": "Signed in",
  "staff.invite_created": "Invited a staff member",
  "staff.invite_redeemed": "Accepted a staff invite",
  "staff.invite_revoked": "Revoked a staff invite",
  "staff.profile_updated": "Changed a staff member",
  "staff.role_created": "Gave a staff role",
  "administrator.bootstrap": "Set up the first administrator",
  "approval_case.approve": "Approved an application",
  "approval_case.reject": "Sent back an application",
  "approval_case.suspend": "Suspended an approval",
  "approval_case.restore": "Reinstated an approval",
  "approval_case.reapply": "Reapplied for approval",
  "client_account.business_apply": "Applied for a business account",
  "client_account.update": "Changed a client account",
  "client_application.request_business_permit": "Asked for a business permit",
  "organization.officer_handover": "Handed over the organization officer",
  "rider_profile.update": "Changed a rider profile",
  // Shops and listings
  "supplier_service.create": "Created a service line",
  "supplier_service.update": "Changed a service line",
  "supplier_service.submit": "Sent a service line for review",
  "supplier_service.verify": "Verified supplier service",
  "supplier_service.suspend": "Suspended supplier service",
  "supplier_service.withdraw": "Withdrew a service line",
  "supplier_service.delete": "Deleted a service line",
  "supplier_profile.update": "Changed a shop profile",
  "supplier_payment_terms.update": "Changed shop payment terms",
  "supplier_invoice.expected": "Expected a shop invoice",
  "supplier_invoice.scan_attached": "Attached a shop invoice scan",
  "service.restore": "Restored a service line",
  "catalog_item.create": "Created a listing",
  "catalog_item.update": "Changed a listing",
  "catalog_item.submit": "Sent a listing for review",
  "catalog_item.review": "Reviewed a listing",
  "catalog_item.suspend": "Took down a listing",
  "catalog_item.restore": "Restored a listing",
  "catalog_item.delete": "Deleted a listing",
  "product_type.request": "Asked for a new product type",
  "product_type.review": "Reviewed a product type request",
  "catalog.featured_prints_update": "Changed Featured Prints",
  // Settings
  "settings.operational_update": "Changed operational settings",
  "settings.payment_qr_replace": "Replaced the payment QR",
  "zone.create": "Created delivery zone",
  "zone.update": "Updated delivery zone",
  "season_window.created": "Created a season window",
  "season_window.updated": "Changed a season window",
  "season_window.deleted": "Deleted a season window",
  "season_window.notice_queued": "Queued a pre-season notice",
  "season_window.push_setting_updated": "Changed pre-season notices",
  "announcement.broadcast": "Sent a broadcast",
  "taxonomy.category.create": "Created category",
  "taxonomy.category.update": "Updated category",
  "taxonomy.material.create": "Created material",
  "taxonomy.material.update": "Updated material",
  "taxonomy.finish.create": "Created finish",
  "taxonomy.finish.update": "Updated finish",
  "taxonomy.category_create": "Created a category",
  "taxonomy.category_update": "Changed a category",
  "taxonomy.category_delete": "Deleted a category",
  "taxonomy.subcategory_create": "Created a product type",
  "taxonomy.subcategory_update": "Changed a product type",
  "taxonomy.subcategory_delete": "Deleted a product type",
  "taxonomy.material_create": "Created a material",
  "taxonomy.material_update": "Changed a material",
  "taxonomy.finish_create": "Created a finish",
  "taxonomy.finish_update": "Changed a finish",
  "tracker.status": "Changed tracker status",
  "tracker.decision": "Recorded tracker decision",
  "tracker.priority": "Changed a tracker priority",
  // Legal and privacy
  "legal.created": "Created legal document",
  "legal.edited": "Edited legal document draft",
  "legal.published": "Published legal document",
  "legal.deleted": "Deleted legal document",
  "legal.accepted": "Accepted legal documents",
  "privacy.requested": "Privacy request received",
  "privacy.updated": "Updated privacy request",
  // Files
  "artwork.download_authorized": "Opened an artwork file",
  "file.early_delete": "Deleted a file early",
  "file.retention_delete": "File deleted at end of retention",
  // Hub
  "hub.order_claimed": "Handed out at the hub",
  "hub.redelivery_requested": "Asked for redelivery from the hub",
  "hub.unclaimed_escalated": "Escalated an unclaimed hub order",
  "handover.escalated": "Escalated a hub handover",
  // Surveys
  "survey.submitted": "Answered the survey",
  "survey.dismissed": "Dismissed the survey",
};

function humanize(code: string): string {
  const words = code
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return words.replace(/^\w/, (c) => c.toUpperCase());
}

/** An action code in plain words. Unknown codes are spelled out, never shown raw. */
export function presentAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? humanize(action);
}

/**
 * The Action filter: the actions people search for most, by area. The API
 * matches one exact code; free-text search still reaches every other code.
 */
export const AUDIT_ACTION_GROUPS: readonly { label: string; actions: readonly string[] }[] = [
  {
    label: "Orders",
    actions: [
      "order.created",
      "order.transition",
      "order.transition_refused",
      "order.production_override",
      "order.file_check",
      "order.supplier_assigned",
      "order.supplier_changed",
      "order.rider_assigned",
      "order.dropoff_confirmed",
    ],
  },
  {
    label: "Money",
    actions: [
      "payment.initial_confirm",
      "payment.initial_reject",
      "basket.payment_confirm",
      "basket.payment_reject",
      "payout_milestone.release",
      "credits.grant",
      "claim.hold",
      "claim.release",
    ],
  },
  {
    label: "Refunds and vouchers",
    actions: [
      "refund.requested",
      "refund.approved",
      "refund.settled",
      "voucher.campaign_create",
      "voucher.campaign_update",
      "voucher.issued",
      "voucher.void",
    ],
  },
  {
    label: "People and staff",
    actions: [
      "staff.sign_in",
      "user.created",
      "user.deleted",
      "user.role_change",
      "user.account_suspend",
      "user.account_remove",
      "user.account_restore",
      "staff.invite_created",
      "staff.role_created",
    ],
  },
  {
    label: "Settings",
    actions: [
      "settings.operational_update",
      "settings.payment_qr_replace",
      "zone.update",
      "season_window.updated",
      "announcement.broadcast",
    ],
  },
  {
    label: "Legal, privacy and files",
    actions: [
      "legal.published",
      "privacy.updated",
      "artwork.download_authorized",
      "file.early_delete",
      "file.retention_delete",
    ],
  },
];

const ITEM_TYPE_LABELS: Record<string, string> = {
  order: "Order",
  basket: "Multi-shop basket",
  user: "Account",
  settings: "Operational settings",
  credits: "Pilot Credits",
  voucher: "Voucher",
  voucher_campaign: "Voucher campaign",
  refund_request: "Refund",
  claim: "Claim",
  issue: "Issue",
  file: "File",
  supplier_service: "Service line",
  supplier_invoice: "Shop invoice",
  catalog_item: "Listing",
  legal_document: "Legal document",
  privacy_request: "Privacy request",
  account_deletion_request: "Account deletion request",
  zone: "Delivery zone",
  season_window: "Season window",
  category: "Category",
  material: "Material",
  finish: "Finish",
  approval_case: "Application",
  staff_invite: "Staff invite",
};

/** The Item type filter, in the order people look for them. */
export const AUDIT_ITEM_TYPES: readonly string[] = [
  "order",
  "basket",
  "user",
  "settings",
  "refund_request",
  "claim",
  "voucher",
  "voucher_campaign",
  "credits",
  "file",
  "catalog_item",
  "supplier_service",
  "legal_document",
  "privacy_request",
  "zone",
  "season_window",
];

export function presentAuditItemType(entityType: string | null | undefined): string {
  if (!entityType) return "No item";
  return ITEM_TYPE_LABELS[entityType] ?? humanize(entityType);
}

// ---- Who and where -----------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  ops_admin: "Operations",
  supplier: "Shop",
  client: "Client",
  rider: "Rider",
  hub_staff: "Hub staff",
  system: "Automatic",
};

export function presentAuditRole(role: string | null | undefined): string {
  if (!role) return "Role not recorded";
  return ROLE_LABELS[role] ?? humanize(role);
}

/**
 * The person as recorded at the time. Names are snapshots; an old row without
 * one says so rather than borrowing today's name.
 */
export function presentAuditActor(entry: Pick<AuditEntry, "actorId" | "actorName" | "actorRole">): {
  name: string;
  role: string;
} {
  const system = entry.actorRole === "system" || (!entry.actorId && !entry.actorName);
  if (system) return { name: "System", role: "Automatic" };
  return {
    name: entry.actorName?.trim() || entry.actorId || "Name not recorded",
    role: presentAuditRole(entry.actorRole),
  };
}

/**
 * The line under the person's name: their role, then the app. Automatic work
 * reads "Automatic" once, not the role and the app saying it twice.
 */
export function auditActorLine(
  entry: Pick<AuditEntry, "actorId" | "actorName" | "actorRole" | "app">,
): string {
  const actor = presentAuditActor(entry);
  const parts: string[] = [];
  if (actor.role !== actor.name) parts.push(actor.role);
  if (!(actor.name === "System" && (!entry.app || entry.app === "system"))) {
    parts.push(presentAuditApp(entry.app));
  }
  return parts.join(", ");
}

const APP_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  admin: "GRIDGO Admin app",
  client: "Client app",
  supplier: "Supplier app",
  rider: "Rider app",
  system: "Automatic, no app",
  api: "Direct to the API",
};

/**
 * Which app sent the request. Apps may name themselves; otherwise the API
 * keeps the browser origin, which is shown as its host. Never verified.
 */
export function presentAuditApp(app: string | null | undefined): string {
  if (!app) return "Not recorded";
  if (APP_LABELS[app]) return APP_LABELS[app];
  try {
    const url = new URL(app);
    if (url.hostname === "gridgo-dash.talasora.com") return "Dashboard";
    return url.host;
  } catch {
    return humanize(app);
  }
}

/** A user agent shortened to "Chrome on macOS"; the full string stays in the detail. */
export function presentAuditDevice(device: string | null | undefined): string | null {
  if (!device) return null;
  const gridgo = /GRIDGO[\w ]*\/[\d.]+/i.exec(device);
  if (gridgo) return gridgo[0];
  const browser = /Edg\//.test(device)
    ? "Edge"
    : /Firefox\//.test(device)
      ? "Firefox"
      : /Chrome\//.test(device)
        ? "Chrome"
        : /Safari\//.test(device)
          ? "Safari"
          : null;
  const os = /Android/.test(device)
    ? "Android"
    : /iPhone|iPad|iOS/.test(device)
      ? "iOS"
      : /Windows/.test(device)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(device)
          ? "macOS"
          : /Linux/.test(device)
            ? "Linux"
            : null;
  if (browser && os) return `${browser} on ${os}`;
  if (browser || os) return browser ?? os;
  return device.length > 48 ? `${device.slice(0, 47)}…` : device;
}

/** Audit times carry seconds and read in Manila time for everyone. */
export function formatAuditTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const value = Date.parse(iso);
  if (Number.isNaN(value)) return iso;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

/** Every order an entry belongs to: its own, plus a shared basket's or file's. */
export function auditOrderIds(entry: Pick<AuditEntry, "orderId" | "orderIds">): string[] {
  const ids = new Set<string>();
  if (entry.orderId) ids.add(entry.orderId);
  for (const id of entry.orderIds ?? []) if (typeof id === "string" && id) ids.add(id);
  return [...ids];
}

// ---- Before and after ----------------------------------------------------------

/** One field of the item, before and after the action. */
export type AuditFieldRow = {
  /** Stable key, e.g. `payments.initial.status`. */
  path: string;
  /** The path in words, e.g. ["Payments", "Initial", "Status"]. */
  label: string[];
  /** The last key, used to pick how a value reads. */
  key: string;
  before: unknown;
  after: unknown;
};

export type AuditChange =
  | { kind: "none" }
  | { kind: "created"; fields: AuditFieldRow[] }
  | { kind: "removed"; fields: AuditFieldRow[] }
  | { kind: "changed"; changed: AuditFieldRow[]; unchanged: AuditFieldRow[] };

const ABSENT = Symbol("absent");

const FIELD_LABELS: Record<string, string> = {
  state: "Step",
  supplierId: "Shop",
  riderId: "Rider",
  clientId: "Client",
  actorId: "Person",
  serviceFeeRateBps: "Service fee rate",
  serviceFeeSchedule: "Service fee brackets",
  scheduledServiceFee: "Scheduled service fee",
  serviceFeeWorking: "Service fee working",
  brackets: "Bracket",
  upToMinor: "Up to",
  rateBps: "Rate",
  taxableMinor: "Charged on",
  effectiveFrom: "Starts",
  settingsVersion: "Settings version",
  organizationDiscountRateBps: "Organization discount rate",
  riderCommissionBps: "Rider share of delivery",
  commissionRatePercent: "Commission rate",
  issueWindowHours: "Complaint window (hours)",
  downpaymentPercent: "Paid at checkout",
  totalMinor: "Total",
  subtotalMinor: "Subtotal",
  balanceMinor: "Balance",
  amountMinor: "Amount",
  feeMinor: "Fee",
  deliveryFeeMinor: "Delivery fee",
  serviceFeeMinor: "Service fee",
  balanceAfterMinor: "Balance after",
  accountStatus: "Account standing",
  verificationStatus: "Accreditation",
  readyBy: "Ready by",
  payoutHold: "Payouts held",
  payoutMilestones: "Payout stages",
  fulfillmentMode: "Delivery or pick-up",
  opensMinute: "Opens",
  closesMinute: "Closes",
  utcOffsetMinutes: "UTC offset (minutes)",
  artworkReviewMinutes: "File check time (minutes)",
  deliveryFeeBands: "Delivery distance zones",
  hubPickup: "Hub pick-up",
  operatingHours: "Operating hours",
  pofFileIds: "Proof files",
  releasedAt: "Released",
  releasedBy: "Released by",
  sharePercent: "Share",
};

/** Keys that name an array element better than its position does. */
const IDENTITY_KEYS = ["code", "id", "zone", "weekday", "key", "fileId", "installment"] as const;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function elementIdentity(items: unknown[]): (typeof IDENTITY_KEYS)[number] | null {
  if (!items.length || !items.every(isPlainObject)) return null;
  for (const key of IDENTITY_KEYS) {
    const values = items.map((item) => (item as Record<string, unknown>)[key]);
    if (
      values.every((value) => typeof value === "string" || typeof value === "number") &&
      new Set(values).size === values.length
    ) {
      return key;
    }
  }
  return null;
}

function segmentLabel(key: string): string {
  return FIELD_LABELS[key] ?? humanize(key);
}

function identityLabel(key: string, value: string | number): string {
  if (key === "weekday" && typeof value === "number" && WEEKDAYS[value]) return WEEKDAYS[value];
  return typeof value === "number" ? String(value) : humanize(value);
}

type Leaf = { path: string; label: string[]; key: string; value: unknown };

/** Every leaf of a recorded value, keyed by a stable path. */
function flatten(value: unknown, path: string[] = [], label: string[] = [], key = ""): Leaf[] {
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (!entries.length) return [{ path: path.join("."), label, key, value: null }];
    return entries.flatMap(([childKey, child]) =>
      flatten(child, [...path, childKey], [...label, segmentLabel(childKey)], childKey),
    );
  }
  if (Array.isArray(value) && value.some((item) => typeof item === "object" && item !== null)) {
    const identity = elementIdentity(value);
    return value.flatMap((item, index) => {
      const id = identity ? ((item as Record<string, unknown>)[identity] as string | number) : index + 1;
      const segment = identity ? identityLabel(identity, id) : `#${id}`;
      return flatten(item, [...path, `[${String(id)}]`], [...label, segment], key);
    });
  }
  return [{ path: path.join("."), label, key, value }];
}

/** Absent and null are the same emptiness; neither side "changed" between them. */
function same(a: unknown, b: unknown): boolean {
  const empty = (value: unknown) => value === ABSENT || value === null || value === undefined;
  if (empty(a) || empty(b)) return empty(a) && empty(b);
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What an entry changed. Creation has no `before`, removal no `after`; when
 * both are present, the changed fields come first and the rest are kept for
 * anyone who wants the whole record.
 */
export function auditChange(entry: Pick<AuditEntry, "before" | "after">): AuditChange {
  const before = entry.before ?? null;
  const after = entry.after ?? null;
  if (before === null && after === null) return { kind: "none" };
  if (before === null) {
    return {
      kind: "created",
      fields: flatten(after).map((leaf) => ({ ...leaf, before: null, after: leaf.value })),
    };
  }
  if (after === null) {
    return {
      kind: "removed",
      fields: flatten(before).map((leaf) => ({ ...leaf, before: leaf.value, after: null })),
    };
  }
  const beforeLeaves = new Map(flatten(before).map((leaf) => [leaf.path, leaf]));
  const afterLeaves = new Map(flatten(after).map((leaf) => [leaf.path, leaf]));
  const changed: AuditFieldRow[] = [];
  const unchanged: AuditFieldRow[] = [];
  const paths = [...new Set([...beforeLeaves.keys(), ...afterLeaves.keys()])];
  for (const path of paths) {
    const b = beforeLeaves.get(path);
    const a = afterLeaves.get(path);
    const row: AuditFieldRow = {
      path,
      label: (a ?? b)!.label,
      key: (a ?? b)!.key,
      before: b ? b.value : ABSENT,
      after: a ? a.value : ABSENT,
    };
    // An empty placeholder on one side only (`shopRecovery: null` before, its
    // fields after) is not a field of its own; the fields carry the change.
    if ((!a || !b) && same(row.before, row.after)) continue;
    (same(row.before, row.after) ? unchanged : changed).push(row);
  }
  // Bookkeeping moves with every save; the change people look for comes first.
  changed.sort((a, b) => Number(isBookkeeping(a)) - Number(isBookkeeping(b)));
  return { kind: "changed", changed, unchanged };
}

/** Fields every save touches (`updatedAt`, `version`), which say nothing on their own. */
export function isBookkeeping(row: Pick<AuditFieldRow, "key">): boolean {
  return row.key === "updatedAt" || row.key === "version";
}

/** True for a value the entry did not record at all (a field added or dropped). */
export function isAbsent(value: unknown): boolean {
  return value === ABSENT;
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function minuteOfDay(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Names the screen already knows, by GRIDGO ID (shops, riders, clients). */
export type AuditNames = Readonly<Record<string, string>>;

/**
 * One recorded value in words: money in pesos, rates as percentages, times
 * in Manila, steps by their label, IDs by name when the screen knows it.
 */
export function presentAuditValue(key: string, value: unknown, names: AuditNames = {}): string {
  // A field the item did not have yet (or no longer has) reads as empty.
  if (value === ABSENT) return "None";
  // The last service fee bracket has no upper limit.
  if (key === "upToMinor" && value === null) return "No limit";
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (/Minor$/.test(key)) return formatPhp(value);
    if (/Bps$/.test(key)) return `${(value / 100).toLocaleString("en-PH", { maximumFractionDigits: 2 })}%`;
    if (/(Percent|Pct)$/.test(key)) return `${value}%`;
    if (key === "opensMinute" || key === "closesMinute") return minuteOfDay(value);
    if (key === "weekday" && WEEKDAYS[value]) return WEEKDAYS[value];
    return value.toLocaleString("en-PH");
  }
  if (typeof value === "string") {
    if (/^(state|stage|from|to)$|(State|Stage)$/.test(key) && /^[a-z_]+$/.test(value)) {
      return presentStep(value);
    }
    if (/(^role|Role)$/.test(key) && ROLE_LABELS[value]) return ROLE_LABELS[value];
    if (/(status|Status|Mode|method)$/.test(key) && /^[a-z][a-z0-9_]*$/.test(value)) {
      return humanize(value);
    }
    if (/(Id|By)$/.test(key) && names[value]) return `${names[value]} (${value})`;
    if (ISO_INSTANT.test(value)) return formatAuditTime(value);
    // A letters-only code ("awaiting_client") reads as words; IDs keep their
    // digits or sit under an ID key, so they stay exact.
    if (!/(^id|Id|Ids|By)$/.test(key) && /^[a-z]+(_[a-z]+)+$/.test(value)) return humanize(value);
    return value;
  }
  if (Array.isArray(value)) {
    if (!value.length) return "None";
    return value.map((item) => presentAuditValue(key, item, names)).join(", ");
  }
  return JSON.stringify(value);
}

/**
 * An order step in its screen label. `presentOrderState` answers "In progress"
 * for any code it does not know, which would hide what was recorded, so an
 * unknown code is spelled out instead.
 */
function presentStep(code: string): string {
  const label = presentOrderState(code).label;
  return label === "In progress" && code !== "in_progress" ? humanize(code) : label;
}

/** "Step › Payments › Status" — the field path in words. */
export function auditFieldLabel(row: Pick<AuditFieldRow, "label">): string {
  return row.label.length ? row.label.join(" › ") : "Value";
}

/**
 * The entry in one or two lines for a list row: the first changed fields, or
 * what kind of record it is. `more` counts the changed fields not shown.
 */
export function auditChangeSummary(
  entry: Pick<AuditEntry, "action" | "before" | "after">,
  max = 2,
): { rows: AuditFieldRow[]; more: number; line: string | null } {
  const change = auditChange(entry);
  switch (change.kind) {
    case "none":
      return { rows: [], more: 0, line: null };
    case "created":
      return { rows: [], more: 0, line: isCreation(entry.action) ? "New record" : "Values recorded" };
    case "removed":
      return { rows: [], more: 0, line: "Record removed" };
    case "changed": {
      if (!change.changed.length) return { rows: [], more: 0, line: "No values changed" };
      const meaningful = change.changed.filter((row) => !isBookkeeping(row));
      const shown = meaningful.length ? meaningful : change.changed;
      return {
        rows: shown.slice(0, max),
        more: Math.max(0, shown.length - max),
        line: null,
      };
    }
  }
}

/**
 * Actions that bring an item into being. Other entries without a `before`
 * (a sign-in, a download) recorded the item as it stood, not its creation.
 */
export function isCreation(action: string): boolean {
  return /(^|[._])(create|created|bootstrap|placed|checkout|requested|request|issued|bulk_issue|raise|report|apply|invite_created|role_created)$/.test(
    action,
  );
}

/** Parts of `detail` already shown as before/after or reason are not repeated. */
const DETAIL_SHOWN_ELSEWHERE = new Set(["previous", "current", "before", "after", "from", "to", "reason"]);

/** Extra facts the entry recorded beyond its before/after, flattened for reading. */
export function auditDetailRows(detail: AuditEntry["detail"]): AuditFieldRow[] {
  if (!isPlainObject(detail)) return [];
  const rest = Object.fromEntries(
    Object.entries(detail).filter(([key]) => !DETAIL_SHOWN_ELSEWHERE.has(key)),
  );
  if (!Object.keys(rest).length) return [];
  return flatten(rest).map((leaf) => ({ ...leaf, before: null, after: leaf.value }));
}

// ---- Errors --------------------------------------------------------------------

const AUDIT_ERROR_COPY: Record<string, string> = {
  invalid_from: "The From date could not be read. Pick it again.",
  invalid_to: "The To date could not be read. Pick it again.",
  invalid_date_range: "The From date is after the To date.",
  invalid_q: "Search is too long; use at most 200 characters.",
  invalid_person: "Person is too long; use at most 200 characters.",
  invalid_orderId: "Order is too long; use at most 200 characters.",
  invalid_offset: "The log cannot page that far back. Narrow the dates.",
  audit_order_mismatch: "That entry list belongs to a different order. Refresh the page.",
  order_not_found: "That order was not found, so it has no audit entries.",
};

/** Plain words for an audit read or export that failed. */
export function auditErrorMessage(err: unknown, fallback: string): string {
  if (!isApiError(err)) return fallback;
  const specific = AUDIT_ERROR_COPY[err.code];
  if (specific) return specific;
  switch (err.kind) {
    case "unauthorized":
      return "Your session expired. Sign in again to read the audit log.";
    case "forbidden":
      return "Only Super Admin can read the whole audit log.";
    case "not_found":
      return "This server does not have the audit log yet. It arrives with the next API update.";
    case "server":
      return "The audit log could not be read just now. Try again in a moment.";
    default:
      return fallback;
  }
}
