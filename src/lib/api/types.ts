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
  /** 1 once the application carries the document checklist; absent on a name-only case. */
  schemaVersion?: number;
  /** Business track. Organizations have none. */
  businessType?: "sole_proprietor" | "partnership" | "corporation" | null;
  school?: string | null;
  /** The shared organization login email, verified with a one-time code. */
  organizationEmail?: string | null;
  emailVerifiedAt?: string | null;
  /** Organization applicant (the officer). */
  officer?: ApplicationPerson | null;
  /** Business applicant (owner or authorised signatory). */
  signatory?: ApplicationPerson | null;
  /** Checklist key → opaque file id. Readable by Operations and Super Admin only. */
  documents?: Record<string, string> | null;
  facultyAdviserContact?: string | null;
  /** Operations asked for the otherwise optional business permit. */
  businessPermitRequired?: boolean;
};

/** Private personal details matched against the applicant's ID. */
export type ApplicationPerson = {
  fullName: string;
  dateOfBirth?: string | null;
  address?: string | null;
  phone?: string | null;
  governmentIdType?:
    "philid" | "ephilid" | "passport" | "drivers_license" | "umid" | string | null;
  governmentIdExpiresOn?: string | null;
  governmentIdHasNoExpiry?: boolean;
  originalId?: boolean;
  detailsMatchId?: boolean;
  studentIdExpiresOn?: string | null;
};

/** One dated entry in an organization's officer of record. */
export type OrganizationOfficer = {
  id: string;
  fullName: string;
  startedAt?: string | null;
  /** `null` while this officer is the current one. */
  endedAt?: string | null;
  verifiedAt: string | null;
  approvalCaseId?: string | null;
  applicationRevision?: number | null;
};

