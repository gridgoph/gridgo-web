"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Check, Trash2 } from "lucide-react";

import { ListingPreviewBody } from "@/app/supplier/_components/ListingPreviewBody";
import { HowLongField } from "@/app/supplier/_components/HowLongField";
import { PriceTierEditor } from "@/app/supplier/_components/TierEditors";
import { ProductionTimeReviewBanner } from "@/app/supplier/_components/ProductionTimeReviewBanner";
import { PrinterMaxWidthField } from "@/app/supplier/_components/PrinterMaxWidthField";
import { PrintLayoutsField } from "@/app/supplier/_components/PrintLayoutsField";
import { ColourPricingField } from "@/app/supplier/_components/ColourPricingField";
import { sectionNumber } from "@/app/supplier/_components/editor-sections";
import {
  focusField,
  ReadinessChecklist,
  requirementRowId,
} from "@/app/supplier/_components/ReadinessChecklist";
import {
  ListingPhotoManager,
  type PhotoReorder,
} from "@/app/supplier/_components/ListingPhotoManager";
import {
  AUTOSAVE_DELAY_MS,
  SaveStatus,
  type SaveState,
} from "@/app/supplier/_components/SaveStatus";
import { SegmentedControl } from "@/app/supplier/_components/SegmentedControl";
import { ListingReviewNotice } from "@/app/supplier/_components/ListingReviewNotice";
import {
  ARCHIVED_SENTENCE,
  listingErrorMessage,
  loadShopServiceLines,
} from "@/app/supplier/_lib/listings-api";
import { forgetListingDraft } from "@/app/supplier/_lib/listing-draft";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import {
  attachCatalogItemPhoto,
  createCatalogItemPrepStep,
  createCatalogOption,
  createCatalogOptionGroup,
  deleteCatalogItem,
  deleteCatalogItemPrepStep,
  reorderCatalogItemPrepSteps,
  deleteCatalogOption,
  deleteCatalogOptionGroup,
  getCatalogItem,
  getSettings,
  getSupplierReadiness,
  getTaxonomy,
  isApiError,
  applyProductionTimeToAll,
  listAcceptedFileFormats,
  listCatalogItemPrepSteps,
  listCatalogItems,
  putCatalogItemFileFormats,
  reorderCatalogPhotos,
  submitCatalogItemForReview,
  updateCatalogItem,
  updateCatalogItemPrepStep,
  updateCatalogOption,
  uploadCatalogItemPhoto,
} from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  minimumOrderProblem,
  packProblem,
  parseCatalogMoney,
} from "@/lib/catalog-money";
import { minorToPesosInput, pesosToMinor } from "@/lib/format";
import {
  LISTING_CAPS,
  PRICING_UNITS,
  addOns,
  asksQuantity,
  boardChecklist,
  boardContextFor,
  boardStanding,
  coversFor,
  effectiveMinimumTurnaround,
  effectiveTurnaround,
  MEASURE_UNITS,
  measurementKind,
  needsPrinterMaxWidth,
  nextFreeSlot,
  normalizeBoardPage,
  normalizeListing,
  normalizeListingReadiness,
  normalizePrepSteps,
  normalizeServiceLines,
  parsePrinterMaxWidthFeet,
  pickLine,
  priceSuffix,
  printerMaxWidthFeetWrite,
  specs,
  subcategoryName,
  unitChoiceLabel,
  unitLine,
  type BoardField,
  type Listing,
  type ListingReadiness,
  type PrepStep,
  type MeasureUnit,
  type PriceTier,
  type PricingUnit,
  type ServiceLine,
  type SpecGroup,
  type SpeedTier,
} from "@/lib/listings";
import {
  billablePayload,
  billableProblem,
  isMeasureUnit,
  measureUnitFor,
  sizeText,
} from "@/lib/listing-measure";
import { changeNotice, replacedNotice } from "@/lib/listing-photos";
import { DEFAULT_DAY_MINUTES, readyInLine, timeFields, timeKey } from "@/lib/production-time";
import {
  choiceFromTimes,
  choiceLine,
  choiceProblem,
  choiceTimes,
  expectedVersionsOf,
  productionTimeSaveError,
  sameChoice,
  type ProductionTimeChoice,
} from "@/lib/production-time-choice";
import { PRINT_LAYOUTS_HELP, sameLayouts, type KnownLayout } from "@/lib/print-layout";
import {
  DEFAULT_A3_LIMIT_BPS,
  colourDraftFrom,
  readColourDraft,
  unpricedSizes,
  type ColourDraft,
} from "@/lib/colour-pricing";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Draft = {
  version: Listing["version"];
  name: string;
  description: string;
  price: string;
  pricingUnit: PricingUnit;
  packageQty: number;
  minimumOrderQuantity: number;
  /** "How long does this take?" Null while the listing has no production time. */
  time: ProductionTimeChoice | null;
  subcategoryCode: string;
  printerMaxWidthFeet: number | null;
  /** Null on an API without layouts: nothing is shown or sent. */
  printLayouts: KnownLayout[] | null;
  /** Null on an API without colour pricing: nothing is shown or sent. */
  pricedByColour: boolean | null;
  oneColour: boolean;
  /** The tier table as typed; blank prices are tiers not offered. */
  colour: ColourDraft;
  measureUnit: MeasureUnit | null;
  /** Typed in `measureUnit` as text, stored as thousandths. */
  minimumWidth: string;
  minimumHeight: string;
  minimumLength: string;
  priceTiers: PriceTier[];
  speedTiers: SpeedTier[];
};

/** Section and field ids; the readiness checklist scrolls to these. */
const FIELD_IDS: Record<BoardField, string> = {
  photos: "listing-photo-add",
  name: "listing-name",
  description: "listing-body",
  price: "price",
  packageQty: "pack",
  measureUnit: "measure-unit",
  billableSize: "billable-size",
  printerMaxWidth: "printer-max-width",
  turnaround: "section-ready-in",
  groups: "section-picks",
  specs: "section-picks",
  formats: "section-artwork",
};

/**
 * The same seven steps as the supplier app's add-a-listing interview.
 * Add-ons sit on Steps. Publish sits on Review.
 */
const EDITOR_STEPS = [
  { id: "pick", label: "Pick", title: "Pick printing category" },
  { id: "about", label: "About", title: "Describe your product" },
  { id: "price", label: "Price", title: "Set your product price" },
  { id: "speed", label: "Speed", title: "Set your capacity & speed" },
  { id: "steps", label: "Steps", title: "How will the client choose?" },
  { id: "artwork", label: "Artwork", title: "How can the client help you?" },
  { id: "review", label: "Review", title: "Finalize your product" },
] as const;

type EditorStepId = (typeof EDITOR_STEPS)[number]["id"];

/** Each step's sections, top to bottom; their numbers are derived from this. */
const STEP_SECTIONS: Record<EditorStepId, readonly string[]> = {
  pick: ["section-kind"],
  about: ["section-photos", "section-what"],
  price: ["section-price"],
  speed: ["section-ready-in"],
  steps: ["section-picks", "section-addons"],
  artwork: ["section-prep", "section-artwork", "section-print-layouts"],
  review: ["section-review"],
};

const SECTION_ORDER = EDITOR_STEPS.map((entry) => STEP_SECTIONS[entry.id]);

const STEP_OF_FIELD: Record<BoardField, EditorStepId> = {
  photos: "about",
  name: "about",
  description: "about",
  price: "price",
  packageQty: "speed",
  measureUnit: "price",
  billableSize: "price",
  printerMaxWidth: "pick",
  turnaround: "speed",
  groups: "steps",
  specs: "steps",
  formats: "artwork",
};

const PRICING_CHOICES = PRICING_UNITS.map((unit) => ({
  value: unit,
  label: unitChoiceLabel(unit),
}));

const COLOUR_MODE_CHOICES = [
  { value: "fixed", label: "Same price every page" },
  { value: "colour", label: "Priced by colour" },
] as const;

const ARTWORK_CHOICES = [
  { value: "inherit", label: "Same as your category" },
  { value: "override", label: "Just this listing" },
] as const;

function draftFrom(listing: Listing): Draft {
  return {
    version: listing.version,
    name: listing.name,
    description: listing.description,
    price: Number.isFinite(listing.basePriceMinor) ? minorToPesosInput(listing.basePriceMinor) : "",
    pricingUnit: listing.pricingUnit,
    packageQty: listing.packageQty ?? 100,
    minimumOrderQuantity: listing.minimumOrderQuantity ?? 0,
    time: listingChoice(listing),
    subcategoryCode: listing.subcategoryCode,
    printerMaxWidthFeet: listing.printerMaxWidthFeet,
    printLayouts: listing.printLayouts,
    pricedByColour: listing.colourSupported ? listing.pricedByColour : null,
    oneColour: listing.oneColour,
    colour: colourDraftFrom(listing.colourPricing),
    measureUnit: listing.measureUnit,
    minimumWidth: sizeText(listing.minimumWidthMilli),
    minimumHeight: sizeText(listing.minimumHeightMilli),
    minimumLength: sizeText(listing.minimumLengthMilli),
    priceTiers: listing.priceTiers,
    speedTiers: listing.speedTiers,
  };
}

function priceTierKey(tiers: readonly PriceTier[]): string {
  return [...tiers]
    .sort((left, right) => left.minQuantity - right.minQuantity)
    .map((tier) => `${tier.minQuantity}:${tier.unitPriceMinor}`)
    .join(",");
}

function speedTierKey(tiers: readonly SpeedTier[]): string {
  return tiers
    .map(
      (tier) =>
        `${timeKey(tier.turnaround)}:${tier.label}:${tier.priceMinor ?? ""}:${tier.surchargeMinor ?? ""}`,
    )
    .join("|");
}

/** A speed as the catalogue API stores it. A new one carries a unit rate and no surcharge. */
function speedTierBody(tier: SpeedTier) {
  return {
    id: tier.id,
    label: tier.label,
    ...timeFields("turnaround", tier.turnaround),
    priceMinor: tier.priceMinor,
    surchargeMinor: tier.surchargeMinor,
  };
}

