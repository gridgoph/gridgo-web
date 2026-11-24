/**
 * Guided sign-up for a document shop, on the supplier web
 * (gridgoph/gridgo-web#328, mirroring gridgoph/gridgo-supplier#286; contract
 * gridgo-api `docs/SUPPLIER_SIGNUP_API.md`).
 *
 * The only place the sign-up draft, its `nextStep` and GRIDGO's wording are
 * read, and the only place a step becomes a title, a time and a state. The
 * shop app's `lib/guidedSignup.ts` holds the same rules; change both together.
 *
 * - **GRIDGO decides what is done.** `nextStep` is the first unfinished step
 *   in GRIDGO's order, so a step is done because the draft or the shop says
 *   so, never because a screen was visited. Resume is a read, not a memory.
 * - **GRIDGO's words, not ours.** The location and payout consent are sent
 *   back exactly as GRIDGO wrote them, the print groups are GRIDGO's list and
 *   the per-side price is GRIDGO's schedule. Nothing here hard-codes a price.
 * - **A server without the guided flow is a fact, not an error.** A 404 or
 *   405 is `not_open_yet`, and the portal keeps today's screens.
 */

import { formatPhp, pesosToMinor } from "@/lib/format";

/* ------------------------------------------------------------------ shapes */

export type ShopKind = "print_shop" | "home_printer";
export type RegistrantRole = "owner" | "manager";
export type Paper = "short" | "a4" | "long" | "a3";
export type Colour = "bw" | "colour";
export type Finishing = "stapling" | "binding" | "photo_paper";
export type JobsHandledBy = "just_me" | "me_and_staff";

/** GRIDGO's order: `eligibility → shop → location → prints → enroll`, then the shop's own. */
export type SignupNextStep =
  | "eligibility"
  | "shop"
  | "location"
  | "prints"
  | "enroll"
  | "hours"
  | "team"
  | "owner_claim"
  | "payout"
  | "listing_photos"
  | "complete";

export type ShopPin = { lat: number; lng: number; label: string };

export type DocumentChoices = {
  papers: Paper[];
  colours: Colour[];
  duplex: boolean;
  a3PricesMinor?: Partial<Record<Colour, number>>;
  finishing?: Partial<Record<Finishing, number>>;
};

export type SignupSteps = {
  eligibility?: { shopKind: ShopKind; registrantRole: RegistrantRole; adult: boolean };
  shop?: { shopName: string; contactName: string; phone: string; ownerPhone?: string };
  location?: { point: ShopPin };
  prints?: { groups: string[]; documents?: DocumentChoices };
};

export type GuidedSignup = {
  version: number;
  supplierId: string | null;
  steps: SignupSteps;
  nextStep: SignupNextStep;
};

/** What GRIDGO hands every sign-up read beside the draft. */
export type SignupTerms = {
  printGroups: string[];
  locationConsentWording: string;
  payoutConsentWording: string;
  documentRates: { bwMinor: number; colourMinor: number };
};

export type PayoutStatus = {
  held: boolean;
  reason: string | null;
  ownerClaimRequired: boolean;
  pausedUntil: string | null;
};

const NEXT_STEPS: readonly SignupNextStep[] = [
  "eligibility",
  "shop",
  "location",
  "prints",
  "enroll",
  "hours",
  "team",
  "owner_claim",
  "payout",
  "listing_photos",
  "complete",
];

