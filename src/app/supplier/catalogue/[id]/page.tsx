"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, Plus, Trash2 } from "lucide-react";

import { ListingCard } from "@/app/supplier/_components/ListingCard";
import { PrinterMaxWidthField } from "@/app/supplier/_components/PrinterMaxWidthField";
import {
  ReadinessChecklist,
  requirementRowId,
} from "@/app/supplier/_components/ReadinessChecklist";
import { SamplePhoto } from "@/app/supplier/_components/SamplePhoto";
import {
  AUTOSAVE_DELAY_MS,
  SaveStatus,
  type SaveState,
} from "@/app/supplier/_components/SaveStatus";
import { SegmentedControl } from "@/app/supplier/_components/SegmentedControl";
import {
  ARCHIVED_SENTENCE,
  listingErrorMessage,
  loadShopServiceLines,
} from "@/app/supplier/_lib/listings-api";
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
  deleteCatalogOption,
  deleteCatalogOptionGroup,
  getCatalogItem,
  getTaxonomy,
  isApiError,
  listAcceptedFileFormats,
  listCatalogItemPrepSteps,
  putCatalogItemFileFormats,
  updateCatalogItem,
  updateCatalogItemPrepStep,
  updateCatalogOption,
  uploadCatalogItemPhoto,
} from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
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
  effectiveTurnaroundHours,
  needsPrinterMaxWidth,
  nextFreeSlot,
  normalizeListing,
  normalizePrepSteps,
  normalizeServiceLines,
  parsePrinterMaxWidthFeet,
  pickLine,
  priceSuffix,
  printerMaxWidthFeetWrite,
  readyInLine,
  specs,
  subcategoryName,
  unitChoiceLabel,
  type BoardField,
  type Listing,
  type PrepStep,
  type PricingUnit,
  type ServiceLine,
  type SpecGroup,
} from "@/lib/listings";
import { cn } from "@/lib/utils";

type Draft = {
  version: Listing["version"];
  name: string;
  description: string;
  price: string;
  pricingUnit: PricingUnit;
  packageQty: number;
  minimumOrderQuantity: number;
  turnaroundMode: "inherit" | "override";
  turnaroundHours: number;
  subcategoryCode: string;
  printerMaxWidthFeet: number | null;
};

/** Section and field ids; the readiness checklist scrolls to these. */
const FIELD_IDS: Record<BoardField, string> = {
  photos: "listing-photo-add",
  name: "listing-name",
  description: "listing-body",
  price: "price",
  packageQty: "pack",
  measureUnit: "section-price",
  billableSize: "section-price",
  printerMaxWidth: "printer-max-width",
  turnaround: "section-ready-in",
  groups: "section-picks",
  formats: "section-artwork",
};

const PRICING_CHOICES = PRICING_UNITS.map((unit) => ({
  value: unit,
  label: unitChoiceLabel(unit),
}));

const TURNAROUND_CHOICES = [
  { value: "inherit", label: "Your usual time" },
  { value: "override", label: "Just this listing" },
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
    price: listing.basePriceMinor ? minorToPesosInput(listing.basePriceMinor) : "",
    pricingUnit: listing.pricingUnit,
    packageQty: listing.packageQty ?? 100,
    minimumOrderQuantity: listing.minimumOrderQuantity ?? 0,
    turnaroundMode: listing.turnaroundMode,
    turnaroundHours: listing.turnaroundHours ?? 48,
    subcategoryCode: listing.subcategoryCode,
    printerMaxWidthFeet: listing.printerMaxWidthFeet,
  };
}

/** Exactly what `updateCatalogItem` receives for a draft, minus `active`. */
function payloadOf(draft: Draft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    basePriceMinor: pesosToMinor(draft.price) ?? 0,
    pricingUnit: draft.pricingUnit,
    packageQty: draft.pricingUnit === "per_package" ? draft.packageQty : null,
    minimumOrderQuantity: asksQuantity(draft.pricingUnit)
      ? draft.minimumOrderQuantity || null
      : null,
    turnaroundMode: draft.turnaroundMode,
    turnaroundHours: draft.turnaroundMode === "override" ? draft.turnaroundHours : null,
    subcategoryCode: draft.subcategoryCode,
    ...printerMaxWidthFeetWrite(
      draft.subcategoryCode,
      draft.printerMaxWidthFeet,
      "update",
    ),
  };
}

