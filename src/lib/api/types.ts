/** Shared GRIDGO API types derived from observed responses. */

export type Role = "client" | "supplier" | "rider" | "ops_admin" | "super_admin";
export type PortalRole = Extract<Role, "supplier" | "ops_admin" | "super_admin">;

export type RoleMembership = {
  role: Role;
};

export type ApprovalCaseSummary = {
  id: string;
  kind: "business_client" | "supplier" | "rider";
  status: "pending" | "approved" | "rejected" | "suspended";
  version: number;
  applicationRevision: number;
  submittedAt: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  suspensionReason: string | null;
  updatedAt: string;
};

export type ApprovalCaseQueueItem = ApprovalCaseSummary & {
  applicant: PortalIdentity | null;
  decidedBy?: string | null;
  /** Display name of whoever made the last decision (reinstate API; optional). */
  decidedByName?: string | null;
};

export type ApprovalCaseQueue = {
  approvalCases: ApprovalCaseQueueItem[];
  nextCursor: string | null;
};

export type ApprovalCaseHistoryEntry = {
  id: string;
  applicationRevision: number;
  fromStatus: ApprovalCaseSummary["status"] | null;
  toStatus: ApprovalCaseSummary["status"];
  actorUserId: string | null;
  actorKind: string;
  reason: string | null;
  requestId: string;
  snapshot: Record<string, unknown>;
  createdAt: string;
};

export type ClientProfile = {
  clientKind: "personal" | "business";
  businessName: string | null;
  businessNature: string | null;
  updatedAt: string;
};

export type BusinessApplication = {
  businessName: string | null;
  businessNature: string | null;
  accountType: "business" | "organization";
};

/**
 * A supplier line that is suspended right now. `suspendedWithAccount` lines
 * went down with the account suspension and may come back on reinstate; any
 * other line was suspended on its own and is reviewed on the Service lines tab.
 */
export type SuspendedServiceLine = {
  id: string;
  name: string;
  suspendedAt: string | null;
  suspendReason: string | null;
  suspendedWithAccount: boolean;
};

export type ApprovalCaseDetail = {
  approvalCase: ApprovalCaseSummary & {
    decidedBy?: string | null;
    decidedByName?: string | null;
  };
  applicant: PortalIdentity | null;
  history: ApprovalCaseHistoryEntry[];
  clientProfile?: ClientProfile | null;
  application?: BusinessApplication;
  /** Supplier cases on the reinstate API. Absent: this API restores the account only. */
  suspendedServiceLines?: SuspendedServiceLine[];
};

/** `POST /approval-cases/:id/<decision>` answers with the fresh detail. */
export type ApprovalDecisionResult = ApprovalCaseDetail & {
  /** Restore only, on the reinstate API: the lines that actually went back live. */
  restoredServiceIds?: string[];
};

export type ApprovalDecisionAction = "approve" | "reject" | "suspend" | "restore";

export type VerificationStatus =
  "unverified" | "pending" | "approved" | "suspended" | "rejected";

export type MapPoint = {
  lat: number;
  lng: number;
  label: string;
};

/** How a client account describes itself at sign-up. Drives client branding. */
export type AccountType = "individual" | "business" | "organization";

/** A supplier's self-declared category ranking, `rank` 1..n with no gaps. */
export type CategoryRank = {
  categoryCode: string;
  rank: number;
};

/** What a rider drives. The API enforces this set at enrollment and profile edit. */
export type VehicleType = "motorcycle" | "car" | "van" | "truck" | "bicycle";

export type RiderProfile = {
  vehicleType?: VehicleType | string;
  plateNumber?: string;
  licenseNumber?: string;
};

export type AccountStatus = "active" | "suspended" | "removed";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Account standing. Separate from supplier/rider accreditation. */
  accountStatus?: AccountStatus;
  accountStatusReason?: string | null;
  accountStatusAt?: string | null;
  phone?: string;
  /** Client accounts only. */
  accountType?: AccountType;
  orgName?: string;
  supplierName?: string;
  shop?: MapPoint;
  /** Supplier sign-up: what they say they do best, best first. */
  categoryRanks?: CategoryRank[];
  /** Rider sign-up profile. */
  riderProfile?: RiderProfile;
  /** Supplier / rider accounts. `pending` accounts cannot receive work. */
  verificationStatus?: VerificationStatus;
  verificationNote?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  createdAt?: string;
};

/** Identity fields shared by every fixed `/auth/me/*` projection. */
export type PortalIdentity = {
  id: string;
  email: string;
  name: string;
  phone?: string;
  createdAt: string;
  accountStatus?: AccountStatus;
  accountStatusReason?: string | null;
  accountStatusAt?: string | null;
};

/** Exact merged `GET /auth/me` envelope. Authorization reads memberships, not `user.role`. */
export type AuthMe = {
  user: User;
  memberships: RoleMembership[];
  approvalCases: ApprovalCaseSummary[];
};

type PortalMembership<R extends PortalRole> = {
  role: R;
};

type PortalRoleProjectionBase<R extends PortalRole> = {
  user: PortalIdentity;
  membership: PortalMembership<R>;
};

export type SupplierPortalProfile = {
  shopName: string;
  contactName: string;
  shop: MapPoint;
  pickupAvailable: boolean;
  updatedAt: string;
};

export type SupplierPortalRoleProjection = PortalRoleProjectionBase<"supplier"> & {
  supplierProfile: SupplierPortalProfile | null;
  approvalCase: (ApprovalCaseSummary & { kind: "supplier" }) | null;
  readiness: {
    readyForApproval: boolean;
    missing: Array<"supplier_profile" | "supplier_service">;
  };
  capabilities: {
    editCatalogue: boolean;
    editSettings: boolean;
    receiveJobOffers: boolean;
    acceptJobs: boolean;
  };
};

export type OpsPortalRoleProjection = PortalRoleProjectionBase<"ops_admin"> & {
  capabilities: {
    manageApprovalCases: boolean;
    manageOperations: boolean;
  };
};

export type AdminPortalRoleProjection = PortalRoleProjectionBase<"super_admin"> & {
  capabilities: {
    manageApprovalCases: boolean;
    manageOperations: boolean;
    manageRoleMemberships: boolean;
    managePlatformSettings: boolean;
  };
};

type PortalRoleProjectionByRole = {
  supplier: SupplierPortalRoleProjection;
  ops_admin: OpsPortalRoleProjection;
  super_admin: AdminPortalRoleProjection;
};

