/**
 * Shop listings — the board a client sees.
 *
 * Vocabulary matches the supplier app: listings on a board, not catalog items.
 * Caps and field names follow gridgo-api docs/SUPPLIER_CATALOG_API.md.
 */

import { formatPhp } from "@/lib/format";
import type { Taxonomy } from "@/lib/api/types";

export type PricingUnit =
  | "per_unit"
  | "per_package"
  | "per_page"
  | "per_area"
  | "per_length"
  | "whole_job";

export const PRICING_UNITS: readonly PricingUnit[] = [
  "per_unit",
  "per_package",
  "per_page",
  "per_area",
  "per_length",
  "whole_job",
] as const;

export type MeasureUnit = "mm" | "cm" | "in" | "ft" | "m";
export const MEASURE_UNITS: readonly MeasureUnit[] = ["mm", "cm", "in", "ft", "m"] as const;

export type PriceTier = { minQuantity: number; unitPriceMinor: number };
export type SpeedTier = {
  id: string;
  label: string;
  turnaroundHours: number;
  priceMinor: number | null;
  surchargeMinor: number | null;
};

export type TurnaroundMode = "inherit" | "override";
export type FileFormatMode = "inherit" | "override";
export type GroupKind = "spec" | "addon";

export const LISTING_CAPS = {
  photos: 8,
  specGroups: 6,
  optionsPerGroup: 20,
  prepSteps: 8,
  nameChars: 80,
  descriptionChars: 4000,
} as const;

export type SamplePhoto = {
  fileId: string;
  sortOrder: number;
  altText: string | null;
  downloadUrl?: string | null;
};

export type SpecOption = {
  id: string;
  label: string;
  priceModifierMinor: number;
  active: boolean;
  sortOrder: number;
};

export type SpecGroup = {
  id: string;
  name: string;
  kind: GroupKind;
  required: boolean;
  helpText: string | null;
  sortOrder: number;
  options: SpecOption[];
  version: number | null;
};

export type PrepStep = {
  id: string;
  title: string;
  body: string;
  sortOrder: number;
};

export type Listing = {
  id: string;
  serviceLineId: string;
  subcategoryCode: string;
  name: string;
  description: string;
  basePriceMinor: number;
  pricingUnit: PricingUnit;
  packageQty: number | null;
  measureUnit: MeasureUnit | null;
  minimumWidthMilli: number | null;
  minimumHeightMilli: number | null;
  minimumLengthMilli: number | null;
  minimumOrderQuantity: number | null;
  priceTiers: PriceTier[];
  speedTiers: SpeedTier[];
  turnaroundMode: TurnaroundMode;
  turnaroundHours: number | null;
  fileFormatMode: FileFormatMode;
  formatCodes: string[];
  onTheBoard: boolean;
  sortOrder: number;
  photos: SamplePhoto[];
  groups: SpecGroup[];
  version: number | null;
  updatedAt: string | null;
};

export type ListingStarter = {
  id: string;
  name: string;
  subcategoryCode: string;
  pricingUnit: PricingUnit;
  packageQty: number | null;
  turnaroundHours: number | null;
  formatCodes: string[];
  specCount: number;
  addOnCount: number;
};

export type ServiceLine = {
  id: string;
  categoryCode: string;
  state: string;
  turnaroundHours: number | null;
  formatCodes: string[];
};

export type BoardPage = {
  listings: Listing[];
  nextCursor: string | null;
  total: number;
};

export type Coverage = { code: string; name: string };
export type BoardTarget = {
  service: ServiceLine;
  categoryCode: string;
  categoryName: string;
  covers: Coverage[];
};

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function pick(raw: Raw, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] != null) return raw[key];
  }
  return undefined;
}

function asArray(value: unknown): Raw[] {
  return Array.isArray(value) ? value.filter((entry): entry is Raw => isRecord(entry)) : [];
}

function collection(body: unknown, ...keys: string[]): Raw[] {
  if (Array.isArray(body)) return asArray(body);
  if (!isRecord(body)) return [];
  for (const key of keys) {
    if (Array.isArray(body[key])) return asArray(body[key]);
  }
  return [];
}

function single(body: unknown, ...keys: string[]): Raw | null {
  if (!isRecord(body)) return null;
  for (const key of keys) {
    const value = body[key];
    if (isRecord(value)) return value;
  }
  return str(pick(body, "id")) ? body : null;
}

function readFormatCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const codes: string[] = [];
  for (const entry of value) {
    const code =
      typeof entry === "string"
        ? str(entry)
        : isRecord(entry)
          ? str(pick(entry, "code", "formatCode"))
          : null;
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

function readPhoto(raw: Raw, index: number): SamplePhoto | null {
  const fileId = str(pick(raw, "fileId", "file_id"));
  if (!fileId) return null;
  return {
    fileId,
    sortOrder: num(pick(raw, "sortOrder", "sort_order")) ?? index,
    altText: str(pick(raw, "altText", "alt_text")),
    downloadUrl: str(pick(raw, "downloadUrl", "download_url")),
  };
}

function readPhotos(value: unknown): SamplePhoto[] {
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return (value as string[]).map((fileId, index) => ({
      fileId,
      sortOrder: index,
      altText: null,
    }));
  }
  return asArray(value)
    .map(readPhoto)
    .filter((photo): photo is SamplePhoto => photo != null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function readOption(raw: Raw, index: number): SpecOption | null {
  const id = str(pick(raw, "id", "optionId"));
  const label = str(pick(raw, "label", "name"));
  if (!id || !label) return null;
  return {
    id,
    label,
    priceModifierMinor: num(pick(raw, "priceModifierMinor", "price_modifier_minor")) ?? 0,
    active: pick(raw, "active") !== false,
    sortOrder: num(pick(raw, "sortOrder", "sort_order")) ?? index,
  };
}

function readGroup(raw: Raw, index: number): SpecGroup | null {
  const id = str(pick(raw, "id", "groupId", "optionGroupId"));
  const name = str(pick(raw, "name", "label"));
  if (!id || !name) return null;
  const kind = str(pick(raw, "kind")) === "addon" ? "addon" : "spec";
  return {
    id,
    name,
    kind,
    required: kind === "addon" ? false : pick(raw, "required") !== false,
    helpText: str(pick(raw, "helpText", "help_text")),
    sortOrder: num(pick(raw, "sortOrder", "sort_order")) ?? index,
    version: num(pick(raw, "version")),
    options: asArray(pick(raw, "options"))
      .map(readOption)
      .filter((option): option is SpecOption => option != null)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

function readPriceTiers(value: unknown): PriceTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!isRecord(row)) return null;
      const minQuantity = num(pick(row, "minQuantity", "min_quantity"));
      const unitPriceMinor = num(pick(row, "unitPriceMinor", "unit_price_minor"));
      if (!minQuantity || minQuantity < 1 || unitPriceMinor == null || unitPriceMinor < 0) {
        return null;
      }
      return { minQuantity, unitPriceMinor };
    })
    .filter((row): row is PriceTier => row !== null)
    .sort((left, right) => left.minQuantity - right.minQuantity);
}

function readSpeedTiers(value: unknown): SpeedTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row, index) => {
      if (!isRecord(row)) return null;
      const turnaroundHours = num(pick(row, "turnaroundHours", "turnaround_hours"));
      if (!turnaroundHours || turnaroundHours < 1) return null;
      return {
        id: str(pick(row, "id")) ?? `speed_${index}`,
        label: str(pick(row, "label")) ?? `${turnaroundHours} hours`,
        turnaroundHours,
        priceMinor: num(pick(row, "priceMinor", "price_minor")),
        surchargeMinor: num(pick(row, "surchargeMinor", "surcharge_minor")),
      };
    })
    .filter((row): row is SpeedTier => row !== null)
    .sort((left, right) => left.turnaroundHours - right.turnaroundHours);
}