/** Why a draft cannot be sent yet — the API would refuse it, so hold it here. */
function holdReason(draft: Draft): string | null {
  if (pesosToMinor(draft.price) == null) {
    return "enter a price in pesos, like 400.00.";
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

export default function ListingEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const shopApproved = useAuth().user?.verificationStatus === "approved";

  const [listing, setListing] = useState<Listing | null>(null);
  const [services, setServices] = useState<ServiceLine[]>([]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [prepSteps, setPrepSteps] = useState<PrepStep[]>([]);
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
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const photoInput = useRef<HTMLInputElement | null>(null);

  const working = draft ?? (listing ? draftFrom(listing) : null);

  const load = useSerializedLoad(
    useCallback(async () => {
      try {
        const [itemBody, servicesBody, tax, stepsBody, formatList] = await Promise.all([
          getCatalogItem(id),
          loadShopServiceLines().catch(() => ({ services: [] })),
          getTaxonomy(),
          listCatalogItemPrepSteps(id).catch(() => ({ prepSteps: [] })),
          listAcceptedFileFormats().catch(() => []),
        ]);
        const next = normalizeListing(itemBody);
        if (!next) throw new Error("unreadable");
        setListing(next);
        setServices(normalizeServiceLines(servicesBody));
        setTaxonomy(tax);
        setPrepSteps(normalizePrepSteps(stepsBody));
        setFormats(formatList);
        setError(null);
        if (!dirtyRef.current) setDraft(draftFrom(next));
      } catch (err) {
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

  useLiveReload(["catalog", "services"], load);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  // Dirty means the API would receive something different, not that a string
  // differs — a trailing space or "400" against "400.00" is not a change.
  const dirty = Boolean(
    listing &&
    working &&
    JSON.stringify(payloadOf(working)) !== JSON.stringify(payloadOf(draftFrom(listing))),
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
          turnaroundMode: working.turnaroundMode,
          turnaroundHours: working.turnaroundHours,
          subcategoryCode: working.subcategoryCode,
          printerMaxWidthFeet: needsPrinterMaxWidth(working.subcategoryCode)
            ? working.printerMaxWidthFeet
            : null,
        }
      : listing;
  const checklist = merged && context ? boardChecklist(merged, context) : [];
  const firstMissing = checklist.find((requirement) => !requirement.done) ?? null;
  const standing =
    merged && context ? boardStanding(merged, context, shopApproved) : null;
  const inheritedHours = context?.inheritedTurnaroundHours ?? null;
  const resolvedHours = merged ? effectiveTurnaroundHours(merged, inheritedHours) : null;
  const covers = listing
    ? coversFor(
        taxonomy,
        services.find((line) => line.id === listing.serviceLineId)?.categoryCode ?? "",
      )
    : [];

  async function persist(onTheBoard?: boolean) {
    if (!listing || !working) return false;
    const held = holdReason(working);
    if (held) {
      setSaveState({ kind: "held", reason: held });
      return false;
    }
    const submitted = working;
    setBusy(true);
    setActionError(null);
    setSaveState({ kind: "saving" });
    try {
      const saved = normalizeListing(
        await updateCatalogItem(listing.id, working.version, {
          ...payloadOf(working),
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
        };
      });
      setNotice(null);
      setSaveState({ kind: "saved", at: Date.now() });
      return true;
    } catch (err) {
      setSaveState({
        kind: "error",
        message: listingErrorMessage(err, "Could not save this listing."),
      });
      return false;
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
    if (!dirty || !working) return;
    const held = holdReason(working);
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
  }, [dirty, working]);

  async function addPhoto(file: File) {
    if (!listing) return;
    setBusy(true);
    setActionError(null);
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
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not add that sample photo."));
    } finally {
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

  async function addStep() {
    if (!listing) return;
    setBusy(true);
    try {
      await createCatalogItemPrepStep(listing.id, listing.version, {
        title: "Before they send work",
        body: "",
        sortOrder: nextFreeSlot(
          prepSteps.map((step) => step.sortOrder),
          LISTING_CAPS.prepSteps,
        ),
      });
      await load();
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not add that step."));
    } finally {
      setBusy(false);
    }
  }

  async function saveStep(step: PrepStep, patch: { title?: string; body?: string }) {
    try {
      await updateCatalogItemPrepStep(id, step.id, patch);
      await load();
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not save that step."));
    }
  }

  async function dropStep(step: PrepStep) {
    try {
      await deleteCatalogItemPrepStep(id, step.id);
      await load();
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not remove that step."));
    }
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
              {standing.note ? (
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

      <div className="lg:grid lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] xl:gap-10">
        <aside
          aria-label="What clients see"
          className="flex flex-col gap-4 lg:sticky lg:top-[4.75rem]"
        >
          <div className="flex flex-col gap-1">
            <p className="text-overline text-text-muted m-0 uppercase">
              What clients see
            </p>
            <SaveStatus state={saveState} onRetry={() => void persist()} />
          </div>
          <div className="max-w-xs">
            <ListingCard
              listing={merged}
              taxonomy={taxonomy}
              services={services}
              shopApproved={shopApproved}
              preview
            />
          </div>
          <ReadinessChecklist requirements={checklist} targets={FIELD_IDS} />
          <Button
            variant="primary"
            fullWidth
            disabled={busy || firstMissing != null}
            aria-describedby={
              firstMissing ? requirementRowId(firstMissing.key) : undefined
            }
            onClick={() => void persist(!listing.onTheBoard)}
          >
            {listing.onTheBoard ? "Take it off the board" : "Put it on the board"}
          </Button>
        </aside>

        <div className="mt-10 flex flex-col gap-8 lg:mt-0">
          <Section
            id="section-photos"
            step="01"
            title="Photos"
            help="Up to eight samples of this kind of work. The first one is what clients see on your board."
          >
            <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
              <div className="flex flex-col gap-2">
                <p
                  className="text-body text-text-primary m-0"
                  style={{ fontFamily: "var(--font-medium)" }}
                >
                  Board photo
                </p>
                <SamplePhoto
                  fileId={listing.photos[0]?.fileId}
                  alt={listing.photos[0]?.altText ?? listing.name}
                  emptyLabel="Add a sample so clients can see the work"
                />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-caption text-text-secondary m-0">
                  {listing.photos.length > 1
                    ? "More samples"
                    : "The rest, if you have them"}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {listing.photos.slice(1).map((photo) => (
                    <SamplePhoto
                      key={photo.fileId}
                      fileId={photo.fileId}
                      alt={photo.altText ?? listing.name}
                    />
                  ))}
                  {listing.photos.length < LISTING_CAPS.photos ? (
                    <button
                      type="button"
                      id={FIELD_IDS.photos}
                      onClick={() => photoInput.current?.click()}
                      className="rounded-card border-outline bg-surface hover:bg-overlay-hover active:bg-overlay-pressed flex aspect-square min-h-11 min-w-11 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed disabled:cursor-not-allowed disabled:opacity-[0.38]"
                    >
                      <Plus aria-hidden className="size-4" />
                      <span className="text-caption">Add</span>
                    </button>
                  ) : null}
                </div>
                <input
                  ref={photoInput}
                  type="file"
                  aria-label="Add a sample photo"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void addPhoto(file);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>
          </Section>

          <Section
            id="section-what"
            step="02"
            title="What it is"
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
                  One or two sentences a client reads on your board.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </Section>

          <Section
            id="section-kind"
            step="03"
            title="Kind of work"
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

          <Section
            id="section-price"
            step="04"
            title="Price"
            help="Your own asking price. What GRIDGO charges the client on top is not yours to set."
          >
            <FieldGroup className="gap-4">
              <SegmentedControl
                id="pricing-unit"
                aria-label="Pricing unit"
                options={PRICING_CHOICES}
                value={working.pricingUnit}
                onChange={(pricingUnit) => setDraft({ ...working, pricingUnit })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
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
                {working.pricingUnit === "per_package" ? (
                  <Field>
                    <FieldLabel htmlFor="pack">Pieces in a pack</FieldLabel>
                    <Input
                      id="pack"
                      type="number"
                      min={2}
                      value={working.packageQty}
                      onChange={(event) =>
                        setDraft({
                          ...working,
                          packageQty: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </Field>
                ) : null}
                {asksQuantity(working.pricingUnit) ? (
                  <Field>
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
                    <FieldDescription>0 means no minimum.</FieldDescription>
                  </Field>
                ) : null}
              </div>
            </FieldGroup>
          </Section>

          <Section
            id="section-ready-in"
            step="05"
            title="Ready in"
            help="How long a client waits from paying to pickup."
          >
            <FieldGroup className="gap-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <SegmentedControl
                  id="turnaround-mode"
                  aria-label="Ready-in time"
                  options={TURNAROUND_CHOICES}
                  value={working.turnaroundMode}
                  onChange={(turnaroundMode) => setDraft({ ...working, turnaroundMode })}
                />
                <p className="text-body text-text-secondary m-0" role="status">
                  {readyInLine(resolvedHours)}
                </p>
              </div>
              {working.turnaroundMode === "override" ? (
                <Field className="max-w-48">
                  <FieldLabel htmlFor="hours">Hours</FieldLabel>
                  <Input
                    id="hours"
                    type="number"
                    min={1}
                    value={working.turnaroundHours}
                    onChange={(event) =>
                      setDraft({
                        ...working,
                        turnaroundHours: Number(event.target.value) || 0,
                      })
                    }
                  />
                </Field>
              ) : (
                <p className="text-caption text-text-secondary m-0">
                  {inheritedHours
                    ? `Your shop's usual time is ${inheritedHours} hours.`
                    : "Your shop has no usual turnaround yet. Set the hours for this listing."}
                </p>
              )}
            </FieldGroup>
          </Section>

          <Section
            id="section-artwork"
            step="06"
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
                <div
                  role="group"
                  aria-label="File formats you accept"
                  className="flex flex-wrap gap-2"
                >
                  {formats.map((format) => {
                    const on = listing.formatCodes.includes(format.code);
                    return (
                      <FormatChip
                        key={format.code}
                        label={format.displayName}
                        on={on}
                        onToggle={() => {
                          const next = on
                            ? listing.formatCodes.filter((code) => code !== format.code)
                            : [...listing.formatCodes, format.code];
                          void saveFormats("override", next);
                        }}
                      />
                    );
                  })}
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

          <Section
            id="section-picks"
            step="07"
            title="What a client picks"
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
                <Button onClick={() => void addChoice("spec")}>Add a step</Button>
              </div>
            ) : null}
          </Section>

          <Section
            id="section-addons"
            step="08"
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

          <Section
            id="section-prep"
            step="09"
            title="Prep steps"
            help="What a client should do before sending work. Numbered — they read it in order."
          >
            {prepSteps.length === 0 ? (
              <p className="text-body text-text-secondary m-0 max-w-prose">
                Nothing yet. On specialised work this is where a job is won or lost —
                flatten the art, outline the fonts, export the 3MF at the right scale.
              </p>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {prepSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className="rounded-card border-outline flex flex-col gap-2 border p-3"
                  >
                    <p className="text-caption text-text-muted m-0">{index + 1}.</p>
                    <Input
                      defaultValue={step.title}
                      aria-label={`Step ${index + 1} title`}
                      onBlur={(event) => {
                        if (event.target.value.trim() !== step.title) {
                          void saveStep(step, { title: event.target.value.trim() });
                        }
                      }}
                    />
                    <Textarea
                      defaultValue={step.body}
                      aria-label={`Step ${index + 1} details`}
                      onBlur={(event) => {
                        if (event.target.value !== step.body) {
                          void saveStep(step, { body: event.target.value });
                        }
                      }}
                    />
                    <Button variant="ghost" onClick={() => void dropStep(step)}>
                      Remove this step
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {prepSteps.length < LISTING_CAPS.prepSteps ? (
              <div>
                <Button onClick={() => void addStep()}>Add a step</Button>
              </div>
            ) : null}
          </Section>

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
        </div>
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
 * One editing section: fill-order eyebrow, sentence-case title, one line of
 * help, then the fields. Sections sit 32px apart; fields inside sit 16px apart.
 */
function Section({
  id,
  step,
  title,
  help,
  children,
}: {
  id: string;
  step: string;
  title: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-overline text-text-muted m-0 uppercase">{step}</p>
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