export type PortalRoleProjection<R extends PortalRole = PortalRole> =
  PortalRoleProjectionByRole[R];

export type TimelineEntry = {
  at: string;
  state: string;
  by: string;
  note: string;
  /** Set on the row the API writes when a Proof of Fulfilment or delivery photo is attached. */
  fileId?: string | null;
  /** Set on proof-attach and payout-release rows: which payout share the row is about. */
  milestoneCode?: string | null;
};

// ---- Split digital payment (v2) ----

/**
 * Portal names for the client online collections. The live API stores these as
 * `initial` and `final_online`; pickup plans often have only the first.
 */
export type PaymentInstallment = "downpayment" | "balance";

export type PaymentStatusCode =
  | "not_submitted"
  | "pending_confirmation"
  | "confirmed"
  /** Only on orders migrated from the pre-v2 model. */
  | "legacy_confirmed"
  /**
   * The ₱0 balance of an order paid in full up front. Nothing to submit,
   * confirm or reject (`409 balance_not_required`); every gate reads it as settled.
   */
  | "not_required";

export type PaymentRecord = {
  amountMinor: number;
  method: string;
  status: PaymentStatusCode | string;
  /** Client-supplied transfer reference, e.g. `GCASH-ABC123`. */
  reference: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  /** `manual_ops` for a confirmation made from this portal. */
  confirmationSource: string | null;
  // Set when Operations sent the last attempt back. All three are cleared the
  // moment the client resubmits; the rejection itself stays on the timeline.
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  /** Client-visible. What Operations told them to fix. */
  rejectionReason?: string | null;
  /** Client-uploaded QR-transfer photo. */
  proofFileId?: string | null;
};

/**
 * Present installments after mapping. A pickup plan may omit the balance; an
 * upfront order keeps it at ₱0 with status `not_required`.
 */
export type OrderPayments = Partial<Record<PaymentInstallment, PaymentRecord>>;

// ---- Milestone payouts (v2) ----

/**
 * Stage codes of the payout plans the API has shipped. Plan 2 (escrow, every
 * order committed from 25 Sep 2026): `production_started`, `delivered`,
 * `issue_window`. Plan 1 (legacy four stages): `printing`, `packaging_qc`,
 * `delivered`, `retention`. Screens render whatever stages an order carries,
 * in array order — a future plan adds codes without a screen change.
 */
export type PayoutMilestoneCode =
  | "production_started"
  | "printing"
  | "packaging_qc"
  | "delivered"
  | "issue_window"
  | "retention";

/**
 * `superseded`: a client refund settlement closed this unpaid stage. It was
 * never paid and never will be; what the shop is still owed became a separate
 * `SupplierSettlementPayout`. Never present it as paid.
 */
export type PayoutMilestoneStatus = "pending_pof" | "pof_attached" | "released" | "superseded";

/**
 * What a stage's release waits on: the shop's own proof, the rider's delivery
 * evidence, or the complaint window closing with no open claim.
 */
export type PayoutReleaseRequirement = "shop_proof" | "delivery_proof" | "issue_window_closed";

/** `1` legacy four stages, `2` the escrow split; `null` before commitment. */
export type PayoutPlanVersion = 1 | 2;

export type PayoutMilestone = {
  code: PayoutMilestoneCode | string;
  /** The API's shop-facing name for the stage. Absent on an older API. */
  label?: string | null;
  /** Share of the supplier's own price — not of the client total. */
  sharePercent: number;
  /** What the release desk waits on. Absent on an older API (plan 1 by code). */
  releaseRequires?: PayoutReleaseRequirement | string | null;
  /** Ops / Super Admin and the assigned supplier only. */
  amountMinor?: number;
  status: PayoutMilestoneStatus | string;
  /** Proof of Fulfilment files backing this milestone. */
  pofFileIds: string[];
  releasedAt?: string | null;
  releasedBy?: string | null;
  legacyFulfilment?: boolean;
  /** The wallet receipt screenshot bound at release. Ops / Super Admin and the assigned shop. */
  receiptFileId?: string | null;
  /** The wallet's reference number typed at release. Same visibility. */
  reference?: string | null;
  /** Set when a refund settlement closed this stage unpaid. */
  supersededAt?: string | null;
  supersededBySettlementId?: string | null;
};

/** Released against outstanding, as the API reports it to Operations. */
export type SupplierSettlement = {
  totalSupplierEarningsMinor?: number;
  supplierReleasedMinor?: number;
  supplierOutstandingMinor?: number;
  [key: string]: number | undefined;
};

/**
 * Ops / Super Admin only. The delivery fee on one order, who it belongs to,
 * and how much of it has actually been collected. Collection is summed over
 * confirmed payments before the snapshot rate is applied.
 */
export type DeliverySettlement = {
  deliveryFeeMinor: number;
  riderCommissionBps: number;
  riderPayoutMinor: number;
  platformDeliveryShareMinor: number;
  /** Confirmed gross delivery collection, both shares. */
  collectedMinor?: number;
  riderCollectedMinor?: number;
  platformCollectedMinor?: number;
};

// ---- Rider pickup checklist (v2) ----

export type PickupCheckCode =
  | "quantity_match"
  | "specification_match"
  | "visible_defects"
  | "packaging_integrity"
  | "documentation"
  | "supplier_sign_off";

export type PickupCheck = {
  code: PickupCheckCode | string;
  passed: boolean;
};

/**
 * `escalation_resolved`: Operations answered a failed check and the rider must
 * repeat all six checks and a fresh count before taking the package.
 */
export type PickupChecklistStatus =
  | "not_started"
  | "passed"
  | "failed_escalated"
  | "escalation_resolved";

/**
 * What the rider counts at the counter, one row per order line. The API
 * derives `expectedQuantity` in pieces from the order's immutable snapshots
 * (two packs of 100 is 200). An older order without line items has one row
 * with `lineItemId: null`. Contract: "Counter count" in the API doc.
 */
export type PickupCountItem = {
  lineItemId: string | null;
  itemName: string;
  expectedQuantity: number;
};

/** One line as the rider counted it, beside what the order says. */
export type PickupCount = {
  lineItemId: string | null;
  expectedQuantity: number;
  countedQuantity: number;
};

/** The shop's signature on the rider's phone that hands custody over. */
export type HandoffSignature = {
  fileId: string;
  signerName: string;
  signedAt: string;
  riderId: string;
  checklistHash?: string;
};