const AFTER_ENROLL: readonly SignupNextStep[] = NEXT_STEPS.slice(NEXT_STEPS.indexOf("hours"));

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function positiveMinor(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/* ----------------------------------------------------------------- reading */

export function readSignup(value: unknown): GuidedSignup | null {
  const row = record(value);
  if (!row) return null;
  const steps = record(row.steps) ?? {};
  const next = NEXT_STEPS.includes(row.nextStep as SignupNextStep)
    ? (row.nextStep as SignupNextStep)
    : "eligibility";
  return {
    version: typeof row.version === "number" ? row.version : 0,
    supplierId: typeof row.supplierId === "string" ? row.supplierId : null,
    steps: steps as SignupSteps,
    nextStep: next,
  };
}

/** `null` when GRIDGO did not send a usable group list or page price: treat as not open. */
export function readTerms(value: unknown): SignupTerms | null {
  const row = record(value);
  if (!row) return null;
  const rates = record(row.documentRates);
  const groups = Array.isArray(row.printGroups)
    ? row.printGroups.filter((group): group is string => typeof group === "string")
    : [];
  const bwMinor = positiveMinor(rates?.bwMinor);
  const colourMinor = positiveMinor(rates?.colourMinor);
  if (!groups.length || !bwMinor || !colourMinor) return null;
  return {
    printGroups: groups,
    locationConsentWording: text(row.locationConsentWording),
    payoutConsentWording: text(row.payoutConsentWording),
    documentRates: { bwMinor, colourMinor },
  };
}

export function readPayoutStatus(value: unknown): PayoutStatus | null {
  const row = record(value);
  if (!row) return null;
  return {
    held: row.held === true,
    reason: typeof row.reason === "string" ? row.reason : null,
    ownerClaimRequired: row.ownerClaimRequired === true,
    pausedUntil: typeof row.pausedUntil === "string" ? row.pausedUntil : null,
  };
}

/* ------------------------------------------------------- refusals in words */

/** Sentences for the refusals a shop can fix, by the code or the field GRIDGO named. */
const STEP_REFUSALS: Record<string, string> = {
  shop_mobile_verification_required: "Confirm your mobile number with the code we text you first.",
  supplier_signup_restart_required:
    "You already chose owner or manager. To change it, ask Operations to restart your sign-up.",
  supplier_signup_step_required: "Finish the earlier steps first.",
  supplier_signup_incomplete: "Finish the earlier steps first.",
  ownerPhone: "Enter your owner's mobile number. It must be different from yours.",
  phone: "Enter a Philippine mobile number, like 0917 123 4567.",
  shopName: "Enter your shop's name.",
  contactName: "Enter your name.",
  point: "Place your shop on the map.",
  label: "Give the pin an address a rider would recognise at the door.",
  consent: "Tick the location consent to continue.",
  groups: "Choose at least one thing your shop prints.",
  eligibility: "Answer all three questions to continue.",
};

export function stepRefusal(code: string | null, field: string | null): string | null {
  return (code && STEP_REFUSALS[code]) ?? (field && STEP_REFUSALS[field]) ?? null;
}

/* ------------------------------------------------------------------ step 0 */

export type Eligibility = {
  shopKind: ShopKind | null;
  registrantRole: RegistrantRole | null;
  adult: boolean;
};

export const EMPTY_ELIGIBILITY: Eligibility = { shopKind: null, registrantRole: null, adult: false };

export const SHOP_KIND_OPTIONS = [
  { value: "print_shop", label: "Print shop", detail: "Imprentahan nga tindahan" },
  { value: "home_printer", label: "Home printer", detail: "Nag-print sa balay" },
] as const;

export const ROLE_OPTIONS = [
  { value: "owner", label: "I own the shop", detail: "Ako ang tag-iya" },
  { value: "manager", label: "I manage it for the owner", detail: "Ako ang nagdumala" },
] as const;

export function eligibilityProblems(value: Eligibility): Partial<Record<keyof Eligibility, string>> {
  const problems: Partial<Record<keyof Eligibility, string>> = {};
  if (!value.shopKind) problems.shopKind = "Choose where you print.";
  if (!value.registrantRole) problems.registrantRole = "Choose owner or manager.";
  if (!value.adult) problems.adult = "You must be 18 or older to open a shop on GRIDGO.";
  return problems;
}

export function eligibilityValue(value: Eligibility): Record<string, unknown> | null {
  if (!value.shopKind || !value.registrantRole || !value.adult) return null;
  return { shopKind: value.shopKind, registrantRole: value.registrantRole, adult: true };
}

export function eligibilityFrom(saved: SignupSteps["eligibility"] | undefined): Eligibility | null {
  if (!saved) return null;
  return { shopKind: saved.shopKind, registrantRole: saved.registrantRole, adult: saved.adult === true };
}

/* --------------------------------------------------------------- your shop */

/** `+639XXXXXXXXX`, the form GRIDGO stores and Clerk compares. `null` when not a PH mobile. */
export function philippineMobile(value: string): string | null {
  const digits = value.replace(/[^0-9]/g, "");
  const local = digits.startsWith("63")
    ? digits.slice(2)
    : digits.startsWith("0")
      ? digits.slice(1)
      : digits;
  return /^9\d{9}$/.test(local) ? `+63${local}` : null;
}

export type ShopFields = {
  shopName: string;
  contactName: string;
  phone: string;
  ownerPhone: string;
};

export const EMPTY_SHOP_FIELDS: ShopFields = { shopName: "", contactName: "", phone: "", ownerPhone: "" };

export function shopFieldsFrom(saved: SignupSteps["shop"] | undefined): ShopFields {
  if (!saved) return EMPTY_SHOP_FIELDS;
  return {
    shopName: saved.shopName ?? "",
    contactName: saved.contactName ?? "",
    phone: saved.phone ?? "",
    ownerPhone: saved.ownerPhone ?? "",
  };
}

export function shopProblems(
  fields: ShopFields,
  options: { manager: boolean; phoneConfirmed: boolean },
): Partial<Record<keyof ShopFields, string>> {
  const problems: Partial<Record<keyof ShopFields, string>> = {};
  if (!fields.shopName.trim()) problems.shopName = "Enter your shop's name.";
  if (!fields.contactName.trim()) problems.contactName = "Enter your name.";
  const mobile = philippineMobile(fields.phone);
  if (!mobile) problems.phone = "Enter a mobile number like 0917 123 4567.";
  else if (!options.phoneConfirmed) problems.phone = "Confirm this number with the code we text you.";
  if (options.manager) {
    const owner = philippineMobile(fields.ownerPhone);
    if (!owner) problems.ownerPhone = "Enter your owner's mobile number, like 0917 123 4567.";
    else if (owner === mobile) problems.ownerPhone = "Your owner's number must be different from yours.";
  }
  return problems;
}

export function shopValue(fields: ShopFields, manager: boolean): Record<string, unknown> {
  return {
    shopName: fields.shopName.trim(),
    contactName: fields.contactName.trim(),
    phone: philippineMobile(fields.phone) ?? fields.phone.trim(),
    ...(manager
      ? { ownerPhone: philippineMobile(fields.ownerPhone) ?? fields.ownerPhone.trim() }
      : {}),
  };
}

/* --------------------------------------------------------------------- pin */

/** The box GRIDGO's shop app searches, and the Samal/Talikud outline it rules out. */
export const DAVAO_BOX = { west: 125.21, south: 6.95, east: 125.71, north: 7.61 } as const;

/** Samal and Talikud as `[lng, lat]`: the same outline the shop and client apps use. */
const SAMAL_OUTLINE: readonly (readonly [number, number])[] = [
  [125.5765, 6.9562], [125.5829, 6.8212], [125.6072, 6.7981], [125.6323, 6.7825],
  [125.6921, 6.7645], [125.7248, 6.7636], [125.758, 6.7579], [125.7822, 6.7587],
  [125.8121, 6.7658], [125.8362, 6.7771], [125.8607, 6.7954], [125.8793, 6.8169],
  [125.8844, 6.8245], [125.8838, 6.9193], [125.8827, 6.9619], [125.8765, 6.9908],
  [125.8304, 7.1666], [125.8141, 7.2061], [125.7855, 7.256], [125.6972, 7.2289],
  [125.6793, 7.2156], [125.6725, 7.1945], [125.6711, 7.129], [125.6577, 7.1053],
  [125.6492, 7.0646], [125.6496, 7.0513], [125.6619, 7.0329], [125.6622, 7.023],
  [125.6561, 7.0137], [125.6227, 6.9872],
];

function insideOutline(lat: number, lng: number, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInDavao(lat: number, lng: number): boolean {
  return (
    lat >= DAVAO_BOX.south &&
    lat <= DAVAO_BOX.north &&
    lng >= DAVAO_BOX.west &&
    lng <= DAVAO_BOX.east &&
    !insideOutline(lat, lng, SAMAL_OUTLINE)
  );
}

/** Central Davao, where the map opens before a pin is placed. */
export const DAVAO_CENTRE: [number, number] = [7.0731, 125.6128];

export function isPlaced(pin: { lat: number; lng: number } | null | undefined): boolean {
  if (!pin) return false;
  if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) return false;
  if (pin.lat === 0 && pin.lng === 0) return false;
  return Math.abs(pin.lat) <= 90 && Math.abs(pin.lng) <= 180;
}

export const PIN_CONSEQUENCE =
  "GRIDGO measures every delivery fee from this pin. Put it on your own door, not on the street corner.";

/** What is wrong with the pin, in the shop's words; null when it is fine. */
export function pinProblem(pin: { lat: number; lng: number } | null, label: string): string | null {
  if (!pin || !isPlaced(pin)) return "Place your shop on the map. Click where your shop stands.";
  if (!pointInDavao(pin.lat, pin.lng)) return "Your pin is outside Davao City. Move it onto your shop.";
  if (!label.trim()) return "Give the pin an address a rider would recognise at the door.";
  return null;
}

export function pinStepProblem(
  pin: { lat: number; lng: number } | null,
  label: string,
  consented: boolean,
): string | null {
  return pinProblem(pin, label) ?? (consented ? null : "Tick the box to let GRIDGO use your pin.");
}

export function locationValue(
  pin: { lat: number; lng: number },
  label: string,
  wording: string,
): Record<string, unknown> {
  return {
    point: { lat: pin.lat, lng: pin.lng, label: label.trim() },
    consent: { accepted: true, wording },
  };
}

/** Three metres a press: a doorway's width, small enough to aim with. */
export function nudgePin(
  pin: { lat: number; lng: number },
  direction: "north" | "south" | "east" | "west",
  meters = 3,
): { lat: number; lng: number } {
  const dLat = meters / 111320;
  const dLng = meters / (111320 * Math.cos((pin.lat * Math.PI) / 180));
  if (direction === "north") return { lat: pin.lat + dLat, lng: pin.lng };
  if (direction === "south") return { lat: pin.lat - dLat, lng: pin.lng };
  if (direction === "east") return { lat: pin.lat, lng: pin.lng + dLng };
  return { lat: pin.lat, lng: pin.lng - dLng };
}

/* ---------------------------------------------------------------- printing */

/** Words for GRIDGO's print-group codes. An unknown code still gets a readable name. */
const GROUP_LABELS: Record<string, { label: string; detail: string }> = {
  documents: { label: "Documents", detail: "Prints, photocopies, school and office papers" },
  marketing: { label: "Marketing prints", detail: "Flyers, cards, brochures, stickers" },
  banners_signage: { label: "Banners and signs", detail: "Tarpaulins, standees, signage" },
  apparel: { label: "Shirts and apparel", detail: "Shirt printing, caps, uniforms" },
  merchandise: { label: "Merchandise", detail: "Mugs, keychains, giveaways" },
  awards: { label: "Awards", detail: "Plaques, certificates, medals" },
  construction: { label: "Plans and blueprints", detail: "Large-format plans and drawings" },
  packaging: { label: "Packaging", detail: "Boxes, labels, bags" },
};

export function groupLabel(code: string): { label: string; detail: string | null } {
  const known = GROUP_LABELS[code];
  if (known) return known;
  const words = code.replace(/_/g, " ");
  return { label: words.charAt(0).toUpperCase() + words.slice(1), detail: null };
}

/** Documents first, then GRIDGO's own order for the rest. */
export function orderedGroups(groups: readonly string[]): string[] {
  return [...groups].sort((a, b) => (a === "documents" ? -1 : b === "documents" ? 1 : 0));
}

export const PAPERS: readonly { value: Paper; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "a4", label: "A4" },
  { value: "long", label: "Long" },
  { value: "a3", label: "A3" },
];

