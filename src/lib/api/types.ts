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

export type RiderProfile = {
  vehicleType?: string;
  vehiclePlate?: string;
  licenseNumber?: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
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
  | "legacy_confirmed";

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

/** Present installments after mapping. A pickup plan may omit the balance. */
export type OrderPayments = Partial<Record<PaymentInstallment, PaymentRecord>>;

// ---- Milestone payouts (v2) ----

export type PayoutMilestoneCode = "printing" | "packaging_qc" | "delivered" | "retention";

export type PayoutMilestoneStatus = "pending_pof" | "pof_attached" | "released";

export type PayoutMilestone = {
  code: PayoutMilestoneCode | string;
  /** Share of the supplier's own price — not of the client total. */
  sharePercent: number;
  /** Ops / Super Admin and the assigned supplier only. */
  amountMinor?: number;
  status: PayoutMilestoneStatus | string;
  /** Proof of Fulfilment files backing this milestone. */
  pofFileIds: string[];
  releasedAt?: string | null;
  releasedBy?: string | null;
  legacyFulfilment?: boolean;
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

export type PickupChecklistStatus = "not_started" | "passed" | "failed_escalated";

export type PickupChecklist = {
  status: PickupChecklistStatus | string;
  checks: PickupCheck[];
  evidenceFileIds: string[];
  failureNote: string | null;
  completedAt: string | null;
  completedBy: string | null;
  escalationId: string | null;
  /** Trained sign-off line the rider says at handoff. */
  signOffPrompt?: string;
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
  supplierPriceMinor?: number;
  /** GRIDGO's cut, added on top of the supplier price. Ops / Super Admin only. */
  commissionRatePercent?: number;
  /** Ops / Super Admin only — never shown to a client, supplier or rider. */
  commissionMinor?: number;
  /** Supplier price + commission. The client's "subtotal". */
  subtotalMinor?: number;
  /** Haversine metres, supplier shop → dropoff. Chooses the delivery band. */
  deliveryDistanceMeters?: number;
  deliveryFeeMinor: number;
  /** Subtotal + delivery. What the client owes in full. */
  totalMinor: number;
  /** 75% of the total. */
  downpaymentMinor?: number;
  /** The exact remainder of the total. */
  balanceMinor?: number;
  priceRange?: PriceRange;
  operationalModelVersion?: number;

  paymentMethod: string | null;
  /** Legacy roll-up summary. `payments` is the authoritative split. */
  paymentStatus: string;
  payments?: OrderPayments;

  /** True while an active claim hold exists on this order. */
  payoutHold?: boolean;
  payoutMilestones?: PayoutMilestone[];

  pickupChecklist?: PickupChecklist;
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
  /** Shop mockup from the checkout line, when the client attached one. */
  mockupFileIds?: string[];
  /** Retired supplier-proof files, preserved by the migration. */
  proofFileIds?: string[];
  fulfilmentProofFileIds?: string[];
  deliveryPhotoFileIds?: string[];

  createdAt: string;
  updatedAt: string;
  timeline: TimelineEntry[];
};

export type Notification = {
  id: string;
  userId: string;
  type?: string;
  orderId?: string | null;
  title: string;
  body: string;
  /** Broadcast picture. Public HTTPS link or `/public/announcement-images/<fileId>`. */
  imageUrl?: string | null;
  read: boolean;
  at: string;
};

// ---- Platform settings (v2) ----

/**
 * One band of the distance-based delivery fee. `maxDistanceMeters` is the
 * inclusive ceiling; the final band is open-ended (`null`).
 */
export type DeliveryFeeBand = {
  maxDistanceMeters: number | null;
  feeMinor: number;
};

export type PaymentQr = {
  method: "qr_manual" | string;
  caption: string;
  /**
   * Public path or URL for the current GCash plate. Absent until Operations
   * uploads one; clients then use their bundled fallback.
   */
  imageUrl?: string;
};

export type PlatformSettings = {
  /** Whole hours, 1–720. One global value — never per order. */
  issueWindowHours: number;
  deliveryFeeBands: DeliveryFeeBand[];
  /** Manual QR checkout. `imageUrl` is the replaceable plate. */
  paymentQr?: PaymentQr;
};

export type UpdateSettingsInput = {
  issueWindowHours?: number;
  deliveryFeeBands?: DeliveryFeeBand[];
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

export type Taxonomy = {
  categories: TaxonomyCategory[];
  materials: TaxonomyMaterial[];
  finishes: TaxonomyFinish[];
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