export function normalizeListing(body: unknown, index = 0): Listing | null {
  const raw = single(body, "item", "catalogItem", "listing") ?? (isRecord(body) ? body : null);
  if (!raw) return null;
  const id = str(pick(raw, "id", "itemId", "catalogItemId"));
  if (!id) return null;
  const declaredUnit = str(pick(raw, "pricingUnit", "pricing_unit"));
  const pricingUnit: PricingUnit = PRICING_UNITS.includes(declaredUnit as PricingUnit)
    ? (declaredUnit as PricingUnit)
    : "per_unit";
  const declaredMeasure = str(pick(raw, "measureUnit", "measure_unit"));
  const measureUnit: MeasureUnit | null = MEASURE_UNITS.includes(declaredMeasure as MeasureUnit)
    ? (declaredMeasure as MeasureUnit)
    : null;
  return {
    id,
    serviceLineId:
      str(pick(raw, "supplierServiceId", "supplier_service_id", "serviceId")) ?? "",
    subcategoryCode: str(pick(raw, "subcategoryCode", "subcategory_code")) ?? "",
    name: str(pick(raw, "name")) ?? "",
    description: typeof raw.description === "string" ? raw.description : "",
    basePriceMinor: num(pick(raw, "basePriceMinor", "base_price_minor")) ?? 0,
    pricingUnit,
    packageQty: num(pick(raw, "packageQty", "package_qty")),
    measureUnit,
    minimumWidthMilli: num(pick(raw, "minimumWidthMilli", "minimum_width_milli")),
    minimumHeightMilli: num(pick(raw, "minimumHeightMilli", "minimum_height_milli")),
    minimumLengthMilli: num(pick(raw, "minimumLengthMilli", "minimum_length_milli")),
    minimumOrderQuantity: num(pick(raw, "minimumOrderQuantity", "minimum_order_quantity")),
    priceTiers: readPriceTiers(pick(raw, "priceTiers", "price_tiers")),
    speedTiers: readSpeedTiers(pick(raw, "speedTiers", "speed_tiers")),
    turnaroundMode:
      str(pick(raw, "turnaroundMode", "turnaround_mode")) === "override" ? "override" : "inherit",
    turnaroundHours: num(pick(raw, "turnaroundHours", "turnaround_hours")),
    fileFormatMode:
      str(pick(raw, "fileFormatMode", "file_format_mode")) === "override" ? "override" : "inherit",
    formatCodes: readFormatCodes(
      pick(raw, "formatCodes", "format_codes", "fileFormats", "acceptedFormats"),
    ),
    onTheBoard: pick(raw, "active") !== false,
    sortOrder: num(pick(raw, "sortOrder", "sort_order")) ?? index,
    photos: readPhotos(pick(raw, "photos", "samplePhotos")),
    groups: asArray(pick(raw, "optionGroups", "option_groups", "groups"))
      .map(readGroup)
      .filter((group): group is SpecGroup => group != null)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    version: num(pick(raw, "version", "expectedVersion")),
    updatedAt: str(pick(raw, "updatedAt", "updated_at")),
  };
}

export function normalizeBoardPage(body: unknown): BoardPage {
  const listings = collection(body, "items", "catalogItems", "listings")
    .map((raw, index) => normalizeListing(raw, index))
    .filter((listing): listing is Listing => listing != null);
  const raw = isRecord(body) ? body : {};
  return {
    listings,
    nextCursor: str(pick(raw, "nextCursor", "next_cursor")),
    total: num(pick(raw, "total")) ?? listings.length,
  };
}

export function normalizeStarters(body: unknown): ListingStarter[] {
  return collection(body, "starters", "listingStarters", "items")
    .map((raw): ListingStarter | null => {
      const id = str(pick(raw, "id", "starterId"));
      const name = str(pick(raw, "name"));
      if (!id || !name) return null;
      const groups = asArray(pick(raw, "groups", "optionGroups", "starterGroups"));
      const unit = str(pick(raw, "defaultPricingUnit", "default_pricing_unit", "pricingUnit"));
      return {
        id,
        name,
        subcategoryCode: str(pick(raw, "subcategoryCode", "subcategory_code")) ?? "",
        pricingUnit: PRICING_UNITS.includes(unit as PricingUnit)
          ? (unit as PricingUnit)
          : "per_unit",
        packageQty: num(pick(raw, "defaultPackageQty", "default_package_qty", "packageQty")),
        turnaroundHours: num(
          pick(raw, "defaultTurnaroundHours", "default_turnaround_hours", "turnaroundHours"),
        ),
        formatCodes: readFormatCodes(
          pick(raw, "defaultFormatCodes", "default_format_codes", "formatCodes"),
        ),
        specCount: groups.filter((group) => str(pick(group, "kind")) !== "addon").length,
        addOnCount: groups.filter((group) => str(pick(group, "kind")) === "addon").length,
      };
    })
    .filter((starter): starter is ListingStarter => starter != null);
}

export function normalizeServiceLines(body: unknown): ServiceLine[] {
  return collection(body, "services", "supplierServices")
    .map((raw): ServiceLine | null => {
      const id = str(pick(raw, "id", "serviceId"));
      const categoryCode = str(pick(raw, "categoryCode", "category_code"));
      if (!id || !categoryCode) return null;
      return {
        id,
        categoryCode,
        state: str(pick(raw, "state")) ?? "draft",
        turnaroundHours: num(
          pick(raw, "turnaroundHours", "standardTurnaroundHours", "turnaround_hours"),
        ),
        formatCodes: readFormatCodes(
          pick(raw, "acceptedFormats", "formatCodes", "accepted_formats", "fileFormats"),
        ),
      };
    })
    .filter((line): line is ServiceLine => line != null);
}

