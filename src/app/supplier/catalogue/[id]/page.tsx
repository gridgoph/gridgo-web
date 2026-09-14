"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { PrinterMaxWidthField } from "@/app/supplier/_components/PrinterMaxWidthField";
import { SamplePhoto } from "@/app/supplier/_components/SamplePhoto";
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
import { EmptyState } from "@/components/ui/EmptyState";
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
  boardBlockers,
  boardContextFor,
  boardStanding,
  coversFor,
  needsPrinterMaxWidth,
  nextFreeSlot,
  normalizeListing,
  normalizePrepSteps,
  normalizeServiceLines,
  parsePrinterMaxWidthFeet,
  pickLine,
  printerMaxWidthFeetWrite,
  specs,
  subcategoryName,
  unitChoiceLabel,
  type Listing,
  type PrepStep,
  type PricingUnit,
  type ServiceLine,
  type SpecGroup,
} from "@/lib/listings";

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

export default function ListingEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const shopApproved = useAuth().user?.verificationStatus === "approved";

  const [listing, setListing] = useState<Listing | null>(null);
  const [services, setServices] = useState<ServiceLine[]>([]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [prepSteps, setPrepSteps] = useState<PrepStep[]>([]);
  const [formats, setFormats] = useState<Array<{ code: string; displayName: string; inputKind: "file" | "url" }>>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const dirtyRef = useRef(false);

  const working = draft ?? (listing ? draftFrom(listing) : null);

  const load = useSerializedLoad(useCallback(async () => {
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
      if (isApiError(err) && ["unauthorized", "forbidden", "not_found"].includes(err.kind)) {
        setListing(null);
        setDraft(null);
        dirtyRef.current = false;
      }
      setError(listingErrorMessage(err, "Could not open this listing."));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [id]));

  useLiveReload(["catalog", "services"], load);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  const dirty = Boolean(listing && working && JSON.stringify(working) !== JSON.stringify(draftFrom(listing)));
  dirtyRef.current = dirty;

  const context = listing ? boardContextFor(listing, services) : null;
  const merged = listing && working
    ? {
        ...listing,
        name: working.name,
        description: working.description,
        pricingUnit: working.pricingUnit,
        packageQty: working.pricingUnit === "per_package" ? working.packageQty : listing.packageQty,
        turnaroundMode: working.turnaroundMode,
        turnaroundHours: working.turnaroundHours,
        subcategoryCode: working.subcategoryCode,
        printerMaxWidthFeet: needsPrinterMaxWidth(working.subcategoryCode)
          ? working.printerMaxWidthFeet
          : null,
      }
    : listing;
  const blockers = merged && context ? boardBlockers(merged, context) : [];
  const standing = merged && context ? boardStanding(merged, context, shopApproved) : null;
  const inheritedHours = context?.inheritedTurnaroundHours ?? null;
  const covers = listing
    ? coversFor(taxonomy, services.find((line) => line.id === listing.serviceLineId)?.categoryCode ?? "")
    : [];

  async function persist(onTheBoard?: boolean) {
    if (!listing || !working) return false;
    const money = pesosToMinor(working.price);
    if (money == null) {
      setActionError("Enter a price in pesos, like 400.00.");
      return false;
    }
    if (
      needsPrinterMaxWidth(working.subcategoryCode) &&
      working.printerMaxWidthFeet != null &&
      parsePrinterMaxWidthFeet(working.printerMaxWidthFeet) == null
    ) {
      setActionError("Max printer width must be a whole number of feet from 1 to 20.");
      return false;
    }
    setBusy(true);
    setActionError(null);
    try {
      const saved = normalizeListing(
        await updateCatalogItem(listing.id, working.version, {
          name: working.name.trim(),
          description: working.description.trim(),
          basePriceMinor: money,
          pricingUnit: working.pricingUnit,
          packageQty: working.pricingUnit === "per_package" ? working.packageQty : null,
          minimumOrderQuantity: asksQuantity(working.pricingUnit)
            ? working.minimumOrderQuantity || null
            : null,
          turnaroundMode: working.turnaroundMode,
          turnaroundHours:
            working.turnaroundMode === "override" ? working.turnaroundHours : null,
          subcategoryCode: working.subcategoryCode,
          ...printerMaxWidthFeetWrite(
            working.subcategoryCode,
            working.printerMaxWidthFeet,
            "update",
          ),
          ...(onTheBoard != null ? { active: onTheBoard } : {}),
        }),
      );
      if (!saved) throw new Error("unreadable");
      dirtyRef.current = false;
      setListing(saved);
      setDraft(draftFrom(saved));
      setNotice(null);
      return true;
    } catch (err) {
      setActionError(listingErrorMessage(err, "Could not save this listing."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addPhoto(file: File) {
    if (!listing) return;
    setBusy(true);
    setActionError(null);
    try {
      const uploaded = await uploadCatalogItemPhoto(file);
      await attachCatalogItemPhoto(
        uploaded.fileId,
        listing.id,
        nextFreeSlot(listing.photos.map((photo) => photo.sortOrder), LISTING_CAPS.photos),
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
        sortOrder: nextFreeSlot(listing.groups.map((group) => group.sortOrder), LISTING_CAPS.specGroups),
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
        sortOrder: nextFreeSlot(group.options.map((option) => option.sortOrder), LISTING_CAPS.optionsPerGroup),
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
      await updateCatalogOption(group.id, optionId, group.version, { priceModifierMinor: minor });
      priceSaved = true;
      await load();
      return true;
    } catch (err) {
      setActionError(priceSaved
        ? "Price saved, but its refresh failed. Your entered price was kept."
        : listingErrorMessage(err, "Could not save that price."));
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
        sortOrder: nextFreeSlot(prepSteps.map((step) => step.sortOrder), LISTING_CAPS.prepSteps),
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
  if (!listing || !working) {
    return (
      <ErrorState
        title="This listing could not open"
        body={error ?? "Refresh and try again."}
      />
    );
  }

  const fileCodes = listing.fileFormatMode === "override"
    ? listing.formatCodes
    : (context?.inheritedFormatCodes ?? []);

  const saveBar = (
    <div className="flex flex-col gap-2">
      <Button variant="primary" disabled={busy || !dirty} onClick={() => void persist()}>
        {busy ? "Saving…" : dirty ? "Save" : "Saved"}
      </Button>
      <Button
        disabled={busy || blockers.length > 0}
        onClick={() => void persist(!listing.onTheBoard)}
      >
        {listing.onTheBoard ? "Take it off the board" : "Put it on the board"}
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 pb-24 lg:pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h3 text-text-primary m-0">{working.name || "Untitled listing"}</h2>
          {standing ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusChip tone={standing.tone} label={standing.label} icon={standing.icon} />
              {standing.note ? (
                <p className="text-caption text-text-secondary m-0">{standing.note}</p>
              ) : null}
            </div>
          ) : null}
        </div>
        {actionError ? <p className="text-body text-destructive m-0">{actionError}</p> : null}
        {notice ? <p className="text-body text-text-secondary m-0">{notice}</p> : null}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)] xl:gap-10">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[4.75rem]">
          <div>
            <p className="text-overline text-text-muted m-0 uppercase">Board photo</p>
            <p className="text-caption text-text-secondary m-0 mt-1">
              The first one is what clients see on your board.
            </p>
          </div>
          <SamplePhoto
            fileId={listing.photos[0]?.fileId}
            alt={listing.photos[0]?.altText ?? listing.name}
            emptyLabel="Add a sample so clients can see the work"
          />
          <div className="grid grid-cols-4 gap-2">
            {listing.photos.slice(1).map((photo) => (
              <SamplePhoto
                key={photo.fileId}
                fileId={photo.fileId}
                alt={photo.altText ?? listing.name}
              />
            ))}
            {listing.photos.length < LISTING_CAPS.photos ? (
              <label className="rounded-card border-outline bg-surface hover:bg-overlay-hover flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 border border-dashed">
                <Plus aria-hidden className="size-4" />
                <span className="text-caption">Add</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void addPhoto(file);
                    event.target.value = "";
                  }}
                />
              </label>
            ) : null}
          </div>
          {blockers.length ? (
            <EmptyState title="Not ready yet" body={blockers[0]} />
          ) : listing.onTheBoard ? (
            <p className="text-caption text-text-secondary m-0">Clients can see this listing now.</p>
          ) : (
            <p className="text-caption text-text-secondary m-0">
              Ready to go up. Clients cannot see it while it is hidden.
            </p>
          )}
          <div className="hidden lg:flex lg:flex-col lg:gap-2">
            {saveBar}
            <Button variant="danger" onClick={() => setRemoveOpen(true)}>
              Remove this listing
            </Button>
          </div>
        </aside>

        <div className="mt-8 flex flex-col gap-8 lg:mt-0">
          <section className="xl:grid xl:grid-cols-2 xl:gap-8">
            <div>
              <p className="text-overline text-text-muted m-0 uppercase">What it is</p>
              <FieldGroup className="mt-3">
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
                  <FieldLabel htmlFor="listing-body">What clients read</FieldLabel>
                  <Textarea
                    id="listing-body"
                    value={working.description}
                    maxLength={LISTING_CAPS.descriptionChars}
                    onChange={(event) => setDraft({ ...working, description: event.target.value })}
                    placeholder="Single-sheet colour printing on 70gsm or 80gsm bond."
                  />
                </Field>
                {covers.length ? (
                  <Field>
                    <FieldLabel>Kind of work</FieldLabel>
                    <p className="text-caption text-text-muted m-0 mb-2">
                      Filed under {subcategoryName(taxonomy, working.subcategoryCode)}. You can move
                      it within that category, not out of it.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {covers.map((cover) => (
                        <Button
                          key={cover.code}
                          variant={working.subcategoryCode === cover.code ? "default" : "outline"}
                          onClick={() => setDraft({ ...working, subcategoryCode: cover.code })}
                        >
                          {cover.name}
                        </Button>
                      ))}
                    </div>
                  </Field>
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
            </div>

            <div className="mt-8 xl:mt-0">
              <p className="text-overline text-text-muted m-0 uppercase">Price</p>
              <p className="text-caption text-text-secondary m-0 mt-1">
                Your own asking price. What GRIDGO charges the client on top is not yours to set.
              </p>
              <FieldGroup className="mt-3">
                <div className="flex flex-wrap gap-2">
                  {PRICING_UNITS.map((unit) => (
                    <Button
                      key={unit}
                      variant={working.pricingUnit === unit ? "default" : "outline"}
                      onClick={() => setDraft({ ...working, pricingUnit: unit })}
                    >
                      {unitChoiceLabel(unit)}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="price">Pesos</FieldLabel>
                    <Input
                      id="price"
                      inputMode="decimal"
                      value={working.price}
                      onChange={(event) => setDraft({ ...working, price: event.target.value })}
                    />
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
                          setDraft({ ...working, packageQty: Number(event.target.value) || 0 })
                        }
                      />
                    </Field>
                  ) : null}
                  {asksQuantity(working.pricingUnit) ? (
                    <Field>
                      <FieldLabel htmlFor="min-qty">Least you will run</FieldLabel>
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
            </div>
          </section>

          <section className="xl:grid xl:grid-cols-2 xl:gap-8">
            <div>
              <p className="text-overline text-text-muted m-0 uppercase">Ready in</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant={working.turnaroundMode === "inherit" ? "default" : "outline"}
                  onClick={() => setDraft({ ...working, turnaroundMode: "inherit" })}
                >
                  Your usual time
                </Button>
                <Button
                  variant={working.turnaroundMode === "override" ? "default" : "outline"}
                  onClick={() => setDraft({ ...working, turnaroundMode: "override" })}
                >
                  Just this listing
                </Button>
              </div>
              {working.turnaroundMode === "override" ? (
                <Field className="mt-3 max-w-48">
                  <FieldLabel htmlFor="hours">Hours</FieldLabel>
                  <Input
                    id="hours"
                    type="number"
                    min={1}
                    value={working.turnaroundHours}
                    onChange={(event) =>
                      setDraft({ ...working, turnaroundHours: Number(event.target.value) || 0 })
                    }
                  />
                </Field>
              ) : (
                <p className="text-body text-text-secondary m-0 mt-3">
                  {inheritedHours
                    ? `This uses your shop's usual ${inheritedHours} hours.`
                    : "Your shop has no usual turnaround yet. Set the hours for this listing."}
                </p>
              )}
            </div>
            <div className="mt-8 xl:mt-0">
              <p className="text-overline text-text-muted m-0 uppercase">Artwork you accept</p>
              <p className="text-caption text-text-secondary m-0 mt-1">
                What a client may send you for this listing.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant={listing.fileFormatMode === "inherit" ? "default" : "outline"}
                  onClick={() => void saveFormats("inherit", [])}
                >
                  Same as your category
                </Button>
                <Button
                  variant={listing.fileFormatMode === "override" ? "default" : "outline"}
                  onClick={() =>
                    void saveFormats("override", fileCodes.length ? fileCodes : ["pdf"])
                  }
                >
                  Just this listing
                </Button>
              </div>
              {listing.fileFormatMode === "override" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {formats.map((format) => {
                    const on = listing.formatCodes.includes(format.code);
                    return (
                      <Button
                        key={format.code}
                        variant={on ? "default" : "outline"}
                        onClick={() => {
                          const next = on
                            ? listing.formatCodes.filter((code) => code !== format.code)
                            : [...listing.formatCodes, format.code];
                          void saveFormats("override", next);
                        }}
                      >
                        {format.displayName}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-caption text-text-secondary m-0 mt-3">
                  {fileCodes.length
                    ? `This listing follows its category: ${fileCodes.join(", ")}.`
                    : "This category has no accepted files yet. Override and tick what you take."}
                </p>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <p className="text-overline text-text-muted m-0 uppercase">What a client picks</p>
              <p className="text-caption text-text-secondary m-0 mt-1">
                In this order, the way they will see it. Each one saves as you add it.
              </p>
            </div>
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
            {specs(listing).length < LISTING_CAPS.specGroups ? (
              <Button onClick={() => void addChoice("spec")}>Add a step</Button>
            ) : null}
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <p className="text-overline text-text-muted m-0 uppercase">Add-ons</p>
              <p className="text-caption text-text-secondary m-0 mt-1">
                Priced extras a client can add. Rush, grommets, lamination.
              </p>
            </div>
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
            {addOns(listing).length < LISTING_CAPS.specGroups ? (
              <Button onClick={() => void addChoice("addon")}>Add an add-on</Button>
            ) : null}
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <p className="text-overline text-text-muted m-0 uppercase">Before they order</p>
              <p className="text-caption text-text-secondary m-0 mt-1">
                What a client should do before sending work. Numbered — they read it in order.
              </p>
            </div>
            {prepSteps.length === 0 ? (
              <p className="text-body text-text-secondary m-0 max-w-prose">
                Nothing yet. On specialised work this is where a job is won or lost — flatten the
                art, outline the fonts, export the 3MF at the right scale.
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
                      onBlur={(event) => {
                        if (event.target.value.trim() !== step.title) {
                          void saveStep(step, { title: event.target.value.trim() });
                        }
                      }}
                    />
                    <Textarea
                      defaultValue={step.body}
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
              <Button onClick={() => void addStep()}>Add a step</Button>
            ) : null}
          </section>

          <div className="lg:hidden">
            <Button variant="danger" onClick={() => setRemoveOpen(true)}>
              Remove this listing
            </Button>
          </div>
        </div>
      </div>

      <div className="border-outline bg-canvas sticky bottom-0 z-20 -mx-3 flex flex-col gap-2 border-t px-3 py-3 md:-mx-4 md:px-4 lg:hidden">
        {saveBar}
      </div>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove “{listing.name || "this listing"}” from your shop?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It comes off your board and its samples, steps and prices go with it. A listing a
              client has already ordered from is kept for that job&apos;s history instead.
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
        <Button variant="ghost" size="icon" aria-label="Remove this step" onClick={onRemoveGroup}>
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


function OptionPriceInput({ group, option, onSave }: {
  group: SpecGroup;
  option: SpecGroup["options"][number];
  onSave: (group: SpecGroup, optionId: string, pesos: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<{ group: SpecGroup; pesos: string } | null>(null);
  useEffect(() => {
    setDraft(current =>
      current && group.version !== current.group.version &&
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
        setDraft(current => ({ group: current?.group ?? group, pesos }));
      }}
      onBlur={() => {
        if (!draft) return;
        const submitted = draft;
        void onSave(submitted.group, option.id, submitted.pesos).then(saved => {
          if (saved) setDraft(current => current === submitted ? null : current);
        });
      }}
    />
  );
}