export const COLOURS: readonly { value: Colour; label: string }[] = [
  { value: "bw", label: "Black & white" },
  { value: "colour", label: "Colour" },
];

export const FINISHING: readonly { value: Finishing; label: string; unit: string }[] = [
  { value: "stapling", label: "Stapling", unit: "per set" },
  { value: "binding", label: "Binding", unit: "per book" },
  { value: "photo_paper", label: "Photo paper", unit: "per page" },
];

export type PrintsDraft = {
  groups: string[];
  papers: Paper[];
  colours: Colour[];
  duplex: boolean;
  a3Prices: Record<Colour, string>;
  finishing: Record<Finishing, string>;
};

/** The common document shop: every standard paper, both colours, back-to-back. */
export const DEFAULT_PRINTS: PrintsDraft = {
  groups: ["documents"],
  papers: ["short", "a4", "long"],
  colours: ["bw", "colour"],
  duplex: true,
  a3Prices: { bw: "", colour: "" },
  finishing: { stapling: "", binding: "", photo_paper: "" },
};

function moneyText(value: number | undefined): string {
  return value ? String(value / 100) : "";
}

/** A saved prints step back into the screen's draft, for resume. */
export function printsDraftFrom(saved: SignupSteps["prints"] | undefined): PrintsDraft {
  if (!saved) return DEFAULT_PRINTS;
  const docs = saved.documents;
  return {
    groups: saved.groups?.length ? saved.groups : DEFAULT_PRINTS.groups,
    papers: docs?.papers?.length ? docs.papers : DEFAULT_PRINTS.papers,
    colours: docs?.colours?.length ? docs.colours : DEFAULT_PRINTS.colours,
    duplex: docs ? Boolean(docs.duplex) : true,
    a3Prices: { bw: moneyText(docs?.a3PricesMinor?.bw), colour: moneyText(docs?.a3PricesMinor?.colour) },
    finishing: {
      stapling: moneyText(docs?.finishing?.stapling),
      binding: moneyText(docs?.finishing?.binding),
      photo_paper: moneyText(docs?.finishing?.photo_paper),
    },
  };
}