export type PickupChecklist = {
  status: PickupChecklistStatus | string;
  checks: PickupCheck[];
  /** Absent on checks recorded before counting was required: "Not recorded". */
  counts?: PickupCount[];
  evidenceFileIds: string[];
  failureNote: string | null;
  completedAt: string | null;
  completedBy: string | null;
  escalationId: string | null;
  /** Trained sign-off line the rider says at handoff. */
  signOffPrompt?: string;
  /** `null` on a failed attempt; absent on checks recorded before signatures. */
  handoffSignature?: HandoffSignature | null;
};

export type DeliveryEvidence = {
  fileId: string;
  evidenceType: "photo" | "signature" | string;
  riderId: string;
  recordedAt: string;
};

/** Commission-inclusive, client-safe estimate shown before a supplier is chosen. */
export type PriceRange = {
  subtotalMinMinor: number;
  subtotalMaxMinor: number;
  deliveryFeeStatus: "pending_supplier_assignment" | "final" | string;
};

/** How big a checkout line is, in thousandths of `unit` (not millimetres). */
export type OrderLineMeasurement = {
  pages?: number;
  widthMilli?: number;
  heightMilli?: number;
  lengthMilli?: number;
  unit?: string | null;
};

/**
 * A design kept at a sharing link instead of (or beside) an uploaded file.
 * Snapshotted at checkout; HTTPS only. Contract: "Artwork design links" in
 * `gridgo-api/docs/ORDER_MATCH_API.md`.
 */
export type ArtworkLinkFormat =
  | "canva_link"
  | "google_drive"
  | "dropbox"
  | "we_transfer"
  | "other_link";

export type ArtworkLink = {
  formatCode: ArtworkLinkFormat | (string & {});
  url: string;
};

/** One print line on a placed order. */
export type ProductionItem = {
  id: string;
  itemName: string;
  quantity: number;
  pricingUnit?: string | null;
  packageQty?: number | null;
  measurement: OrderLineMeasurement | null;
  structuredSpec?: Record<string, unknown>;
  options?: Array<{ groupName: string; label: string }>;
  artworkFileId?: string | null;
  /** Design links on this line; `[]` when none, absent on an older API. */
  artworkLinks?: ArtworkLink[];
  mockupFileId?: string | null;
};

export type PhysicalInvoiceRequest = {
  contactPerson: string;
  officeAddress: string;
  operatingHours: string;
  requestedAt: string;
  promisedDeliveryAt?: string | null;
};

export type Order = {
  id: string;
  clientId: string;
  supplierId: string | null;
  riderId: string | null;
  state: string;
  productId?: string | null;
  title: string;
  quantity?: number | null;
  /** Catalog unit from the checkout line (`pack100`, `sqm`, `piece`, …). */
  unit?: string | null;
  size?: string;
  material?: string;
  /** Optional finish note/code; may be empty string. */
  finish?: string | null;
  deadline: string | null;
  address: string;
  /** Checkout may leave this unset; present as an em dash. */
  zone?: string | null;
  pickup?: MapPoint | null;
  dropoff?: MapPoint | null;

  // Money. Every field is PHP minor units.
  // Server-side projection decides which of these a caller receives:
  // supplier price is hidden from the client; commission is Ops / Super Admin only.
  /** Supplier's own asking price. Ops / Super Admin and the assigned supplier. */
  /**
   * What the shop is paid for the work. The API has always called it this;
   * `supplierPriceMinor` was the quote-era name and appears nowhere in it, so a
   * screen reading that field read undefined on every order.
   */
  supplierSubtotalMinor?: number;
  supplierPriceMinor?: number;
  /**
   * The date the client was promised. The shop's own date is deliberately
   * absent from every client-facing payload, and Operations reads this one.
   */
  readyBy?: string | null;
  /** When the shop actually finished, stamped as it hands over to a rider. */
  readyAt?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancellationReason?: string | null;
  /**
   * GRIDGO's service fee on this order: the rate it was priced at, in basis
   * points, and the amount. Added on top of the shop price. Ops / Super Admin
   * only — the API strips both from every client, supplier and rider payload,
   * and the client is never shown the fee as a line.
   */
  serviceFeeRateBps?: number | null;
  serviceFeeMinor?: number;
  /**
   * The quote-era names for the same two figures. The API never sent them;
   * kept only so older fixtures type-check. Read `serviceFee*` instead.
   */
  commissionRatePercent?: number;
  commissionMinor?: number;
  /** The client's "subtotal" for the work. */
  subtotalMinor?: number;
  /** Haversine metres, supplier shop → dropoff. Chooses the delivery band. */
  deliveryDistanceMeters?: number;
  /** Gross delivery fee the client pays. */
  deliveryFeeMinor: number;
  /**
   * The rider's share of the delivery fee as snapshotted on this order, in
   * basis points, and the two amounts it splits into (rider half-up, GRIDGO
   * the remainder). Ops / Super Admin and the rider only; absent on an API
   * that predates the split, and orders placed before it hold 10,000 (the
   * whole fee to the rider).
   */
  riderCommissionBps?: number;
  riderPayoutMinor?: number;
  platformDeliveryShareMinor?: number;
  /** Ops / Super Admin only. The split with what has been collected. */
  deliverySettlement?: DeliverySettlement;
  /** Subtotal + delivery. What the client owes in full. */
  totalMinor: number;
  /**
   * The share of the total this order takes up front, snapshotted at checkout
   * (100 or 75). Absent on an API that predates it and on orders with no
   * checkout split. Read through `downpaymentPercentOf` in `@/lib/payments`,
   * never directly.
   */
  downpaymentPercent?: number;
  /** `downpaymentPercent` of the total — all of it on an upfront order. */
  downpaymentMinor?: number;
  /** The exact remainder of the total. 0 on an order paid in full up front. */
  balanceMinor?: number;
  priceRange?: PriceRange;
  operationalModelVersion?: number;

  paymentMethod: string | null;
  /** Legacy roll-up summary. `payments` is the authoritative split. */
  paymentStatus: string;
  payments?: OrderPayments;

  /** True while an active claim hold exists on this order. */
  payoutHold?: boolean;
  /**
   * The payout plan the order was committed under, snapshotted per order.
   * Absent from an API that predates it; read through `payoutPlanVersionOf`.
   */
  payoutPlanVersion?: PayoutPlanVersion | number | null;
  payoutMilestones?: PayoutMilestone[];
  /** Ops / Super Admin only. The API's own released-versus-outstanding roll-up. */
  supplierSettlement?: SupplierSettlement;
  /**
   * Client refunds (`gridgo-api/docs/REFUNDS_API.md`). `refundHold`: an active
   * refund request stops work and every payout. `refundDisposition` is set once
   * a settlement is approved; `unpaidBalanceCancelled` means the original
   * unpaid installment is history, not money to collect.
   */
  refundHold?: boolean;
  refundDisposition?: RefundDisposition | null;
  unpaidBalanceCancelled?: boolean;
  /**
   * Ops / Super Admin and the assigned shop. What the shop is still owed after
   * a refund settlement, paid as its own separately labelled item. Never on a
   * client payload.
   */
  supplierSettlementPayouts?: SupplierSettlementPayout[];
  /** Ops / Super Admin only. Client refund totals on this order. */
  refundFinance?: RefundFinance;
  /** Ops / Super Admin and the rider, once settled. */
  refundDeliverySettlement?: { riderEntitlementMinor: number; settlementId: string } | null;
  /**
   * Ops / Super Admin only. Where the assigned shop wants this money sent:
   * the receiving QR the release desk scans plus the words to check it by.
   * `null` when the shop has not set one up; absent for every other role.
   */
  supplierPayoutAccount?: SupplierPayoutAccount | null;

  pickupChecklist?: PickupChecklist;
  /** What the rider counts at the counter; `null` when the order has no usable quantity. */
  pickupCountItems?: PickupCountItem[] | null;
  deliveryEvidence?: DeliveryEvidence | null;
  issueWindowOpenedAt?: string | null;
  issueWindowExpiresAt?: string | null;

  promisedDate: string | null;
  /** Service line IDs that justified supplier assignment. */
  matchingServiceIds?: string[] | null;
  /** Proof that the client was told the final price before payment. */
  assignmentNotificationId?: string | null;
  assignmentNotifiedAt?: string | null;

  artworkName: string | null;
  artworkFileIds?: string[];
  /**
   * Checkout lines as the API projects them. Size can live on `structuredSpec.size`
   * or on `measurement` when the listing is billed by area (tarpaulins).
   */
  productionItems?: ProductionItem[];
  /** Shop mockup from the checkout line, when the client attached one. */
  mockupFileIds?: string[];
  /** Retired supplier-proof files, preserved by the migration. */
  proofFileIds?: string[];
  fulfilmentProofFileIds?: string[];
  deliveryPhotoFileIds?: string[];
  /** Progress-only shop photos (`production_photo`). The gallery is `productionProgress`. */
  productionPhotoFileIds?: string[];
  /**
   * The shop's progress photos, signed for this reader. Absent on an API that
   * predates it; read it through `src/lib/production-progress.ts`.
   */
  productionProgress?: ProductionProgress;
  /** Wallet receipts Operations bound to released shares. Never sent to clients. */
  payoutReceiptFileIds?: string[];

  createdAt: string;
  updatedAt: string;
  timeline: TimelineEntry[];

  /**
   * Where to send a printed invoice, and when Operations promised it would
   * arrive. Absent unless this client asked for one. Hidden from the shop
   * and the rider.
   */
  physicalInvoiceRequest?: PhysicalInvoiceRequest | null;
};