export function normalizePrepSteps(body: unknown): PrepStep[] {
  return collection(body, "prepSteps", "steps", "items")
    .map((raw, index): PrepStep | null => {
      const id = str(pick(raw, "id", "stepId", "prepStepId"));
      const title = str(pick(raw, "title", "name"));
      if (!id || !title) return null;
      return {
        id,
        title,
        body: typeof raw.body === "string" ? raw.body : (str(pick(raw, "detail", "text")) ?? ""),
        sortOrder: num(pick(raw, "sortOrder", "sort_order")) ?? index,
      };
    })
    .filter((step): step is PrepStep => step != null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function nextFreeSlot(taken: readonly number[], cap: number): number {
  const used = new Set(taken);
  for (let slot = 0; slot < cap; slot += 1) if (!used.has(slot)) return slot;
  return cap - 1;
}

export function measurementKind(unit: PricingUnit): "none" | "area" | "length" | "pages" {
  if (unit === "per_area") return "area";
  if (unit === "per_length") return "length";
  if (unit === "per_page") return "pages";
  return "none";
}

export function asksQuantity(unit: PricingUnit): boolean {
  return unit !== "whole_job";
}

export function specs(listing: Listing): SpecGroup[] {
  return listing.groups.filter((group) => group.kind === "spec");
}

export function addOns(listing: Listing): SpecGroup[] {
  return listing.groups.filter((group) => group.kind === "addon");
}

export function pickLine(group: SpecGroup): string {
  return group.required ? "Pick 1" : "Can skip";
}

export function unitLine(
  listing: Pick<Listing, "pricingUnit" | "packageQty" | "measureUnit">,
): string {
  switch (listing.pricingUnit) {
    case "per_package":
      return listing.packageQty ? `per pack of ${listing.packageQty}` : "per pack";
    case "per_page":
      return "per page";
    case "per_area":
      return listing.measureUnit ? `per sq.${listing.measureUnit}` : "per square unit";
    case "per_length":
      return listing.measureUnit ? `per ${listing.measureUnit}` : "per unit of length";
    case "whole_job":
      return "for the whole job";
    default:
      return "per piece";
  }
}

export function unitChoiceLabel(unit: PricingUnit): string {
  switch (unit) {
    case "per_package":
      return "Per pack";
    case "per_page":
      return "Per page";
    case "per_area":
      return "Per area";
    case "per_length":
      return "Per length";
    case "whole_job":
      return "Whole job";
    default:
      return "Per piece";
  }
}

export function fromPriceMinor(listing: Listing): number {
  const required = specs(listing).filter((group) => group.required);
  const additions = required.reduce((total, group) => {
    const active = group.options.filter((option) => option.active);
    if (!active.length) return total;
    return total + Math.min(...active.map((option) => option.priceModifierMinor));
  }, 0);
  return Math.max(0, listing.basePriceMinor + additions);
}

export function hasPriceRange(listing: Listing): boolean {
  return specs(listing).some(
    (group) => group.required && group.options.filter((option) => option.active).length > 1,
  );
}

export function priceLine(listing: Listing): string {
  const money = formatPhp(fromPriceMinor(listing));
  return hasPriceRange(listing)
    ? `From ${money} ${unitLine(listing)}`
    : `${money} ${unitLine(listing)}`;
}

export function effectiveTurnaroundHours(
  listing: Listing,
  inheritedHours: number | null,
): number | null {
  return listing.turnaroundMode === "override" ? listing.turnaroundHours : inheritedHours;
}

export function readyInLine(hours: number | null): string {
  if (hours == null || hours <= 0) return "Ready-in not set";
  if (hours < 48) return `Ready in ${hours} hours`;
  if (hours % 24 === 0) return `Ready in ${hours / 24} days`;
  return `Ready in ${hours} hours`;
}

export function effectiveFormatCodes(listing: Listing, inheritedCodes: string[]): string[] {
  return listing.fileFormatMode === "override" ? listing.formatCodes : inheritedCodes;
}

export type BoardContext = {
  inheritedTurnaroundHours: number | null;
  inheritedFormatCodes: string[];
};

export function boardBlockers(listing: Listing, context: BoardContext): string[] {
  const out: string[] = [];
  if (!listing.photos.length) {
    out.push("Add at least one sample photo before it can go on the board.");
  }
  if (!listing.name.trim()) {
    out.push("Give this listing a name a client would recognise.");
  }
  if (!listing.description.trim()) {
    out.push("Say what this is, so a client knows what they are ordering.");
  }
  if (listing.basePriceMinor <= 0) {
    out.push("Set your price before it can go on the board.");
  }
  if (listing.pricingUnit === "per_package" && (listing.packageQty ?? 0) < 2) {
    out.push("Say how many pieces are in a pack.");
  }
  if (
    measurementKind(listing.pricingUnit) === "area" ||
    measurementKind(listing.pricingUnit) === "length"
  ) {
    if (!listing.measureUnit) {
      out.push("Say what you measure in — feet, inches, metres — so a client can be asked for a size.");
    }
  }
  if ((listing.minimumWidthMilli == null) !== (listing.minimumHeightMilli == null)) {
    out.push("A smallest billable size needs both a width and a height.");
  }
  if (
    listing.turnaroundMode === "override" &&
    (listing.turnaroundHours == null || listing.turnaroundHours <= 0)
  ) {
    out.push("Set how many hours this takes, or use your shop's usual time.");
  } else if (effectiveTurnaroundHours(listing, context.inheritedTurnaroundHours) == null) {
    out.push("Your shop has no usual turnaround yet. Set the hours for this listing.");
  }
  const emptyGroup = listing.groups.find(
    (group) => !group.options.filter((option) => option.active).length,
  );
  if (emptyGroup) {
    out.push(
      emptyGroup.kind === "addon"
        ? `Add at least one choice under the add-on “${emptyGroup.name}”, or remove it.`
        : `Add at least one option under “${emptyGroup.name}”, or remove that step.`,
    );
  }
  if (!effectiveFormatCodes(listing, context.inheritedFormatCodes).length) {
    out.push("Say which artwork files you accept for this listing.");
  }
  return out;
}

export type BoardStanding = {
  label: string;
  tone: "success" | "warning" | "neutral";
  icon: "circle-check" | "triangle-alert" | "square-pen";
  note: string | null;
};

export function boardStanding(
  listing: Listing,
  context: BoardContext,
  shopApproved: boolean,
): BoardStanding {
  const blockers = boardBlockers(listing, context);
  if (blockers.length) {
    return { label: "Not ready yet", tone: "warning", icon: "triangle-alert", note: blockers[0] };
  }
  if (!listing.onTheBoard) {
    return {
      label: "Hidden",
      tone: "neutral",
      icon: "square-pen",
      note: "Ready to go up. Clients cannot see it while it is hidden.",
    };
  }
  return {
    label: "On the board",
    tone: "success",
    icon: "circle-check",
    note: shopApproved ? null : "Clients will see it as soon as Operations approves your shop.",
  };
}

export const EMPTY_BOARD_TITLE = "Nothing on the board yet";
export const EMPTY_BOARD_BODY = "Add a listing so clients can see what you print.";

export function boardCountLine(count: number): string {
  if (count === 0) return "No listings yet";
  return count === 1 ? "1 listing" : `${count} listings`;
}

export function isActiveLine(service: Pick<ServiceLine, "state">): boolean {
  return service.state !== "withdrawn";
}

export function serviceLineFor(
  listing: Pick<Listing, "serviceLineId">,
  services: ServiceLine[],
): ServiceLine | null {
  return services.find((service) => service.id === listing.serviceLineId) ?? null;
}

export function boardContextFor(
  listing: Pick<Listing, "serviceLineId">,
  services: ServiceLine[],
): BoardContext {
  const line = serviceLineFor(listing, services);
  return {
    inheritedTurnaroundHours: line?.turnaroundHours ?? null,
    inheritedFormatCodes: line?.formatCodes ?? [],
  };
}

export function subcategoryName(taxonomy: Taxonomy | null | undefined, code: string): string {
  const hit = taxonomy?.subcategories?.find((entry) => entry.code === code);
  return hit?.name ?? code.replace(/_/g, " ");
}

export function categoryName(taxonomy: Taxonomy | null | undefined, code: string): string {
  const hit = taxonomy?.categories.find((entry) => entry.code === code);
  return hit?.name ?? code.replace(/_/g, " ");
}

export function coversFor(taxonomy: Taxonomy | null | undefined, categoryCode: string): Coverage[] {
  return (taxonomy?.subcategories ?? [])
    .filter((entry) => entry.active !== false && entry.categoryCode === categoryCode)
    .map((entry) => ({ code: entry.code, name: entry.name }));
}

export function boardTargets(taxonomy: Taxonomy | null, services: ServiceLine[]): BoardTarget[] {
  if (!taxonomy) return [];
  const out: BoardTarget[] = [];
  for (const service of services) {
    if (!isActiveLine(service)) continue;
    const covers = coversFor(taxonomy, service.categoryCode);
    if (!covers.length) continue;
    if (out.some((target) => target.categoryCode === service.categoryCode)) continue;
    out.push({
      service,
      categoryCode: service.categoryCode,
      categoryName: categoryName(taxonomy, service.categoryCode),
      covers,
    });
  }
  return out;
}