export type PrintsProblems = Partial<{
  groups: string;
  papers: string;
  colours: string;
  a3: Partial<Record<Colour, string>>;
  finishing: Partial<Record<Finishing, string>>;
}>;

function typedMinor(value: string): number | null {
  const minor = pesosToMinor(value);
  return minor != null && minor > 0 ? minor : null;
}

export function printsProblems(draft: PrintsDraft): PrintsProblems {
  const problems: PrintsProblems = {};
  if (!draft.groups.length) problems.groups = "Choose at least one thing your shop prints.";
  if (!draft.groups.includes("documents")) return problems;
  if (!draft.papers.length) problems.papers = "Tick at least one paper size.";
  if (!draft.colours.length) problems.colours = "Tick black & white, colour, or both.";
  if (draft.papers.includes("a3")) {
    const a3: Partial<Record<Colour, string>> = {};
    for (const colour of draft.colours) {
      if (!typedMinor(draft.a3Prices[colour])) a3[colour] = "Set your A3 price per side.";
    }
    if (Object.keys(a3).length) problems.a3 = a3;
  }
  const finishing: Partial<Record<Finishing, string>> = {};
  for (const item of FINISHING) {
    const typed = draft.finishing[item.value].trim();
    if (typed && !typedMinor(typed)) finishing[item.value] = "Enter a price above ₱0, or leave it empty.";
  }
  if (Object.keys(finishing).length) problems.finishing = finishing;
  return problems;
}