export type Notification = {
  id: string;
  userId: string;
  type?: string;
  orderId?: string | null;
  approvalCaseId?: string | null;
  announcementId?: string | null;
  title: string;
  body: string;
  /** Broadcast picture. Public HTTPS link or `/public/announcement-images/<fileId>`. */
  imageUrl?: string | null;
  orderTitle?: string;
  orderState?: string;
  fulfillmentMode?: "pickup" | "delivery";
  collectHold?: boolean;
  read: boolean;
  at: string;
};

export type NotificationInbox = {
  notifications: Notification[];
  snapshot: string | null;
};

export type InvalidateResource =
  | "orders"
  | "jobs"
  | "approvals"
  | "escalations"
  | "claims"
  | "dispatch"
  | "payouts"
  | "notifications"
  | "identity"
  | "catalog"
  | "services"
  | "availability"
  | "settings"
  | "location"
  | "credits"
  | "issue-reports"
  | "chat";

export type InvalidatePing = {
  resource: InvalidateResource;
  id?: string;
};

// ---- Platform settings (v2) ----

/**
 * The four fixed delivery distance zones (gridgo-api#121, "Delivery distance
 * zones" in `OPERATIONAL_MODEL_V2_API.md`). One table drives the distance word
 * a client sees and the delivery fee. Keys, labels, order and limits are fixed;
 * Operations edits only the prices. Rules live in `src/lib/delivery-zones.ts`.
 */
export type DeliveryZoneKey = "nearby" | "away" | "long_distance" | "out_of_zone";

/** Nearby, Away and Long Distance: one flat fee. `maxDistanceMeters` is inclusive. */
export type FlatDeliveryZoneBand = {
  zone: Exclude<DeliveryZoneKey, "out_of_zone">;
  label: string;
  maxDistanceMeters: number;
  feeMinor: number;
};

/**
 * Out of Zone, over 15 km, open-ended. No `feeMinor`: the fee is
 * `baseFeeMinor + perKmMinor × ceil(distanceMeters / 1000)` over the whole
 * distance.
 */
export type OutOfZoneDeliveryBand = {
  zone: "out_of_zone";
  label: string;
  maxDistanceMeters: null;
  baseFeeMinor: number;
  perKmMinor: number;
};

/**
 * A distance band from an API before the zones: a flat fee up to an
 * inclusive ceiling, the last one open-ended (`null`). Shown, never edited.
 */
export type LegacyDeliveryFeeBand = {
  zone?: undefined;
  maxDistanceMeters: number | null;
  feeMinor: number;
};

export type DeliveryFeeBand = FlatDeliveryZoneBand | OutOfZoneDeliveryBand | LegacyDeliveryFeeBand;

export type PaymentQr = {
  method: "qr_manual" | string;
  caption: string;
  /**
   * Public path or URL for the current GCash plate. Absent until Operations
   * uploads one; clients then use their bundled fallback.
   */
  imageUrl?: string;
};

/** Live cadence for a shop that has not moved a job waiting on production. */
export type ProductionNudgeUnit = "seconds" | "minutes" | "hours" | "days";

export type ProductionNudge = {
  enabled: boolean;
  afterValue: number;
  afterUnit: ProductionNudgeUnit;
  repeatValue: number;
  repeatUnit: ProductionNudgeUnit;
  maxCount: number;
};