/** Priced by colour only per page: any other unit sends it off. */
function colourOn(draft: Draft): boolean {
  return draft.pricedByColour === true && draft.pricingUnit === "per_page";
}

/**
 * The colour fields a save sends. The table goes only while the listing is
 * priced by colour; switched off, it is left out so the shop's prices are
 * kept for when it comes back. An unreadable table is held, never sent.
 */
function colourPayload(draft: Draft): Record<string, unknown> {
  if (draft.pricedByColour == null) return {};
  const on = colourOn(draft);
  const read = readColourDraft(draft.colour);
  return {
    pricedByColour: on,
    oneColour: on ? false : draft.oneColour,
    ...(on ? { colourPricing: read.ok ? read.pricing : { unreadable: draft.colour } } : {}),
  };
}

/**
 * The listing's answer to "How long does this take?". An API that predates
 * the field still sends the duration pair, which reads the same way.
 */
function listingChoice(listing: Listing): ProductionTimeChoice | null {
  if (listing.productionTime !== undefined) return listing.productionTime;
  return choiceFromTimes(listing.minimumTurnaround, listing.turnaround);
}

/**
 * True when the draft's answer differs from what the listing holds. An
 * unchanged answer is left out of the save, so a listing still carrying an
 * older long time in hours can have its name or price changed without first
 * being asked to fix a time nobody touched.
 */
function timeChanged(draft: Draft, listing: Listing): boolean {
  return !sameChoice(draft.time, listingChoice(listing));
}

/**
 * The draft after another write moved the listing on (Use for all my
 * listings): what the server now holds, except the fields the shop changed
 * since `submitted` was captured. A field nobody touched takes the server's
 * value, so a stale draft never autosaves an older price over a newer one,
 * and an edit made while the request ran is kept and saved next. Live
 * reloads are held while the request runs, so only the shop moves the draft.
 */
function rebaseDraft(current: Draft, submitted: Draft, saved: Listing): Draft {
  const next = draftFrom(saved);
  const kept = { ...next } as Record<keyof Draft, unknown>;
  for (const key of Object.keys(next) as Array<keyof Draft>) {
    if (key === "version") continue;
    if (JSON.stringify(current[key]) !== JSON.stringify(submitted[key])) kept[key] = current[key];
  }
  return kept as Draft;
}

/**
 * "Keep 1 working day" on the reminder: offered when the listing holds a
 * usable answer the shop has not changed.
 */
function keepLabelFor(listing: Listing, draft: Draft, dirty: boolean): string | null {
  const held = listingChoice(listing);
  if (!held || dirty || timeChanged(draft, listing)) return null;
  if (choiceProblem(held)) return null;
  return `Keep ${choiceLine(held)}`;
}

/** Every listing the shop has, hidden and drafts included, for "Use for all my listings". */
async function readAllOwnListings(): Promise<Listing[]> {
  const listings: Listing[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_OWN_LISTING_PAGES; page += 1) {
    const body = normalizeBoardPage(await listCatalogItems({ limit: 50, cursor }));
    listings.push(...body.listings);
    cursor = body.nextCursor;
    if (!cursor) return listings;
  }
  throw new Error("too_many_listings");
}

const MAX_OWN_LISTING_PAGES = 40;

function draftPriceMinor(price: string): number {
  const money = parseCatalogMoney(price);
  return money.ok ? (money.minor ?? 0) : 0;
}

/** Exactly what `updateCatalogItem` receives for a draft, minus `active`. */
function payloadOf(draft: Draft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    basePriceMinor: draftPriceMinor(draft.price),
    pricingUnit: draft.pricingUnit,
    packageQty: draft.pricingUnit === "per_package" ? draft.packageQty : null,
    minimumOrderQuantity: asksQuantity(draft.pricingUnit)
      ? draft.minimumOrderQuantity || null
      : null,
    priceTiers: asksQuantity(draft.pricingUnit) ? draft.priceTiers : [],
    speedTiers: draft.speedTiers.map(speedTierBody),
    // One answer, never the older duration fields or `express` beside it.
    productionTime: draft.time,
    subcategoryCode: draft.subcategoryCode,
    ...printerMaxWidthFeetWrite(
      draft.subcategoryCode,
      draft.printerMaxWidthFeet,
      "update",
    ),
    ...(draft.printLayouts ? { printLayouts: draft.printLayouts } : {}),
    ...colourPayload(draft),
    ...billablePayload(draft),
  };
}

/** What a save sends: the draft, with an untouched production time left out. */
function savePayload(draft: Draft, listing: Listing) {
  const payload: Record<string, unknown> = payloadOf(draft);
  if (!timeChanged(draft, listing) || !draft.time) delete payload.productionTime;
  // Tiers are replaced as a set. An edit that does not touch them leaves the
  // stored rows alone, including when only the production window changes.
  const nextBreaks = asksQuantity(draft.pricingUnit) ? draft.priceTiers : [];
  const heldBreaks = asksQuantity(listing.pricingUnit) ? listing.priceTiers : [];
  if (priceTierKey(nextBreaks) === priceTierKey(heldBreaks)) delete payload.priceTiers;
  if (speedTierKey(draft.speedTiers) === speedTierKey(listing.speedTiers)) delete payload.speedTiers;
  // The set is replaced whole and a change opens review, so it is sent only
  // when the shop changed it.
  if (sameLayouts(draft.printLayouts, listing.printLayouts)) delete payload.printLayouts;
  // Colour fields go through review too: send only what moved.
  const before = colourPayload(draftFrom(listing));
  for (const key of ["pricedByColour", "oneColour", "colourPricing"]) {
    if (key in payload && JSON.stringify(payload[key]) === JSON.stringify(before[key])) {
      delete payload[key];
    }
  }
  return payload;
}

/** Why a draft cannot be sent yet — the API would refuse it, so hold it here. */
function holdReason(draft: Draft, listing: Listing): string | null {
  if (colourOn(draft)) {
    const read = readColourDraft(draft.colour);
    if (!read.ok) return read.problem.message;
    if (draft.printLayouts && draft.printLayouts.length === 0) {
      return "keep at least one print layout on the Artwork step while this listing is priced by colour.";
    }
  } else {
    const money = parseCatalogMoney(draft.price);
    if (!money.ok) return money.error;
    if (money.minor == null) return "enter a price in pesos, like 400.00.";
  }
  const pack = packProblem(
    draft.pricingUnit,
    draft.pricingUnit === "per_package" ? draft.packageQty : null,
  );
  if (pack) return pack;
  const minimum = minimumOrderProblem(
    draft.pricingUnit,
    asksQuantity(draft.pricingUnit) ? draft.minimumOrderQuantity || null : null,
    asksQuantity(draft.pricingUnit),
  );
  if (minimum) return minimum;
  const measured = billableProblem(draft);
  if (measured) return measured;
  if (draft.time && timeChanged(draft, listing)) {
    const problem = choiceProblem(draft.time);
    if (problem) return problem.charAt(0).toLowerCase() + problem.slice(1);
  }
  if (
    needsPrinterMaxWidth(draft.subcategoryCode) &&
    draft.printerMaxWidthFeet != null &&
    parsePrinterMaxWidthFeet(draft.printerMaxWidthFeet) == null
  ) {
    return "max printer width must be a whole number of feet from 1 to 20.";
  }
  return null;
}

/** A queued prep write that has nothing left to send. */
const SKIP = Symbol("skip");

type PrepField = "title" | "body";
type PrepDraft = {
  title?: string;
  body?: string;
  /** Why GRIDGO refused that box's last save. */
  errors?: Partial<Record<PrepField, string>>;
};

/**
 * One box's text was stored. Its draft goes unless the shop typed on since,
 * and the step's warning goes once nothing on it is left unsaved.
 */
function settleDraft(
  drafts: Record<string, PrepDraft>,
  stepId: string,
  field: PrepField,
  sent: string,
): Record<string, PrepDraft> {
  const draft = drafts[stepId];
  if (!draft || draft[field] !== sent) return drafts;
  const rest: PrepDraft = { ...draft };
  delete rest[field];
  if (rest.errors) {
    rest.errors = { ...rest.errors };
    delete rest.errors[field];
  }
  const next = { ...drafts };
  if (rest.title === undefined && rest.body === undefined) delete next[stepId];
  else next[stepId] = rest;
  return next;
}

function prepEditMessage(err: unknown): string {
  return isApiError(err) && ["catalog_item_stale", "expected_version_required"].includes(err.code)
    ? "This listing changed on another screen. Your text is still in the box; click out of it to save it again."
    : listingErrorMessage(err, "Could not save that step. Your text is still in the box.");
}