export function hasPrintsProblems(problems: PrintsProblems): boolean {
  return Object.keys(problems).length > 0;
}

export function printsValue(draft: PrintsDraft): Record<string, unknown> {
  const groups = orderedGroups([...new Set(draft.groups)]);
  if (!groups.includes("documents")) return { groups };
  const papers = PAPERS.map((p) => p.value).filter((paper) => draft.papers.includes(paper));
  const colours = COLOURS.map((c) => c.value).filter((colour) => draft.colours.includes(colour));
  const documents: Record<string, unknown> = { papers, colours, duplex: draft.duplex };
  if (papers.includes("a3")) {
    const prices: Partial<Record<Colour, number>> = {};
    for (const colour of colours) {
      const price = typedMinor(draft.a3Prices[colour]);
      if (price) prices[colour] = price;
    }
    documents.a3PricesMinor = prices;
  }
  const finishing: Partial<Record<Finishing, number>> = {};
  for (const item of FINISHING) {
    const price = typedMinor(draft.finishing[item.value]);
    if (price) finishing[item.value] = price;
  }
  if (Object.keys(finishing).length) documents.finishing = finishing;
  return { groups, documents };
}

/** "₱3.00 a side": GRIDGO's fixed page price, read-only in this flow. */
export function pagePriceLine(terms: SignupTerms, colour: Colour): string {
  const value = colour === "bw" ? terms.documentRates.bwMinor : terms.documentRates.colourMinor;
  return `${formatPhp(value)} a side`;
}