export type PlatformSettings = {
  /**
   * The settings row's version, quoted back as `expectedVersion` on every
   * save so a stale screen cannot overwrite a newer change.
   */
  version: number;
  /** Whole hours, 1–720. One global value — never per order. */
  issueWindowHours: number;
  /**
   * How long a shop may stay silent on a production job, and how often GRIDGO
   * reminds them. Absent on an older settings row; the screen then shows the
   * published defaults.
   */
  productionNudge?: ProductionNudge;
  /**
   * GRIDGO's service fee in basis points of the shop's price (1,000 = 10%),
   * 0–10,000. Added on top of the shop price and folded into the client's
   * total. Operations and Super Admin change it here and see it on every order.
   */
  serviceFeeRateBps: number;
  /**
   * Whether client checkout names the fee (`Service fee · N%`). The pesos
   * stay inside Printing either way. Absent on an older settings row; treat
   * as shown.
   */
  serviceFeeVisibleToClient?: boolean;
  /**
   * The share of each delivery fee the rider keeps, in basis points (8,500 =
   * 85% rider, 15% GRIDGO), 0–10,000. Snapshotted on every order when its
   * delivery fee is set. Absent on an API that predates the split — the
   * settings screen then says so instead of offering a control that saves
   * nothing.
   */
  riderCommissionBps?: number;
  /**
   * How much of a new checkout the client pays up front: 100 (the default
   * since 2026-09-25, gridgo-api#66) or 75 (75% now, 25% before delivery).
   * Snapshotted on every order at checkout. Absent on an API that predates
   * it; the settings screen then leaves the control out.
   */
  downpaymentPercent?: number;
  deliveryFeeBands: DeliveryFeeBand[];
  /** Manual QR checkout. `imageUrl` is the replaceable plate. */
  paymentQr?: PaymentQr;
};

export type UpdateSettingsInput = {
  issueWindowHours?: number;
  serviceFeeRateBps?: number;
  serviceFeeVisibleToClient?: boolean;
  riderCommissionBps?: number;
  downpaymentPercent?: number;
  deliveryFeeBands?: DeliveryFeeBand[];
  productionNudge?: ProductionNudge;
  reason?: string;
};

// ---- Escalations (v2) ----

export type EscalationStatus = "open" | "resolved" | string;

export type Escalation = {
  id: string;
  type: string;
  status: EscalationStatus;
  orderId: string;
  riderId: string | null;
  supplierId: string | null;
  /** Which of the six pickup checks the rider failed. */
  failedCheckCodes: string[];
  /** The whole attempt that failed, kept after a later recheck passes. */
  checks?: PickupCheck[];
  counts?: PickupCount[];
  evidenceFileIds: string[];
  failureNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
};

// ---- Files ----

export type FileReference = {
  type: string;
  id: string;
  field: string;
  milestoneCode?: string;
};

/* ---------------------------------------------------------------------------
   Where a shop gets paid
   Contract: "Supplier payout account" in gridgo-api docs/OPERATIONAL_MODEL_V2_API.md.
   --------------------------------------------------------------------------- */

export type PayoutProvider = "gcash" | "maya" | "bank" | "other";

export type SupplierPayoutAccount = {
  supplierId: string;
  provider: PayoutProvider | string;
  /** The name the wallet or bank shows back after a scan. */
  accountName: string;
  /** Canonical `+639XXXXXXXXX` for a wallet; free text for a bank. */
  accountNumber: string | null;
  /** The bank or wallet when `provider` is `bank` or `other`. */
  institution: string | null;
  /** The bound plate. Bytes come from `getFileDownloadUrl(qr.fileId)`. */
  qr: {
    fileId: string;
    originalFilename: string | null;
    detectedContentType: string | null;
    size: number | null;
    readyAt: string | null;
  } | null;
  version: number;
  updatedAt: string;
  /** Present on the Operations projection only. */
  shopName?: string | null;
};

/** `qrFileId` binds a stored `supplier_payout_qr` upload; `null` removes the picture. */
export type SupplierPayoutAccountPatch = {
  provider?: PayoutProvider;
  accountName?: string;
  accountNumber?: string;
  institution?: string;
  qrFileId?: string | null;
};

/**
 * What the file said about itself, read by GRIDGO when it was uploaded.
 *
 * Every field is advisory. A scan at 96 DPI and the same scan at 300 DPI are
 * the same pixels and different pieces of paper. Absent entirely when the file
 * said nothing readable — a PNG with no declared density has a pixel size and
 * no physical one.
 */
export type DetectedArtwork = {
  kind: "pdf" | "raster";
  /** Pages in a PDF; 1 for an image; null when the file would not say. */
  pageCount: number | null;
  pixelWidth: number | null;
  pixelHeight: number | null;
  dpi: number | null;
  /** Always "mm" when a physical size was read at all. */
  measureUnit: "mm" | null;
  /** Thousandths of a millimetre, so no float carries a measurement. */
  widthMilli: number | null;
  heightMilli: number | null;
  /** "A4", "Letter" — null when the size matches no name GRIDGO knows. */
  pageSize: string | null;
  orientation: "portrait" | "landscape" | "square" | null;
};

/**
 * One progress photo, as `productionProgress.photos` carries it. It names no
 * uploader, filename, payout stage or proof code. `downloadUrl` is missing when
 * signing failed; `GET /files/:fileId/download-url` retries it.
 */
export type ProductionPhoto = {
  fileId: string;
  contentType: string;
  at: string;
  downloadUrl?: string | null;
  downloadUrlExpiresAt?: string | null;
};

/**
 * Contract "Production progress photos" in the API doc. One ready, attached
 * shop image is enough to pack a job; the start-of-production image counts.
 */
export type ProductionProgress = {
  status: "waiting_for_photo" | "photos_available";
  photos: ProductionPhoto[];
};

export type StoredFile = {
  fileId: string;
  purpose: string;
  originalFilename: string;
  declaredContentType: string;
  detectedContentType: string | null;
  size: number;
  ownerId: string;
  state: string;
  createdAt: string;
  readyAt: string | null;
  deleteRequestedAt: string | null;
  deletedAt: string | null;
  references: FileReference[];
  /** Present only when the bytes carried something worth reading. */
  detected?: DetectedArtwork;
};

export type CreditLedgerEntry = {
  id: string;
  type: string;
  amountMinor: number;
  balanceAfterMinor: number;
  reason: string;
  at: string;
  actorId: string;
  orderId?: string | null;
};

export type CreditBalance = {
  clientId: string;
  balanceMinor: number;
  ledger: CreditLedgerEntry[];
};