/** `GET /ops/organizations/:userId` (and the approval case's `organization`). */
export type OrganizationAccount = {
  userId: string;
  name: string | null;
  school: string | null;
  email: string | null;
  /** `null` until a first officer is verified (legacy or pending accounts). */
  currentOfficer: OrganizationOfficer | null;
  confirmedAt: string | null;
  nextConfirmationAt: string | null;
  confirmationRequestedAt: string | null;
  approvalCase: {
    id: string;
    status: ApprovalCaseSummary["status"];
    version: number;
    applicationRevision: number;
  } | null;
  actions: string[];
  /** Detail reads only. Oldest first. */
  officerHistory?: OrganizationOfficer[];
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
  /** Organization cases: the account and its dated officer history. */
  organization?: OrganizationAccount | null;
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
  /**
   * Who moved it. Absent on a supplier's timeline: the API keeps only
   * `{ at, state, note }` there (gridgo-api SUPPLIER_JOB_READINESS_API.md).
   */
  by?: string;
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
export type PayoutMilestoneStatus =
  "pending_pof" | "pof_attached" | "released" | "superseded";

/**
 * What a stage's release waits on: the shop's own proof, the rider's delivery
 * evidence, or the complaint window closing with no open claim.
 */
export type PayoutReleaseRequirement =
  "shop_proof" | "delivery_proof" | "issue_window_closed";

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
  /**
   * What a late-production deduction took off this stage. `amountMinor` is
   * already net of it; the two add back to the stage's original share. Absent
   * or 0 means none. Ops / Super Admin and the assigned shop only.
   */
  productionDeductionMinor?: number;
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
  | "escalation_resolved"
  // Rider-packs handover: six passes on the unpacked products, custody not moved yet.
  | "inspected";

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
  /**
   * Rider-packs handover only. `status: "inspected"` is a passing check of
   * the unpacked products that has not moved custody yet; the final pickup
   * keeps the inspection it confirmed and the packed photos.
   */
  inspectionId?: string;
  inspectedAt?: string;
  packedPhotoFileIds?: string[];
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
  "canva_link" | "google_drive" | "dropbox" | "we_transfer" | "other_link";

export type ArtworkLink = {
  formatCode: ArtworkLinkFormat | (string & {});
  url: string;
  /** The client's own name for it ("Logo design"); absent when they gave none. */
  label?: string | null;
};

/**
 * One entry in a line's ordered artwork: an uploaded file or a design link,
 * each with an optional client label ("Front", "Back", "Logo PDF"). At most
 * ten per line, in the client's order; the first file is `artworkFileId`.
 * File entries carry a short-lived signed link when the API could sign one.
 * Contract: "Multiple artwork attachments" in `gridgo-api/docs/ORDER_MATCH_API.md`.
 */
export type ArtworkAttachment =
  | {
      kind: "file";
      fileId: string;
      label?: string | null;
      downloadUrl?: string;
      downloadUrlExpiresAt?: string;
    }
  | {
      kind: "link";
      formatCode: ArtworkLinkFormat | (string & {});
      url: string;
      label?: string | null;
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
  /** Ops / Super Admin. The shop's stored unit price and line total. */
  effectiveUnitPriceMinor?: number | null;
  lineSubtotalMinor?: number | null;
  documentPages?: { total?: number | null; range?: string | null; printed?: number | null } | null;
  artworkFileId?: string | null;
  /** Design links on this line; `[]` when none, absent on an older API. */
  artworkLinks?: ArtworkLink[];
  /** Every file and link on this line, in order; absent on an older API. */
  artworkAttachments?: ArtworkAttachment[];
  mockupFileId?: string | null;
  /**
   * The client's special instructions for this line (≤ 300 characters),
   * contact details already masked by GRIDGO; empty or absent when none.
   * Read through `@/lib/order-changes`.
   */
  specialInstructions?: string | null;
  /** The latest change the client agreed to (and paid for) on this line. */
  agreedChange?: { id: string; proposedSpec: string; appliedAt: string } | null;
  /**
   * What the uploaded files measured against the product type at checkout,
   * and which warnings the client accepted. Frozen when the order was placed;
   * `null` on older orders and lines with no uploaded file, absent on an older
   * API. Read through `@/lib/artwork-guidance`.
   */
  artworkGuidance?: ArtworkGuidanceRecord | null;
  /**
   * How the client asked for the file to sit on the paper. `null` on products
   * without a layout choice and on older orders, absent on an older API.
   * Read through `@/lib/print-layout`.
   */
  printLayout?: PrintLayoutCode | null;
  /** The fit check as the client saw it at checkout, frozen with the order. */
  printLayoutCheck?: PrintLayoutCheck | null;
  /**
   * The client's exact colours, agreed at checkout and frozen with the order;
   * `[]` when none and on older orders, absent on an older API. Read through
   * `@/lib/color-targets`.
   */
  colorTargets?: ColorTargetRecord[];
  /** The colours GRIDGO read from each uploaded file on the line. Design links have none. */
  artworkColors?: ArtworkColorsRecord[];
};

// ---- Exact colours ----
// Contract: gridgo-api docs/EXACT_COLOURS_API.md.

export type CmykValues = { c: number; m: number; y: number; k: number };

/** One colour the client named, as GRIDGO normalised it. */
export type ColorTargetRecord = {
  label: string;
  format: "pantone" | "cmyk" | "hex" | (string & {});
  /** What to show as text: `PANTONE 201 C`, `C0 M100 Y65 K34`, `#1A5FB4`. */
  value: string;
  cmyk: CmykValues | null;
  hex: string | null;
  /** Null for a Pantone without the client's approximate hex: text only. */
  swatchHex: string | null;
  swatchApproximate: boolean | null;
};

/** One colour GRIDGO read from a file. */
export type ArtworkColorRecord = {
  kind: "spot" | "process" | "pixels" | (string & {});
  name: string | null;
  space: "cmyk" | "rgb" | "gray" | (string & {}) | null;
  cmyk: CmykValues | null;
  hex: string | null;
  uses: number | null;
  /** A PNG colour's share of the opaque pixels, 10000 = all. */
  shareBps: number | null;
};

/** `file.detected.colors`: what GRIDGO read when the file was uploaded. */
export type ArtworkColorsRead = {
  version?: number;
  status: "read" | "partial" | "unknown" | (string & {});
  reasons: string[];
  colors: ArtworkColorRecord[];
};

export type ArtworkColorsRecord = { fileId: string; colors: ArtworkColorsRead | null };

// ---- Print layout ----
// Contract: gridgo-api docs/PRINT_LAYOUT_API.md.

/** A layout code; a code added after this build reads as itself, tidied. */
export type PrintLayoutCode =
  | "fit_to_paper"
  | "actual_size_centered"
  | "actual_size_original_position"
  | (string & {});

/** A paper option of the listing, measured in thousandths of a millimetre. */
export type PrintLayoutPaper = {
  optionId: string;
  label: string;
  widthMilli: number;
  heightMilli: number;
  pageSize: string | null;
};

export type PrintLayoutFilePage = {
  widthMilli: number;
  heightMilli: number;
  pageSize: string | null;
  orientation?: string | null;
  largestShortSideMilli?: number | null;
  largestLongSideMilli?: number | null;
  mixedPageSizes?: boolean | null;
};

/** The fit check: the file's page against the chosen paper. */
export type PrintLayoutCheck = {
  supportedLayouts: PrintLayoutCode[];
  layout: PrintLayoutCode | null;
  paper: PrintLayoutPaper | null;
  files: Array<{
    fileId: string;
    page: PrintLayoutFilePage | null;
    exceedsPaper: boolean | null;
  }>;
  exceedsPaper: boolean | null;
  cutOff: boolean | null;
  scaleChanges: boolean | null;
  suggestedPaper: PrintLayoutPaper | null;
  unknown: Array<{ code: string; fileId?: string | null }>;
};

// ---- Artwork guidance ----
// Contract: gridgo-api docs/ARTWORK_GUIDANCE_API.md.

/** One product type's target. `minimumDpi` 50–1200, or null for no resolution check. */
export type ArtworkGuidanceTarget = {
  minimumDpi: number | null;
  /** `false`: the product type expects CMYK, so an RGB file gets a warning. */
  acceptsRgb: boolean;
};

/** `settings.artworkGuidance`: the default and each product type's own target. */
export type ArtworkGuidanceSettings = {
  version: 1;
  default: ArtworkGuidanceTarget;
  /** Keyed by taxonomy subcategory code; a code without an entry uses `default`. */
  subcategories: Record<string, ArtworkGuidanceTarget>;
};

export type ArtworkColorMode = "rgb" | "cmyk" | "grayscale" | "mixed";

export type ArtworkGuidanceWarning =
  | {
      code: "low_resolution";
      effectiveDpi: number;
      minimumDpi: number;
      /** When the client accepted it; null when nobody did. */
      acceptedAt: string | null;
    }
  | {
      code: "color_mode";
      colorMode: ArtworkColorMode | string;
      expectedColorMode: string;
      acceptedAt: string | null;
    };

export type ArtworkGuidanceFile = {
  fileId: string;
  /** Null when the file does not say (Word, a PDF naming no colour space). */
  colorMode: ArtworkColorMode | string | null;
  pixelWidth: number | null;
  pixelHeight: number | null;
  /** At the ordered size, limiting side. Null without pixels or a size. */
  effectiveDpi: number | null;
  warnings: ArtworkGuidanceWarning[];
};

/** The order line's frozen record (`productionItems[].artworkGuidance`). */
export type ArtworkGuidanceRecord = {
  version: number;
  evaluatedAt: string;
  subcategoryCode: string | null;
  minimumDpi: number | null;
  acceptsRgb: boolean;
  /** `cmyk`, or `rgb_accepted` when the product type takes RGB. */
  expectedColorMode: string;
  /** Thousandths of a millimetre; null when the line names no size. */
  orderedSize: { widthMilli: number; heightMilli: number } | null;
  files: ArtworkGuidanceFile[];
  openWarningCount: number;
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
  /**
   * Late-production (Ops / Super Admin and the assigned shop): the order was
   * severely late, so Operations may review handing it to another shop.
   */
  productionReassignmentEligible?: boolean;
  /** Set when Operations recorded that the shop could not be reached. */
  productionNoCommunication?: { at: string; by: string; reason: string } | null;
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
  /**
   * The fee GRIDGO keeps: **net** of any organization discount since
   * gridgo-api#155. On an organization order the gross fee and the discount
   * ride beside it (`grossServiceFeeMinor - organizationDiscountMinor`).
   * Read the three through `src/lib/organization-discount.ts`.
   */
  serviceFeeMinor?: number;
  /**
   * Ops / Super Admin. The fee table this order was priced under, frozen at
   * checkout (gridgo-api#220). Version 2 is the bracket table; version 1 a
   * legacy flat rate. Orders on version 2 carry `serviceFeeRateBps: null`:
   * never infer one whole-order rate for them. Read through
   * `src/lib/service-fee-brackets.ts`.
   */
  serviceFeeSchedule?: ServiceFeeSchedule | null;
  /** Ops / Super Admin. How the gross fee was worked out, bracket by bracket. */
  serviceFeeWorking?: ServiceFeeWorkingRow[] | null;
  /** Ops / Super Admin. The fee before the organization discount. */
  grossServiceFeeMinor?: number;
  /** Ops / Super Admin. The discount rate snapshotted at checkout; 0 for everyone else. */
  organizationDiscountRateBps?: number;
  /**
   * The organization discount in pesos, funded from GRIDGO's fee. The client
   * sees this one too ("Organization discount -₱X"); it is already taken off
   * `totalMinor`. 0 or absent when the client is not an approved organization.
   */
  organizationDiscountMinor?: number;
  /** Ops / Super Admin. GRIDGO's revenue on this order, gross and net of the discount. */
  platformRevenue?: PlatformRevenue;
  /**
   * A GRIDGO-funded voucher on this order (gridgo-api#204, VOUCHERS_API.md).
   * Ops / Super Admin and the owning client only; the API strips it, and the
   * five figures below, from shops and riders. On a basket group the line is
   * that group's share of the one voucher. It replaces the organization
   * discount (only one applies) and comes out of GRIDGO's service fee first,
   * then delivery; the shop price, payout stages and rider pay never move.
   * `totalMinor` is already after it. Read through `src/lib/vouchers.ts`.
   */
  voucher?: OrderVoucherLine | null;
  voucherDiscountMinor?: number;
  /** Of the voucher, the part taken off GRIDGO's service fee. */
  voucherServiceFeeMinor?: number;
  /** Of the voucher, the part taken off delivery (only once the fee is used up). */
  voucherDeliveryMinor?: number;
  /** The service fee the client actually pays after the voucher. */
  clientServiceFeeMinor?: number;
  /** The delivery the client actually pays after the voucher. */
  clientDeliveryFeeMinor?: number;
  /** Ops / Super Admin money reporting: the voucher line with its funding split. */
  voucherFunding?: OrderVoucherLine;
  /**
   * Multi-shop checkout (gridgo-api#150, MULTI_SHOP_CHECKOUT_API.md). A basket
   * is one payment over several shop groups; each group is an ordinary order
   * with its own job. Absent on a single-shop order. Read through
   * `src/lib/baskets.ts`.
   */
  basketId?: string | null;
  /** "Shop A", "Shop B", … — never the shop's trading name. */
  groupLabel?: string | null;
  basketDeadline?: string | null;
  invoiceNumber?: string | null;
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
  refundDeliverySettlement?: {
    riderEntitlementMinor: number;
    settlementId: string;
  } | null;
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
  /** Separate packed-work evidence; supplier, client and staff only. */
  packingProgress?: ProductionProgress;
  /**
   * Which shop-to-rider handover this order follows (contract
   * `gridgo-api/docs/SHOP_HANDOVER_API.md`). Staff and the assigned
   * shop/rider only; absent on an older API. Read it through
   * `src/lib/shop-handover.ts`, never from dates or payout amounts.
   */
  handoverFlow?: HandoverFlow;
  /** The handover evidence trail. Staff and the assigned shop/rider only. */
  shopHandover?: ShopHandover | null;
  /** Every staff-forced production step, with its reason. Staff and assigned parties. */
  forcedSteps?: ForcedStep[];
  /** True once any step was forced: every app shows "Forced by GRIDGO". */
  forcedByGridgo?: boolean;
  /** Staff only: the reason codes a forced step may carry. */
  forcedStepReasonCodes?: string[];
  /** Staff only: already-packed jobs this shop has presented, across its orders. */
  shopArrivedPackedCount?: number;
  /**
   * What the API would still refuse each packaging step for, as of this read
   * (assigned supplier and Operations/Super Admin). A snapshot, never a
   * reservation: the transition is checked again when pressed. Read it
   * through `src/lib/packaging-readiness.ts`.
   */
  transitionReadiness?: Partial<
    Record<"supplier_self_qc" | "ready_for_dispatch", TransitionReadiness>
  > | null;
  /**
   * Material, zone and the shop's date as the API filled them from the
   * order's own snapshots. A value it could not fill is exactly
   * "Not specified" and is named in `missing`.
   */
  jobDetails?: JobDetails | null;
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

  /**
   * Operations' file check (gridgo-api#122, contract "Artwork checkout gate and
   * Operations handoff" in ORDER_MATCH_API.md). The shop sees nothing of the
   * order until it is `passed`. Ops / Super Admin and the owning client; absent
   * on an older order or API. Read through `src/lib/file-check.ts`.
   */
  fileCheck?: FileCheck | null;
  /**
   * While a new order's file check is pending: when Operations can review it
   * (OPERATING_HOURS_API.md). Ops / Super Admin and the owning client; absent
   * on an order from before operating hours or once the check is decided.
   */
  review?: OrderReview | null;
  /**
   * The assigned shop's one-opening-hour window to accept (SHOP_RECOVERY_API.md).
   * Ops / Super Admin and the assigned shop.
   */
  shopAcceptance?: ShopAcceptance | null;
  /** The open (or last) recovery after a shop could not take or keep the order. */
  shopRecovery?: ShopRecovery | null;
  /** The shop's one production-deadline request (ORDER_RESCHEDULE_API.md). */
  rescheduleRequest?: RescheduleRequest | null;
  /** Delivery or hub pick-up, chosen before matching (gridgo-client#158). */
  requestFulfillment?: {
    fulfillmentMode: "delivery" | "pickup";
    dropoff: MapPoint | null;
  } | null;
  /** The hub's schedule and fee as snapshotted at checkout, on a pick-up order. */
  hubPickup?: HubPickup | null;
  /** Ops / Super Admin. Set when Operations holds the file and tells the client. */
  qaHold?: { at: string; by: string; reason: string } | null;
  notes?: string | null;
  /** Optional landmark kept beside the composed address. */
  landmark?: string | null;
  /** Present only when a pin check already recorded one of these. */
  pinWarning?: string | null;
  pinFarFromAddress?: boolean;
  outsideDeliveryArea?: boolean;
  dropoffConfirmation?: {
    status: string;
    requestedAt?: string;
    answeredAt?: string | null;
    point?: MapPoint | null;
    requestedPoint?: MapPoint | null;
    warning?: string | null;
    farFromAddress?: boolean;
    outsideArea?: boolean;
  } | null;
  /** Already inside `deliveryFeeMinor` on a pick-up order. Never add the two. */
  pickupFeeMinor?: number;
  /**
   * The production-finished delivery pin (gridgo-api `docs/DELIVERY_PIN_API.md`):
   * whether the client will be there, and their one change. Absent on a pick-up
   * order, a legacy trip and every supplier payload. Read through
   * `@/lib/delivery-pin`.
   */
  deliveryPin?: DeliveryPin | null;
  /**
   * The delivery fee now, after an applied pin change. `deliveryFeeMinor`
   * stays the checkout fee. Sent only with `deliveryPin`.
   */
  effectiveDeliveryFeeMinor?: number;
  /** The checkout total plus an applied pin change's difference. */
  effectiveTotalMinor?: number;
  /**
   * Special instructions and change requests (gridgo-api
   * `docs/ORDER_CHANGES_API.md`). Read only through `@/lib/order-changes`.
   * `specialInstructions` is an older order's single note; checkout orders
   * carry one per line.
   */
  specialInstructions?: string | null;
  specialInstructionLines?: SpecialInstructionLine[];
  /** The assigned shop's tick that it read the notes, once it accepted. */
  specialInstructionsAcknowledgement?: SpecialInstructionsAcknowledgement | null;
  changeRequests?: OrderChangeRequest[];
  /** Verified change payments on top of the checkout total. Absent until one is confirmed. */
  supplementalTotalMinor?: number;
  totalIncludingSupplementsMinor?: number;
};

// ---- Special instructions and change requests (gridgo-api docs/ORDER_CHANGES_API.md) ----

export type SpecialInstructionLine = { lineItemId: string; text: string };

export type SpecialInstructionsAcknowledgement = {
  /** The shop that ticked. Stripped for clients. */
  supplierId?: string;
  at: string;
  /** The notes exactly as the shop read them. */
  lines?: SpecialInstructionLine[];
  /** An older order's single note, when it had one. */
  text?: string;
};

export type OrderChangeStatus =
  | "pending"
  | "pending_payment"
  | "pending_confirmation"
  | "applied"
  | "declined"
  | "closed";

/** The client's QR transfer for a change, and the GRIDGO Team's check of it. */
export type OrderChangePayment = {
  proofFileId: string;
  reference: string;
  submittedAt: string;
  confirmedAt?: string;
  confirmedBy?: string;
};

export type OrderChangeRejectedPayment = OrderChangePayment & {
  rejectedAt: string;
  rejectedBy?: string;
  reason?: string;
};

/** The shop's extra for an applied change, paid with the final payout stage. */
export type OrderChangePayout = {
  status: "pending" | "released" | "superseded";
  amountMinor: number;
  releaseRequires?: string;
  reference?: string;
  createdAt?: string;
};

/**
 * One change request. Which fields arrive depends on the caller: the shop
 * never gets the client's total, GRIDGO's fee or the payment; staff get
 * everything.
 */
export type OrderChangeRequest = {
  id: string;
  orderId?: string;
  supplierId?: string;
  lineItemId: string | null;
  status: OrderChangeStatus | (string & {});
  version: number;
  reason: string;
  /** Empty for a time-only request. */
  proposedSpec: string;
  proposedReadyBy?: string | null;
  proposedPromiseBy?: string | null;
  /** The shop's own extra (centavos). Shop and staff only. */
  extraPrincipalMinor?: number;
  /** GRIDGO's added fee on the extra. Staff only. */
  feeMinor?: number;
  /** What the client pays for the change: extra + fee. Client and staff. */
  totalMinor?: number;
  createdAt: string;
  originalInstructions?: string;
  originalReadyBy?: string | null;
  originalPromiseBy?: string | null;
  answeredAt?: string;
  answeredBy?: string;
  appliedAt?: string;
  closedAt?: string;
  closureReason?: string;
  payment?: OrderChangePayment;
  paymentHistory?: OrderChangeRejectedPayment[];
  rejectionReason?: string;
  payout?: OrderChangePayout | null;
};

// ---- Delivery pin (gridgo-api docs/DELIVERY_PIN_API.md) ----

/** The client's surcharge transfer for a dearer pin, and Operations' check of it. */
export type DeliveryPinPayment = {
  proofFileId: string;
  reference: string;
  submittedAt: string;
  /** Set when Operations verified it: always the exact difference. */
  amountMinor?: number;
  confirmedAt?: string;
  confirmedBy?: string;
};

export type DeliveryPinChangeStatus = "pending_payment" | "pending_confirmation" | "applied";

/** The one change. A dearer pin is a proposal until its payment is verified. */
export type DeliveryPinChange = {
  id: string;
  status: DeliveryPinChangeStatus | string;
  point: MapPoint;
  zone: DeliveryZoneKey | string;
  distanceMeters: number;
  /** The delivery fee at the new pin. */
  deliveryFeeMinor: number;
  /** Signed: positive is collected from the client, negative is a credit back. */
  feeDifferenceMinor: number;
  createdAt: string;
  appliedAt?: string | null;
  /** A cheaper pin's delivery-fee credit, a `delivery_pin` refund request. */
  refundRequestId?: string | null;
  payment?: DeliveryPinPayment | null;
  /** The last rejected proof's reason, which the client read. */
  rejectionReason?: string | null;
  /** Staff only: the signed split of the difference. */
  riderDifferenceMinor?: number;
  platformDifferenceMinor?: number;
};

export type DeliveryPin = {
  version: number;
  /** `pending` until the client says they will be there (or a change applies). */
  status: "pending" | "confirmed" | string;
  requestedAt: string;
  confirmedAt: string | null;
  /** The effective pin: the original until a change is applied. */
  point: MapPoint;
  zone: DeliveryZoneKey | string;
  notes: string;
  /** Empty means the client receives it themselves. */
  receiverName: string;
  changeUsed: boolean;
  canConfirm: boolean;
  canChange: boolean;
  /** The checkout pin. Never on a rider payload. */
  original?: MapPoint;
  change?: DeliveryPinChange | null;
};

// ---- Operations file check (gridgo-api#122) ----

export type FileCheckStatus = "pending" | "passed" | "failed" | "cancelled";

export type QaCheckId = "artwork" | "spec" | "quantity" | "address";
export type QaChecklist = Record<QaCheckId, boolean>;

export type FileCheck = {
  /** Staff-only explicit ticks. Missing/null means no per-item record. */
  checklist?: { version: 1; checks: QaChecklist } | null;
  status: FileCheckStatus;
  /** When the wait began: checkout, or the client's resubmission. */
  requestedAt: string;
  reviewedAt: string | null;
  /** Ops / Super Admin only. */
  reviewedBy?: string | null;
  /** Why the file was sent back, in words the client reads. */
  reason: string | null;
  /** Computed by the API at read time; 0 once decided. */
  waitingSeconds: number;
};

// ---- Shop acceptance and recovery (gridgo-api SHOP_RECOVERY_API.md) ----

export type ShopAcceptanceStatus =
  "pending" | "accepted" | "timed_out" | "declined" | "cancelled";

export type ShopAcceptance = {
  supplierId: string;
  assignedAt: string;
  /** Absolute expiry: one hour of the shop's opening time, not 60 wall minutes. */
  deadlineAt: string;
  workingMinutes: number;
  status: ShopAcceptanceStatus;
  acceptedAt?: string | null;
};

export type ShopFailureKind = "timed_out" | "declined" | "cancelled";

export type ShopRecoveryStatus =
  "awaiting_client" | "ops_review" | "refund_requested" | "refunded" | "accepted";

/** The replacement GRIDGO found. Ops / Super Admin see who and when. */
export type ShopRecoveryProposal = {
  supplierId: string;
  pickup?: MapPoint | null;
  /** The replacement shop's ready-by. */
  readyBy: string;
  /** What the client is told. */
  promiseBy: string;
  expiresAt: string;
};

export type ShopRecovery = {
  id: string;
  status: ShopRecoveryStatus;
  originalSupplierId?: string;
  /** The order state when the shop failed. */
  stage?: string;
  createdAt?: string;
  originalSnapshot?: {
    pickup?: MapPoint | null;
    readyBy: string | null;
    promiseBy: string | null;
  };
  proposal?: ShopRecoveryProposal | null;
  refundRequestId?: string | null;
  acceptedAt?: string | null;
};

/** One timeout, decline or cancellation, from `GET /ops/shop-failures`. */
export type ShopFailureEvent = {
  id: string;
  orderId: string;
  supplierId: string;
  kind: ShopFailureKind;
  stage: string;
  reason: string;
  at: string;
  actorId: string | null;
  /** The order's current recovery, which may be a later one. */
  recovery?: ShopRecovery | null;
};

// ---- Production deadline requests (gridgo-api ORDER_RESCHEDULE_API.md) ----

export type RescheduleStatus =
  "pending" | "accepted" | "declined" | "expired" | "operations_required";

export type RescheduleResolution =
  | "rematch_offered"
  | "no_match"
  | "operations_required"
  | "rematched"
  | "refund_requested"
  | "resolved";

/** The Ops / Super Admin projection. */
export type RescheduleRequest = {
  id: string;
  orderId: string;
  supplierId?: string;
  reason: string;
  status: RescheduleStatus;
  requestedAt: string;
  /** requestedAt + 24 hours. */
  expiresAt: string;
  answeredAt: string | null;
  resolution: RescheduleResolution | null;
  refundRequestId: string | null;
  /** True while work and payouts are stopped for this request. */
  workHeld: boolean;
  originalReadyBy?: string | null;
  proposedReadyBy?: string | null;
  originalPromiseBy?: string | null;
  proposedPromiseBy?: string | null;
  canRequestRefund?: boolean;
  rematch?: { id: string; promiseBy: string; expiresAt: string } | null;
  appliedDeductionMinor?: number;
  resolvedAt?: string | null;
  resolutionReason?: string | null;
};

export type RescheduleQueue = {
  /** The shop's lifetime count (before the status filter). */
  totalRequests: number;
  requests: RescheduleRequest[];
};

// ---- Operating hours (gridgo-api docs/OPERATING_HOURS_API.md) ----

/**
 * GRIDGO's own working week: when artwork is reviewed, riders are dispatched
 * and new orders' shop clocks count. One window per open day, Manila time.
 */
export type OperatingHours = {
  /** Always `Asia/Manila`. */
  timeZone: string;
  schedule: {
    /** Always 480. */
    utcOffsetMinutes: number;
    /** One window per open weekday; a weekday left out is closed. */
    week: WeeklyWindow[];
    /** Inclusive Manila dates; at most 100 ranges and 90 distinct days. */
    closures: ScheduleClosure[];
  };
  /** Open-time minutes a review takes, 1–540. */
  artworkReviewMinutes: number;
  /** Minutes after Manila midnight, 0–1439. Stored only: Priority Delivery is not offered. */
  priorityDispatchCutoffMinute: number;
};

/** The shared timing object: when a review placed at the read instant would happen. */
export type OperatingTiming = {
  timeZone: string;
  isOpenNow: boolean;
  artworkReviewMinutes: number;
  /** Now while open, otherwise the next opening. */
  scheduledReviewAt: string;
  reviewCompletesAt: string;
  /** A closure pushes the review later than the same week without closures. */
  reviewDelayed: boolean;
};

/** `order.review`: a pending file check's live review time. */
export type OrderReview = OperatingTiming & {
  status: "waiting_for_review" | string;
  label: string;
  originallyScheduledReviewAt: string | null;
  outsideHoursNotice: "outside_operating_hours" | null | string;
  /** The client promise, never the shop's internal deadline. */
  readyBy: string | null;
};

// ---- Hub pick-up (gridgo-api OPERATIONAL_MODEL_V2_API.md "Hub pick-up settings") ----

/** One opening window: weekday 0 Sunday … 6 Saturday, minutes after midnight. */
export type WeeklyWindow = { weekday: number; opensMinute: number; closesMinute: number };

/** Inclusive `YYYY-MM-DD` days the hub is shut. */
export type ScheduleClosure = { startDay: string; endDay: string };

// ---- Shop hours ----
// Contract: gridgo-api docs/SHOP_HOURS_API.md. Read through
// `normalizeShopHours` in `src/lib/shop-hours.ts`, never raw.

/** Today's extra hours, a Manila date and minutes after its midnight. */
export type ShopHoursExtension = { day: string; opensMinute: number; closesMinute: number };

/** A shop's hours as the screens read them. */
export type ShopHours = {
  /** Shared with `/me/supplier-profile`; a stale one is `409 supplier_profile_stale`. */
  version: number;
  /** One window per open weekday; a weekday left out is closed. */
  week: WeeklyWindow[];
  closures: ScheduleClosure[];
  temporarilyClosed: boolean;
  isOpenNow: boolean;
  /** False when the API holds an older calendar it cannot schedule against. */
  calendarAvailable: boolean;
  /** Now while open, the next opening while closed, null while closed for a while. */
  nextOpeningAt: string | null;
  todayExtension: ShopHoursExtension | null;
  /** `dispatchNotice` is `review_and_dispatch_in_next_working_window`. */
  dispatchWaits: boolean;
};

/** `PATCH /me/shop-hours` without its `expectedVersion`. Fields left out are kept. */
export type ShopHoursPatch = {
  schedule?: { utcOffsetMinutes: number; week: WeeklyWindow[]; closures: ScheduleClosure[] };
  temporarilyClosed?: boolean;
  extension?: { closesMinute: number } | null;
};

export type WeeklySchedule = {
  utcOffsetMinutes: number;
  week: WeeklyWindow[];
  closures?: ScheduleClosure[];
};

export type HubPickup = {
  /** Read-only: GRIDGO's own counter. */
  point?: MapPoint | null;
  /** `null` means the hours are not set yet — never "open all week". */
  schedule: WeeklySchedule | null;
  feeMinor: number;
};

export type Notification = {
  id: string;
  userId: string;
  type?: string;
  orderId?: string | null;
  approvalCaseId?: string | null;
  catalogItemId?: string | null;
  announcementId?: string | null;
  /** Organization reminders and notices name the organization account. */
  organizationUserId?: string | null;
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
  | "account-deletion-requests"
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

export type DeliveryFeeBand =
  FlatDeliveryZoneBand | OutOfZoneDeliveryBand | LegacyDeliveryFeeBand;

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

// ---- Service fee brackets ----
// Contract: gridgo-api docs/SERVICE_FEE_API.md (gridgo-api#220).

/** One bracket: the rate on the part of the shop price up to `upToMinor`; null on the last. */
export type ServiceFeeBracket = { upToMinor: number | null; rateBps: number };

/** A legacy flat rate on the whole shop price, as older orders snapshot it. */
export type ServiceFeeScheduleV1 = { version: 1; rateBps: number };

/** Marginal brackets, rounded half-up once per shop/deadline group. */
export type ServiceFeeScheduleV2 = {
  version: 2;
  rounding: "half_up_once";
  brackets: ServiceFeeBracket[];
  /** The settings version that saved it (settings edits only). */
  settingsVersion?: number;
  /** When it prices new orders, as UTC ISO (settings edits only). */
  effectiveFrom?: string;
};

export type ServiceFeeSchedule = ServiceFeeScheduleV1 | ServiceFeeScheduleV2;

/** One line of the fee's working: `taxableMinor × rateBps`, rounded so the rows add to the fee. */
export type ServiceFeeWorkingRow = {
  fromMinor: number;
  upToMinor: number | null;
  rateBps: number;
  taxableMinor: number;
  amountMinor: number;
};

export type ServiceFeeResult = {
  grossServiceFeeMinor: number;
  serviceFeeSchedule: ServiceFeeSchedule;
  serviceFeeWorking: ServiceFeeWorkingRow[];
};

/** `POST /settings/service-fee/preview`: today's table against the proposed one. */
export type ServiceFeePreview = {
  version: number;
  current: ServiceFeeSchedule;
  proposed: ServiceFeeSchedule;
  examples: Array<{
    shopPriceMinor: number;
    previous: ServiceFeeResult;
    next: ServiceFeeResult;
  }>;
};

export type ServiceFeePreviewInput = {
  expectedVersion: number;
  serviceFeeBrackets: ServiceFeeBracket[];
  serviceFeeEffectiveFrom?: string;
};

/** The order fields the money panel reads a fee from. */
export type OrderFeeLike = Pick<
  Order,
  "serviceFeeSchedule" | "serviceFeeWorking" | "serviceFeeRateBps" | "supplierSubtotalMinor"
>;

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
   * The bracket table pricing new orders (gridgo-api#220). Operations and
   * Super Admin only; the API strips it from everyone else. When present,
   * `serviceFeeRateBps` is kept for old consumers and prices nothing new.
   * Absent on an API from before brackets.
   */
  serviceFeeSchedule?: ServiceFeeSchedule;
  /**
   * A table waiting for its `effectiveFrom`. Once that time has passed the API
   * prices with it, though it stays here as evidence until the next edit:
   * resolve through `scheduleInForce`.
   */
  scheduledServiceFee?: ServiceFeeScheduleV2 | null;
  /**
   * Whether client checkout names the fee (`Service fee · N%`). The pesos
   * stay inside Printing either way. Absent on an older settings row; treat
   * as shown.
   */
  serviceFeeVisibleToClient?: boolean;
  /**
   * Whether clients may file a new printed-invoice request. Super Admin
   * writes it. Absent on an older settings row; treat as off. A request
   * already on file stays visible either way.
   */
  physicalInvoiceRequestsEnabled?: boolean;
  /**
   * The organization discount, in basis points of the same shop price the
   * service fee is charged on (500 = 5%), 0–10,000. Paid out of GRIDGO's fee.
   * Under a flat rate it may never exceed `serviceFeeRateBps` (`400
   * organization_discount_exceeds_service_fee`); under brackets each order's
   * discount is capped at its own fee instead. Super Admin writes it.
   * Absent on an API that predates organization discounts.
   */
  organizationDiscountRateBps?: number;
  /**
   * The share of each delivery fee the rider keeps, in basis points (8,500 =
   * 85% rider, 15% GRIDGO), 0–10,000. Snapshotted on every order when its
   * delivery fee is set. Absent on an API that predates the split — the
   * settings screen then says so instead of offering a control that saves
   * nothing.
   */
  riderCommissionBps?: number;
  /**
   * Deprecated since gridgo-api#229: still stored, no longer controls what a
   * client sees. Not shown or sent by this portal.
   */
  clientRiderLocationRevealDistanceMeters?: number;
  /**
   * How often client maps re-read the rider's position, whole seconds 15–30
   * (default 20). Super Admin writes it. Absent on an API before #229.
   */
  riderLocationRefreshIntervalSeconds?: number;
  /**
   * How old a rider's last fix may be before it is flagged stale, whole
   * seconds 30–600 (default 120). Super Admin writes it.
   */
  riderLocationStaleAfterSeconds?: number;
  /**
   * How much of a new checkout the client pays up front: 100 (the default
   * since 2026-09-25, gridgo-api#66) or 75 (75% now, 25% before delivery).
   * Snapshotted on every order at checkout. Absent on an API that predates
   * it; the settings screen then leaves the control out.
   */
  downpaymentPercent?: number;
  deliveryFeeBands: DeliveryFeeBand[];
  /**
   * Late-production penalties: the three tier rates and the real-deductions
   * gate (off by default). Every role reads it; only Super Admin may write it.
   * Absent on an API that predates penalties; the screen then says so.
   */
  productionPenalty?: ProductionPenaltyPolicy;
  /** Super Admin availability switch for new orders; missing means off. */
  hubPickupEnabled?: boolean;
  /** Super Admin handover codes gate; issued codes survive disabling it. */
  handoverOtpEnabled?: boolean;
  /**
   * The hub's pick-up hours and flat fee. Every role reads it; only Super
   * Admin writes it. Absent on an API that predates hub pick-up.
   */
  hubPickup?: HubPickup;
  /** Manual QR checkout. `imageUrl` is the replaceable plate. */
  paymentQr?: PaymentQr;
  /** Super Admin pricing dashboard. Monthly fixed costs in centavos. */
  pricingFixedCostsMinor?: number | null;
  /** Super Admin pricing dashboard. Payment-fee rate in basis points. */
  pricingPaymentFeeBps?: number | null;
  /**
   * GRIDGO's operating week, review time and the stored Priority dispatch
   * cutoff. Every role reads it; only Super Admin writes it, always whole.
   * Absent on an API that predates operating hours.
   */
  operatingHours?: OperatingHours;
  /**
   * Read with the settings, beside them in the response: is GRIDGO open now,
   * and when a file arriving now would be reviewed.
   */
  operatingStatus?: OperatingTiming;
  /**
   * Recommended resolution and colour per product type. Every role reads it;
   * only Super Admin writes it, always the whole value. Absent on an API that
   * predates artwork guidance.
   */
  artworkGuidance?: ArtworkGuidanceSettings;
};

export type UpdateSettingsInput = {
  issueWindowHours?: number;
  serviceFeeRateBps?: number;
  serviceFeeVisibleToClient?: boolean;
  /** Super Admin only. The complete bracket table; the last limit is null. */
  serviceFeeBrackets?: ServiceFeeBracket[];
  /** With `serviceFeeBrackets` only: when it starts (ISO with offset). Omit to start now. */
  serviceFeeEffectiveFrom?: string;
  /** Super Admin only. Off unless sent as `true`. */
  physicalInvoiceRequestsEnabled?: boolean;
  organizationDiscountRateBps?: number;
  riderCommissionBps?: number;
  /** Super Admin only; whole seconds 15–30. */
  riderLocationRefreshIntervalSeconds?: number;
  /** Super Admin only; whole seconds 30–600. */
  riderLocationStaleAfterSeconds?: number;
  downpaymentPercent?: number;
  deliveryFeeBands?: DeliveryFeeBand[];
  productionNudge?: ProductionNudge;
  /** Super Admin only, always the complete object (`403` for anyone else). */
  productionPenalty?: ProductionPenaltyPolicy;
  /** Super Admin only; does not affect already placed orders. */
  hubPickupEnabled?: boolean;
  /** Super Admin handover codes gate; issued codes survive disabling it. */
  handoverOtpEnabled?: boolean;
  /** Super Admin only, always `{schedule, feeMinor}`; the point is read-only. */
  hubPickup?: Pick<HubPickup, "schedule" | "feeMinor">;
  /** Pricing dashboard. Whole centavos of monthly fixed cost. */
  pricingFixedCostsMinor?: number | null;
  /** Pricing dashboard. Payment fee in basis points, 0–10,000. */
  pricingPaymentFeeBps?: number | null;
  /** Super Admin only, always the complete object. */
  operatingHours?: OperatingHours;
  /** Super Admin only, always the complete value (`403` for anyone else). */
  artworkGuidance?: ArtworkGuidanceSettings;
  reason?: string;
};

// ---- Late-production penalties ----
// Contract: gridgo-api docs/PRODUCTION_PENALTIES_API.md.

export type ProductionPenaltyTier = "minor" | "moderate" | "severe";

/**
 * Basis points of what GRIDGO still owes the shop on the order (500 = 5%),
 * 0–10,000, never decreasing from minor to severe. `deductionsEnabled` is the
 * real-money gate and ships off.
 */
export type ProductionPenaltyPolicy = {
  deductionsEnabled: boolean;
  minorBps: number;
  moderateBps: number;
  severeBps: number;
};

export type ProductionLapseWarning = {
  tier: ProductionPenaltyTier | string;
  at: string;
  /** The exact text the shop received. */
  message: string;
  /** Moderate and severe warnings go on the shop's record. */
  formal: boolean;
};

/**
 * `warning_only`: the gate was off when the lapse began, so it never deducts.
 * `warned`: the gate was on; one deduction is assessed once the job finishes
 * or turns severe. `applied`: deducted. `closed`: a refund or cancellation
 * ended it without a deduction.
 */
export type ProductionLapseStatus = "warning_only" | "warned" | "applied" | "closed";

/** One order a shop finished (or is still finishing) after its ready-by time. */
export type ProductionLapse = {
  id: string;
  orderId: string;
  supplierId: string;
  /** The ready-by deadline it missed. */
  deadlineAt: string;
  detectedAt: string;
  /** The furthest tier reached. */
  tier: ProductionPenaltyTier | string;
  rateBps: number;
  settingsVersion: number;
  /** The policy in force when the first warning went out. */
  policy: ProductionPenaltyPolicy;
  warnings: ProductionLapseWarning[];
  /** The unpaid balance the deduction was taken from. 0 until assessed — not a quote. */
  remainingBalanceMinor: number;
  /** 0 until assessed. */
  deductionMinor: number;
  appliedAt: string | null;
  closedAt: string | null;
  /** Severe: Operations may review handing the order to another shop. */
  reassignmentEligible: boolean;
  status: ProductionLapseStatus | string;
};

export type SupplierProductionLapses = {
  supplierId: string;
  /** Newest first. */
  lapses: ProductionLapse[];
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
  /**
   * Read at upload when the bytes said so. Absent or null means the file
   * did not say — the desk does not invent a colour mode, a font list or bleed.
   */
  colorMode?: "cmyk" | "rgb" | "gray" | "mixed" | "indexed" | "icc" | "spot" | null;
  fonts?: { name: string; embedded: boolean }[] | null;
  /** Smallest bleed margin, in thousandths of a millimetre. */
  bleedMilli?: number | null;
  hasAlpha?: boolean | null;
  /** The warning a client accepted while uploading, when that record was stored. */
  acceptedWarning?: { at: string; message?: string | null } | null;
  /** The colours the file uses, read once at upload; absent on older files. */
  colors?: ArtworkColorsRead | null;
};

/**
 * One progress photo, as `productionProgress.photos` carries it. It names no
 * uploader, filename, payout stage or proof code. `downloadUrl` is missing when
 * signing failed; `GET /files/:fileId/download-url` retries it.
 */
/** One thing the API still needs before a step, in its own sentence. */
export type TransitionRequirement = { code: string; message: string };

/** `rider_packs`: the shop sends unpacked photos, GRIDGO reviews, the rider packs. */
export type HandoverFlow = "rider_packs" | "legacy";

/** The shop's finished, unpacked product photos, as one immutable submission. */
export type FinishedSubmission = {
  at: string;
  by: string;
  supplierId: string;
  photoFileIds: string[];
};

/** GRIDGO's answer to one submission. `note` is what the shop reads when sent back. */
export type FinishedReview = {
  at: string;
  by: string;
  decision: "approved" | "rejected" | (string & {});
  note: string;
};

/** One reviewed submission, kept for good. */
export type FinishedAttempt = { finished: FinishedSubmission; review: FinishedReview };

/** A rider found the job already packed and recorded it before inspecting. */
export type ArrivedPackedEvent = {
  at: string;
  riderId: string;
  supplierId: string;
  assignedAt: string | null;
};

/** A passing check of the unpacked products at the counter. */
export type HandoverInspection = {
  status: string;
  inspectionId: string;
  checks: PickupCheck[];
  counts?: PickupCount[];
  completedAt: string;
  completedBy: string;
};

/** A packing photo the rider took after an inspection. */
export type RiderPackingPhoto = {
  at: string;
  by: string;
  fileId: string;
  inspectionId: string;
};

export type ShopHandover = {
  finished?: FinishedSubmission | null;
  review?: FinishedReview | null;
  attempts?: FinishedAttempt[];
  arrivedPacked?: ArrivedPackedEvent[];
  inspections?: HandoverInspection[];
  packingPhotos?: RiderPackingPhoto[];
};

/** A production step GRIDGO staff forced, and the checks it went past. */
export type ForcedStep = {
  at: string;
  by: string;
  role: string;
  from: string;
  to: string;
  reasonCode: string;
  note: string;
  skippedChecks: string[];
};

export type TransitionReadiness = {
  allowed: boolean;
  missing: TransitionRequirement[];
  /** A supplier invoice scan. Optional: it never holds a step. */
  receiptScan?: { required: boolean; attached: boolean } | null;
};

export type JobDetails = {
  material: string;
  zone: string;
  promisedDate: string;
  missing: Array<"material" | "zone" | "promisedDate" | (string & {})>;
};

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

/**
 * `GET /admin/files/retention` (Super Admin). Always a dry run: what the next
 * scheduled pass would delete, by file purpose. `deletionEnabled` is the API's
 * `GRIDGO_FILE_RETENTION_DELETE_ENABLED` flag, off unless configured.
 */
export type FileRetentionReport = {
  at: string;
  dryRun: boolean;
  deletionEnabled: boolean;
  total: number;
  byPurpose: Record<string, number>;
  deleted: number;
  failed: number;
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
  /**
   * Absent on a line the shop created in the supplier app
   * (`POST /me/supplier-services` stores none of these). Read with `?? []`.
   */
  materialCodes?: string[];
  finishCodes?: string[];
  productFamilyIds?: string[];
  sizeMin: string | null;
  sizeMax: string | null;
  qtyMin: number | null;
  qtyMax: number | null;
  pricingBasis: string;
  referenceRateMinor: number;
  /**
   * The line's usual production time. Read it through `readServiceLineTime`
   * (`src/lib/production-time.ts`): days for day-based work, exact minutes
   * for everything, hours kept for older apps.
   */
  turnaroundDays?: number | null;
  turnaroundMinutes?: number | null;
  turnaroundHours: number;
  /** The shop's working day in minutes; a same-day time stays under it. */
  productionDayMinutes?: number | null;
  capacityDaily: number | null;
  capacityWeekly: number | null;
  zones?: string[];
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
  /** Send one: whole working days, or same-day minutes under one working day. */
  turnaroundDays?: number | null;
  turnaroundMinutes?: number | null;
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

/**
 * One permanent audit entry (`gridgo-api/docs/AUDIT_API.md`). The name, role,
 * app and device are snapshots taken when the action happened; old rows and
 * an older API leave them null or absent, and the portal never fills them in.
 */
export type AuditEntry = {
  id: string;
  at: string;
  actorId: string | null;
  /** Snapshot of the person's name; "System" for automatic work. */
  actorName?: string | null;
  actorRole: string | null;
  /** `X-GRIDGO-App`, else the request origin, else `api`; `system` off-request. */
  app?: string | null;
  /** Bounded User-Agent. Describes the request; not a verified device. */
  device?: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  orderId: string | null;
  /** Every order a shared basket payment or file record belongs to. */
  orderIds?: string[] | null;
  /** The item before the action; null on creation. */
  before?: unknown;
  /** The item after the action; null on removal. */
  after?: unknown;
  detail: Record<string, unknown> | null;
  reason: string | null;
};

/** One page of `GET /audit` or `GET /orders/:id/audit`, newest first. */
export type AuditPage = {
  audit: AuditEntry[];
  limit: number;
  offset: number;
  /** Offset of the next page; null on the last one. */
  nextOffset: number | null;
  /**
   * True when the API answered without paging, as the API before the
   * permanent log did: search, person and dates were not applied.
   */
  legacy: boolean;
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
 * Latest shared GPS fix for a rider on an active trip (`rider_assigned`,
 * `picked_up`, `out_for_delivery`), with what the map needs to draw them
 * honestly: the vehicle they drive and the trip's two ends. `dropoff` is
 * already the GRIDGO Office for a collected order.
 *
 * Since gridgo-api#229 a rider who has never sent a fix is still a row, with
 * null position and times, so Operations can call them. The freshness fields
 * are absent on an older API.
 */
export type RiderLocation = {
  riderId: string;
  name: string;
  vehicleType: VehicleType | string | null;
  plateNumber: string | null;
  orderId: string;
  orderTitle: string | null;
  state: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  /** Source GPS time of the latest fix; null when none was ever sent. */
  at: string | null;
  /** When the server received that fix. */
  receivedAt?: string | null;
  lastUpdatedAt?: string | null;
  /** Server-counted age of the fix at read time. */
  ageSeconds?: number | null;
  /** Past `riderLocationStaleAfterSeconds`, including a rider with no fix past the grace period. */
  stale?: boolean;
  pickup: MapPoint | null;
  dropoff: MapPoint | null;
};

/** One accepted fix in the ping-gap diagnostics. No coordinates. */
export type LocationDiagnosticsSample = {
  at: string;
  receivedAt: string;
  processedAt: string | null;
  /** Seconds since the previous received fix; null for the first. */
  receiveGapSeconds: number | null;
  /** Seconds from the GPS fix to server receipt. */
  sourceDelaySeconds: number;
};

/** `GET /ops/orders/:id/location-diagnostics`, Operations and Super Admin only. */
export type LocationDiagnostics = {
  orderId: string;
  riderId: string | null;
  lastUpdatedAt: string | null;
  ageSeconds: number | null;
  stale: boolean;
  sampleLimit: number;
  sampleCount: number;
  maxReceiveGapSeconds: number | null;
  secondsSinceLastReceived: number | null;
  samples: LocationDiagnosticsSample[];
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

// ---------------------------------------------------------------------------
// Season windows — Super Admin writes them; clients see them on the deadline
// calendar, a home banner six to four weeks ahead, and (only once the push
// switch is on) one pre-season notice. Awareness only: no date is ever blocked.
//
// Contract: gridgo-api docs/SEASON_WINDOWS_API.md.

export type SeasonDemandLevel = "Normal" | "Busy" | "Peak";

export type SeasonWindowStatus = "upcoming" | "current" | "past";

/** Inclusive `YYYY-MM-DD` dates in Asia/Manila, computed by the server. */
export type SeasonBannerInterval = {
  startDate: string;
  endDate: string;
  active: boolean;
};

export type SeasonWindow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  demandLevel: SeasonDemandLevel;
  message: string;
  status: SeasonWindowStatus;
  banner: SeasonBannerInterval;
  version: number;
  /** When the pre-season notice was queued. Once set, never cleared. */
  noticeQueuedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SeasonWindowsEnvelope = {
  timeZone: string;
  /** Manila calendar day on the server clock. */
  today: string;
  awarenessOnly: true;
  windows: SeasonWindow[];
  banners: SeasonWindow[];
};

export type SeasonWindowInput = {
  name: string;
  startDate: string;
  endDate: string;
  demandLevel: SeasonDemandLevel;
  message: string;
};

export type SeasonPushSettings = {
  enabled: boolean;
  version: number;
};

export type SeasonPushDryRunWindow = {
  id: string;
  name: string;
  banner: SeasonBannerInterval;
  noticeQueuedAt: string | null;
  /** Inside the banner interval and never queued. */
  due: boolean;
  wouldNotifyClients: number;
  wouldNotifyDevices: number;
};

/** Prospective counts, reported even while the switch is off. Mutates nothing. */
export type SeasonPushDryRun = {
  enabled: boolean;
  version: number;
  timeZone: string;
  today: string;
  eligibleClients: number;
  eligibleDevices: number;
  windows: SeasonPushDryRunWindow[];
};

/** A browser push subscription as `PushSubscription.toJSON()` gives it. */
export type WebPushSubscriptionInput = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
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
  "open" | "in-review" | "merged-dev" | "live" | "needs-decision" | "blocked";

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
  /** Sheet metadata can be absent on issues labelled tracker without a tracker block. */
  section?: string | null;
  order: number;
  /** The sheet's ID column, e.g. `1.0`. */
  ref?: string | null;
  /** Sheet "Module / Step". */
  module?: string | null;
  developer?: string | null;
  /** Sheet "Requirement / Issue Description". */
  requirement?: string | null;
  category?: string | null;
  status: TrackerStatus;
  /** Shared GitHub priority label; independent of status. */
  priority?: boolean;
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
export type SupportChatThreadRole = SupportChatSenderRole;

export type SupportChatPerson = {
  userId: string;
  name: string;
  email?: string | null;
  role: SupportChatThreadRole;
  imageUrl?: string | null;
};

export type SupportChatThread = {
  id: string;
  partyUserId: string;
  partyRole: SupportChatThreadRole;
  partyName?: string | null;
  partyEmail?: string | null;
  partyImageUrl?: string | null;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  lastMessageSenderRole?: SupportChatSenderRole | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  viewerUserId?: string | null;
  staffPeerUserId?: string | null;
  staffPeerName?: string | null;
  staffPeerEmail?: string | null;
  staffPeerRole?: SupportChatThreadRole | null;
  staffPeerImageUrl?: string | null;
};

export type SupportChatAttachment = {
  fileId: string;
  contentType?: string | null;
  originalFilename?: string | null;
};

export type SupportChatMessage = {
  id: string;
  threadId: string;
  senderUserId: string;
  senderRole: SupportChatSenderRole;
  senderName?: string | null;
  senderImageUrl?: string | null;
  body: string;
  attachments?: SupportChatAttachment[];
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
  /** Shared implementation priority; absent on older APIs. */
  priority?: boolean;
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
export type IssueReportCounts = Record<Exclude<IssueReportStatus, "tracked">, number> & {
  tracked?: number;
  priorities?: number;
};

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

/** `delivery_pin`: a cheaper pin's delivery-fee credit. It never cancels anything. */
export type RefundKind = "cancellation" | "complaint" | "delivery_pin";

/** What a person can file. A delivery-fee credit is opened only by the pin route. */
export type FileableRefundKind = Exclude<RefundKind, "delivery_pin">;

/**
 * `cancelled` before handover; `fulfilled_with_refund` after it;
 * `delivery_adjustment` for a pin change's credit, reserved when the pin applied.
 */
export type RefundDisposition = "cancelled" | "fulfilled_with_refund" | "delivery_adjustment";

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
  /**
   * Voucher orders only: whether staff found the refund the client's fault.
   * `false` gives the client the voucher back if it has not expired.
   */
  clientCaused?: boolean;
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
  /**
   * The settlement's frozen working. A `delivery_adjustment` carries
   * `DeliveryCreditSnapshot` instead: read it through `deliveryCreditSnapshot`.
   */
  snapshot?: RefundAmounts;
};

/** A delivery-fee credit's frozen working: the checkout fee and the fee at the new pin. */
export type DeliveryCreditSnapshot = {
  changeId: string;
  originalFeeMinor: number;
  deliveryFeeMinor: number;
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

// ---------------------------------------------------------------------------
// Invited staff and the pick-up hub (gridgo-api docs/HUB_HANDOVER_API.md)
// ---------------------------------------------------------------------------

/** A configurable staff role. `hub_staff` is built in. */
export type StaffRole = {
  code: string;
  name: string;
  /** May hand out hub orders. */
  canHandout: boolean;
};

/** Never carries the code: it is shown once, when the invite is created. */
export type StaffInvite = {
  id: string;
  roleCode: string;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string;
  redeemedBy: string | null;
  redeemedAt: string | null;
  revokedAt: string | null;
};

export type StaffInviteCreated = { invite: StaffInvite; code: string };

export type StaffMember = {
  userId: string;
  name?: string | null;
  roleCode: string;
  active: boolean;
  updatedAt: string;
};

export type HubRecord = {
  id: string;
  name: string;
  point?: MapPoint | null;
  feeMinor?: number;
  schedule: WeeklySchedule | null;
};

export type HubHandout = {
  id: string;
  orderId: string;
  staffId: string;
  /** The staff member's name at the time of the handover. */
  staffName: string;
  hubId: string;
  at: string;
};

export type HubStaffTotal = { staffId: string; name: string; count: number };

export type HubHandoutLog = {
  handouts: HubHandout[];
  /** Counts over every handout, not just this page. */
  staffTotals: HubStaffTotal[];
  nextCursor: string | null;
};

export type HubRedeliveryRequest = {
  status: "pending_operations" | string;
  costAccepted: boolean;
  at: string;
  by: string;
};

/** A ready pick-up order nobody has collected yet. */
export type HubWaitingOrder = {
  orderId: string;
  state: string;
  readyAt: string | null;
  /** Completed open hub days the client missed. */
  missedDays: number;
  /** True from the third missed hub day: Operations now owns the next step. */
  operationsRequired: boolean;
  redeliveryRequest: HubRedeliveryRequest | null;
};

export type HubCodeMismatch = HubWaitingOrder & {
  escalation: { by: string; at: string; reason: string };
};

// ---- Organization money and statements (gridgo-api ORGANIZATION_MONEY_API.md) ----

/** Ops / Super Admin. One order's platform revenue, as the API reports it. */
export type PlatformRevenue = {
  /** Present on a voucher order: GRIDGO's funding, off the fee and delivery. */
  voucherDiscountMinor?: number;
  grossServiceFeeMinor: number;
  organizationDiscountMinor: number;
  netServiceFeeMinor: number;
  billedMinor?: number;
  collectedMinor?: number;
  recognizedMinor?: number;
  adjustedMinor?: number;
  refundedMinor?: number;
};

// ---- Multi-shop baskets (gridgo-api MULTI_SHOP_CHECKOUT_API.md) ----

export type BasketPayment = {
  label?: string;
  method: string;
  /** The one transfer for every group: `not_submitted`, `pending_confirmation`, `confirmed`. */
  status: string;
  amountMinor: number;
  reference: string | null;
  proofFileId: string | null;
  submittedAt?: string | null;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
  confirmationSource?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
};

/** One shop group of a basket. `order` is that group's ordinary order. */
export type BasketGroup = {
  deadline?: string | null;
  orderId: string;
  label: string;
  state: string;
  /** Printing as the client sees it: shop price plus the gross service fee. */
  clientItemSubtotalMinor: number;
  /** Ops / Super Admin. The shop's price for this group. */
  itemSubtotalMinor?: number;
  /** Ops / Super Admin. The fee GRIDGO keeps on this group, net of any discount. */
  serviceFeeMinor?: number;
  organizationDiscountMinor?: number;
  deliveryFeeMinor: number;
  /** Already inside `deliveryFeeMinor` on a hub pick-up basket. */
  pickupFeeMinor?: number;
  totalMinor: number;
  order: Order;
};

export type Basket = {
  id: string;
  /** The group whose order carries the combined receipt. */
  receiptOrderId: string;
  /** What the client paid, once, for every group. */
  totalMinor: number;
  deadline: string | null;
  fulfillmentMode: "delivery" | "pickup" | string;
  createdAt?: string;
  payment: BasketPayment;
  pickupFeeMinor?: number;
  groups: BasketGroup[];
};

export type InvoiceLine = {
  id: string;
  itemName: string;
  quantity: number;
  /** Ops / Super Admin: the shop's amount. */
  amountMinor?: number;
  unitPriceMinor?: number;
  /** What the client's receipt prints: shop price plus fee. */
  clientAmountMinor?: number;
  clientUnitPriceMinor?: number;
};

export type BasketInvoiceGroup = {
  deadline?: string | null;
  orderId: string;
  label: string;
  lines: InvoiceLine[];
  clientItemSubtotalMinor: number;
  itemSubtotalMinor?: number;
  serviceFeeMinor?: number;
  organizationDiscountMinor?: number;
  deliveryFeeMinor: number;
  pickupFeeMinor?: number;
  totalMinor: number;
};

/** The one immutable receipt of a basket. */
export type BasketInvoice = {
  orderId: string;
  basketId?: string;
  invoiceNumber: string;
  issuedAt: string;
  currency?: string;
  totalMinor: number;
  clientItemSubtotalMinor?: number;
  itemSubtotalMinor?: number;
  serviceFeeMinor?: number;
  organizationDiscountMinor?: number;
  deliveryFeeMinor?: number;
  pickupFeeMinor?: number;
  groups?: BasketInvoiceGroup[];
};

// ---- Organizations (list) and statements ----

/**
 * The fields of an organization account the Organizations list reads
 * (`GET /ops/organizations`). The full projection, with officer history, is
 * the organization page's own type.
 */
export type OrganizationSummary = {
  userId: string;
  name: string;
  school?: string | null;
  email?: string | null;
  currentOfficer: { id?: string; fullName: string } | null;
  approvalCase: { id: string; status: string } | null;
};

export type OrganizationStatementRow = {
  /** Manila calendar date the order closed. */
  date: string;
  closedAt: string;
  orderId: string;
  product: string;
  /** What the organization paid for the order, after its discount. */
  amountMinor: number;
  organizationDiscountMinor: number;
  invoiceNumber: string;
  /** The officer recorded on the order when it was placed; "" when none was. */
  officerOfRecord: string;
};

export type OrganizationStatement = {
  /** "Not a tax document. Official receipts are issued separately." */
  notice: string;
  currency: string;
  period: { from: string; to: string; timezone: string };
  orderCount: number;
  totalSpendMinor: number;
  discountEarnedMinor: number;
  orders: OrganizationStatementRow[];
};

export type StatementPeriod =
  | { period: "this_month" | "this_quarter" }
  | { period: "custom"; from: string; to: string };

export type AccountDeletionRequest = {
  id: string; userId: string | null; contactEmail: string | null;
  source: 'app' | 'web'; status: 'pending' | 'done';
  requestedAt: string; dueAt: string; completedAt: string | null; completedBy: string | null;
};

// ---- GRIDGO-funded vouchers (gridgo-api#204, docs/VOUCHERS_API.md) ----

/** The voucher line an order snapshots at checkout. */
export type OrderVoucherLine = {
  id: string;
  campaignId: string;
  label: string;
  fundedBy: "GRIDGO";
  amountMinor: number;
  serviceFeeMinor: number;
  deliveryMinor: number;
};

export type VoucherCampaignMode = "assigned" | "shared";
export type VoucherCampaignStatus = "draft" | "active" | "paused" | "ended";

/** Super Admin only. `code` is never shown to a client. */
export type VoucherCampaign = {
  id: string;
  name: string;
  code: string;
  mode: VoucherCampaignMode;
  valueMinor: number;
  /** A count of accounts that can be issued one, not a budget in pesos. */
  totalLimit: number;
  perAccountLimit: 1;
  /** Exactly one of `endsAt` (a fixed end) and `validityDays` (from each issue) is set. */
  endsAt: string | null;
  validityDays: number | null;
  status: VoucherCampaignStatus;
  createdAt: string;
  updatedAt: string;
};

export type VoucherCampaignInput = {
  name: string;
  valueMinor: number;
  mode: VoucherCampaignMode;
  code?: string | null;
  endsAt?: string | null;
  validityDays?: number | null;
  totalLimit: number;
  perAccountLimit: 1;
};

export type VoucherStatus = "available" | "used" | "expired" | "void";

/** One wallet item, as the client and the staff lookup read it. */
export type Voucher = {
  id: string;
  campaignId: string;
  name?: string;
  valueMinor: number;
  status: VoucherStatus;
  issuedAt: string;
  expiresAt: string;
  secondsRemaining: number;
  redeemable: boolean;
  reservation: { id: string; cartId: string; expiresAt: string } | null;
  fundedBy: "GRIDGO";
  transferable: false;
  cashValue: false;
};

export type VoucherTab = "available" | "used" | "expired" | "all";

export type VoucherIssueRecipient = { email: string; adultConfirmed: boolean };

export type VoucherIssueReport = {
  matched: { email: string; clientId: string; voucherId: string; issued: boolean }[];
  unmatched: {
    email: string;
    reason: "no_client_account" | "invalid_email" | "ambiguous_email";
  }[];
};

export type VoucherLedgerKind =
  | "issued"
  | "reserved"
  | "released"
  | "redeemed"
  | "restored"
  | "client_fault"
  | "no_fault"
  | "void"
  | "reissue";

/** One append-only activity row. `amountMinor` is negative on a restore. */
export type VoucherLedgerEntry = {
  id: string;
  voucherId: string;
  campaignId: string;
  clientId: string;
  kind: VoucherLedgerKind | string;
  amountMinor: number;
  at: string;
  data: {
    actorId?: string | null;
    reason?: string | null;
    orderId?: string;
    orderIds?: string[];
    [key: string]: unknown;
  };
};

export type VoucherLedgerPage = {
  entries: VoucherLedgerEntry[];
  total: number;
  /** A decimal integer string: the sum can pass JavaScript's safe range. */
  budgetUsedMinor: string;
  budgetUsedScope: string;
  serverTime: string;
};

export type VoucherLedgerFilter = {
  campaignId?: string;
  clientId?: string;
  kind?: string;
  /** Inclusive ISO instants. */
  from?: string;
  to?: string;
};

// ---- Legal documents, consent evidence and privacy requests ----
// Contract: gridgo-api `docs/LEGAL_API.md` (gridgo-api#202). Rules live in
// `src/lib/legal.ts` and `src/lib/privacy-requests.ts`.

/** Who a document binds. `all` is every signed-in identity. */
export type LegalAudience = "all" | "client" | "supplier" | "rider" | "staff";

/**
 * The editable draft of one document. Editing it never changes a published
 * version; publishing snapshots it as the next version.
 */
export type LegalDraft = {
  title: string;
  audience: LegalAudience;
  /** Plain text, never HTML. "" when a PDF carries the document. */
  text: string;
  pdfFileId: string | null;
  placeholder: boolean;
  /** The editor's choice; the API forces it on in some cases (see `publishMateriality`). */
  material: boolean;
  /** Only a real Supplier Agreement may carry money penalties. */
  penalties: boolean;
  changeSummary: string;
  effectiveAt: string;
};

/** One immutable published version. */
export type LegalVersion = {
  /** Opaque version ID (launch placeholders read `terms-of-service-1`). */
  id: string;
  documentId: string;
  version: number;
  title: string;
  audience: LegalAudience;
  text: string;
  pdfFileId: string | null;
  /** Public route that answers a signed link once the version is effective. */
  pdfUrl: string | null;
  effectiveAt: string;
  publishedAt: string;
  placeholder: boolean;
  /** The enforced flag: true means everyone it applies to must accept again. */
  material: boolean;
  penalties: boolean;
  changeSummary: string;
  status: "placeholder" | "live";
};

/** `GET /admin/legal`: the library row with every version, newest first. */
export type LegalDocument = {
  id: string;
  /** Optimistic editor token. Both edit and publish move it. */
  revision: number;
  draft: LegalDraft;
  /** One of the eight reserved slots: never deleted, audience fixed. */
  launchSlot: boolean;
  versions: LegalVersion[];
};

export type LegalAcceptancePurpose = "document" | "enrollment" | "artwork";

/** One append-only acceptance row, in the API's database field names. */
export type LegalAcceptance = {
  id: string;
  user_id: string;
  version_id: string;
  document_id: string;
  version: number;
  accepted_at: string;
  method: "checkbox" | "blocking_screen";
  /** Caller-reported, never verified. */
  app: string;
  device: string;
  purpose: LegalAcceptancePurpose;
  order_id: string | null;
  /** Sign-up evidence only; null otherwise. */
  marketing: boolean | null;
  junior: boolean | null;
  guardian: boolean | null;
};

export type PrivacyRequestKind = "access" | "correction" | "deletion";
export type PrivacyRequestStatus = "pending" | "in_progress" | "completed" | "rejected";

export type PrivacyRequest = {
  id: string;
  userId: string;
  kind: PrivacyRequestKind;
  status: PrivacyRequestStatus;
  /** The requester's own words; "" when they wrote none. */
  details: string;
  /** Staff's answer. The requester can read it in their app. */
  resolution: string;
  requestedAt: string;
  dueAt: string;
  handlerId: string | null;
  updatedAt: string;
  revision: number;
};

// ---- Post-order survey responses ----
// Contract: gridgo-api `docs/SURVEY_API.md` (report 81CA4493). Super Admin
// only; rules and words live in `src/lib/survey-responses.ts`.

export type SurveyFulfillmentKind = "delivery" | "pickup";
export type SurveyRewardStatus = "issued" | "cooldown";

/** One submitted survey. No email, Clerk subject, file or voucher code. */
export type SurveyResponse = {
  orderId: string;
  clientId: string;
  fulfillmentKind: SurveyFulfillmentKind;
  /** The handover the survey followed (fixed once invited). */
  completedAt: string | null;
  openedAt: string | null;
  expiresAt: string | null;
  notifiedAt: string | null;
  dismissedAt: string | null;
  submittedAt: string;
  /** 1–5. */
  fulfillmentStars: number;
  fulfillmentTags: string[];
  /** 1–5. */
  easeStars: number;
  easeTags: string[];
  /** 1 very cheap … 5 very expensive. Not a star rating. */
  priceFeeling: number;
  expectedPriceMinor: number | null;
  /** 1–5 or null. */
  qualityStars: number | null;
  /** 0–10 or null. */
  recommendScore: number | null;
  improvementNote: string | null;
  /** Automatic: a star score ≤ 2 or a recommend score 0–6. Not editable. */
  needsFollowUp: boolean;
  rewardStatus: SurveyRewardStatus | null;
  rewardVoucherId: string | null;
  // Pricing feedback (PRICING_FEEDBACK_API.md). Optional: an older API sends none.
  /** One code, or null when skipped. */
  directShopComparison?: string | null;
  /** Choose any; `not_worth_it` only ever alone. `[]` when skipped. */
  priceWorthTags?: string[];
  orderAgainAtPrice?: string | null;
  /** The order's client total, delivery included. */
  orderTotalMinor?: number | null;
  orderSize?: OrderSizeBracket | null;
  categoryCodes?: string[];
  /** The client's account type now, not when they ordered. */
  accountType?: ClientAccountType | null;
};

// ---- Pricing feedback (gridgo-api `docs/PRICING_FEEDBACK_API.md`) ----
// Super Admin only; words and rules live in `src/lib/pricing-feedback.ts`.

export type OrderSizeBracket = "under_500" | "500_to_1999" | "2000_to_4999" | "5000_to_19999" | "20000_and_up";
export type ClientAccountType = "individual" | "business" | "organization";

/** Category, order size and account type; shared by every survey and pricing read. */
export type PricingFeedbackFilter = {
  /** Inclusive ISO instants. Survey answers use submission time; exit answers the time asked. */
  from?: string;
  to?: string;
  categoryCode?: string;
  orderSize?: OrderSizeBracket;
  accountType?: ClientAccountType;
};

export type PricingOptionCount = {
  code: string;
  count: number;
  /** `100 × count / answered`, one decimal; null when nobody answered. */
  percent: number | null;
};

export type PricingQuestionTally = {
  /** Answers to this question; a skipped optional question is not counted. */
  answered: number;
  /** Every option in the API's order, zero counts included. */
  options: PricingOptionCount[];
};

export type PricingQuestionKey =
  | "priceFeeling"
  | "expectedPrice"
  | "directShopComparison"
  | "priceWorthTags"
  | "orderAgainAtPrice";

export type CheckoutExitStatus = "answered" | "skipped" | "unanswered";

export type PricingFeedbackReport = {
  serverTime: string;
  survey: {
    responses: number;
    questions: Record<PricingQuestionKey, PricingQuestionTally>;
  };
  checkoutExit: {
    asked: number;
    answered: number;
    skipped: number;
    unanswered: number;
    reasons: PricingQuestionTally;
  };
  orderSizeBrackets: { code: OrderSizeBracket; minMinor: number; maxMinor: number | null }[];
};

/** One checkout exit question as asked, newest first. */
export type CheckoutExitAnswer = {
  id: string;
  clientId: string;
  cartId: string;
  reachedAt: string;
  askedAt: string;
  status: CheckoutExitStatus;
  reason: string | null;
  /** Only with `reason: "other"`. The client's own words. */
  otherText: string | null;
  answeredAt: string | null;
  skippedAt: string | null;
  /** The cart's quote at the last checkout visit; null when it had no price. */
  cartTotalMinor: number | null;
  orderSize: OrderSizeBracket | null;
  categoryCodes: string[];
  accountType: ClientAccountType | null;
};

export type CheckoutExitFeedbackFilter = PricingFeedbackFilter & {
  clientId?: string;
  status?: CheckoutExitStatus;
  reason?: string;
};

export type CheckoutExitFeedbackPage = {
  serverTime: string;
  prompts: CheckoutExitAnswer[];
  total: number;
};

export type SurveyScoreKey =
  | "fulfillmentStars"
  | "easeStars"
  | "priceFeeling"
  | "qualityStars"
  | "recommendScore";

/** Over every matching response, not the page. Empty averages/NPS are null. */
export type SurveyAggregates = {
  averages: Record<SurveyScoreKey, number | null>;
  counts: Record<SurveyScoreKey, number>;
  needsFollowUp: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps: number | null;
};

export type SurveyResponsesPage = {
  serverTime: string;
  responses: SurveyResponse[];
  total: number;
  aggregates: SurveyAggregates;
};

/** Filters combine with AND. Score filters are exact values. */
export type SurveyResponsesFilter = PricingFeedbackFilter & {
  clientId?: string;
  orderId?: string;
  fulfillmentKind?: SurveyFulfillmentKind;
  rewardStatus?: SurveyRewardStatus;
  needsFollowUp?: boolean;
  fulfillmentStars?: number;
  easeStars?: number;
  qualityStars?: number;
  priceFeeling?: number;
  recommendScore?: number;
  tag?: string;
  /** Inclusive ISO instants, on submission time. */
  from?: string;
  to?: string;
};

// ---- Supplier invoices and monthly paper collection (SUPPLIER_INVOICES_API.md) ----

/**
 * One order's incoming shop invoice. The obligation is fixed when the order
 * first became ready for pick-up: shop, order, `expectedAt` and `month`
 * (Asia/Manila) never move. Details are null until the shop enters them.
 * `received` is entered details plus the selected scan still on file;
 * `collected` is GRIDGO holding the paper original. They are independent.
 */
export type SupplierInvoice = {
  orderId: string;
  supplierId: string;
  expectedAt: string;
  /** `YYYY-MM`, the Manila month `expectedAt` falls in. */
  month: string;
  fileId: string | null;
  number: string | null;
  /** The date printed on the shop's invoice, `YYYY-MM-DD` (a calendar date). */
  date: string | null;
  /** What the shop typed from its invoice, in centavos. Not order money. */
  amountMinor: number | null;
  submittedAt: string | null;
  updatedAt: string | null;
  version: number;
  collectedAt: string | null;
  /** User ID of the staff member who recorded the paper original. */
  collectedBy: string | null;
  /** Every ready scan the shop attached to this order, the selected one included. */
  scanFileIds: string[];
  received: boolean;
  collected: boolean;
};

/** `missing = expected - received`; `toCollect = expected - collected`. */
export type SupplierInvoiceCounts = {
  expected: number;
  received: number;
  missing: number;
  collected: number;
  toCollect: number;
};

export type SupplierInvoiceShop = SupplierInvoiceCounts & {
  supplierId: string;
  shopName: string;
};

/** Totals and shops cover the whole filtered month; `invoices` is one page. */
export type SupplierInvoiceMonth = {
  month: string;
  reminder: string;
  totals: SupplierInvoiceCounts;
  shops: SupplierInvoiceShop[];
  invoices: SupplierInvoice[];
  nextCursor: string | null;
};

export type SupplierInvoiceEnvelope = {
  invoice: SupplierInvoice;
  reminder: string;
};