/* ----------------------------------------------------------- who takes jobs */

export const JOBS_HANDLED_BY_OPTIONS = [
  { value: "just_me", label: "Just me", detail: "Ako ra · You take and print every job." },
  {
    value: "me_and_staff",
    label: "Me and staff",
    detail: "Ako ug akong staff · Staff take jobs, never see money.",
  },
] as const;

/* ------------------------------------------------------------------- steps */

export type MissionId = "shop" | "pin" | "prints" | "staff" | "hours" | "paid" | "verify";
export type MissionState = "done" | "current" | "later" | "waiting";

export type Mission = {
  id: MissionId;
  title: string;
  /** Bisaya, under the title. */
  local: string;
  minutes: number;
  optional?: boolean;
};

export const MISSIONS: readonly Mission[] = [
  { id: "shop", title: "Your shop", local: "Imong tindahan", minutes: 1 },
  { id: "pin", title: "Pin your shop", local: "Asa ka", minutes: 1 },
  { id: "prints", title: "What you print", local: "Unsa imong i-print", minutes: 1 },
  { id: "staff", title: "Who takes jobs", local: "Kinsa modawat", minutes: 0.5 },
  { id: "hours", title: "Your hours", local: "Oras sa tindahan", minutes: 1 },
  { id: "paid", title: "Get paid and alerts", local: "Bayad ug pahibalo", minutes: 0.5 },
  { id: "verify", title: "Verify your shop", local: "I-verify ang tindahan", minutes: 2, optional: true },
];

export const REQUIRED_MISSIONS = MISSIONS.filter((mission) => !mission.optional);

export type RequiredMissionId = Exclude<MissionId, "verify">;

export function missionById(id: MissionId): Mission {
  return MISSIONS.find((mission) => mission.id === id) ?? MISSIONS[0];
}

export function isEnrolled(signup: GuidedSignup | null): boolean {
  return Boolean(signup?.supplierId) || Boolean(signup && AFTER_ENROLL.includes(signup.nextStep));
}

/**
 * Whether each required step is done, from GRIDGO's own record. Before
 * enrollment the saved steps decide; after it, `nextStep` does.
 */
export function missionDone(signup: GuidedSignup | null, id: MissionId): boolean {
  if (!signup) return false;
  const enrolled = isEnrolled(signup);
  switch (id) {
    case "shop":
      return Boolean(signup.steps.shop) || enrolled;
    case "pin":
      return Boolean(signup.steps.location) || enrolled;
    case "prints":
      return Boolean(signup.steps.prints) || enrolled;
    case "staff":
      return enrolled && signup.nextStep !== "team";
    case "hours":
      return enrolled && signup.nextStep !== "hours";
    case "paid":
      return enrolled && (signup.nextStep === "listing_photos" || signup.nextStep === "complete");
    case "verify":
      return false;
  }
}