export type CreditGrantResult = {
  clientId: string;
  balanceMinor: number;
  entry: CreditLedgerEntry;
  ledger: CreditLedgerEntry[];
};

export type CatalogItem = {
  id: string;
  name: string;
  family: string;
  basePriceMinor: number;
  unit: string;
};

// ---- Taxonomy (platform-governed) ----

export type TaxonomyCategory = {
  id: string;
  code: string;
  name: string;
  /** Audience line from the chart, without a "Best for:" prefix. */
  bestFor?: string;
  sortOrder?: number;
  productFamilyIds: string[];
  active: boolean;
};

export type TaxonomyMaterial = {
  id: string;
  code: string;
  name: string;
  categoryCodes: string[];
  active: boolean;
};

export type TaxonomyFinish = {
  id: string;
  code: string;
  name: string;
  categoryCodes: string[];
  active: boolean;
};

export type TaxonomySubcategory = {
  id: string;
  code: string;
  categoryCode: string;
  name: string;
  /** Chart examples for this print job, as chips. */
  examples?: string[];
  active: boolean;
  sortOrder?: number;
};

/**
 * Who stands on a category or print job, from a `409 catalog_entry_in_use`
 * (DELETE /taxonomy/categories/:code, DELETE /taxonomy/subcategories/:code).
 * Category figures add the print jobs, accreditations and legacy codes under it.
 */
export type CatalogEntryUsage = {
  listings: number;
  shops: { supplierId: string; shopName: string }[];
  orders: number;
  starters: number;
  printJobs?: number;
  services?: number;
  aliases?: number;
};

export type TaxonomyDeleteResult = {
  ok: true;
  deleted: { kind: "category" | "subcategory"; id: string; code: string; name: string };
};

/** Retired pre-chart category code still accepted on input. */
export type TaxonomyCategoryAlias = {
  code: string;
  name: string;
  categoryCode: string;
  ambiguous?: boolean;
  note?: string;
  active?: boolean;
};

export type Taxonomy = {
  categories: TaxonomyCategory[];
  /** Flat chart of what each category covers. Present on the live taxonomy. */
  subcategories?: TaxonomySubcategory[];
  materials: TaxonomyMaterial[];
  finishes: TaxonomyFinish[];
  categoryAliases?: TaxonomyCategoryAlias[];
};

/** Public marketplace shop card from GET /catalog/shops. */
export type PublicCatalogShopSummary = {
  supplierId: string;
  shopName: string;
  categories?: string[];
  itemCount?: number;
};

export type PublicCatalogListing = {
  id: string;
  supplierId?: string;
  subcategoryCode?: string;
  name: string;
  fromPriceMinor?: number;
  basePriceMinor?: number;
  /** Printing-machine cap in whole feet. Present on tarpaulin listings. */
  printerMaxWidthFeet?: number | null;
  turnaroundHours?: number | null;
  photos?: Array<{
    fileId: string;
    sortOrder?: number;
    altText?: string | null;
    downloadUrl?: string | null;
    url?: string;
  }>;
};

export type PublicCatalogShop = {
  supplierId: string;
  shopName: string;
  categories?: string[];
  services?: Array<{
    id: string;
    categoryCode: string;
    items?: PublicCatalogListing[];
  }>;
};

// ---- Supplier services ----

export type SupplierServiceState =
  "draft" | "pending_verification" | "live" | "suspended" | "withdrawn";

export type SupplierService = {
  id: string;
  supplierId: string;
  categoryCode: string;
  materialCodes: string[];
  finishCodes: string[];
  productFamilyIds: string[];
  sizeMin: string | null;
  sizeMax: string | null;
  qtyMin: number | null;
  qtyMax: number | null;
  pricingBasis: string;
  referenceRateMinor: number;
  turnaroundHours: number;
  capacityDaily: number | null;
  capacityWeekly: number | null;
  zones: string[];
  equipmentNotes: string;
  state: SupplierServiceState;
  verifiedAt: string | null;
  suspendedAt: string | null;
  suspendReason: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateSupplierServiceInput = {
  categoryCode: string;
  materialCodes?: string[];
  finishCodes?: string[];
  productFamilyIds?: string[];
  sizeMin?: string | null;
  sizeMax?: string | null;
  qtyMin?: number | null;
  qtyMax?: number | null;
  pricingBasis?: string;
  referenceRateMinor?: number;
  turnaroundHours?: number;
  capacityDaily?: number | null;
  capacityWeekly?: number | null;
  zones?: string[];
  equipmentNotes?: string;
};

export type UpdateSupplierServiceInput = Partial<CreateSupplierServiceInput>;

// ---- Matching ----

export type MatchingRankingInputs = {
  liveServiceCount: number;
  matchingServiceCount: number;
  minTurnaroundHours: number;
  totalCapacityDaily: number;
  verificationStatus: VerificationStatus | string;
};

export type EligibleSupplierCandidate = {
  supplier: User;
  eligible: boolean;
  reasons: string[];
  matchingServiceIds: string[];
  services: SupplierService[];
  rankingInputs?: MatchingRankingInputs;
};

export type EligibleSuppliersResult = {
  orderId: string;
  orderState: string;
  productId: string;
  productFamily: string | null;
  zone: string;
  material: string;
  quantity: number;
  candidates: EligibleSupplierCandidate[];
};

// ---- Zones ----

/**
 * Address zones. These name a delivery area only — the per-zone flat fee was
 * removed in v2; `PlatformSettings.deliveryFeeBands` is the sole fee authority.
 */
export type Zone = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type CreateZoneInput = {
  code: string;
  name: string;
  active?: boolean;
};

export type UpdateZoneInput = {
  code?: string;
  name?: string;
  active?: boolean;
};

// ---- Claims & payout holds ----

export type ClaimStatus = "open" | "payout_held" | "released" | string;

export type ClaimTimelineEntry = {
  at: string;
  action: string;
  by: string;
  note: string;
};

export type Claim = {
  id: string;
  orderId: string;
  raisedBy: string;
  reason: string;
  status: ClaimStatus;
  holdReason: string | null;
  releaseReason: string | null;
  heldAt: string | null;
  heldBy: string | null;
  releasedAt: string | null;
  releasedBy: string | null;
  createdAt: string;
  updatedAt: string;
  issueId: string | null;
  timeline: ClaimTimelineEntry[];
};

// ---- Issues ----

export type IssueStatus = "open" | "resolved" | "dismissed" | string;

export type Issue = {
  id: string;
  orderId: string;
  clientId: string;
  description: string;
  kind: string;
  status: IssueStatus;
  consequence: string;
  claimId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
};

// ---- Audit ----

export type AuditEntry = {
  id: string;
  at: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  orderId: string | null;
  detail: Record<string, unknown> | null;
  reason: string | null;
};

// ---- Dispatch ----

export type LocationPing = {
  id: string;
  orderId: string;
  riderId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  at: string;
};

/**
 * Latest shared GPS fix for a rider on an active trip, with what the map needs
 * to draw them honestly: the vehicle they drive and the trip's two ends.
 * `dropoff` is already the GRIDGO Office for a collected order.
 */
export type RiderLocation = {
  riderId: string;
  name: string;
  vehicleType: VehicleType | string | null;
  plateNumber: string | null;
  orderId: string;
  orderTitle: string | null;
  state: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  at: string;
  pickup: MapPoint | null;
  dropoff: MapPoint | null;
};

// ---- Platform announcements ----
//
// Super Admin only in this portal (the API also authorises ops_admin; do not
// open the megaphone to Operations here). One POST, no list, no pre-send
// count, no destination URL. Unclaimed push data is {type:"announcement"}
// and a tap opens the app — a download link cannot ride the lock screen.
//
// Contract: gridgo-api docs/OPERATIONAL_MODEL_V2_API.md → Platform announcements.

/** Who an announcement interrupts. `everyone` also reaches unclaimed phones. */
export type AnnouncementAudience =
  "everyone" | "clients" | "suppliers" | "riders" | "ops";

export type Announcement = {
  id: string;
  audience: AnnouncementAudience;
  title: string;
  body: string;
  /** Present when the send included a picture. */
  imageUrl?: string | null;
  at: string;
  /** Signed-in accounts that received a notification record. */
  notifiedUsers: number;
  /**
   * Unclaimed (never-signed-in or signed-out) phones that were also pushed.
   * Non-zero only for `everyone`; role audiences cannot reach them.
   */
  unclaimedDevices: number;
};

export type PostAnnouncementInput = {
  audience: AnnouncementAudience;
  title: string;
  body: string;
  imageUrl?: string;
};

// ---- Super Admin Tracker ----
// Contract: gridgo-api docs/TRACKER_API.md. GitHub issues labelled `tracker`
// are the source of truth; the API reads them with a server-side token.

/** The report's six statuses, exact wire values. */
export type TrackerStatus =
  | "open"
  | "in-review"
  | "merged-dev"
  | "live"
  | "needs-decision"
  | "blocked";

export type TrackerAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
};

