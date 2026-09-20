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

export type ApprovalCaseDetail = {
  approvalCase: ApprovalCaseSummary & { decidedBy?: string | null };
  applicant: PortalIdentity | null;
  history: ApprovalCaseHistoryEntry[];
  clientProfile?: ClientProfile | null;
  application?: BusinessApplication;
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
  /** The wallet receipt screenshot bound at release. Ops / Super Admin and the assigned shop. */
  receiptFileId?: string | null;
  /** The wallet's reference number typed at release. Same visibility. */
  reference?: string | null;
};

/** Released against outstanding, as the API reports it to Operations. */
export type SupplierSettlement = {
  totalSupplierEarningsMinor?: number;
  supplierReleasedMinor?: number;
  supplierOutstandingMinor?: number;
  [key: string]: number | undefined;
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
  /** Ops / Super Admin only. The API's own released-versus-outstanding roll-up. */
  supplierSettlement?: SupplierSettlement;
  /**
   * Ops / Super Admin only. Where the assigned shop wants this money sent:
   * the receiving QR the release desk scans plus the words to check it by.
   * `null` when the shop has not set one up; absent for every other role.
   */
  supplierPayoutAccount?: SupplierPayoutAccount | null;

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
  /** Wallet receipts Operations bound to released shares. Never sent to clients. */
  payoutReceiptFileIds?: string[];

  createdAt: string;
  updatedAt: string;
  timeline: TimelineEntry[];
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
  | "credits";

export type InvalidatePing = {
  resource: InvalidateResource;
  id?: string;
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
  /**
   * The settings row's version, quoted back as `expectedVersion` on every
   * save so a stale screen cannot overwrite a newer change.
   */
  version: number;
  /** Whole hours, 1–720. One global value — never per order. */
  issueWindowHours: number;
  /**
   * GRIDGO's service fee in basis points of the shop's price (1,000 = 10%),
   * 0–10,000. Added on top of the shop price and folded into the client's
   * total; the client is never shown it as a line. Operations and Super Admin
   * change it here and see it on every order.
   */
  serviceFeeRateBps: number;
  deliveryFeeBands: DeliveryFeeBand[];
  /** Manual QR checkout. `imageUrl` is the replaceable plate. */
  paymentQr?: PaymentQr;
};

export type UpdateSettingsInput = {
  issueWindowHours?: number;
  serviceFeeRateBps?: number;
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