export default function ListingEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const requestedStep = useSearchParams().get("step");
  const shopApproved = useAuth().user?.verificationStatus === "approved";

  const [listing, setListing] = useState<Listing | null>(null);
  const [readiness, setReadiness] = useState<ListingReadiness | null>(null);
  const [services, setServices] = useState<ServiceLine[]>([]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [prepSteps, setPrepSteps] = useState<PrepStep[]>([]);
  const [prepLoadError, setPrepLoadError] = useState<string | null>(null);
  const [formats, setFormats] = useState<
    Array<{ code: string; displayName: string; inputKind: "file" | "url" }>
  >([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [replacingPhoto, setReplacingPhoto] = useState<string | null>(null);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [step, setStep] = useState<EditorStepId>(
    EDITOR_STEPS.some((entry) => entry.id === requestedStep)
      ? (requestedStep as EditorStepId)
      : "pick",
  );
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  const [listingCount, setListingCount] = useState<number | null>(null);
  const [keepError, setKeepError] = useState<string | null>(null);
  const [a3LimitBps, setA3LimitBps] = useState(DEFAULT_A3_LIMIT_BPS);
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  // While "Use for all my listings" runs, a live reload is held and run once
  // afterwards: a server copy landing in the draft mid-request would look like
  // the shop's own edit when the draft is rebased on the result.
  const applyingRef = useRef(false);
  const loadGeneration = useRef(0);
  const reloadHeld = useRef(false);
  // Every prep-step write bumps the listing's version, so a blur save and a
  // Later click sent together would race on one version. They run in order
  // instead, each on the version the previous one left.
  const prepQueue = useRef<Promise<void>>(Promise.resolve());
  const listingVersion = useRef<number | null>(null);
  const prepStepsRef = useRef<PrepStep[]>([]);
  // Text the shop typed into a step that GRIDGO has not stored yet, by step
  // id. It lives here, not in the boxes, so a refused save survives a tab
  // change, and its warning stays until that edit saves or is put back.
  const [prepDrafts, setPrepDrafts] = useState<Record<string, PrepDraft>>({});
  const [prepError, setPrepError] = useState<string | null>(null);
  // The step whose edit is with GRIDGO now; its Put back waits for the answer.
  const [prepWriting, setPrepWriting] = useState<string | null>(null);
  // Set as the pointer goes down on Put back, before the box's blur would save.
  const discardIntent = useRef<string | null>(null);
  // Bumped by Put back, so an edit still waiting in the queue is not sent.
  const discardGeneration = useRef<Record<string, number>>({});

  /** A listing's version only moves on, whichever save or read reports it. */
  function adoptVersion(version: number | null | undefined) {
    if (version == null) return;
    if (listingVersion.current == null || version > listingVersion.current) {
      listingVersion.current = version;
    }
  }

  // Autosave, photo moves and Send for review adopt the saved listing without
  // a reread; the next prep-step write must carry the version they left.
  useEffect(() => {
    adoptVersion(listing?.version);
  }, [listing?.version]);

  const working = draft ?? (listing ? draftFrom(listing) : null);

  const load = useSerializedLoad(
    useCallback(async () => {
      const generation = loadGeneration.current;
      // Started or finished while Use for all ran: drop it and read again,
      // after the request if it is still running, or now if it has ended.
      const held = () => {
        if (!applyingRef.current && generation === loadGeneration.current) return false;
        if (applyingRef.current) reloadHeld.current = true;
        else void loadRef.current().catch(() => undefined);
        return true;
      };
      if (held()) return;
      try {
        const [itemBody, servicesBody, tax, stepsBody, formatList, ready, board] =
          await Promise.all([
            getCatalogItem(id),
            loadShopServiceLines().catch(() => ({ services: [] })),
            getTaxonomy(),
            listCatalogItemPrepSteps(id).then(
              (body) => ({ ok: true as const, body }),
              () => ({ ok: false as const, body: null }),
            ),
            listAcceptedFileFormats().catch(() => []),
            getSupplierReadiness().then(normalizeListingReadiness, () => null),
            listCatalogItems({ limit: 1 }).then(normalizeBoardPage, () => null),
          ]);
        if (held()) return;
        const next = normalizeListing(itemBody);
        if (!next) throw new Error("unreadable");
        // A read that started before this page's own save can land after it.
        // Its listing and steps are older than what is on screen, so they stay
        // out; the save's own answer is the newer copy.
        const older =
          next.version != null &&
          listingVersion.current != null &&
          next.version < listingVersion.current;
        if (!older) {
          setListing(next);
          adoptVersion(next.version);
        }
        setReadiness(ready?.get(next.id) ?? null);
        setServices(normalizeServiceLines(servicesBody));
        setTaxonomy(tax);
        if (!stepsBody.ok) {
          setPrepLoadError("Could not load the preparation steps. They are not an empty list.");
        } else if (!older) {
          showSteps(normalizePrepSteps(stepsBody.body));
          setPrepLoadError(null);
        }
        setFormats(formatList);
        if (board) setListingCount(board.total);
        setError(null);
        if (!dirtyRef.current && !older) setDraft(draftFrom(next));
      } catch (err) {
        if (held()) return;
        if (
          isApiError(err) &&
          ["unauthorized", "forbidden", "not_found"].includes(err.kind)
        ) {
          setListing(null);
          setDraft(null);
          dirtyRef.current = false;
        }
        setError(listingErrorMessage(err, "Could not open this listing."));
        throw err;
      } finally {
        setLoading(false);
      }
    }, [id]),
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useLiveReload(["catalog", "services"], load);

  // The A3 monochrome limit is a Super Admin setting; tier labels say it.
  useEffect(() => {
    let live = true;
    getSettings()
      .then((settings) => {
        const limit = settings.colourDetection?.a3MonochromeMaxBps;
        if (live && typeof limit === "number") setA3LimitBps(limit);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  // Dirty means the API would receive something different, not that a string
  // differs — a trailing space or "400" against "400.00" is not a change.
  const typedPrice = working && !colourOn(working) ? parseCatalogMoney(working.price) : null;
  const priceUnfinished = typedPrice != null && (!typedPrice.ok || typedPrice.minor == null);
  const dirty = Boolean(
    listing &&
    working &&
    (priceUnfinished ||
      JSON.stringify(payloadOf(working)) !== JSON.stringify(payloadOf(draftFrom(listing)))),
  );
  dirtyRef.current = dirty;
  busyRef.current = busy;

  const context = listing ? boardContextFor(listing, services) : null;
  // The board's view of the draft: what the preview and checklist read.
  const merged =
    listing && working
      ? {
          ...listing,
          name: working.name,
          description: working.description,
          basePriceMinor: pesosToMinor(working.price) ?? 0,
          pricingUnit: working.pricingUnit,
          packageQty:
            working.pricingUnit === "per_package"
              ? working.packageQty
              : listing.packageQty,
          minimumOrderQuantity: asksQuantity(working.pricingUnit)
            ? working.minimumOrderQuantity || null
            : null,
          // A changed answer is the listing's own time once saved.
          ...(working.time && timeChanged(working, listing)
            ? (() => {
                const { min, max } = choiceTimes(working.time);
                return {
                  turnaroundMode: "override" as const,
                  turnaround: max,
                  minimumTurnaround:
                    working.time.mode === "days" && working.time.minDays < working.time.maxDays
                      ? min
                      : null,
                };
              })()
            : {}),
          subcategoryCode: working.subcategoryCode,
          printerMaxWidthFeet: needsPrinterMaxWidth(working.subcategoryCode)
            ? working.printerMaxWidthFeet
            : null,
          printLayouts: working.printLayouts,
          pricedByColour: colourOn(working),
          oneColour: colourOn(working) ? false : working.oneColour,
          colourPricing: (() => {
            const read = readColourDraft(working.colour);
            return read.ok ? read.pricing : listing.colourPricing;
          })(),
        }
      : listing;
  const checklist = merged && context ? boardChecklist(merged, context) : [];
  const colourRead = working ? readColourDraft(working.colour) : null;
  const colourProblem =
    colourRead && !colourRead.ok && (colourRead.problem.key != null || working?.colour.length)
      ? colourRead.problem
      : null;
  const firstMissing = checklist.find((requirement) => !requirement.done) ?? null;
  const standing =
    merged && context
      ? boardStanding(
          { ...merged, suspendReason: listing?.suspendReason ?? null },
          context,
          shopApproved,
          // Unsaved edits change what readiness last saw; trust it only when clean.
          dirty ? null : readiness,
        )
      : null;
  // An older range that mixes hours and days has no one answer (`productionTime`
  // is null) but still schedules: say what it is rather than "not set".
  const heldMax =
    listing && listing.productionTime === null
      ? effectiveTurnaround(listing, context?.inheritedTurnaround ?? null)
      : null;
  const heldMin = listing ? effectiveMinimumTurnaround(listing) : null;
  const heldLine =
    heldMax && heldMin && heldMin.unit !== heldMax.unit ? readyInLine(heldMax, heldMin) : null;
  const covers = listing
    ? coversFor(
        taxonomy,
        services.find((line) => line.id === listing.serviceLineId)?.categoryCode ?? "",
      )
    : [];

  async function persist(onTheBoard?: boolean) {
    if (!listing || !working) return false;
    const held = holdReason(working, listing);
    if (held) {
      setSaveState({ kind: "held", reason: held });
      return false;
    }
    const submitted = working;
    const payload = savePayload(working, listing);
    setBusy(true);
    setActionError(null);
    setSaveState({ kind: "saving" });
    try {
      const saved = normalizeListing(
        await updateCatalogItem(listing.id, working.version, {
          ...payload,
          ...(onTheBoard != null ? { active: onTheBoard } : {}),
        }),
      );
      if (!saved) throw new Error("unreadable");
      dirtyRef.current = false;
      setListing(saved);
      setDraft((current) => {
        if (current == null) return current;
        // Typed during the save: keep every keystroke, move the version on so
        // the next autosave carries the right expectedVersion.
        if (current !== submitted) return { ...current, version: saved.version };
        // Adopt what the server kept, but never rewrite text under the cursor
        // when it only differs by trimming or number formatting.
        const next = draftFrom(saved);
        return {
          ...next,
          name: current.name.trim() === saved.name ? current.name : next.name,
          description:
            current.description.trim() === saved.description
              ? current.description
              : next.description,
          price:
            pesosToMinor(current.price) === saved.basePriceMinor
              ? current.price
              : next.price,
          // Rows keep their keys (and the cursor its field) when the server
          // kept exactly the prices typed.
          colour:
            JSON.stringify(readColourDraft(current.colour)) ===
            JSON.stringify(readColourDraft(next.colour))
              ? current.colour
              : next.colour,
        };
      });
      if (onTheBoard) forgetListingDraft();
      setNotice(null);
      setSaveState({ kind: "saved", at: Date.now() });
      void refreshReadiness();
      return true;
    } catch (err) {
      setSaveState({
        kind: "error",
        message:
          productionTimeSaveError(err, "productionTime" in payload) ??
          listingErrorMessage(err, "Could not save this listing."),
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * "Use for all my listings": this answer on every listing the shop has.
   * The API takes every listing's version and applies nothing if one moved,
   * so the whole board is read again right before sending.
   */
  async function applyToAll() {
    if (!listing || !working?.time || busyRef.current) return;
    const choice = working.time;
    const submitted = working;
    setBusy(true);
    busyRef.current = true;
    applyingRef.current = true;
    loadGeneration.current += 1;
    setApplying(true);
    setApplyError(null);
    setApplyNotice(null);
    try {
      const all = await readAllOwnListings();
      const versions = expectedVersionsOf(all);
      if (!versions) throw new Error("unversioned");
      const updated = normalizeBoardPage(await applyProductionTimeToAll(choice, versions));
      const saved = updated.listings.find((entry) => entry.id === listing.id);
      if (saved) {
        setListing(saved);
        setDraft((current) => (current == null ? current : rebaseDraft(current, submitted, saved)));
      }
      setListingCount(updated.total);
      setApplyNotice(
        `Done. ${updated.total === 1 ? "Your listing takes" : `All ${updated.total} listings take`} ${choiceLine(choice)} now.`,
      );
      void refreshReadiness();
    } catch (err) {
      setApplyError(
        isApiError(err) && err.code === "catalog_items_stale"
          ? "One of your listings changed while this was being applied, so nothing was changed. Try again."
          : (productionTimeSaveError(err, true) ??
            listingErrorMessage(err, "Could not apply this to all your listings. Nothing was changed.")),
      );
    } finally {
      applyingRef.current = false;
      setApplying(false);
      setBusy(false);
      if (reloadHeld.current) {
        reloadHeld.current = false;
        void load().catch(() => undefined);
      }
    }
  }

  /**
   * The reminder's "Keep": saves the answer the listing already holds, which
   * is how a shop confirms a time GRIDGO rounded up. Only while nothing else
   * is waiting to save, so it never sends half-typed edits.
   */
  async function keepTime() {
    if (!listing || !working || busyRef.current || dirtyRef.current) return;
    const held = listingChoice(listing);
    if (!held) return;
    setBusy(true);
    busyRef.current = true;
    setKeepError(null);
    try {
      const saved = normalizeListing(
        await updateCatalogItem(listing.id, working.version, { productionTime: held }),
      );
      if (!saved) throw new Error("unreadable");
      setListing(saved);
      setDraft((current) =>
        current == null ? current : { ...current, version: saved.version },
      );
      void refreshReadiness();
    } catch (err) {
      setKeepError(
        productionTimeSaveError(err, true) ??
          listingErrorMessage(err, "Could not save this production time."),
      );
    } finally {
      setBusy(false);
    }
  }

  /** What matching sees changes with a save; read it again. */
  async function refreshReadiness() {
    try {
      const ready = normalizeListingReadiness(await getSupplierReadiness());
      setReadiness(ready.get(id) ?? null);
    } catch {
      /* Keep the last reading; the checklist still covers the listing. */
    }
  }

  async function sendForReview() {
    if (!listing) return;
    setBusy(true);
    setActionError(null);
    try {
      const saved = normalizeListing(
        await submitCatalogItemForReview(listing.id, listing.version),
      );
      if (!saved) throw new Error("unreadable");
      setListing(saved);
      setDraft((current) =>
        current ? { ...current, version: saved.version } : draftFrom(saved),
      );
      setNotice("Sent to Operations. You will get a notification when they decide.");
      void refreshReadiness();
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not send this listing for review."));
      if (isApiError(err) && err.code === "catalog_item_stale") {
        await load().catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  const persistRef = useRef(persist);
  persistRef.current = persist;

  // Autosave: a dirty draft goes up once the shop pauses. A draft the API would
  // refuse is held, not sent, and the status line says why. A failed save waits
  // for Retry or the next edit rather than hammering the API.
  useEffect(() => {
    if (!dirty || !working || !listing) return;
    const held = holdReason(working, listing);
    if (held) {
      setSaveState({ kind: "held", reason: held });
      return;
    }
    let timer = 0;
    const attempt = () => {
      if (busyRef.current) {
        timer = window.setTimeout(attempt, AUTOSAVE_DELAY_MS);
        return;
      }
      void persistRef.current();
    };
    timer = window.setTimeout(attempt, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // `working` is the draft object; a new one means the shop typed.
  }, [dirty, working, listing]);

  async function applyPhotoOrder({ action, fileId, fileIds }: PhotoReorder) {
    if (!listing || listing.version == null) {
      setActionError("This listing changed on another screen. Refresh and try again.");
      return;
    }
    const before = listing.photos.map((photo) => photo.fileId);
    setBusy(true);
    setActionError(null);
    setPhotoNotice(null);
    try {
      const saved = normalizeListing(
        await reorderCatalogPhotos(listing.id, fileIds, listing.version),
      );
      if (!saved) throw new Error("unreadable");
      setListing(saved);
      setDraft((current) =>
        current ? { ...current, version: saved.version } : draftFrom(saved),
      );
      setPhotoNotice(
        changeNotice(
          action,
          fileId,
          before,
          saved.photos.map((photo) => photo.fileId),
        ),
      );
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not update these sample photos."));
    } finally {
      setBusy(false);
    }
  }

  async function addPhoto(file: File) {
    if (!listing) return;
    setBusy(true);
    setAddingPhoto(true);
    setActionError(null);
    setPhotoNotice(null);
    try {
      const uploaded = await uploadCatalogItemPhoto(file);
      await attachCatalogItemPhoto(
        uploaded.fileId,
        listing.id,
        nextFreeSlot(
          listing.photos.map((photo) => photo.sortOrder),
          LISTING_CAPS.photos,
        ),
      );
      await load();
      setPhotoNotice(
        listing.photos.length === 0 ? "Board photo added." : "Photo added at the end.",
      );
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not add that sample photo."));
    } finally {
      setAddingPhoto(false);
      setBusy(false);
    }
  }

  /**
   * Swap one photo in place. Attaching at a slot that is already taken makes
   * the API detach the old photo and put the new one there, so the board order
   * never changes and there is no moment with the photo missing.
   */
  async function replacePhoto(photo: Listing["photos"][number], index: number, file: File) {
    if (!listing) return;
    setBusy(true);
    setReplacingPhoto(photo.fileId);
    setActionError(null);
    setPhotoNotice(null);
    try {
      const uploaded = await uploadCatalogItemPhoto(file);
      await attachCatalogItemPhoto(
        uploaded.fileId,
        listing.id,
        photo.sortOrder,
        photo.altText ?? undefined,
      );
      await load();
      setPhotoNotice(replacedNotice(index));
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not replace that sample photo."));
    } finally {
      setReplacingPhoto(null);
      setBusy(false);
    }
  }

  async function addChoice(kind: "spec" | "addon") {
    if (!listing) return;
    const label = kind === "addon" ? "Add-on" : "Size";
    const first = kind === "addon" ? "Lamination" : "A5";
    setBusy(true);
    setActionError(null);
    try {
      await createCatalogOptionGroup(listing.id, listing.version, {
        name: label,
        kind,
        required: kind === "spec",
        sortOrder: nextFreeSlot(
          listing.groups.map((group) => group.sortOrder),
          LISTING_CAPS.specGroups,
        ),
        options: [{ label: first, priceModifierMinor: 0, sortOrder: 0 }],
      });
      await load();
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not add that step."));
    } finally {
      setBusy(false);
    }
  }

  async function addOption(group: SpecGroup) {
    setBusy(true);
    setActionError(null);
    try {
      await createCatalogOption(group.id, group.version, {
        label: "New choice",
        priceModifierMinor: 0,
        sortOrder: nextFreeSlot(
          group.options.map((option) => option.sortOrder),
          LISTING_CAPS.optionsPerGroup,
        ),
      });
      await load();
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not add that choice."));
    } finally {
      setBusy(false);
    }
  }

  async function saveOptionPrice(group: SpecGroup, optionId: string, pesos: string) {
    const minor = pesosToMinor(pesos) ?? 0;
    let priceSaved = false;
    setBusy(true);
    setActionError(null);
    try {
      await updateCatalogOption(group.id, optionId, group.version, {
        priceModifierMinor: minor,
      });
      priceSaved = true;
      await load();
      return true;
    } catch (err) {
      setActionError(
        priceSaved
          ? "Price saved, but its refresh failed. Your entered price was kept."
          : listingErrorMessage(err, "Could not save that price."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function dropOption(group: SpecGroup, optionId: string) {
    setBusy(true);
    try {
      await deleteCatalogOption(group.id, optionId, group.version);
      await load();
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not remove that choice."));
    } finally {
      setBusy(false);
    }
  }

  async function dropGroup(group: SpecGroup) {
    if (!listing) return;
    setBusy(true);
    try {
      await deleteCatalogOptionGroup(listing.id, group.id, group.version);
      await load();
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not remove that step."));
    } finally {
      setBusy(false);
    }
  }

  /** Puts the steps on screen and where the next queued write reads them. */
  function showSteps(steps: PrepStep[]) {
    prepStepsRef.current = steps;
    setPrepSteps(steps);
  }

  /**
   * This page's own prep write moved the listing from `sent` to `next`. The
   * listing and an unsaved About draft move with it only if they were still
   * on `sent`, so an edit made elsewhere still meets its conflict.
   */
  function ownPrepVersion(sent: number | null, next: number) {
    adoptVersion(next);
    setListing((current) =>
      current && current.version === sent ? { ...current, version: next } : current,
    );
    setDraft((current) =>
      current && current.version === sent ? { ...current, version: next } : current,
    );
  }

  /**
   * Runs one prep-step write after any still in flight. A stored write is put
   * on screen from its own answer, so a failed reread after it loses nothing;
   * the reread then brings in anything changed elsewhere. `settled` runs last,
   * with the refusal if there was one. A write that returns SKIP sends nothing.
   */
  function queuePrep(
    write: (version: number | null) => Promise<unknown>,
    settled: (err: unknown | null) => void,
    stored?: (body: unknown) => void,
  ) {
    const run = prepQueue.current.then(async () => {
      let failure: unknown | null = null;
      const sent = listingVersion.current;
      try {
        const body = await write(sent);
        if (body === SKIP) return;
        stored?.(body);
        const itemVersion = (body as { itemVersion?: unknown } | null)?.itemVersion;
        if (typeof itemVersion === "number") ownPrepVersion(sent, itemVersion);
      } catch (err) {
        failure = err;
      }
      // A refused write still rereads, so the next try carries the current version.
      await load().catch(() => undefined);
      settled(failure);
    });
    prepQueue.current = run;
    return run;
  }

  /** For moves, adds and removals; an edit's warning stays on its own step. */
  function prepActionSettled(fallback: string) {
    return (err: unknown | null) =>
      setPrepError(err == null ? null : listingErrorMessage(err, fallback));
  }

  async function moveStep(stepId: string, direction: -1 | 1) {
    setBusy(true);
    let order: string[] = [];
    try {
      await queuePrep(
        async (version) => {
          // Read the order when the move runs: an edit ahead of it may have reread the steps.
          order = prepStepsRef.current.map((step) => step.id);
          const index = order.indexOf(stepId);
          const next = index + direction;
          if (index < 0 || next < 0 || next >= order.length) return SKIP;
          order.splice(index, 1);
          order.splice(next, 0, stepId);
          return reorderCatalogItemPrepSteps(id, version, order);
        },
        prepActionSettled("GRIDGO refused that order. Refresh the steps and try again."),
        () => {
          const byId = new Map(prepStepsRef.current.map((step) => [step.id, step]));
          showSteps(
            order.flatMap((stepId, sortOrder) => {
              const step = byId.get(stepId);
              return step ? [{ ...step, sortOrder }] : [];
            }),
          );
        },
      );
    } finally {
      setBusy(false);
    }
  }

  async function addStep() {
    setBusy(true);
    try {
      await queuePrep(
        (version) =>
          createCatalogItemPrepStep(id, version, {
            title: "Before they send work",
            body: "",
            sortOrder: nextFreeSlot(
              prepStepsRef.current.map((step) => step.sortOrder),
              LISTING_CAPS.prepSteps,
            ),
          }),
        prepActionSettled("Could not add that step."),
        (body) => {
          const [added] = normalizePrepSteps({ prepSteps: [(body as { prepStep?: unknown })?.prepStep] });
          if (added) {
            showSteps(
              [...prepStepsRef.current.filter((step) => step.id !== added.id), added].sort(
                (a, b) => a.sortOrder - b.sortOrder,
              ),
            );
          }
        },
      );
    } finally {
      setBusy(false);
    }
  }

  function typeStep(stepId: string, field: PrepField, value: string) {
    setPrepDrafts((current) => ({ ...current, [stepId]: { ...current[stepId], [field]: value } }));
  }

  /** Saves what was typed into one box, unless it already matches GRIDGO's copy. */
  function saveStep(step: PrepStep, field: PrepField, nextFocus: EventTarget | null) {
    // Leaving the box for Put back the saved text, by pointer or Tab, is not a save.
    if (discardIntent.current === step.id) return;
    if (nextFocus instanceof HTMLElement && nextFocus.dataset.putBack === step.id) return;
    const typed = prepDrafts[step.id]?.[field];
    if (typed === undefined) return;
    const value = field === "title" ? typed.trim() : typed;
    if (value === step[field]) {
      setPrepDrafts((current) => settleDraft(current, step.id, field, typed));
      return;
    }
    const generation = discardGeneration.current[step.id] ?? 0;
    void queuePrep(
      async (version) => {
        // Put back while this waited its turn: the text it carries was dropped.
        if ((discardGeneration.current[step.id] ?? 0) !== generation) return SKIP;
        setPrepWriting(step.id);
        return updateCatalogItemPrepStep(id, step.id, version, { [field]: value });
      },
      (err) => {
        setPrepWriting(null);
        setPrepDrafts((current) =>
          err == null
            ? settleDraft(current, step.id, field, typed)
            : current[step.id]?.[field] === typed
              ? {
                  ...current,
                  [step.id]: {
                    ...current[step.id],
                    errors: { ...current[step.id].errors, [field]: prepEditMessage(err) },
                  },
                }
              : current,
        );
      },
      (body) => {
        const [saved] = normalizePrepSteps({ prepSteps: [(body as { prepStep?: unknown })?.prepStep] });
        showSteps(
          prepStepsRef.current.map((current) =>
            current.id !== step.id
              ? current
              : saved?.id === step.id
                ? saved
                : { ...current, [field]: value },
          ),
        );
      },
    );
  }

  /** Drops the shop's unsaved text for a step and shows GRIDGO's copy again. */
  function putBackStep(stepId: string) {
    discardIntent.current = null;
    discardGeneration.current[stepId] = (discardGeneration.current[stepId] ?? 0) + 1;
    setPrepDrafts((current) => {
      const rest = { ...current };
      delete rest[stepId];
      return rest;
    });
  }

  function dropStep(step: PrepStep) {
    return queuePrep(
      (version) => deleteCatalogItemPrepStep(id, step.id, version),
      (err) => {
        prepActionSettled("Could not remove that step.")(err);
        if (err == null) putBackStep(step.id);
      },
      () => showSteps(prepStepsRef.current.filter((current) => current.id !== step.id)),
    );
  }

  async function saveFormats(mode: "inherit" | "override", codes: string[]) {
    if (!listing) return;
    setBusy(true);
    try {
      await putCatalogItemFileFormats(listing.id, listing.version, mode, codes);
      await load();
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not save the files you accept."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!listing) return;
    setBusy(true);
    try {
      const body = await deleteCatalogItem(listing.id, listing.version);
      const kept = normalizeListing(body);
      setRemoveOpen(false);
      if (kept) {
        setNotice(ARCHIVED_SENTENCE);
        await load();
      } else {
        router.replace("/supplier/catalogue");
      }
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not remove this listing."));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !listing) {
    return <p className="text-body text-text-muted m-0">Opening this listing…</p>;
  }
  if (!listing || !working || !merged) {
    return (
      <ErrorState
        title="This listing could not open"
        body={error ?? "Refresh and try again."}
      />
    );
  }

  const fileCodes =
    listing.fileFormatMode === "override"
      ? listing.formatCodes
      : (context?.inheritedFormatCodes ?? []);
  const showStanding = standing && standing.label !== "Not ready yet";
  const stepIndex = EDITOR_STEPS.findIndex((entry) => entry.id === step);

  const STEP_GATE: Partial<Record<EditorStepId, BoardField>> = {
    about: "photos",
    steps: "specs",
    artwork: "formats",
  };

  async function selectStep(next: EditorStepId): Promise<boolean> {
    if (busyRef.current) return false;
    const nextIndex = EDITOR_STEPS.findIndex((entry) => entry.id === next);
    if (nextIndex > stepIndex) {
      if (dirty) {
        const saved = await persist();
        if (!saved) return false;
      }
      const gate = STEP_GATE[step];
      const row = gate ? checklist.find((requirement) => requirement.key === gate) : undefined;
      if (row && !row.done) {
        setActionError(row.sentence);
        jumpTo(gate as BoardField);
        return false;
      }
    }
    setActionError(null);
    setStep(next);
    return true;
  }

  function jumpTo(field: BoardField) {
    flushSync(() => setStep(STEP_OF_FIELD[field]));
    // A listing priced by colour has no single price field: land on its table.
    focusField(field === "price" && working && colourOn(working) ? "section-price" : FIELD_IDS[field]);
  }

  return (
    <div className="flex flex-col gap-6 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h3 text-text-primary m-0">
            {working.name || "Untitled listing"}
          </h2>
          {showStanding ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusChip
                tone={standing.tone}
                label={standing.label}
                icon={standing.icon}
              />
              {standing.secondary === "pending_review" ? (
                <StatusChip tone="info" label="Changes in review" icon="clock" />
              ) : standing.secondary === "needs_changes" ? (
                <StatusChip tone="warning" label="Needs changes" icon="square-pen" />
              ) : null}
              {/* Review states explain themselves in the notice below. */}
              {standing.note &&
              standing.kind !== "needs_changes" &&
              standing.kind !== "pending_review" &&
              !standing.secondary ? (
                <p className="text-caption text-text-secondary m-0">{standing.note}</p>
              ) : null}
            </div>
          ) : null}
        </div>
        {actionError ? (
          <p className="text-body text-destructive m-0">{actionError}</p>
        ) : null}
        {notice ? <p className="text-body text-text-secondary m-0">{notice}</p> : null}
      </div>

      {listing.productionTimeReview?.required ? (
        <ProductionTimeReviewBanner
          reasons={listing.productionTimeReview.reasons}
          onCheck={step === "speed" ? undefined : () => setStep("speed")}
          keepLabel={keepLabelFor(listing, working, dirty)}
          onKeep={() => void keepTime()}
          busy={busy}
          error={keepError}
        />
      ) : null}

      <ListingReviewNotice
        listing={listing}
        busy={busy || dirty}
        onSend={() => void sendForReview()}
      />

      {/* The editor comes first in the page, so on a phone the shop edits
          before scrolling past the preview; from 1024px the grid places the
          preview back in the left column. */}
      <div className="lg:grid lg:grid-cols-[minmax(18rem,28rem)_minmax(0,1fr)] lg:items-start lg:gap-8 xl:gap-10">
        <div className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1">
          <SaveStatus state={saveState} onRetry={() => void persist()} />
          <ListingStepNav step={step} onSelect={selectStep} />

          <div
            id="listing-step-panel"
            role="tabpanel"
            aria-labelledby={`listing-step-${step}`}
            className="flex flex-col gap-8"
          >
            {step === "pick" ? (
              <Section
                id="section-kind"
                title="Pick printing category"
                help={`Filed under ${subcategoryName(taxonomy, working.subcategoryCode)}. You can move it within that category, not out of it.`}
              >
                <FieldGroup className="gap-4">
                  {covers.length ? (
                    <SegmentedControl
                      id="kind"
                      aria-label="Kind of work"
                      options={covers.map((cover) => ({
                        value: cover.code,
                        label: cover.name,
                      }))}
                      value={working.subcategoryCode}
                      onChange={(subcategoryCode) =>
                        setDraft({ ...working, subcategoryCode })
                      }
                    />
                  ) : null}
                  {needsPrinterMaxWidth(working.subcategoryCode) ? (
                    <PrinterMaxWidthField
                      value={working.printerMaxWidthFeet}
                      onChange={(printerMaxWidthFeet) =>
                        setDraft({ ...working, printerMaxWidthFeet })
                      }
                    />
                  ) : null}
                </FieldGroup>
              </Section>
            ) : null}

            {step === "about" ? (
              <>
                <Section
                  id="section-photos"
                  title="Sample photos"
                  help="Up to eight samples of this kind of work. The Board photo is the wide sample clients see first. Use Edit on a photo to replace it, remove it, or make it the Board photo. A preview is not a stored sample until it finishes uploading."
                >
                  <ListingPhotoManager
                    photos={listing.photos}
                    listingName={listing.name}
                    busy={busy}
                    replacingFileId={replacingPhoto}
                    adding={addingPhoto}
                    notice={photoNotice}
                    addId={FIELD_IDS.photos}
                    onAdd={(file) => void addPhoto(file)}
                    onReplace={(photo, index, file) => void replacePhoto(photo, index, file)}
                    onReorder={(change) => void applyPhotoOrder(change)}
                  />
                </Section>
                <Section
                  id="section-what"
                  title="Describe your product"
                  help="Name it the way a client would ask for it."
                >
                  <FieldGroup className="gap-4">
                    <Field>
                      <FieldLabel htmlFor="listing-name">Name</FieldLabel>
                      <Input
                        id="listing-name"
                        value={working.name}
                        maxLength={LISTING_CAPS.nameChars}
                        onChange={(event) => setDraft({ ...working, name: event.target.value })}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="listing-body">Description</FieldLabel>
                      <Textarea
                        id="listing-body"
                        value={working.description}
                        maxLength={LISTING_CAPS.descriptionChars}
                        onChange={(event) =>
                          setDraft({ ...working, description: event.target.value })
                        }
                        placeholder="Single-sheet colour printing on 70gsm or 80gsm bond."
                      />
                      <FieldDescription>
                        One or two sentences a client reads before they order.
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </Section>
              </>
            ) : null}

            {step === "price" ? (
              <Section
                id="section-price"
                title="Set your product price"
                help="Your own asking price. What GRIDGO charges the client on top is not yours to set."
              >
                <FieldGroup className="gap-4">
                  <SegmentedControl
                    id="pricing-unit"
                    aria-label="Pricing unit"
                    options={PRICING_CHOICES}
                    value={working.pricingUnit}
                    onChange={(pricingUnit) =>
                      setDraft({
                        ...working,
                        pricingUnit,
                        measureUnit: measureUnitFor(pricingUnit, working.measureUnit),
                        minimumWidth: measurementKind(pricingUnit) === "area" ? working.minimumWidth : "",
                        minimumHeight: measurementKind(pricingUnit) === "area" ? working.minimumHeight : "",
                        minimumLength: measurementKind(pricingUnit) === "length" ? working.minimumLength : "",
                      })
                    }
                  />
                  {working.pricedByColour != null && working.pricingUnit === "per_page" ? (
                    <div className="flex flex-col gap-2">
                      <h4
                        id="colour-mode-heading"
                        className="text-body text-text-primary m-0"
                        style={{ fontFamily: "var(--font-medium)" }}
                      >
                        How each page is priced
                      </h4>
                      <SegmentedControl
                        id="colour-mode"
                        aria-labelledby="colour-mode-heading"
                        options={COLOUR_MODE_CHOICES}
                        value={working.pricedByColour ? "colour" : "fixed"}
                        onChange={(mode) =>
                          setDraft({ ...working, pricedByColour: mode === "colour" })
                        }
                      />
                      <p className="text-caption text-text-secondary m-0 max-w-prose">
                        {working.pricedByColour
                          ? "For document and construction prints charged by how much strong colour a sheet carries, like whiteprints. Fixed-price work such as CAD plotting, blueprint or photo paper keeps one price."
                          : "One price for every page, whatever its colour. Choose priced by colour if you charge more for pages with strong colour."}
                      </p>
                    </div>
                  ) : null}
                  {colourOn(working) ? (
                    <>
                      {working.printLayouts && working.printLayouts.length === 0 ? (
                        <div
                          role="note"
                          className="border-warning flex flex-col items-start gap-2 rounded-field border p-3"
                        >
                          <p className="text-body text-text-primary m-0">
                            Pricing by colour needs at least one print layout, so GRIDGO
                            measures each page the way it sits on the paper. Nothing saves
                            until one is marked.
                          </p>
                          <Button type="button" onClick={() => setStep("artwork")}>
                            Mark print layouts
                          </Button>
                        </div>
                      ) : null}
                      <ColourPricingField
                        value={working.colour}
                        onChange={(colour) => setDraft({ ...working, colour })}
                        sizeLabels={specs(listing).flatMap((group) =>
                          group.options.flatMap((option) => (option.paper ? [option.paper] : [])),
                        )}
                        problem={colourProblem}
                        a3LimitBps={a3LimitBps}
                      />
                      {unpricedSizes(working.colour).length ? (
                        <p className="text-caption text-text-secondary m-0 max-w-prose" role="status">
                          No tier is priced on {unpricedSizes(working.colour).join(", ")}. Every
                          page on that paper will need a price check before the client can
                          pay.
                        </p>
                      ) : null}
                      <p className="text-caption text-text-muted m-0 max-w-prose">
                        Each price here is the whole rate for a sheet: option add-ons,
                        quantity discounts and rush prices are not added on top. If another
                        choice, such as a different stock, changes your rate, make it a
                        separate listing.
                      </p>
                    </>
                  ) : (
                  <Field className="max-w-sm">
                    <FieldLabel htmlFor="price">Your price</FieldLabel>
                    <div className="relative">
                      <span
                        aria-hidden
                        className="text-body text-text-secondary pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                      >
                        ₱
                      </span>
                      <Input
                        id="price"
                        inputMode="decimal"
                        className="pr-24 pl-7"
                        value={working.price}
                        aria-describedby="price-unit"
                        onChange={(event) =>
                          setDraft({ ...working, price: event.target.value })
                        }
                      />
                      <span
                        id="price-unit"
                        className="text-caption text-text-muted pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
                      >
                        {priceSuffix(merged)}
                      </span>
                    </div>
                  </Field>
                  )}
                  {asksQuantity(working.pricingUnit) && !colourOn(working) ? (
                    <PriceTierEditor
                      tiers={working.priceTiers}
                      unitLabel={unitLine({
                        pricingUnit: working.pricingUnit,
                        packageQty: working.pricingUnit === "per_package" ? working.packageQty : null,
                        measureUnit: working.measureUnit,
                      })}
                      onChange={(priceTiers) => setDraft({ ...working, priceTiers })}
                    />
                  ) : null}
                  {measurementKind(working.pricingUnit) === "area" ||
                  measurementKind(working.pricingUnit) === "length" ? (
                    <div className="flex flex-col gap-3" id="measure-unit">
                      <Field>
                        <FieldLabel htmlFor="measure-unit-select">What you measure in</FieldLabel>
                        <select
                          id="measure-unit-select"
                          className="border-input bg-card h-12 rounded-[var(--radius-field)] border px-3"
                          value={working.measureUnit ?? "ft"}
                          onChange={(event) => {
                            const next = event.target.value;
                            if (!isMeasureUnit(next)) return;
                            setDraft({ ...working, measureUnit: next });
                          }}
                        >
                          {MEASURE_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {measurementKind(working.pricingUnit) === "area" ? (
                        <div id="billable-size" className="flex flex-col gap-2">
                          <p className="text-caption text-text-muted m-0">
                            Smallest size you charge for — optional. Both a width and a height, or neither.
                          </p>
                          <div className="flex flex-wrap gap-3">
                            <Field className="max-w-40">
                              <FieldLabel htmlFor="billable-width">Width</FieldLabel>
                              <Input
                                id="billable-width"
                                inputMode="decimal"
                                aria-label="Smallest billable width"
                                value={working.minimumWidth}
                                onChange={(event) =>
                                  setDraft({
                                    ...working,
                                    minimumWidth: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field className="max-w-40">
                              <FieldLabel htmlFor="billable-height">Height</FieldLabel>
                              <Input
                                id="billable-height"
                                inputMode="decimal"
                                aria-label="Smallest billable height"
                                value={working.minimumHeight}
                                onChange={(event) =>
                                  setDraft({
                                    ...working,
                                    minimumHeight: event.target.value,
                                  })
                                }
                              />
                            </Field>
                          </div>
                        </div>
                      ) : (
                        <Field id="billable-size" className="max-w-40">
                          <FieldLabel htmlFor="billable-length">Shortest you charge for</FieldLabel>
                          <Input
                            id="billable-length"
                            inputMode="decimal"
                            aria-label="Shortest billable length"
                            value={working.minimumLength}
                            onChange={(event) =>
                              setDraft({
                                ...working,
                                minimumLength: event.target.value,
                              })
                            }
                          />
                          <FieldDescription>Optional. Leave it blank if any length is fine.</FieldDescription>
                        </Field>
                      )}
                    </div>
                  ) : null}
                  {working.pricedByColour != null &&
                  working.pricingUnit === "per_page" &&
                  !working.pricedByColour ? (
                    <div className="flex items-start gap-3">
                      <Switch
                        id="one-colour"
                        checked={working.oneColour}
                        onCheckedChange={(oneColour) => setDraft({ ...working, oneColour })}
                        aria-describedby="one-colour-hint"
                      />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <label
                          htmlFor="one-colour"
                          className="text-body text-text-primary"
                          style={{ fontFamily: "var(--font-medium)" }}
                        >
                          Prints in one colour
                        </label>
                        <span id="one-colour-hint" className="text-caption text-text-secondary max-w-prose">
                          For blueprint or monochrome work. A client whose file has colour
                          is told this service prints in one colour. It never blocks the
                          order or changes your price.
                        </span>
                      </div>
                    </div>
                  ) : null}
                </FieldGroup>
              </Section>
            ) : null}

            {step === "speed" ? (
              <Section
                id="section-ready-in"
                title="Set your capacity & speed"
                help="How many you will take, and how long a client waits from paying to pickup."
              >
                <FieldGroup className="gap-4">
                  {working.pricingUnit === "per_package" ? (
                    <Field className="max-w-xs">
                      <FieldLabel htmlFor="pack">Pieces in a pack</FieldLabel>
                      <Input
                        id="pack"
                        type="number"
                        min={2}
                        value={working.packageQty}
                        aria-describedby="pack-rule"
                        onChange={(event) =>
                          setDraft({
                            ...working,
                            packageQty: Number(event.target.value) || 0,
                          })
                        }
                      />
                      <FieldDescription id="pack-rule">
                        A whole number of at least 2.
                      </FieldDescription>
                    </Field>
                  ) : null}
                  {asksQuantity(working.pricingUnit) ? (
                    <Field className="max-w-xs">
                      <FieldLabel htmlFor="min-qty">Minimum order</FieldLabel>
                      <Input
                        id="min-qty"
                        type="number"
                        min={0}
                        value={working.minimumOrderQuantity}
                        onChange={(event) =>
                          setDraft({
                            ...working,
                            minimumOrderQuantity: Number(event.target.value) || 0,
                          })
                        }
                      />
                      <FieldDescription>
                        A whole number of at least 1, or 0 for none.
                      </FieldDescription>
                    </Field>
                  ) : null}
                  <HowLongField
                    itemId={listing.id}
                    choice={working.time}
                    heldLine={heldLine}
                    onChange={(time) => setDraft({ ...working, time })}
                    dayMinutes={listing.productionDayMinutes ?? DEFAULT_DAY_MINUTES}
                    speedTiers={working.speedTiers}
                    speedUnitLabel={unitLine({
                      pricingUnit: working.pricingUnit,
                      packageQty: working.pricingUnit === "per_package" ? working.packageQty : null,
                      measureUnit: working.measureUnit,
                    })}
                    onSpeedTiersChange={(speedTiers) => setDraft({ ...working, speedTiers })}
                    listingCount={listingCount}
                    applyBlocked={busy || dirty}
                    applying={applying}
                    applyError={applyError}
                    applyNotice={applyNotice}
                    onApplyToAll={applyToAll}
                  />
                </FieldGroup>
              </Section>
            ) : null}

            {step === "steps" ? (
              <>
                <Section
                  id="section-picks"
                  title="How will the client choose?"
                  help="In this order, the way they will see it. Each one saves as you add it."
                >
                  {specs(listing).length ? (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {specs(listing).map((group, index) => (
                        <GroupEditor
                          key={group.id}
                          group={group}
                          index={index + 1}
                          onAddChoice={() => void addOption(group)}
                          onSavePrice={saveOptionPrice}
                          onRemoveChoice={(optionId) => void dropOption(group, optionId)}
                          onRemoveGroup={() => void dropGroup(group)}
                        />
                      ))}
                    </div>
                  ) : null}
                  {specs(listing).length < LISTING_CAPS.specGroups ? (
                    <div>
                      <Button onClick={() => void addChoice("spec")}>Add a client choice</Button>
                    </div>
                  ) : null}
                </Section>
                <Section
                  id="section-addons"
                  title="Add-ons"
                  help="Priced extras a client can add. Rush, grommets, lamination."
                >
                  {addOns(listing).length ? (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {addOns(listing).map((group) => (
                        <GroupEditor
                          key={group.id}
                          group={group}
                          onAddChoice={() => void addOption(group)}
                          onSavePrice={saveOptionPrice}
                          onRemoveChoice={(optionId) => void dropOption(group, optionId)}
                          onRemoveGroup={() => void dropGroup(group)}
                        />
                      ))}
                    </div>
                  ) : null}
                  {addOns(listing).length < LISTING_CAPS.specGroups ? (
                    <div>
                      <Button onClick={() => void addChoice("addon")}>Add an add-on</Button>
                    </div>
                  ) : null}
                </Section>
              </>
            ) : null}

            {step === "artwork" ? (
              <>
                <Section
                  id="section-prep"
                  title="How can the client help you?"
                  help="What a client should do before sending work. Numbered — they read it in order."
                >
                  {prepLoadError ? (
                    <p className="text-body text-error m-0" role="alert">{prepLoadError}</p>
                  ) : null}
                  {prepError ? (
                    <p className="text-body text-error m-0" role="alert">{prepError}</p>
                  ) : null}
                  {prepSteps.length === 0 && !prepLoadError ? (
                    <p className="text-body text-text-secondary m-0 max-w-prose">
                      Nothing yet. On specialised work this is where a job is won or lost —
                      flatten the art, outline the fonts, export the 3MF at the right scale.
                    </p>
                  ) : prepSteps.length > 0 ? (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {prepSteps.map((prep, index) => (
                        <div
                          key={prep.id}
                          className="rounded-card border-outline flex flex-col gap-2 border p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-caption text-text-muted m-0">{index + 1}.</p>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={index === 0 || busy}
                                onClick={() => void moveStep(prep.id, -1)}
                              >
                                Earlier
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={index === prepSteps.length - 1 || busy}
                                onClick={() => void moveStep(prep.id, 1)}
                              >
                                Later
                              </Button>
                            </div>
                          </div>
                          <Input
                            value={prepDrafts[prep.id]?.title ?? prep.title}
                            aria-label={`Step ${index + 1} title`}
                            onChange={(event) => typeStep(prep.id, "title", event.target.value)}
                            onFocus={() => (discardIntent.current = null)}
                            onBlur={(event) => saveStep(prep, "title", event.relatedTarget)}
                          />
                          <Textarea
                            value={prepDrafts[prep.id]?.body ?? prep.body}
                            aria-label={`Step ${index + 1} details`}
                            onChange={(event) => typeStep(prep.id, "body", event.target.value)}
                            onFocus={() => (discardIntent.current = null)}
                            onBlur={(event) => saveStep(prep, "body", event.relatedTarget)}
                          />
                          {prepDrafts[prep.id]?.errors?.title || prepDrafts[prep.id]?.errors?.body ? (
                            <div className="flex flex-col items-start gap-1">
                              <p className="text-body text-error m-0" role="alert">
                                {prepDrafts[prep.id]?.errors?.title ?? prepDrafts[prep.id]?.errors?.body}
                              </p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={prepWriting === prep.id}
                                focusableWhenDisabled
                                data-put-back={prep.id}
                                onPointerDown={() => (discardIntent.current = prep.id)}
                                onClick={() => putBackStep(prep.id)}
                              >
                                {prepWriting === prep.id ? "Saving your text…" : "Put back the saved text"}
                              </Button>
                            </div>
                          ) : null}
                          <Button variant="ghost" onClick={() => void dropStep(prep)}>
                            Remove this step
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {prepSteps.length < LISTING_CAPS.prepSteps ? (
                    <div>
                      <Button onClick={() => void addStep()}>Add a step</Button>
                      <p className="text-caption text-text-muted m-0">
                        A preparation instruction the client reads before sending work. Not a product choice.
                      </p>
                    </div>
                  ) : null}
                </Section>
                <Section
                  id="section-artwork"
                  title="Artwork you accept"
                  help="What a client may send you for this listing."
                >
                  <FieldGroup className="gap-4">
                    <SegmentedControl
                      id="artwork-mode"
                      aria-label="Artwork you accept"
                      options={ARTWORK_CHOICES}
                      value={listing.fileFormatMode}
                      onChange={(mode) => {
                        if (mode === listing.fileFormatMode) return;
                        void saveFormats(
                          mode,
                          mode === "override" ? (fileCodes.length ? fileCodes : ["pdf"]) : [],
                        );
                      }}
                    />
                    {listing.fileFormatMode === "override" ? (
                      <div className="flex flex-col gap-5">
                        <FormatGroup
                          title="Files"
                          hint="A file is an upload."
                          formats={formats.filter((format) => format.inputKind === "file")}
                          selected={listing.formatCodes}
                          onToggle={(code, on) => {
                            const next = on
                              ? listing.formatCodes.filter((entry) => entry !== code)
                              : [...listing.formatCodes, code];
                            void saveFormats("override", next);
                          }}
                        />
                        <FormatGroup
                          title="Links"
                          hint="A link is a Canva, Drive, or Dropbox address."
                          formats={formats.filter((format) => format.inputKind === "url")}
                          selected={listing.formatCodes}
                          onToggle={(code, on) => {
                            const next = on
                              ? listing.formatCodes.filter((entry) => entry !== code)
                              : [...listing.formatCodes, code];
                            void saveFormats("override", next);
                          }}
                        />
                      </div>
                    ) : (
                      <p className="text-caption text-text-secondary m-0">
                        {fileCodes.length
                          ? `This listing follows its category: ${fileCodes.join(", ")}.`
                          : "This category has no accepted files yet. Choose “Just this listing” and tick what you take."}
                      </p>
                    )}
                  </FieldGroup>
                </Section>
                {working.printLayouts ? (
                  <Section
                    id="section-print-layouts"
                    title="Print layouts"
                    help={PRINT_LAYOUTS_HELP}
                  >
                    <PrintLayoutsField
                      value={working.printLayouts}
                      onChange={(printLayouts) => setDraft({ ...working, printLayouts })}
                      inReview={listing.reviewStatus != null}
                    />
                  </Section>
                ) : null}
              </>
            ) : null}

            {step === "review" ? (
              <Section
                id="section-review"
                title="Finalize your product"
                help="The reading beside this is what a client sees, including a price or sample you have not saved yet. It goes on the board only when the list below is clear."
              >
                <ReadinessChecklist
                  requirements={checklist}
                  targets={FIELD_IDS}
                  onJump={jumpTo}
                />
                {listing.suspendReason ? (
                  <div className="flex flex-col gap-1" role="note">
                    <p className="text-body text-text-primary m-0">
                      GRIDGO took this listing down, so clients cannot see it. Reason:{" "}
                      {listing.suspendReason}
                    </p>
                    <p className="text-caption text-text-secondary m-0">
                      You can still edit it. Only GRIDGO can put it back on the board.
                    </p>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    disabled={busy || firstMissing != null}
                    aria-describedby={
                      firstMissing ? requirementRowId(firstMissing.key) : undefined
                    }
                    onClick={() => void persist(!listing.onTheBoard)}
                  >
                    {listing.onTheBoard ? "Take it off the board" : "Put it on the board"}
                  </Button>
                )}
                {listing.reviewStatus ? (
                  <p className="text-caption text-text-secondary m-0 max-w-prose">
                    The GRIDGO Team reviews every new listing, and any change to its price,
                    specs, print layouts, artwork formats or photos, before clients see it. Photos must not show a
                    watermark, logo or shop branding.
                  </p>
                ) : null}
                <div className="border-outline flex flex-col gap-2 border-t pt-6">
                  <p className="text-caption text-text-secondary m-0">
                    Taking it down for good? A listing a client has already ordered from is kept
                    for that job&apos;s history.
                  </p>
                  <div>
                    <Button variant="danger" onClick={() => setRemoveOpen(true)}>
                      Remove this listing
                    </Button>
                  </div>
                </div>
              </Section>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {stepIndex > 0 ? (
                <Button type="button" onClick={() => void selectStep(EDITOR_STEPS[stepIndex - 1].id)}>
                  Back
                </Button>
              ) : null}
              {stepIndex < EDITOR_STEPS.length - 1 ? (
                <Button type="button" onClick={() => void selectStep(EDITOR_STEPS[stepIndex + 1].id)}>
                  Next
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <aside
          aria-label="What clients see"
          className="mt-10 flex flex-col gap-4 lg:sticky lg:col-start-1 lg:row-start-1 lg:mt-0 lg:top-[4.75rem] lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
        >
          <p className="text-overline text-text-muted m-0 uppercase">
            What clients see
          </p>
          <ListingPreviewBody
            listing={merged}
            taxonomy={taxonomy}
            services={services}
            prepSteps={prepSteps}
            formats={formats}
          />
        </aside>
      </div>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove “{listing.name || "this listing"}” from your shop?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It comes off your board and its samples, steps and prices go with it. A
              listing a client has already ordered from is kept for that job&apos;s
              history instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>Remove it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

/**
 * Where the shop is in the seven steps, and what is still ahead.
 *
 * The current step is marked. Steps before it can be opened again. Later
 * steps stay in the row and read as not done yet. On a phone only the
 * current step is named; the rest keep their numbers.
 */
function onStepKey(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  onSelect: (id: EditorStepId) => void | boolean | Promise<boolean>,
) {
  const target =
    event.key === "ArrowRight"
      ? index + 1
      : event.key === "ArrowLeft"
        ? index - 1
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? EDITOR_STEPS.length - 1
            : null;
  if (target == null) return;
  event.preventDefault();
  const next = EDITOR_STEPS[Math.max(0, Math.min(EDITOR_STEPS.length - 1, target))];
  void Promise.resolve(onSelect(next.id)).then((moved) => {
    if (moved === false) return;
    document.getElementById(`listing-step-${next.id}`)?.focus();
  });
}

function ListingStepNav({
  step,
  onSelect,
}: {
  step: EditorStepId;
  onSelect: (id: EditorStepId) => void | boolean | Promise<boolean>;
}) {
  const currentIndex = EDITOR_STEPS.findIndex((entry) => entry.id === step);
  return (
    <>
      <p id="listing-step-done" className="sr-only">
        Done. You can open it again.
      </p>
      <p id="listing-step-ahead" className="sr-only">
        Not done yet.
      </p>
      <div role="tablist" aria-label="Listing steps" className="grid grid-cols-7">
        {EDITOR_STEPS.map((entry, index) => {
          const selected = index === currentIndex;
          const done = index < currentIndex;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`listing-step-${entry.id}`}
              aria-label={entry.label}
              aria-selected={selected}
              aria-controls="listing-step-panel"
              aria-describedby={
                selected ? undefined : done ? "listing-step-done" : "listing-step-ahead"
              }
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(entry.id)}
              onKeyDown={(event) => onStepKey(event, index, onSelect)}
              className="relative flex min-h-11 flex-col items-center gap-1.5 bg-transparent px-0.5 pt-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-yellow"
            >
              {index > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-4 right-1/2 left-0 h-px",
                    index <= currentIndex ? "bg-foreground" : "bg-border",
                  )}
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 flex size-6 items-center justify-center rounded-full text-caption",
                  selected && "bg-foreground text-background",
                  done && "border border-foreground bg-card text-foreground",
                  !selected && !done && "border border-border bg-card text-text-muted",
                )}
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-caption",
                  // Seven labels do not fit a phone; it names only the step it is on.
                  !selected && "max-sm:sr-only",
                  selected && "text-text-primary",
                  done && "text-text-secondary",
                  !selected && !done && "text-text-muted",
                )}
                style={selected ? { fontFamily: "var(--font-medium)" } : undefined}
              >
                {entry.label}
              </span>
              <span
                aria-hidden
                className={cn("h-0.5 w-6 rounded-full", selected ? "bg-foreground" : "bg-transparent")}
              />
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * One editing section: fill-order eyebrow, sentence-case title, one line of
 * help, then the fields. Sections sit 32px apart; fields inside sit 16px apart.
 */
function Section({
  id,
  title,
  help,
  children,
}: {
  id: string;
  title: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-overline text-text-muted m-0 uppercase">
          {sectionNumber(SECTION_ORDER, id)}
        </p>
        <h3
          id={`${id}-title`}
          className="text-body-lg text-text-primary m-0"
          style={{ fontFamily: "var(--font-bold)" }}
        >
          {title}
        </h3>
        <p className="text-caption text-text-secondary m-0">{help}</p>
      </div>
      {children}
    </section>
  );
}

/** Files in one wrap, links in another. An empty kind is omitted. */
function FormatGroup({
  title,
  hint,
  formats,
  selected,
  onToggle,
}: {
  title: string;
  hint: string;
  formats: ReadonlyArray<{ code: string; displayName: string }>;
  selected: readonly string[];
  onToggle: (code: string, on: boolean) => void;
}) {
  if (!formats.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <p className="text-caption text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          {title}
        </p>
        <p className="text-caption text-text-muted m-0">{hint}</p>
      </div>
      <div role="group" aria-label={title} className="flex flex-wrap gap-2">
        {formats.map((format) => {
          const on = selected.includes(format.code);
          return (
            <FormatChip
              key={format.code}
              label={format.displayName}
              on={on}
              onToggle={() => onToggle(format.code, on)}
            />
          );
        })}
      </div>
    </div>
  );
}

/** A multi-choice chip: the filled state is unmistakable and carries a tick. */
function FormatChip({
  label,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "text-button inline-flex min-h-11 min-w-11 items-center gap-2 rounded-[var(--radius-field)] border px-4 transition-[background-color,border-color,color] duration-200 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-[0.38]",
        on
          ? "bg-primary text-primary-foreground border-transparent"
          : "border-border bg-card text-foreground hover:bg-overlay-hover active:bg-overlay-pressed",
      )}
    >
      {on ? <Check aria-hidden className="size-4" /> : null}
      {label}
    </button>
  );
}

function GroupEditor({
  group,
  index,
  onAddChoice,
  onSavePrice,
  onRemoveChoice,
  onRemoveGroup,
}: {
  group: SpecGroup;
  index?: number;
  onAddChoice: () => void;
  onSavePrice: (group: SpecGroup, optionId: string, pesos: string) => Promise<boolean>;
  onRemoveChoice: (optionId: string) => void;
  onRemoveGroup: () => void;
}) {
  return (
    <div className="rounded-card border-outline flex flex-col gap-3 border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          {index != null ? (
            <p className="text-caption text-text-muted m-0">
              {index}. {group.name}
            </p>
          ) : (
            <p className="text-body m-0" style={{ fontFamily: "var(--font-medium)" }}>
              {group.name}
            </p>
          )}
          <p className="text-caption text-text-muted m-0">{pickLine(group)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove this step"
          onClick={onRemoveGroup}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      {group.options.map((option) => (
        <div key={option.id} className="flex flex-wrap items-center gap-2">
          <Input value={option.label} readOnly className="min-w-40 flex-1" />
          <OptionPriceInput group={group} option={option} onSave={onSavePrice} />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${option.label}`}
            onClick={() => onRemoveChoice(option.id)}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      <Button onClick={onAddChoice}>Add choice</Button>
    </div>
  );
}

function OptionPriceInput({
  group,
  option,
  onSave,
}: {
  group: SpecGroup;
  option: SpecGroup["options"][number];
  onSave: (group: SpecGroup, optionId: string, pesos: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<{ group: SpecGroup; pesos: string } | null>(null);
  useEffect(() => {
    setDraft((current) =>
      current &&
      group.version !== current.group.version &&
      pesosToMinor(current.pesos) === option.priceModifierMinor
        ? null
        : current,
    );
  }, [group.version, option.priceModifierMinor]);
  return (
    <Input
      className="w-28"
      value={draft?.pesos ?? minorToPesosInput(option.priceModifierMinor)}
      aria-label={`${option.label} extra pesos`}
      onChange={(event) => {
        const pesos = event.target.value;
        setDraft((current) => ({ group: current?.group ?? group, pesos }));
      }}
      onBlur={() => {
        if (!draft) return;
        const submitted = draft;
        void onSave(submitted.group, option.id, submitted.pesos).then((saved) => {
          if (saved) setDraft((current) => (current === submitted ? null : current));
        });
      }}
    />
  );
}