export type TrackerDecision = {
  id: string;
  text: string;
  attachments: TrackerAttachment[];
  decidedBy: { id: string; name: string };
  decidedAt: string;
};

/** One sheet row, read from one GitHub issue. Only `status` is editable. */
export type TrackerItem = {
  /** `<repo>#<number>`, e.g. `gridgo-web#50`. */
  key: string;
  repo: string;
  number: number;
  url: string;
  /** Sheet section key: `general`, `supplier`, `step-01` … `step-08`. */
  section: string;
  order: number;
  /** The sheet's ID column, e.g. `1.0`. */
  ref: string;
  /** Sheet "Module / Step". */
  module: string;
  developer: string;
  /** Sheet "Requirement / Issue Description". */
  requirement: string;
  category: string;
  status: TrackerStatus;
  /** `explicit` when a Super Admin set it; `derived` from the issue's state. */
  statusSource: "explicit" | "derived";
  decisions: TrackerDecision[];
  /**
   * The issue's "Waiting on a decision" questions, parsed by the API. Empty
   * when the section is missing or not in question form; absent from an
   * older API.
   */
  decisionQuestions?: TrackerDecisionQuestion[];
  /** The raw "Waiting on a decision" markdown, the fallback when it did not parse. */
  decisionMarkdown?: string | null;
};

export type TrackerDecisionOption = {
  /** The option's letter, e.g. `A`. */
  key: string;
  label: string;
  detail?: string | null;
};

export type TrackerDecisionQuestion = {
  number: number;
  question: string;
  context?: string | null;
  options: TrackerDecisionOption[];
  /** Whether the issue offers "Something else" as an answer. */
  allowOther: boolean;
  recommended: { key: string; reason?: string | null } | null;
};

export type TrackerBoard = {
  fetchedAt: string;
  items: TrackerItem[];
};

export type RecordTrackerDecisionInput = {
  text: string;
  attachmentIds?: string[];
  /** Where the item goes after the decision; the API defaults to `open`. */
  status?: TrackerStatus;
};

// ---- Auth / health ----

export type HealthResult = {
  ok: boolean;
  service?: string;
  version?: number;
  at?: string;
};

/** Structured error body returned by the GRIDGO API. */
export type ApiErrorBody = {
  error: string;
  [key: string]: unknown;
};

export type SupportChatPartyRole = "client" | "supplier" | "rider";
export type SupportChatSenderRole = SupportChatPartyRole | "ops_admin" | "super_admin";