/**
 * Each required step's state. `owner_claim` is a manager's shop waiting for
 * its owner: payouts are the owner's to set, so the step reads "waiting".
 */
export function missionStates(signup: GuidedSignup | null): Record<RequiredMissionId, MissionState> {
  const states = {} as Record<RequiredMissionId, MissionState>;
  let currentTaken = false;
  for (const mission of REQUIRED_MISSIONS) {
    const id = mission.id as RequiredMissionId;
    if (missionDone(signup, id)) states[id] = "done";
    else if (id === "paid" && signup?.nextStep === "owner_claim") states[id] = "waiting";
    else if (!currentTaken) {
      states[id] = "current";
      currentTaken = true;
    } else states[id] = "later";
  }
  return states;
}

/** The first step still to do, or null when every required one is done (or waiting). */
export function currentMission(signup: GuidedSignup | null): Mission | null {
  const states = missionStates(signup);
  return REQUIRED_MISSIONS.find((mission) => states[mission.id as RequiredMissionId] === "current") ?? null;
}

export function doneCount(signup: GuidedSignup | null): number {
  const states = missionStates(signup);
  return REQUIRED_MISSIONS.filter((mission) => states[mission.id as RequiredMissionId] === "done").length;
}

/** The minutes of every required step not yet done, rounded up. */
export function minutesLeft(signup: GuidedSignup | null): number {
  const states = missionStates(signup);
  const left = REQUIRED_MISSIONS.filter(
    (mission) => states[mission.id as RequiredMissionId] !== "done",
  ).reduce((sum, mission) => sum + mission.minutes, 0);
  return Math.ceil(left);
}

export function minutesLabel(minutes: number): string {
  return minutes < 1 ? "30 sec" : `${minutes} min`;
}

export function setupComplete(signup: GuidedSignup | null): boolean {
  return Boolean(signup && (signup.nextStep === "listing_photos" || signup.nextStep === "complete"));
}

export function isManagerSignup(signup: GuidedSignup | null): boolean {
  return signup?.steps.eligibility?.registrantRole === "manager";
}

function past(next: SignupNextStep, step: SignupNextStep): boolean {
  return NEXT_STEPS.indexOf(next) > NEXT_STEPS.indexOf(step);
}

/** Past the draft's own steps and ready to open the shop. */
export function readyToEnroll(signup: GuidedSignup | null): boolean {
  return Boolean(signup && !signup.supplierId && past(signup.nextStep, "prints"));
}

/** Whether a step may be opened from the list: done, current or waiting. */
export function canOpenMission(state: MissionState | undefined): boolean {
  return state === "done" || state === "current" || state === "waiting";
}

/** "Step 2 of 6 · 1 min" above a step's content. */
export function missionProgress(id: MissionId): { label: string; now: number; max: number } {
  const index = REQUIRED_MISSIONS.findIndex((mission) => mission.id === id);
  const mission = missionById(id);
  const max = REQUIRED_MISSIONS.length;
  if (index < 0) return { label: `Optional · ${minutesLabel(mission.minutes)}`, now: max, max };
  return { label: `Step ${index + 1} of ${max} · ${minutesLabel(mission.minutes)}`, now: index + 1, max };
}

/** The step before and after `id` in the list, for Back and Next. */
export function neighbours(id: MissionId): { previous: Mission | null; next: Mission | null } {
  const index = MISSIONS.findIndex((mission) => mission.id === id);
  return {
    previous: index > 0 ? MISSIONS[index - 1] : null,
    next: index >= 0 && index < MISSIONS.length - 1 ? MISSIONS[index + 1] : null,
  };
}

/** Steps that live before the shop exists, on `/signup`. */
export const DRAFT_MISSIONS: readonly MissionId[] = ["shop", "pin", "prints", "staff"];

/* -------------------------------------------------- the manager's owner link */

export function ownerClaimMessage(url: string): string {
  return `I set up our shop on GRIDGO. Open this to claim it as the owner (works for 24 hours): ${url}`;
}