export type SupportChatThread = {
  id: string;
  partyUserId: string;
  partyRole: SupportChatPartyRole;
  partyName?: string | null;
  partyEmail?: string | null;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  lastMessageSenderRole?: SupportChatSenderRole | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SupportChatMessage = {
  id: string;
  threadId: string;
  senderUserId: string;
  senderRole: SupportChatSenderRole;
  senderName?: string | null;
  body: string;
  createdAt: string;
  mine: boolean;
};

export type SupportChatEvent = {
  type: "message";
  thread: SupportChatThread;
  message: SupportChatMessage;
};

/* --------------------------------------------------------------------------
 * Shop rankings: what clients said about each shop, read back for Operations.
 * ------------------------------------------------------------------------ */

export type ShopRankingRow = {
  supplierId: string;
  shopName: string;
  /** Rank by `overall`, ties broken by review count. Null when never reviewed in scope. */
  position: number | null;
  count: number;
  quality: number | null;
  speed: number | null;
  value: number | null;
  /** The plain mean of the three star averages. */
  overall: number | null;
  /** Whether the shop hit its own ready-by date, across finished jobs. */
  onTime: { count: number; rate: number } | null;
  /** The shop's cheapest listing in the chosen category; null without a category. */
  fromPriceMinor: number | null;
};

export type ShopRankings = {
  categories: Array<{ code: string; name: string }>;
  categoryCode: string | null;
  rankedCount: number;
  rows: ShopRankingRow[];
};

// ---------------------------------------------------------------------------
// Public issue reports (landing /report) — gridgo-api docs/ISSUE_REPORTS_API.md
// ---------------------------------------------------------------------------

export type IssueReportCategory = "bug" | "feature" | "other";
/** `tracked`: filed on, or linked to, a GitHub tracker issue. */
export type IssueReportStatus = "new" | "tracked" | "published" | "dismissed";

export type IssueReportScreenshot = {
  position: number;
  contentType: string;
  size: number;
  /** Presigned and short-lived; reload the list for fresh links. */
  url: string;
  expiresAt: string;
};

export type IssueReport = {
  id: string;
  issue: string;
  category: IssueReportCategory | null;
  status: IssueReportStatus;
  publishedIn: string | null;
  /**
   * `https://github.com/gridgoph/<repo>/issues/<n>`. Kept while `tracked` or
   * `published`, cleared on `new` or `dismissed`. Absent from an API that
   * predates the tracker link.
   */
  trackerIssueUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  screenshots: IssueReportScreenshot[];
};

/** `tracked` is missing from an API that predates the tracker link. */
export type IssueReportCounts = Record<Exclude<IssueReportStatus, "tracked">, number> & { tracked?: number };

// ---- Client refunds (available-funds settlement, `available_funds_v1`) ----
// Contract: gridgo-api/docs/REFUNDS_API.md. Every `*Minor` is integer centavos.

export type RefundStatus =
  | "requested"
  | "reviewed"
  | "approved"
  | "destination_review"
  | "payment_in_progress"
  | "payment_unknown"
  | "paid"
  | "rejected"
  | "withdrawn";

export type RefundKind = "cancellation" | "complaint";

/** `cancelled` before handover; `fulfilled_with_refund` after it. */
export type RefundDisposition = "cancelled" | "fulfilled_with_refund";

/** The client's own receiving account. Only the client can set or replace it. */
export type RefundDestination = {
  provider: PayoutProvider | string;
  accountName: string;
  qrFileId: string;
  ownershipConfirmed: boolean;
  /** Increments on every replacement; a payment reserves one revision. */
  revision: number;
};

/** One client-visible event. Staff also see internal `supplier_paid` events. */
export type RefundHistoryEntry = {
  kind: string;
  reason: string;
  at: string;
};

export type RefundComponents = {
  principalMinor: number;
  feeMinor: number;
  deliveryMinor: number;
};

/** The server's calculation; also frozen on a settlement as `snapshot`. */
export type RefundAmounts = RefundComponents & {
  totalMinor: number;
  collected: RefundComponents;
  previous: RefundComponents;
  releasedMinor: number;
  remainingShopMinor: number;
  shopEntitlementMinor: number;
  riderEntitlementMinor: number;
  availablePrincipalMinor: number;
  directStoreDueMinor?: number;
  directStoreCollectedMinor?: number;
};

export type RefundPreview = {
  amounts: RefundAmounts;
  availableTotalMinor: number;
  canSettle: boolean;
};

/** Staff projection. The client's copy drops everything after `reason`. */
export type RefundSettlement = RefundComponents & {
  id: string;
  totalMinor: number;
  disposition: RefundDisposition;
  /** Client-visible decision reason. */
  reason: string;
  approvedAt?: string;
  requestId?: string;
  orderId?: string;
  sequence?: number;
  createdBy?: string;
  createdAt?: string;
  /** Staff only. */
  shopAgreement?: string;
  deliveryEvidence?: string;
  shopEntitlementMinor?: number;
  riderEntitlementMinor?: number;
  platformDeliveryMinor?: number;
  snapshot?: RefundAmounts;
};

export type RefundAttemptStatus = "in_progress" | "unknown" | "failed" | "paid";

/** One reserved payer, frozen destination and amount. Staff only. */
export type RefundAttempt = {
  id: string;
  requestId: string;
  settlementId: string;
  payerId: string;
  status: RefundAttemptStatus;
  destination: RefundDestination;
  amountMinor: number;
  /** The sending wallet, lowercase. */
  provider: string;
  sourceWallet: string;
  createdAt: string;
  updatedAt: string;
};

export type RefundPayment = {
  id: string;
  reference: string;
  receiptFileId: string;
  amountMinor: number;
  paidAt: string;
  /** Always "Wallet transfer evidence" — never an official receipt. */
  evidenceLabel: string;
  requestId?: string;
  attemptId?: string;
  provider?: string;
  sourceWallet?: string;
  recordedBy?: string;
  createdAt?: string;
};

export type SupplierSettlementPayoutStatus = "pending" | "released" | "superseded";

/** What the shop is still owed after a settlement, paid as its own item. */
export type SupplierSettlementPayout = {
  id: string;
  settlementId: string;
  orderId: string;
  supplierId: string;
  amountMinor: number;
  status: SupplierSettlementPayoutStatus | string;
  reference: string | null;
  receiptFileId: string | null;
  releasedAt: string | null;
  releasedBy: string | null;
  createdAt: string;
  code: "refund_settlement" | string;
  /** "Agreed refund settlement payout" — the API's own label. */
  label: string;
  releaseRequires: string;
};

export type RefundFinance = {
  approvedMinor: number;
  paidMinor: number;
  refundedPrincipalMinor: number;
  reservedMinor: number;
};

export type RefundRequest = {
  id: string;
  orderId: string;
  status: RefundStatus | string;
  version: number;
  policyVersion: string;
  kind: RefundKind | string;
  /** The client's own words (or Operations', filing for them). */
  reason: string;
  evidenceFileIds: string[];
  destination: RefundDestination | null;
  beforeProduction: boolean;
  /** Filed after the complaint deadline: Super Admin decides. */
  late: boolean;
  filingDeadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  history: RefundHistoryEntry[];
  settlement: RefundSettlement | null;
  payment: RefundPayment | null;
  // Staff projection
  clientId?: string;
  collections?: RefundComponents;
  releasedShopMinor?: number;
  previousRefunds?: RefundSettlement[];
  supplierSettlementPayouts?: SupplierSettlementPayout[];
  supplierPayoutAccount?: SupplierPayoutAccount | null;
  attempt?: RefundAttempt | null;
};

export type SettlementInput = {
  shopEntitlementMinor: number;
  riderEntitlementMinor: number;
  /** Omit for the maximum available. */
  principalMinor?: number;
  /** Historical direct-store plans only. */
  directStoreCollectedMinor?: 0;
};
